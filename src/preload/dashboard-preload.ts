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
  // API Logs
  getApiLogs: (filters?: any) => ipcRenderer.invoke('get-api-logs', filters),
  // Tally Voucher Logs
  getTallyVoucherLogs: (filters?: any) => ipcRenderer.invoke('get-tally-voucher-logs', filters),
  // Settings
  getSetting: (key: string) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('set-setting', key, value),
  getAllSettings: () => ipcRenderer.invoke('get-all-settings'),
  // Log management
  clearLogs: (logType: 'system' | 'api' | 'voucher') => ipcRenderer.invoke('clear-logs', logType),
  // Sound
  playSound: (soundType: string) => ipcRenderer.invoke('play-sound', soundType),
  // Recent Sync History
  getRecentSyncHistory: () => ipcRenderer.invoke('get-recent-sync-history'),
  getSyncRecordDetails: (syncHistoryId: number, filters?: any) => ipcRenderer.invoke('get-sync-record-details', syncHistoryId, filters),
  getVoucherSyncSummary: () => ipcRenderer.invoke('get-voucher-sync-summary'),
  // Customer data
  getCustomers: (filters?: any) => ipcRenderer.invoke('get-customers', filters),
  getCustomersCount: (search?: string) => ipcRenderer.invoke('get-customers-count', search),
  // Voucher data
  getVouchers: (filters?: any) => ipcRenderer.invoke('get-vouchers', filters),
  getVouchersCount: (filters?: any) => ipcRenderer.invoke('get-vouchers-count', filters),
  getVoucherLineItems: (voucherId: string) => ipcRenderer.invoke('get-voucher-line-items', voucherId),
  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowMaximize: (callback: any) => ipcRenderer.on('window-maximized', callback),
  onWindowUnmaximize: (callback: any) => ipcRenderer.on('window-unmaximized', callback),
});