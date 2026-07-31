const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const isDev = Boolean(process.env.ELECTRON_START_URL);
function createWindow() {
  const win = new BrowserWindow({width:1440,height:900,minWidth:820,minHeight:620,show:false,backgroundColor:'#0f172a',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.once('ready-to-show',()=>win.show());
  if (isDev) win.loadURL(process.env.ELECTRON_START_URL);
  else win.loadFile(path.join(__dirname,'..','frontend','dist','index.html'));
  win.webContents.setWindowOpenHandler(({url})=>{ if(url.startsWith('http')) shell.openExternal(url); return {action:'deny'}; });
}
app.whenReady().then(()=>{createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
