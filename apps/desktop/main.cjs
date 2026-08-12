const { app, BrowserWindow, shell, dialog, ipcMain, net } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

const isDev = Boolean(process.env.ELECTRON_START_URL);
const updateApiBase = 'https://srsb-work-management-production.up.railway.app/api/app-updates';
const releasesPage = 'https://github.com/digisrsb-byte/srsb-work-management/releases';

app.setAppUserModelId('com.srsb.hrms');

let mainWindow = null;
let checkingPromise = null;
let updateState = {
  success: true,
  updateAvailable: false,
  prepared: false,
  currentVersion: null,
  latestVersion: null,
  releaseName: '',
  notes: '',
  publishedAt: null,
  progress: null,
  message: ''
};

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

function send(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

async function fetchReleaseMetadata({ refresh = false } = {}) {
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

  return payload.data || {};
}

function statePayload(overrides = {}) {
  return {
    ...updateState,
    currentVersion: app.getVersion(),
    ...overrides
  };
}

async function buildAvailablePayload(info) {
  let metadata = {};
  try {
    metadata = await fetchReleaseMetadata();
  } catch (error) {
    console.warn('Release notes metadata could not be loaded:', error.message);
  }

  const latestVersion = normalizeVersion(info?.version || metadata.latestVersion);

  updateState = statePayload({
    success: true,
    updateAvailable: isNewerVersion(latestVersion, app.getVersion()),
    prepared: false,
    latestVersion,
    releaseName: metadata.releaseName || `Version ${latestVersion}`,
    notes: metadata.notes || '',
    publishedAt: metadata.publishedAt || null,
    progress: null,
    message: ''
  });

  return updateState;
}

function configureAutoUpdater() {
  // Production-grade behaviour:
  // - check on startup
  // - download automatically in the background
  // - never interrupt active work
  // - install when user chooses "Restart & Install" or when app quits normally
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  // The Railway proxy only needs to expose latest.yml + the latest installer.
  // Full downloads are reliable and avoid requiring previous-version blockmaps.
  autoUpdater.disableDifferentialDownload = true;

  autoUpdater.on('checking-for-update', () => {
    updateState = statePayload({
      success: true,
      message: 'Checking for updates...'
    });
  });

  autoUpdater.on('update-available', async (info) => {
    const payload = await buildAvailablePayload(info);
    send('app:update-available', payload);
  });

  autoUpdater.on('update-not-available', async (info) => {
    let metadata = {};
    try {
      metadata = await fetchReleaseMetadata();
    } catch {
      // Update engine already confirmed no newer version.
    }

    updateState = statePayload({
      success: true,
      updateAvailable: false,
      prepared: false,
      latestVersion: normalizeVersion(info?.version || metadata.latestVersion || app.getVersion()),
      releaseName: metadata.releaseName || '',
      notes: metadata.notes || '',
      publishedAt: metadata.publishedAt || null,
      progress: null,
      message: 'This application is up to date.'
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    updateState = statePayload({
      ...updateState,
      updateAvailable: true,
      prepared: false,
      progress: Number(progress?.percent || 0)
    });

    send('app:update-progress', {
      progress: Math.max(0, Math.min(100, Math.round(Number(progress?.percent || 0)))),
      transferred: Number(progress?.transferred || 0),
      total: Number(progress?.total || 0),
      bytesPerSecond: Number(progress?.bytesPerSecond || 0),
      latestVersion: updateState.latestVersion
    });
  });

  autoUpdater.on('update-downloaded', async (info) => {
    if (!updateState.notes) {
      try {
        const metadata = await fetchReleaseMetadata();
        updateState.notes = metadata.notes || '';
        updateState.releaseName = metadata.releaseName || updateState.releaseName;
      } catch {
        // The downloaded update is still valid even if release notes are unavailable.
      }
    }

    updateState = statePayload({
      ...updateState,
      success: true,
      updateAvailable: true,
      prepared: true,
      latestVersion: normalizeVersion(info?.version || updateState.latestVersion),
      progress: 100,
      message: 'Update downloaded and ready to install.'
    });

    send('app:update-ready', updateState);
  });

  autoUpdater.on('error', (error) => {
    console.error('Automatic updater error:', error);

    updateState = statePayload({
      ...updateState,
      success: false,
      message: error?.message || 'Automatic update failed.'
    });

    send('app:update-download-error', {
      message: updateState.message
    });
  });
}

async function checkForUpdate(_event, options = {}) {
  if (isDev) {
    return statePayload({
      success: true,
      updateAvailable: false,
      prepared: false,
      latestVersion: app.getVersion(),
      message: 'Automatic updates are checked only in the installed desktop application.'
    });
  }

  if (checkingPromise) return checkingPromise;

  checkingPromise = (async () => {
    let metadata = {};
    try {
      metadata = await fetchReleaseMetadata({
        refresh: Boolean(options?.refresh)
      });
    } catch (error) {
      console.warn('Release metadata check failed:', error.message);
    }

    const result = await autoUpdater.checkForUpdates();
    const latestVersion = normalizeVersion(
      result?.updateInfo?.version ||
      metadata.latestVersion ||
      updateState.latestVersion ||
      app.getVersion()
    );

    updateState = statePayload({
      ...updateState,
      success: true,
      updateAvailable: isNewerVersion(latestVersion, app.getVersion()),
      latestVersion,
      releaseName: metadata.releaseName || updateState.releaseName || `Version ${latestVersion}`,
      notes: metadata.notes || updateState.notes || '',
      publishedAt: metadata.publishedAt || updateState.publishedAt || null,
      message: ''
    });

    return updateState;
  })();

  try {
    return await checkingPromise;
  } catch (error) {
    return statePayload({
      success: false,
      updateAvailable: false,
      prepared: false,
      message: error?.message || 'Unable to check for updates.',
      releaseUrl: releasesPage
    });
  } finally {
    checkingPromise = null;
  }
}

async function prepareUpdate() {
  const result = await checkForUpdate(null, { refresh: true });
  return result;
}

async function downloadUpdate() {
  try {
    if (updateState.prepared) {
      return statePayload({
        success: true,
        prepared: true
      });
    }

    if (!updateState.updateAvailable) {
      const checked = await checkForUpdate(null, { refresh: true });
      if (!checked.updateAvailable) return checked;
    }

    await autoUpdater.downloadUpdate();

    return statePayload({
      success: true,
      updateAvailable: true,
      prepared: updateState.prepared
    });
  } catch (error) {
    return statePayload({
      success: false,
      message: error?.message || 'The update could not be downloaded.'
    });
  }
}

async function installPreparedUpdate() {
  if (!updateState.prepared) {
    return statePayload({
      success: false,
      message: 'The update has not finished downloading yet.'
    });
  }

  setImmediate(() => {
    autoUpdater.quitAndInstall(false, true);
  });

  return { success: true };
}

ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('app:check-update', checkForUpdate);
ipcMain.handle('app:prepare-update', prepareUpdate);
ipcMain.handle('app:download-update', downloadUpdate);
ipcMain.handle('app:install-prepared-update', installPreparedUpdate);
ipcMain.handle('app:open-releases', () => shell.openExternal(releasesPage));

function createWindow() {
  mainWindow = new BrowserWindow({
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

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error('Renderer failed to load:', {
        errorCode,
        errorDescription,
        validatedURL
      });
    }
  );

  if (isDev) {
    mainWindow.loadURL(process.env.ELECTRON_START_URL);
  } else {
    const frontendEntry = path.join(
      process.resourcesPath,
      'frontend',
      'index.html'
    );

    mainWindow.loadFile(frontendEntry).catch((error) => {
      console.error('Unable to load packaged frontend:', error);
      dialog.showErrorBox(
        'SRSB Work Management could not start',
        `The packaged frontend could not be loaded.\n\n${error.message}`
      );
    });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.once('did-finish-load', () => {
    if (isDev) return;

    // Do not slow down application startup. Check shortly after the UI is ready.
    setTimeout(() => {
      checkForUpdate(null, { refresh: false }).catch((error) => {
        console.error('Startup update check failed:', error);
      });
    }, 2500);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  configureAutoUpdater();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
