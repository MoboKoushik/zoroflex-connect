const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  manualSync: () => ipcRenderer.invoke('manual-sync'),
  logout: () => ipcRenderer.invoke('logout'),
  onProfileData: (callback: any) => ipcRenderer.on('profile-data', callback),
  onSyncStarted: (callback: any) => ipcRenderer.on('sync-started', callback),
  onSyncCompleted: (callback: any) => ipcRenderer.on('sync-completed', callback),
  getProfile: () => ipcRenderer.invoke('get-profile'),
  getSyncHistory: () => ipcRenderer.invoke('get-sync-history'),
  getLogs: () => ipcRenderer.invoke('get-logs'),
  getLastSync: () => ipcRenderer.invoke('get-last-sync'),
  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowMaximize: (callback: any) => ipcRenderer.on('window-maximized', callback),
  onWindowUnmaximize: (callback: any) => ipcRenderer.on('window-unmaximized', callback),
});