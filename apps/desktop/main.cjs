const { app, BrowserWindow, shell, dialog, ipcMain, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const { createHash } = require('crypto');

const isDev = Boolean(process.env.ELECTRON_START_URL);
const updateApiBase = 'https://srsb-work-management-production.up.railway.app/api/app-updates';
const releasesPage = 'https://github.com/digisrsb-byte/srsb-work-management/releases';

app.setAppUserModelId('com.srsb.hrms');

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '').split('-')[0];
}

function isNewerVersion(latest, current) {
  const a = normalizeVersion(latest).split('.').map((part) => Number(part) || 0);
  const b = normalizeVersion(current).split('.').map((part) => Number(part) || 0);
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    if ((a[index] || 0) > (b[index] || 0)) return true;
    if ((a[index] || 0) < (b[index] || 0)) return false;
  }

  return false;
}

async function fetchLatestRelease({ refresh = false } = {}) {
  const endpoint = `${updateApiBase}/latest${refresh ? '?refresh=1' : ''}`;
  const response = await net.fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache'
    }
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok || !payload.success) {
    throw new Error(
      payload.message ||
      payload.error ||
      `Update server returned HTTP ${response.status}.`
    );
  }

  const release = payload.data || {};
  return {
    currentVersion: app.getVersion(),
    latestVersion: normalizeVersion(release.latestVersion),
    releaseName: release.releaseName || `Version ${release.latestVersion}`,
    notes: release.notes || '',
    publishedAt: release.publishedAt || null,
    assetName: release.assetName || null,
    assetSize: Number(release.assetSize || 0),
    assetDigest: release.assetDigest || null,
    downloadUrl: release.downloadUrl || null,
    releaseUrl: release.releaseUrl || releasesPage
  };
}

async function checkForUpdate(_event, options = {}) {
  try {
    const release = await fetchLatestRelease({
      refresh: Boolean(options?.refresh)
    });

    return {
      success: true,
      updateAvailable: isNewerVersion(release.latestVersion, release.currentVersion),
      ...release
    };
  } catch (error) {
    return {
      success: false,
      updateAvailable: false,
      currentVersion: app.getVersion(),
      message: error.message,
      releaseUrl: releasesPage
    };
  }
}

function expectedSha256(digest) {
  const match = String(digest || '').trim().match(/^sha256:([a-f0-9]{64})$/i);
  return match ? match[1].toLowerCase() : null;
}

async function downloadAndInstallUpdate(event) {
  // Always retrieve the approved latest release in the trusted main process.
  // Renderer-provided URLs are intentionally ignored.
  const updateInfo = await fetchLatestRelease({ refresh: true });

  if (!isNewerVersion(updateInfo.latestVersion, updateInfo.currentVersion)) {
    return {
      success: false,
      message: 'This application is already up to date.'
    };
  }

  if (!updateInfo.downloadUrl) {
    await shell.openExternal(updateInfo.releaseUrl || releasesPage);
    return { success: false, openedReleasePage: true };
  }

  const safeAssetName = path.basename(
    updateInfo.assetName ||
    `SRSB-Work-Management-Setup-${updateInfo.latestVersion}.exe`
  ).replace(/[^a-zA-Z0-9._-]/g, '_');

  if (!safeAssetName.toLowerCase().endsWith('.exe')) {
    throw new Error('The update server did not return a Windows installer.');
  }

  const target = path.join(app.getPath('temp'), safeAssetName);
  const response = await net.fetch(updateInfo.downloadUrl, {
    headers: {
      Accept: 'application/octet-stream',
      'Cache-Control': 'no-cache'
    }
  });

  if (!response.ok || !response.body) {
    throw new Error(`Update download failed with HTTP ${response.status}.`);
  }

  const total = Number(response.headers.get('content-length') || updateInfo.assetSize || 0);
  let downloaded = 0;
  const hash = createHash('sha256');
  const nodeStream = Readable.fromWeb(response.body);
  const output = fs.createWriteStream(target);

  try {
    await new Promise((resolve, reject) => {
      nodeStream.on('data', (chunk) => {
        downloaded += chunk.length;
        hash.update(chunk);
        const progress = total ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
        event.sender.send('app:update-progress', { downloaded, total, progress });
      });
      nodeStream.on('error', reject);
      output.on('error', reject);
      output.on('finish', resolve);
      nodeStream.pipe(output);
    });

    const expected = expectedSha256(updateInfo.assetDigest);
    const actual = hash.digest('hex').toLowerCase();

    if (expected && expected !== actual) {
      throw new Error('The downloaded update failed its integrity check.');
    }

    const launchError = await shell.openPath(target);
    if (launchError) throw new Error(launchError);

    setTimeout(() => app.quit(), 1000);
    return { success: true, target };
  } catch (error) {
    try {
      fs.rmSync(target, { force: true });
    } catch {
      // Ignore cleanup failures and report the original update error.
    }
    throw error;
  }
}

ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('app:check-update', checkForUpdate);
ipcMain.handle('app:download-update', downloadAndInstallUpdate);
ipcMain.handle('app:open-releases', () => shell.openExternal(releasesPage));

function createWindow() {
  const win = new BrowserWindow({
    title: 'SRSB Work Management',
    icon: path.join(__dirname, 'app-icon.png'),
    width: 1440,
    height: 900,
    minWidth: 820,
    minHeight: 620,
    show: false,
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.once('ready-to-show', () => win.show());

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('Renderer failed to load:', { errorCode, errorDescription, validatedURL });
  });

  if (isDev) {
    win.loadURL(process.env.ELECTRON_START_URL);
  } else {
    const frontendEntry = path.join(process.resourcesPath, 'frontend', 'index.html');
    win.loadFile(frontendEntry).catch((error) => {
      console.error('Unable to load packaged frontend:', error);
      dialog.showErrorBox(
        'SRSB Work Management could not start',
        `The packaged frontend could not be loaded.\n\n${error.message}`
      );
    });
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.once('did-finish-load', async () => {
    if (isDev) return;
    const result = await checkForUpdate(null, { refresh: false });
    if (result.updateAvailable) win.webContents.send('app:update-available', result);
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
