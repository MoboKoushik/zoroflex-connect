// src/renderer/shared/types/electron-api.d.ts
// Unified type definition for electronAPI across all renderer processes

export interface ElectronAPI {
  // Login
  login?: (credentials: { email: string; password: string }) => Promise<{ success: boolean; message?: string }>;
  onLoginSuccess?: (callback: () => void) => void;
  
  // Company selection (company-selector)
  fetchCompanies?: () => Promise<{ success: boolean; companies?: any[]; autoSelectedCompanyId?: number; error?: string; warning?: string }>;
  selectCompany?: (companyId: number) => Promise<{ success: boolean; error?: string }>;
  continueToDashboard?: () => Promise<{ success: boolean; error?: string }>;
  onProfileData?: (callback: (data: any) => void) => void;
  onAutoSelectInfo?: (callback: (data: { companyId: number }) => void) => void;
  onInitialError?: (callback: (data: { error: string }) => void) => void;
  onWarningMessage?: (callback: (data: { warning: string }) => void) => void;
  
  // Dashboard
  getProfile?: () => Promise<any>;
  getActiveCompany?: () => Promise<any>;
  getDashboardStats?: () => Promise<any>;
  getRecentSyncLogs?: () => Promise<any[]>;
  getEntitySyncInfo?: () => Promise<any>;
  getActiveSyncProcesses?: () => Promise<Array<{
    id: number;
    entity_type: string;
    sync_type: string;
    status: string;
    started_at: string;
    current_step?: string;
    progress?: {
      current: number;
      total: number;
    };
  }>>;
  getAnalytics?: () => Promise<any>;
  getLogs?: () => Promise<any[]>;
  getApiLogs?: (filters?: any) => Promise<any[]>;
  getTallySyncLogs?: (filters?: any) => Promise<any[]>;
  onSyncStarted?: (callback: (data: any) => void) => void;
  onSyncCompleted?: (callback: (data: any) => void) => void;
  forceFullSync?: () => Promise<{ success: boolean; error?: string }>;
  forceFreshSync?: () => Promise<{ success: boolean; error?: string }>;
  forceFullFreshSync?: () => Promise<{ success: boolean; error?: string }>;
  manualSync?: () => Promise<{ success: boolean; error?: string }>;
  syncEntity?: (entityType: 'CUSTOMER' | 'INVOICE' | 'PAYMENT' | 'JOURNAL' | 'DEBITNOTE') => Promise<{ success: boolean; error?: string }>;
  restartBackgroundSync?: () => Promise<{ success: boolean; error?: string }>;
  removeSyncCompletedListener?: (callback: any) => void;
  
  // Window controls (dashboard)
  windowMinimize?: () => Promise<any>;
  windowMaximize?: () => Promise<any>;
  windowClose?: () => Promise<any>;
  windowIsMaximized?: () => Promise<boolean>;
  onWindowMaximized?: (callback: () => void) => void;
  onWindowUnmaximized?: (callback: () => void) => void;
  
  // Settings
  getSetting?: (key: string) => Promise<string | null>;
  setSetting?: (key: string, value: string) => Promise<{ success: boolean }>;
  getAllSettings?: () => Promise<Record<string, string>>;
  // Auto-start
  getAutoStart?: () => Promise<{ enabled: boolean }>;
  setAutoStart?: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  
  // Status
  getTallyStatus?: () => Promise<any>;
  getApiStatus?: () => Promise<any>;
  getSyncStatus?: () => Promise<any>;
  testTallyConnectivity?: () => Promise<{ success: boolean; status: any }>;
  testApiConnectivity?: () => Promise<{ success: boolean; status: any }>;


  getSyncSummaryHistory?: (limit?: number, page?: number) => Promise<any>;
  
  // Staging data
  getStagingCustomers?: (page?: number, limit?: number, search?: string) => Promise<any>;
  getStagingInvoices?: (page?: number, limit?: number, search?: string) => Promise<any>;
  getStagingPayments?: (page?: number, limit?: number, search?: string) => Promise<any>;
  getStagingJvEntries?: (page?: number, limit?: number, search?: string) => Promise<any>;
  
  // Common
  removeAllListeners?: (channel: string) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
