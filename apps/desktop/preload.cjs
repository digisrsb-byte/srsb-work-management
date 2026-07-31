const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('srsbDesktop', { platform: process.platform, version: process.versions.electron });
