import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Sync methods
  manualSync: (syncType?: 'full' | 'fresh') => ipcRenderer.invoke('manual-sync', syncType),
  forceFullSync: () => ipcRenderer.invoke('force-full-sync'),
  forceFreshSync: () => ipcRenderer.invoke('force-fresh-sync'),
  logout: () => ipcRenderer.invoke('logout'),
  
  // Company methods
  getActiveCompany: () => ipcRenderer.invoke('get-active-company'),
  getAllCompanies: () => ipcRenderer.invoke('get-all-companies'),
  onProfileData: (callback: any) => {
    // Remove any existing listeners for this channel to prevent duplicates
    ipcRenderer.removeAllListeners('profile-data');
    ipcRenderer.on('profile-data', callback);
    return () => ipcRenderer.removeListener('profile-data', callback);
  },
  onSyncStarted: (callback: any) => {
    // Remove any existing listeners for this channel to prevent duplicates
    ipcRenderer.removeAllListeners('sync-started');
    ipcRenderer.on('sync-started', callback);
    return () => ipcRenderer.removeListener('sync-started', callback);
  },
  onSyncCompleted: (callback: any) => {
    // Remove any existing listeners for this channel to prevent duplicates
    ipcRenderer.removeAllListeners('sync-completed');
    ipcRenderer.on('sync-completed', callback);
    return () => ipcRenderer.removeListener('sync-completed', callback);
  },
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
  // Dashboard queries
  getDashboardStats: () => ipcRenderer.invoke('get-dashboard-stats'),
  getCustomers: (limit?: number, offset?: number, search?: string) => ipcRenderer.invoke('get-customers', limit, offset, search),
  getVouchers: (limit?: number, offset?: number, search?: string, voucherType?: string) => ipcRenderer.invoke('get-vouchers', limit, offset, search, voucherType),
  getSyncHistoryWithBatches: (limit?: number) => ipcRenderer.invoke('get-sync-history-with-batches', limit),
  getRecentSyncLogs: () => ipcRenderer.invoke('get-recent-sync-logs'),
  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowMaximize: (callback: any) => {
    // Remove any existing listeners for this channel to prevent duplicates
    ipcRenderer.removeAllListeners('window-maximized');
    ipcRenderer.on('window-maximized', callback);
    return () => ipcRenderer.removeListener('window-maximized', callback);
  },
  onWindowUnmaximized: (callback: any) => {
    // Remove any existing listeners for this channel to prevent duplicates
    ipcRenderer.removeAllListeners('window-unmaximized');
    ipcRenderer.on('window-unmaximized', callback);
    return () => ipcRenderer.removeListener('window-unmaximized', callback);
  },
  
  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
});