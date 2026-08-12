const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('srsbDesktop', {
  platform: process.platform,
  electronVersion: process.versions.electron,
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  checkForUpdates: (options = {}) => ipcRenderer.invoke('app:check-update', options),
  downloadUpdate: () => ipcRenderer.invoke('app:download-update'),
  openReleases: () => ipcRenderer.invoke('app:open-releases'),
  onUpdateAvailable: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('app:update-available', listener);
    return () => ipcRenderer.removeListener('app:update-available', listener);
  },
  onUpdateProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('app:update-progress', listener);
    return () => ipcRenderer.removeListener('app:update-progress', listener);
  }
});
