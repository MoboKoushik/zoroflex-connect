// Preload script for secure IPC communication
import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Add IPC methods here if needed in the future
  platform: process.platform,
  
  // Profile
  getProfile: () => ipcRenderer.invoke('get-profile'),
  
  // Company
  getActiveCompany: () => ipcRenderer.invoke('get-active-company'),
  
  // Settings
  getSetting: (key: string) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('set-setting', key, value),
  getAllSettings: () => ipcRenderer.invoke('get-all-settings'),
  
  // Sync
  getDashboardStats: () => ipcRenderer.invoke('get-dashboard-stats'),
  getRecentSyncLogs: () => ipcRenderer.invoke('get-recent-sync-logs'),
  getAnalytics: () => ipcRenderer.invoke('get-analytics'),
  forceFullSync: () => ipcRenderer.invoke('force-full-sync'),
  forceFreshSync: () => ipcRenderer.invoke('force-fresh-sync'),
  
  // Logs
  getLogs: () => ipcRenderer.invoke('get-logs'),
  getApiLogs: (filters?: any) => ipcRenderer.invoke('get-api-logs', filters),
  getTallySyncLogs: (filters?: any) => ipcRenderer.invoke('get-tally-sync-logs', filters),
  
  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  
  // Event listeners
  onSyncStarted: (callback: (data: any) => void) => {
    ipcRenderer.on('sync-started', (_event, data) => callback(data));
  },
  onSyncCompleted: (callback: (data: any) => void) => {
    ipcRenderer.on('sync-completed', (_event, data) => callback(data));
  },
  onWindowMaximized: (callback: () => void) => {
    ipcRenderer.on('window-maximized', () => callback());
  },
  onWindowUnmaximized: (callback: () => void) => {
    ipcRenderer.on('window-unmaximized', () => callback());
  },
  
  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
  
  // Status
  getTallyStatus: () => ipcRenderer.invoke('get-tally-status'),
  getApiStatus: () => ipcRenderer.invoke('get-api-status'),
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
  testTallyConnectivity: () => ipcRenderer.invoke('test-tally-connectivity'),
  testApiConnectivity: () => ipcRenderer.invoke('test-api-connectivity'),
  
  // Staging data
  getStagingCustomers: (page?: number, limit?: number, search?: string) => 
    ipcRenderer.invoke('get-staging-customers', page, limit, search),
  getStagingInvoices: (page?: number, limit?: number, search?: string) => 
    ipcRenderer.invoke('get-staging-invoices', page, limit, search),
  getStagingPayments: (page?: number, limit?: number, search?: string) => 
    ipcRenderer.invoke('get-staging-payments', page, limit, search),
});

