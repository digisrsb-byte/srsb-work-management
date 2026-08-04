import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const githubApiVersion = '2022-11-28';
const installerPattern = /^SRSB-Work-Management-Setup-([0-9]+(?:\.[0-9]+){1,3})\.exe$/i;
const cache = {
  release: null,
  expiresAt: 0
};

function normalizeVersion(value) {
  return String(value || '')
    .trim()
    .replace(/^v/i, '')
    .split('-')[0];
}

function githubHeaders(accept = 'application/vnd.github+json') {
  return {
    Accept: accept,
    'User-Agent': 'SRSB-Work-Management-Update-Service',
    'X-GitHub-Api-Version': githubApiVersion,
    ...(env.githubReleaseToken
      ? { Authorization: `Bearer ${env.githubReleaseToken}` }
      : {})
  };
}

function repositoryApiUrl(pathname) {
  return `https://api.github.com/repos/${encodeURIComponent(env.githubReleaseOwner)}/${encodeURIComponent(env.githubReleaseRepo)}${pathname}`;
}

function requestOrigin(req) {
  if (env.publicApiUrl) {
    return env.publicApiUrl.replace(/\/+$/, '').replace(/\/api$/i, '');
  }

  const forwardedProtocol = String(req.get('x-forwarded-proto') || '')
    .split(',')[0]
    .trim();
  const protocol = forwardedProtocol || req.protocol || 'https';
  return `${protocol}://${req.get('host')}`;
}

async function readGithubError(response) {
  try {
    const payload = await response.json();
    return payload?.message || `GitHub returned HTTP ${response.status}.`;
  } catch {
    return `GitHub returned HTTP ${response.status}.`;
  }
}

async function fetchLatestGithubRelease({ force = false } = {}) {
  if (!force && cache.release && cache.expiresAt > Date.now()) {
    return cache.release;
  }

  const response = await fetch(
    repositoryApiUrl('/releases/latest'),
    {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(15000)
    }
  );

  if (!response.ok) {
    const githubMessage = await readGithubError(response);

    if (response.status === 404 && !env.githubReleaseToken) {
      throw new AppError(
        'The update release could not be accessed. If the GitHub repository is private, add a read-only GITHUB_RELEASE_TOKEN to the existing Railway backend variables.',
        503
      );
    }

    throw new AppError(
      `The update release could not be checked: ${githubMessage}`,
      response.status === 403 || response.status === 429 ? 503 : 502
    );
  }

  const release = await response.json();
  cache.release = release;
  cache.expiresAt = Date.now() + env.githubReleaseCacheSeconds * 1000;
  return release;
}

function findInstallerAsset(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];

  return assets.find((asset) => installerPattern.test(String(asset?.name || '')))
    || assets.find((asset) => String(asset?.name || '').toLowerCase().endsWith('.exe'))
    || null;
}

export const getLatestAppUpdate = asyncHandler(async (req, res) => {
  const release = await fetchLatestGithubRelease({
    force: req.query.refresh === '1'
  });
  const asset = findInstallerAsset(release);
  const latestVersion = normalizeVersion(release.tag_name || release.name);
  const origin = requestOrigin(req);

  res.set('Cache-Control', 'no-store');
  res.json({
    success: true,
    data: {
      latestVersion,
      releaseName: release.name || release.tag_name || `Version ${latestVersion}`,
      notes: release.body || '',
      publishedAt: release.published_at || null,
      assetName: asset?.name || null,
      assetSize: Number(asset?.size || 0),
      assetDigest: asset?.digest || null,
      downloadUrl: asset
        ? `${origin}/api/app-updates/download/${asset.id}`
        : null,
      releaseUrl: release.html_url || null
    }
  });
});

export const downloadLatestAppUpdate = asyncHandler(async (req, res) => {
  const assetId = Number(req.params.assetId);

  if (!Number.isSafeInteger(assetId) || assetId <= 0) {
    throw new AppError('Invalid update asset.', 400);
  }

  const release = await fetchLatestGithubRelease();
  const installer = findInstallerAsset(release);

  if (!installer || Number(installer.id) !== assetId) {
    throw new AppError('The requested installer is not the latest approved release.', 404);
  }

  const response = await fetch(
    repositoryApiUrl(`/releases/assets/${assetId}`),
    {
      headers: githubHeaders('application/octet-stream'),
      redirect: 'manual',
      signal: AbortSignal.timeout(30000)
    }
  );

  // GitHub normally returns a short-lived signed asset URL. Redirecting the
  // desktop client avoids routing the large installer through Railway.
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    if (!location) {
      throw new AppError('The update server did not provide a download location.', 502);
    }

    res.set('Cache-Control', 'no-store');
    return res.redirect(302, location);
  }

  if (!response.ok || !response.body) {
    const githubMessage = await readGithubError(response);
    throw new AppError(`The update could not be downloaded: ${githubMessage}`, 502);
  }

  const safeName = String(installer.name || 'SRSB-Work-Management-Setup.exe')
    .replace(/[^a-zA-Z0-9._-]/g, '_');

  res.status(200);
  res.set({
    'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${safeName}"`,
    'Cache-Control': 'private, no-store'
  });

  const contentLength = response.headers.get('content-length');
  if (contentLength) res.set('Content-Length', contentLength);

  await pipeline(Readable.fromWeb(response.body), res);
  return undefined;
});
