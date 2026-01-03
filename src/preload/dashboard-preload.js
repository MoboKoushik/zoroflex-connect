const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  manualSync: () => ipcRenderer.invoke('manual-sync'),
  logout: () => ipcRenderer.invoke('logout'),
  onProfileData: (callback) => {
    // Remove any existing listeners for this channel to prevent duplicates
    ipcRenderer.removeAllListeners('profile-data');
    ipcRenderer.on('profile-data', callback);
    return () => ipcRenderer.removeListener('profile-data', callback);
  },
  onSyncStarted: (callback) => {
    // Remove any existing listeners for this channel to prevent duplicates
    ipcRenderer.removeAllListeners('sync-started');
    ipcRenderer.on('sync-started', callback);
    return () => ipcRenderer.removeListener('sync-started', callback);
  },
  onSyncCompleted: (callback) => {
    // Remove any existing listeners for this channel to prevent duplicates
    ipcRenderer.removeAllListeners('sync-completed');
    ipcRenderer.on('sync-completed', callback);
    return () => ipcRenderer.removeListener('sync-completed', callback);
  },
  getProfile: () => ipcRenderer.invoke('get-profile'),
  getSyncHistory: () => ipcRenderer.invoke('get-sync-history'),
  getLogs: (limit) => ipcRenderer.invoke('get-logs', limit),
  getLastSync: () => ipcRenderer.invoke('get-last-sync'),
  // API Logs
  getApiLogs: (filters) => ipcRenderer.invoke('get-api-logs', filters),
  // Tally Voucher Logs
  getTallyVoucherLogs: (filters) => ipcRenderer.invoke('get-tally-voucher-logs', filters),
  // Settings
  getSetting: (key) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
  getAllSettings: () => ipcRenderer.invoke('get-all-settings'),
  // Log management
  clearLogs: (logType) => ipcRenderer.invoke('clear-logs', logType),
  // Sound
  playSound: (soundType) => ipcRenderer.invoke('play-sound', soundType),
  // Recent Sync History
  getRecentSyncHistory: () => ipcRenderer.invoke('get-recent-sync-history'),
  getSyncRecordDetails: (syncHistoryId, filters) => ipcRenderer.invoke('get-sync-record-details', syncHistoryId, filters),
  getVoucherSyncSummary: () => ipcRenderer.invoke('get-voucher-sync-summary'),
  // Dashboard queries
  getDashboardStats: () => ipcRenderer.invoke('get-dashboard-stats'),
  getCustomers: (limit, offset, search) => ipcRenderer.invoke('get-customers', limit, offset, search),
  getVouchers: (limit, offset, search, voucherType) => ipcRenderer.invoke('get-vouchers', limit, offset, search, voucherType),
  getSyncHistoryWithBatches: (limit) => ipcRenderer.invoke('get-sync-history-with-batches', limit),
  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowMaximize: (callback) => {
    // Remove any existing listeners for this channel to prevent duplicates
    ipcRenderer.removeAllListeners('window-maximized');
    ipcRenderer.on('window-maximized', callback);
    return () => ipcRenderer.removeListener('window-maximized', callback);
  },
  onWindowUnmaximize: (callback) => {
    // Remove any existing listeners for this channel to prevent duplicates
    ipcRenderer.removeAllListeners('window-unmaximized');
    ipcRenderer.on('window-unmaximized', callback);
    return () => ipcRenderer.removeListener('window-unmaximized', callback);
  },
});

