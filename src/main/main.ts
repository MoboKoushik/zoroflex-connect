import { app, BrowserWindow, Tray, Menu, ipcMain, dialog } from 'electron';
import * as path from 'path';
import axios from 'axios';
import { DatabaseService } from '../services/database/database.service';
import { SyncService } from '../services/sync/sync.service';
import { OrganizationService } from '../services/sync/send-to-platfrom/organization.service';
import { ApiLoggerService } from '../services/api/api-logger.service';
import { getApiUrl, getDefaultApiUrl } from '../services/config/api-url-helper';
import { CompanyRepository } from '../services/database/repositories/company.repository';
import { fetchCompanies } from '../services/sync/fetch-to-tally/fetchCompanies';
import { TallyConnectivityService } from '../services/tally/tally-connectivity.service';
import { ApiHealthService } from '../services/api/api-health.service';
import { SystemNotificationService } from '../services/notifications/system-notification.service';

let tray: Tray | null = null;
let loginWindow: BrowserWindow | null = null;
let companySelectorWindow: BrowserWindow | null = null;
let dashboardWindow: BrowserWindow | null = null;

const dbService = new DatabaseService();
let organizationService = new OrganizationService(dbService);
let syncService = new SyncService(dbService, organizationService);
let apiLogger = new ApiLoggerService(dbService);
let companyRepository = new CompanyRepository(dbService);
let tallyConnectivityService = new TallyConnectivityService(dbService);
let apiHealthService = new ApiHealthService(dbService);
let notificationService = new SystemNotificationService(dbService);

// Setup API logging interceptor
apiLogger.setupInterceptor(axios);

ipcMain.on('login-success', async () => {
  console.log('login-success event received → Initializing organization database');
  if (loginWindow) {
    loginWindow.hide();
    loginWindow = null;
  }

  const profile = await dbService.getProfile();
  if (!profile) {
    console.error('Profile missing after login!');
    createLoginWindow();
    return;
  }

  console.log('Profile loaded after login:', profile.email);

  // Extract organization UUID from profile using helper method
  const organizationUuid = dbService.extractOrganizationUuid(profile);

  if (!organizationUuid) {
    console.error('No organization UUID found in profile');
    createLoginWindow();
    return;
  }

  console.log('Organization UUID:', organizationUuid);
  
  // Store organization UUID in settings
  await dbService.setOrganizationUuid(organizationUuid);

  // Initialize database with organization UUID
  const localDbExists = dbService.databaseExists(organizationUuid);
  
  if (!localDbExists) {
    // Try to restore from backend
    console.log('Local database not found, attempting to restore from backend...');
    const restored = await dbService.restoreDatabaseFromBackend(
      profile.biller_id || '',
      organizationUuid
    );
    
    if (restored) {
      console.log('Database restored from backend successfully');
      // Reinitialize database service with organization UUID
      dbService.switchDatabase(organizationUuid);
    } else {
      console.log('Database not found in backend, creating new database');
      dbService.initializeDatabase(organizationUuid);
    }
  } else {
    console.log('Local database found, using existing database');
    dbService.initializeDatabase(organizationUuid);
  }
  
  // Re-initialize services with correct database
  organizationService = new OrganizationService(dbService);
  syncService = new SyncService(dbService, organizationService);
  apiLogger = new ApiLoggerService(dbService);
  companyRepository = new CompanyRepository(dbService);
  apiLogger.setupInterceptor(axios);
  
  // Re-initialize monitoring services
  tallyConnectivityService.stopMonitoring();
  apiHealthService.stopMonitoring();
  tallyConnectivityService = new TallyConnectivityService(dbService);
  apiHealthService = new ApiHealthService(dbService);
  notificationService = new SystemNotificationService(dbService);
  
  // Start connectivity monitoring
  startConnectivityMonitoring().catch(err => {
    console.error('Error starting connectivity monitoring:', err);
  });

  // Check if user already has an active company
  const activeCompany = companyRepository.getActiveCompany(profile.biller_id || '');
  
  if (activeCompany) {
    // User already has a company selected, go directly to dashboard
    console.log('Active company found, opening dashboard:', activeCompany.name);
    if (tray) {
      tray.destroy();
      tray = null;
    }
    app.setLoginItemSettings({ openAtLogin: true });
    createTrayAndStartSync(profile, syncService, dbService).catch(err => {
      console.error('Error creating tray and starting sync:', err);
    });
    createDashboardWindow(profile, false); // Don't show window on startup, run in background
  } else {
    // No active company - fetch from Tally and check for matches
    console.log('No active company, fetching companies from Tally...');
    try {
      // Fetch companies from Tally
      const companies = await fetchCompanies(dbService);
      const filteredCompanies = companies.filter(c => c.biller_id === profile.biller_id);
      
      if (filteredCompanies.length === 0) {
        console.log('No companies found in Tally for this biller');
        createCompanySelectorWindow(profile, null);
        return;
      }

      // Save companies to database
      console.log(`Saving ${filteredCompanies.length} companies to database...`);
      for (const companyData of filteredCompanies) {
        await companyRepository.upsertCompany(companyData);
      }

      // Extract organization data from profile for matching
      const billerId = profile.biller_id || '';
      if (!billerId) {
        console.error('No biller_id in profile');
        createCompanySelectorWindow(profile, null);
        return;
      }
      
      const savedCompanies = companyRepository.getAllCompanies(billerId);
      
      // Extract organization_id from profile.organization.response.organization_id
      let profileOrgId = '';
      if (profile?.organization?.response?.organization_id) {
        profileOrgId = String(profile.organization.response.organization_id).trim();
      }
      
      // Extract name from profile.organization.response.name or profile.organization.organization_data.name
      let profileOrgName = '';
      if (profile?.organization?.response?.name) {
        profileOrgName = String(profile.organization.response.name).trim();
      } else if (profile?.organization?.organization_data) {
        // Handle organization_data as object or JSON string
        let orgData = profile.organization.organization_data;
        if (typeof orgData === 'string') {
          try {
            orgData = JSON.parse(orgData);
          } catch (e) {
            console.warn('Failed to parse organization_data as JSON:', e);
          }
        }
        if (orgData?.name) {
          profileOrgName = String(orgData.name).trim();
        }
      }

      console.log('Organization matching data:', {
        organization_id: profileOrgId || '(not available)',
        name: profileOrgName || '(not available)'
      });

      let matchedCompany = null;
      
      // Match by organization_id first (exact match)
      if (profileOrgId) {
        matchedCompany = savedCompanies.find(c => {
          if (!c.organization_id) return false;
          return c.organization_id.trim() === profileOrgId;
        });
        
        if (matchedCompany) {
          console.log('Match found by organization_id:', matchedCompany.name);
        }
      }

      // If no match by organization_id, try by name (case-insensitive)
      if (!matchedCompany && profileOrgName) {
        matchedCompany = savedCompanies.find(c => {
          if (!c.name) return false;
          return c.name.trim().toLowerCase() === profileOrgName.toLowerCase();
        });
        
        if (matchedCompany) {
          console.log('Match found by name:', matchedCompany.name);
        }
      }

      // Show company selector with auto-select info if match found
      // Don't auto-select in DB yet - let user confirm with Continue button
      console.log(`Found ${savedCompanies.length} companies, showing selector`);
      if (matchedCompany) {
        console.log('Matching company found, will auto-select in UI:', {
          id: matchedCompany.id,
          name: matchedCompany.name,
          organization_id: matchedCompany.organization_id
        });
        createCompanySelectorWindow(profile, matchedCompany.id);
      } else {
        console.log('No matching company found, showing all companies for selection');
        createCompanySelectorWindow(profile, null);
      }
    } catch (error: any) {
      console.error('Error fetching companies:', error);
      dbService.log('ERROR', 'Failed to fetch companies from Tally', {
        error: error.message,
        stack: error.stack
      });
      // Still show selector even if fetch fails
      createCompanySelectorWindow(profile, null);
    }
  }
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  // Initialize API endpoint setting if not exists
  const existingApiEndpoint = await dbService.getSetting('apiEndpoint');
  if (!existingApiEndpoint) {
    const defaultUrl = getDefaultApiUrl();
    await dbService.setSetting('apiEndpoint', defaultUrl);
    console.log('Initialized API endpoint setting with default:', defaultUrl);
  }

  const profile = await dbService.getProfile().catch(() => null);

  if (profile) {
    console.log('Profile found → Checking for active company');
    const activeCompany = companyRepository.getActiveCompany(profile.biller_id || '');
    
    if (activeCompany) {
      console.log('Active company found → Starting in background');
      app.setLoginItemSettings({ openAtLogin: true });
      createTrayAndStartSync(profile, syncService, dbService).catch(err => {
        console.error('Error creating tray and starting sync:', err);
      });
      createDashboardWindow(profile, false); // Don't show window on startup, run in background
    } else {
      console.log('No active company → Showing company selector');
      // Don't start sync - wait for company selection
      createCompanySelectorWindow(profile, null);
    }
  } else {
    console.log('No profile → Opening login');
    createLoginWindow();
  }
});

function createLoginWindow(): void {
  if (loginWindow) {
    loginWindow.focus();
    return;
  }

  loginWindow = new BrowserWindow({
    width: 420,
    height: 380,
    minWidth: 400,
    minHeight: 380,
    show: false,
    frame: true,
    resizable: false,
    maximizable: false,
    title: 'Zorrofin Connect - Login',
    icon: path.join(__dirname, '../../assets/icon.png'),
    backgroundColor: '#ffffff',
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/login-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  loginWindow.loadFile(path.join(__dirname, '../renderer/login/login.html'));

  // Open DevTools automatically only in development mode
  if (!app.isPackaged) {
    loginWindow.webContents.once('did-finish-load', () => {
      loginWindow?.webContents.openDevTools({ mode: 'detach' });
    });
  }

  loginWindow.once('ready-to-show', () => {
    loginWindow?.show();
    loginWindow?.center();
  });

  loginWindow.on('closed', () => {
    loginWindow = null;
  });
}

// Create Company Selector Window
function createCompanySelectorWindow(profile: any, autoSelectedCompanyId: number | null = null): void {
  if (companySelectorWindow) {
    companySelectorWindow.focus();
    return;
  }

  companySelectorWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: true,
    resizable: true,
    maximizable: true,
    title: 'Zorrofin Connect - Select Company',
    icon: path.join(__dirname, '../../assets/icon.png'),
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/company-selector-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load company selector HTML (React-based)
  companySelectorWindow.loadFile(path.join(__dirname, '../renderer/company-selector/company-selector.html'));

  if (!app.isPackaged) {
    companySelectorWindow.webContents.once('did-finish-load', () => {
      companySelectorWindow?.webContents.openDevTools({ mode: 'detach' });
    });
  }

  companySelectorWindow.once('ready-to-show', () => {
    companySelectorWindow?.show();
    companySelectorWindow?.center();
  });

  companySelectorWindow.webContents.once('did-finish-load', () => {
    try {
      if (companySelectorWindow && !companySelectorWindow.isDestroyed()) {
        companySelectorWindow.webContents.send('profile-data', profile);
        // Send auto-select info if available
        if (autoSelectedCompanyId !== null) {
          companySelectorWindow.webContents.send('auto-select-info', { companyId: autoSelectedCompanyId });
        }
      }
    } catch (error) {
      console.error('Error sending data to company selector:', error);
    }
  });

  companySelectorWindow.on('closed', () => {
    companySelectorWindow = null;
  });
}

// New: Create Dashboard Window
function createDashboardWindow(profile: any, show: boolean = true): void {
  if (dashboardWindow) {
    dashboardWindow.focus();
    return;
  }

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets/icon.png')
    : path.join(__dirname, '../../assets/icon.png');

  dashboardWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false, // Start hidden; show on tray click
    frame: false, // Frameless window for custom title bar
    resizable: true,
    maximizable: true,
    title: 'Zorrofin Connect - Dashboard',
    icon: iconPath,
    backgroundColor: '#252526', // Dark theme background
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, '../preload/dashboard-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the dashboard HTML (which renders React Dashboard)
  dashboardWindow.loadFile(path.join(__dirname, '../renderer/dashboard/index.html'));

  // Show window once loaded (only if show parameter is true)
  if (show) {
    dashboardWindow.once('ready-to-show', () => {
      dashboardWindow?.show();
      dashboardWindow?.focus();
    });
  }

  // Pass profile data via IPC once loaded
  dashboardWindow.webContents.once('did-finish-load', () => {
    try {
      if (dashboardWindow && !dashboardWindow.isDestroyed() && !dashboardWindow.webContents.isDestroyed()) {
        dashboardWindow.webContents.send('profile-data', profile);
      }
    } catch (error) {
      console.error('Error sending profile-data event:', error);
    }
  });

  // Log errors for debugging
  dashboardWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Dashboard failed to load:', errorCode, errorDescription);
  });

  dashboardWindow.webContents.on('console-message', (event, level, message) => {
    if (level >= 2) { // Error or warning (2 = warning, 3 = error)
      console.error('Dashboard console:', message);
    }
  });

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });

  // Listen for window maximize/unmaximize events
  dashboardWindow.on('maximize', () => {
    try {
      if (dashboardWindow && !dashboardWindow.isDestroyed() && !dashboardWindow.webContents.isDestroyed()) {
        dashboardWindow.webContents.send('window-maximized');
      }
    } catch (error) {
      console.error('Error sending window-maximized event:', error);
    }
  });
  dashboardWindow.on('unmaximize', () => {
    try {
      if (dashboardWindow && !dashboardWindow.isDestroyed() && !dashboardWindow.webContents.isDestroyed()) {
        dashboardWindow.webContents.send('window-unmaximized');
      }
    } catch (error) {
      console.error('Error sending window-unmaximized event:', error);
    }
  });

  // Auto-show after a delay if you want (optional)
  // setTimeout(() => dashboardWindow?.show(), 1000);
}

ipcMain.handle('login', async (event, credentials: { email: string; password: string }) => {
  console.log('Login attempt:', credentials.email);

  try {
    const apiUrl = await getApiUrl(dbService);
    const { data } = await axios.post(`${apiUrl}/billers/tally/login`, credentials, {
      timeout: 15000,
    });

    if (data.success) {
      const { token, biller_id, apikey, organization } = data;

      await dbService.saveProfile(credentials.email, token, biller_id, apikey, organization);
      console.log('Profile saved successfully, sending login-success event');

      if (loginWindow) {
        loginWindow.hide();
        loginWindow = null;
      }

      // Send login-success event to trigger navigation flow
      // The login-success handler will check for active company and either go to dashboard or show company selector
      // Background sync will only start after Continue button is clicked (or if user already has active company)
      event.sender.send('login-success');
      
      return { success: true };
    } else {
      return { success: false, message: data.message || 'Login failed' };
    }
  } catch (error: any) {
    console.error('Login error:', error.message);
    return {
      success: false,
      message: error.response?.data?.message || 'Server not reachable',
    };
  }
});

// IPC for manual sync from dashboard
ipcMain.handle('manual-sync', async (event) => {
  try {
    const profile = await dbService.getProfile();
    if (!profile) {
      return { success: false, error: 'No profile found' };
    }
    if (dashboardWindow && !dashboardWindow.isDestroyed() && !dashboardWindow.webContents.isDestroyed()) {
      try {
        dashboardWindow.webContents.send('sync-started', { syncType: 'smart' });
      } catch (err) {
        console.error('Error sending sync-started event:', err);
      }
    }
    await syncService.manualSync(profile);
    if (dashboardWindow && !dashboardWindow.isDestroyed() && !dashboardWindow.webContents.isDestroyed()) {
      try {
        dashboardWindow.webContents.send('sync-completed');
      } catch (err) {
        console.error('Error sending sync-completed event:', err);
      }
    }
    // Notify sync success
    await notificationService.notifySyncSuccess();
    return { success: true };
  } catch (error: any) {
    console.error('Manual sync error:', error);
    if (dashboardWindow && !dashboardWindow.isDestroyed() && !dashboardWindow.webContents.isDestroyed()) {
      try {
        dashboardWindow.webContents.send('sync-completed', { error: error.message });
      } catch (err) {
        console.error('Error sending sync-completed event:', err);
      }
    }
    // Notify sync failure
    await notificationService.notifySyncFailed(error.message || 'Sync failed');
    return { success: false, error: error.message || 'Sync failed' };
  }
});

ipcMain.handle('force-full-fresh-sync', async (event) => {
  try {
    const profile = await dbService.getProfile();
    if (!profile) {
      return { success: false, error: 'No profile found' };
    }
    if (dashboardWindow && !dashboardWindow.isDestroyed() && !dashboardWindow.webContents.isDestroyed()) {
      try {
        dashboardWindow.webContents.send('sync-started', { syncType: 'full' });
      } catch (err) {
        console.error('Error sending sync-started event:', err);
      }
    }
    await syncService.forceFullFreshSync(profile);
    if (dashboardWindow && !dashboardWindow.isDestroyed() && !dashboardWindow.webContents.isDestroyed()) {
      try {
        dashboardWindow.webContents.send('sync-completed');
      } catch (err) {
        console.error('Error sending sync-completed event:', err);
      }
    }
    await notificationService.notifySyncSuccess();
    return { success: true };
  } catch (error: any) {
    console.error('Force full fresh sync error:', error);
    if (dashboardWindow && !dashboardWindow.isDestroyed() && !dashboardWindow.webContents.isDestroyed()) {
      try {
        dashboardWindow.webContents.send('sync-completed', { error: error.message });
      } catch (err) {
        console.error('Error sending sync-completed event:', err);
      }
    }
    await notificationService.notifySyncFailed(error.message || 'Sync failed');
    return { success: false, error: error.message || 'Sync failed' };
  }
});

// Restart background sync with new settings
ipcMain.handle('restart-background-sync', async (event) => {
  try {
    const profile = await dbService.getProfile();
    if (!profile) {
      return { success: false, error: 'Not logged in' };
    }
    await syncService.restartBackgroundSync(profile);
    return { success: true };
  } catch (error: any) {
    console.error('Restart background sync error:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
});

// Keep old handlers for backward compatibility
ipcMain.handle('force-full-sync', async (event) => {
  try {
    const profile = await dbService.getProfile();
    if (!profile) {
      return { success: false, error: 'No profile found' };
    }
    await syncService.forceFullFreshSync(profile);
    await notificationService.notifySyncSuccess();
    return { success: true };
  } catch (error: any) {
    await notificationService.notifySyncFailed(error.message || 'Sync failed');
    return { success: false, error: error.message || 'Sync failed' };
  }
});

ipcMain.handle('force-fresh-sync', async (event) => {
  try {
    const profile = await dbService.getProfile();
    if (!profile) {
      return { success: false, error: 'No profile found' };
    }
    await syncService.forceFullFreshSync(profile);
    await notificationService.notifySyncSuccess();
    return { success: true };
  } catch (error: any) {
    await notificationService.notifySyncFailed(error.message || 'Sync failed');
    return { success: false, error: error.message || 'Sync failed' };
  }
});

// New IPC for logout from dashboard
ipcMain.handle('logout', async () => {
  syncService.stop();
  await dbService.logoutAndClearProfile();
  if (tray) {
    tray.destroy();
    tray = null;
  }
  if (dashboardWindow) {
    dashboardWindow.close();
    dashboardWindow = null;
  }
  createLoginWindow();
  return { success: true };
});

// New IPC handlers for dashboard data
ipcMain.handle('get-profile', async () => {
  try {
    const profile = await dbService.getProfile();
    return profile;
  } catch (error: any) {
    console.error('Error getting profile:', error);
    return null;
  }
});

ipcMain.handle('get-sync-history', async () => {
  return await dbService.getSyncHistory();
});

ipcMain.handle('get-logs', async () => {
  return await dbService.getLogs();
});

ipcMain.handle('get-last-sync', async () => {
  return await dbService.getLastSync();
});

// API Logs handlers
ipcMain.handle('get-api-logs', async (event, filters?: any) => {
  return await dbService.getApiLogs(filters);
});

// Tally Voucher Logs handlers
ipcMain.handle('get-tally-voucher-logs', async (event, filters?: any) => {
  return await dbService.getTallyVoucherLogs(filters);
});

// Tally Sync Logs handlers
ipcMain.handle('get-tally-sync-logs', async (event, filters?: any) => {
  return await dbService.getTallySyncLogs(filters);
});

// Analytics handler
ipcMain.handle('get-analytics', async () => {
  try {
    const profile = await dbService.getProfile();
    if (!profile || !profile.biller_id) {
      return null;
    }

    // Get sync stats
    const syncHistory = await dbService.getSyncHistory();
    const totalSyncs = syncHistory.length;
    const successfulSyncs = syncHistory.filter((s: any) => s.status === 'SUCCESS').length;
    const failedSyncs = totalSyncs - successfulSyncs;

    // Get last 7 days sync data
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const daySyncs = syncHistory.filter((s: any) => {
        const syncDate = new Date(s.started_at || s.created_at).toISOString().split('T')[0];
        return syncDate === dateStr;
      });
      last7Days.push({
        date: dateStr,
        count: daySyncs.length,
        success: daySyncs.filter((s: any) => s.status === 'SUCCESS').length,
        failed: daySyncs.filter((s: any) => s.status === 'FAILED').length
      });
    }

    // Get API stats
    const apiLogs = await dbService.getApiLogs({ limit: 10000 });
    const totalCalls = apiLogs.length;
    const successfulCalls = apiLogs.filter((l: any) => l.status === 'success').length;
    const failedCalls = totalCalls - successfulCalls;

    // Get last 7 days API data
    const last7DaysApi = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayLogs = apiLogs.filter((l: any) => {
        const logDate = new Date(l.created_at).toISOString().split('T')[0];
        return logDate === dateStr;
      });
      last7DaysApi.push({
        date: dateStr,
        count: dayLogs.length,
        success: dayLogs.filter((l: any) => l.status === 'success').length,
        failed: dayLogs.filter((l: any) => l.status === 'error').length
      });
    }

    // Get processing stats from backend API
    let processingStats = {
      customers: { total: 0, processed: 0, pending: 0, failed: 0 },
      invoices: { total: 0, processed: 0, pending: 0, failed: 0 },
      payments: { total: 0, processed: 0, pending: 0, failed: 0 }
    };

    try {
      const apiUrl = await getApiUrl(dbService);
      const apiKey = profile.apikey || '7061797A6F72726F74616C6C79';
      
      // Get staging stats from backend
      const statsRes = await axios.get(`${apiUrl}/billers/tally/staging-stats`, {
        params: { biller_id: profile.biller_id },
        headers: { 
          'API-KEY': apiKey,
          'X-Biller-Id': profile.biller_id
        },
        timeout: 10000
      }).catch((error: any) => {
        console.error('Error fetching staging stats:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status
        });
        return null;
      });

      if (statsRes?.data?.status === true && statsRes.data.customers) {
        processingStats = {
          customers: statsRes.data.customers || { total: 0, processed: 0, pending: 0, failed: 0 },
          invoices: statsRes.data.invoices || { total: 0, processed: 0, pending: 0, failed: 0 },
          payments: statsRes.data.payments || { total: 0, processed: 0, pending: 0, failed: 0 }
        };
      } else if (statsRes?.data && !statsRes.data.status) {
        console.warn('Staging stats API returned status false:', statsRes.data);
      }
    } catch (error: any) {
      console.error('Error fetching processing stats:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      // Continue with default values
    }

    return {
      syncStats: {
        totalSyncs,
        successfulSyncs,
        failedSyncs,
        last7Days
      },
      apiStats: {
        totalCalls,
        successfulCalls,
        failedCalls,
        last7Days: last7DaysApi
      },
      processingStats
    };
  } catch (error: any) {
    console.error('Error getting analytics:', error);
    return null;
  }
});

// Settings handlers
ipcMain.handle('get-setting', async (event, key: string) => {
  return await dbService.getSetting(key);
});

ipcMain.handle('set-setting', async (event, key: string, value: string) => {
  await dbService.setSetting(key, value);
  return { success: true };
});

ipcMain.handle('get-all-settings', async () => {
  return await dbService.getAllSettings();
});

// Log export/clear handlers
ipcMain.handle('clear-logs', async (event, logType: 'system' | 'api' | 'voucher') => {
  await dbService.clearLogs(logType);
  return { success: true };
});

// Sound handler (optional - can be implemented in renderer)
ipcMain.handle('play-sound', async (event, soundType: string) => {
  // Sound will be handled in renderer via Web Audio API
  return { success: true };
});

// Recent Sync History handlers
ipcMain.handle('get-recent-sync-history', async () => {
  return await dbService.getRecentSyncHistoryGrouped();
});

ipcMain.handle('get-sync-record-details', async (event, syncHistoryId: number, filters?: any) => {
  return await dbService.getSyncRecordDetails(syncHistoryId, filters);
});

ipcMain.handle('get-voucher-sync-summary', async () => {
  return await dbService.getVoucherSyncSummary();
});

// Company selection IPC handlers
ipcMain.handle('fetch-companies', async (event) => {
  try {
    const profile = await dbService.getProfile();
    if (!profile || !profile.biller_id) {
      return { success: false, error: 'No profile or biller_id found' };
    }

    const companies = await fetchCompanies(dbService);
    // Filter by biller_id and save to database
    const filteredCompanies = companies.filter(c => c.biller_id === profile.biller_id);
    
    // Save companies to database
    for (const companyData of filteredCompanies) {
      await companyRepository.upsertCompany(companyData);
    }

    // Get saved companies
    const savedCompanies = companyRepository.getAllCompanies(profile.biller_id);
    
    return { success: true, companies: savedCompanies };
  } catch (error: any) {
    console.error('Error fetching companies:', error);
    return { success: false, error: error.message || 'Failed to fetch companies' };
  }
});

ipcMain.handle('select-company', async (event, companyId: number) => {
  try {
    const profile = await dbService.getProfile();
    if (!profile || !profile.biller_id) {
      return { success: false, error: 'No profile found' };
    }

    // Set company as active (don't start sync yet - wait for Continue button)
    companyRepository.setActiveCompany(companyId, profile.biller_id);
    
    dbService.log('INFO', 'Company selected and set as active', {
      company_id: companyId,
      company_name: companyRepository.getCompanyById(companyId)?.name || 'Unknown'
    });

    // Don't start sync or open dashboard here - Continue button will handle that
    return { success: true };
  } catch (error: any) {
    console.error('Error selecting company:', error);
    return { success: false, error: error.message || 'Failed to select company' };
  }
});

ipcMain.handle('get-active-company', async () => {
  try {
    const profile = await dbService.getProfile();
    if (!profile || !profile.biller_id) {
      return null;
    }
    return companyRepository.getActiveCompany(profile.biller_id);
  } catch (error: any) {
    console.error('Error getting active company:', error);
    return null;
  }
});

ipcMain.handle('get-all-companies', async () => {
  try {
    const profile = await dbService.getProfile();
    if (!profile || !profile.biller_id) {
      return [];
    }
    return companyRepository.getAllCompanies(profile.biller_id);
  } catch (error: any) {
    console.error('Error getting all companies:', error);
    return [];
  }
});

// Database dump handler
ipcMain.handle('dump-database', async () => {
  try {
    const profile = await dbService.getProfile();
    if (!profile || !profile.biller_id) {
      return { success: false, error: 'No profile found' };
    }

    const organizationUuid = dbService.getCurrentOrganizationUuid();
    if (!organizationUuid) {
      return { success: false, error: 'No organization UUID found' };
    }

    const success = await dbService.dumpDatabaseToBackend(profile.biller_id, organizationUuid);
    return { success };
  } catch (error: any) {
    console.error('Error dumping database:', error);
    return { success: false, error: error.message };
  }
});

// Database restore handler
ipcMain.handle('restore-database', async () => {
  try {
    const profile = await dbService.getProfile();
    if (!profile || !profile.biller_id) {
      return { success: false, error: 'No profile found' };
    }

    // Extract organization UUID from profile
    let organizationUuid = '';
    if (profile?.organization?.response?.organization_id) {
      organizationUuid = String(profile.organization.response.organization_id).trim();
    } else if (profile?.organization?.organization_data) {
      let orgData = profile.organization.organization_data;
      if (typeof orgData === 'string') {
        try {
          orgData = JSON.parse(orgData);
        } catch (e) {
          console.warn('Failed to parse organization_data as JSON:', e);
        }
      }
      if (orgData?.organization_id) {
        organizationUuid = String(orgData.organization_id).trim();
      }
    }

    if (!organizationUuid) {
      return { success: false, error: 'No organization UUID found in profile' };
    }

    const success = await dbService.restoreDatabaseFromBackend(profile.biller_id, organizationUuid);
    if (success) {
      dbService.switchDatabase(organizationUuid);
    }
    return { success };
  } catch (error: any) {
    console.error('Error restoring database:', error);
    return { success: false, error: error.message };
  }
});

// Continue to dashboard handler
ipcMain.handle('continue-to-dashboard', async () => {
  try {
    const profile = await dbService.getProfile();
    if (!profile || !profile.biller_id) {
      return { success: false, error: 'No profile found' };
    }

    // Verify active company exists
    const activeCompany = companyRepository.getActiveCompany(profile.biller_id);
    if (!activeCompany) {
      return { success: false, error: 'No active company selected' };
    }

    // Send company data to backend before continuing
    try {
      const apiUrl = await getApiUrl(dbService);
      const apiKey = profile.apikey || '7061797A6F72726F74616C6C79';
      
      await axios.post(
        `${apiUrl}/billers/tally/set-organization`,
        {
          biller: [{
            biller_id: activeCompany.biller_id,
            name: activeCompany.name,
            organization_id: activeCompany.organization_id,
            tally_id: activeCompany.tally_id,
            address: activeCompany.address || '',
            state: activeCompany.state || '',
            country: activeCompany.country || 'India',
            pin: activeCompany.pin || '',
            trn: activeCompany.trn || '',
            gstin: activeCompany.gstin || ''
          }]
        },
        {
          headers: {
            'API-KEY': apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      dbService.log('INFO', 'Company data sent to backend successfully', {
        company_id: activeCompany.id,
        company_name: activeCompany.name
      });
    } catch (error: any) {
      console.error('Error sending company to backend:', error);
      dbService.log('ERROR', 'Failed to send company data to backend', {
        error: error.message,
        company_id: activeCompany.id
      });
      // Continue anyway - backend sync will retry
    }

    // Start background sync and create tray
    if (tray) {
      tray.destroy();
      tray = null;
    }
    app.setLoginItemSettings({ openAtLogin: true });
    createTrayAndStartSync(profile, syncService, dbService).catch(err => {
      console.error('Error creating tray and starting sync:', err);
    });
    
    // Open dashboard window
    createDashboardWindow(profile);
    
    // Close company selector window
    if (companySelectorWindow && !companySelectorWindow.isDestroyed()) {
      companySelectorWindow.close();
      companySelectorWindow = null;
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error continuing to dashboard:', error);
    return { success: false, error: error.message || 'Failed to continue to dashboard' };
  }
});

// Sync logs IPC handlers
ipcMain.handle('get-recent-sync-logs', async (event, limit: number = 20) => {
  try {
    const profile = await dbService.getProfile();
    if (!profile || !profile.biller_id) {
      return [];
    }
    const activeCompany = companyRepository.getActiveCompany(profile.biller_id);
    if (!activeCompany) {
      return [];
    }
    return await dbService.getRecentSyncLogs(limit);
  } catch (error: any) {
    console.error('Error getting recent sync logs:', error);
    return [];
  }
});

// Dashboard query handlers
ipcMain.handle('get-dashboard-stats', async () => {
  try {
    return await dbService.getDashboardStats();
  } catch (error: any) {
    console.error('get-dashboard-stats error:', error);
    return {
      totalCustomers: 0,
      totalVouchers: 0,
      invoiceCount: 0,
      receiptCount: 0,
      jvCount: 0,
      lastSyncTime: null
    };
  }
});

ipcMain.handle('get-customers', async (event, limit?: number, offset?: number, search?: string) => {
  return await dbService.getCustomers(limit, offset, search);
});

ipcMain.handle('get-vouchers', async (event, limit?: number, offset?: number, search?: string, voucherType?: string) => {
  return await dbService.getVouchers(limit, offset, search, voucherType);
});

ipcMain.handle('get-sync-history-with-batches', async (event, limit?: number) => {
  return await dbService.getSyncHistoryWithBatches(limit);
});

// Window control handlers
ipcMain.handle('window-minimize', () => {
  try {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.minimize();
      return { success: true };
    } else {
      console.warn('window-minimize: dashboardWindow not available or destroyed');
      return { success: false, error: 'Window not available' };
    }
  } catch (error: any) {
    console.error('Error minimizing window:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
});

ipcMain.handle('window-maximize', () => {
  try {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      if (dashboardWindow.isMaximized()) {
        dashboardWindow.unmaximize();
      } else {
        dashboardWindow.maximize();
      }
      return { success: true };
    } else {
      console.warn('window-maximize: dashboardWindow not available or destroyed');
      return { success: false, error: 'Window not available' };
    }
  } catch (error: any) {
    console.error('Error maximizing window:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
});

ipcMain.handle('window-close', () => {
  try {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.close();
      return { success: true };
    } else {
      console.warn('window-close: dashboardWindow not available or destroyed');
      return { success: false, error: 'Window not available' };
    }
  } catch (error: any) {
    console.error('Error closing window:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
});

ipcMain.handle('window-is-maximized', () => {
  try {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      return dashboardWindow.isMaximized();
    }
    return false;
  } catch (error: any) {
    console.error('Error checking window maximize state:', error);
    return false;
  }
});

async function createTrayAndStartSync(profile: any, syncServiceParam?: SyncService, dbServiceParam?: DatabaseService): Promise<void> {
  // Use provided services or fall back to global ones
  const syncSvc = syncServiceParam || syncService;
  const dbSvc = dbServiceParam || dbService;
  if (tray) return;

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets/icon.png')
    : path.join(__dirname, '../../assets/icon.png');

  tray = new Tray(iconPath);
  tray.setToolTip('Zorrofin Connect - Connected');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Dashboard',
      click: () => {
        if (dashboardWindow) {
          if (dashboardWindow.isVisible()) {
            dashboardWindow.hide();
          } else {
            dashboardWindow.show();
            dashboardWindow.focus();
          }
        } else {
          createDashboardWindow(profile); // Recreate if closed
        }
      }
    },
    { label: 'Sync Now', click: () => syncSvc.manualSync(profile) },
    { type: 'separator' },
    {
      label: 'Disconnect',
      click: async () => {
        const { response } = await dialog.showMessageBox({
          type: 'question',
          buttons: ['Cancel', 'Disconnect'],
          defaultId: 1,
          message: 'Disconnect?',
          detail: 'You will be logged out.',
        });

        if (response === 1) {
          syncSvc.stop();
          await dbSvc.logoutAndClearProfile();
          if (tray) {
            tray.destroy();
            tray = null;
          }
          if (dashboardWindow) {
            dashboardWindow.close();
            dashboardWindow = null;
          }
          createLoginWindow();
        }
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    // Default click: Toggle dashboard
    if (dashboardWindow) {
      if (dashboardWindow.isVisible()) {
        dashboardWindow.hide();
      } else {
        dashboardWindow.show();
        dashboardWindow.focus();
      }
    } else {
      createDashboardWindow(profile);
    }
  });

  // Update tray tooltip with status
  updateTrayTooltip();
  
  // Subscribe to status changes for tray updates
  tallyConnectivityService.onStatusChange(() => updateTrayTooltip());
  apiHealthService.onStatusChange(() => updateTrayTooltip());
  
  // Start background sync (check settings first)
  const backgroundSyncEnabled = await dbSvc.getSetting('backgroundSyncEnabled');
  if (backgroundSyncEnabled !== 'false') {
    await syncSvc.startBackgroundSync(profile);
  } else {
    console.log('Background sync is disabled in settings');
  }
  
  // Start connectivity monitoring if not already started
  const tallyStatus = tallyConnectivityService.getStatus();
  if (!tallyStatus.lastCheckTime) {
    startConnectivityMonitoring().catch(err => {
      console.error('Error starting connectivity monitoring:', err);
    });
  }
  
  console.log('Tray created + Background sync started');
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  console.log('App quitting → cleaning up...');
  syncService.stop();
  dbService.close();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const profile = dbService.getProfile().catch(() => null);
    if (profile) {
      createDashboardWindow(profile);
    } else {
      createLoginWindow();
    }
  }
});

/**
 * Start connectivity monitoring
 */
async function startConnectivityMonitoring(): Promise<void> {
  // Get intervals from settings or use defaults
  const tallyIntervalSetting = await dbService.getSetting('tallyHealthCheckInterval');
  const apiIntervalSetting = await dbService.getSetting('apiHealthCheckInterval');
  const tallyInterval = tallyIntervalSetting ? parseInt(tallyIntervalSetting, 10) : 30; // 30 seconds default
  const apiInterval = apiIntervalSetting ? parseInt(apiIntervalSetting, 10) : 60; // 60 seconds default

  // Start Tally monitoring
  tallyConnectivityService.startMonitoring(tallyInterval);
  
  // Subscribe to Tally status changes for notifications
  let wasTallyOnline = false;
  tallyConnectivityService.onStatusChange((status) => {
    if (status.isOnline && !wasTallyOnline) {
      notificationService.notifyTallyOnline(status.port);
    } else if (!status.isOnline && wasTallyOnline) {
      notificationService.notifyTallyOffline(status.port);
    }
    wasTallyOnline = status.isOnline;
    updateTrayTooltip();
  });

  // Start API monitoring
  apiHealthService.startMonitoring(apiInterval);
  
  // Subscribe to API status changes for notifications
  let wasApiOnline = false;
  apiHealthService.onStatusChange((status) => {
    if (status.isOnline && !wasApiOnline) {
      notificationService.notifyApiOnline();
    } else if (!status.isOnline && wasApiOnline) {
      notificationService.notifyApiOffline();
    }
    wasApiOnline = status.isOnline;
    updateTrayTooltip();
  });
}

/**
 * Update tray tooltip with current status
 */
function updateTrayTooltip(): void {
  if (!tray) return;

  const tallyStatus = tallyConnectivityService.getStatus();
  const apiStatus = apiHealthService.getStatus();
  
  const tallyText = tallyStatus.isOnline ? 'Online' : 'Offline';
  const apiText = apiStatus.isOnline ? 'Online' : 'Offline';
  
  const tooltip = `Zorrofin Connect\nTally: ${tallyText}\nAPI: ${apiText}`;
  tray.setToolTip(tooltip);
}

// IPC Handlers for status
ipcMain.handle('get-tally-status', async () => {
  try {
    const status = tallyConnectivityService.getStatus();
    
    // If status hasn't been checked recently (within last 5 seconds), perform immediate check
    const now = new Date();
    // Handle both Date object and null properly
    const lastCheck = status?.lastCheckTime instanceof Date 
      ? status.lastCheckTime 
      : (status?.lastCheckTime ? new Date(status.lastCheckTime) : null);
    
    const shouldCheck = !lastCheck || (now.getTime() - lastCheck.getTime()) > 5000;
    
    if (shouldCheck) {
      // Perform immediate check
      console.log('Performing immediate Tally connectivity check...');
      await tallyConnectivityService.checkConnectivity();
    }
    
    // Get updated status after check
    const updatedStatus = tallyConnectivityService.getStatus();
    
    console.log('Tally status response:', {
      isOnline: updatedStatus?.isOnline,
      lastCheckTime: updatedStatus?.lastCheckTime,
      port: updatedStatus?.port,
      errorMessage: updatedStatus?.errorMessage
    });
    
    // Ensure status always has required fields
    return {
      isOnline: updatedStatus?.isOnline ?? false,
      lastCheckTime: updatedStatus?.lastCheckTime instanceof Date 
        ? updatedStatus.lastCheckTime.toISOString() 
        : (updatedStatus?.lastCheckTime ? new Date(updatedStatus.lastCheckTime).toISOString() : null),
      lastSuccessTime: updatedStatus?.lastSuccessTime instanceof Date 
        ? updatedStatus.lastSuccessTime.toISOString() 
        : (updatedStatus?.lastSuccessTime ? new Date(updatedStatus.lastSuccessTime).toISOString() : null),
      errorMessage: updatedStatus?.errorMessage ?? null,
      port: updatedStatus?.port ?? 9000
    };
  } catch (error: any) {
    console.error('Error getting Tally status:', error);
    return {
      isOnline: false,
      lastCheckTime: null,
      lastSuccessTime: null,
      errorMessage: error?.message || 'Unknown error',
      port: 9000
    };
  }
});

ipcMain.handle('get-api-status', async () => {
  try {
    const status = apiHealthService.getStatus();
    
    // If status hasn't been checked recently (within last 5 seconds), perform immediate check
    const now = new Date();
    // Handle both Date object and null properly
    const lastCheck = status?.lastCheckTime instanceof Date 
      ? status.lastCheckTime 
      : (status?.lastCheckTime ? new Date(status.lastCheckTime) : null);
    
    const shouldCheck = !lastCheck || (now.getTime() - lastCheck.getTime()) > 5000;
    
    if (shouldCheck) {
      // Perform immediate check
      console.log('Performing immediate API health check...');
      await apiHealthService.checkHealth();
    }
    
    // Get updated status after check
    const updatedStatus = apiHealthService.getStatus();
    
    console.log('API status response:', {
      isOnline: updatedStatus?.isOnline,
      lastCheckTime: updatedStatus?.lastCheckTime,
      responseTime: updatedStatus?.responseTime,
      errorMessage: updatedStatus?.errorMessage
    });
    
    // Ensure status always has required fields
    return {
      isOnline: updatedStatus?.isOnline ?? false,
      lastCheckTime: updatedStatus?.lastCheckTime instanceof Date 
        ? updatedStatus.lastCheckTime.toISOString() 
        : (updatedStatus?.lastCheckTime ? new Date(updatedStatus.lastCheckTime).toISOString() : null),
      lastSuccessTime: updatedStatus?.lastSuccessTime instanceof Date 
        ? updatedStatus.lastSuccessTime.toISOString() 
        : (updatedStatus?.lastSuccessTime ? new Date(updatedStatus.lastSuccessTime).toISOString() : null),
      errorMessage: updatedStatus?.errorMessage ?? null,
      responseTime: updatedStatus?.responseTime ?? null
    };
  } catch (error: any) {
    console.error('Error getting API status:', error);
    return {
      isOnline: false,
      lastCheckTime: null,
      lastSuccessTime: null,
      errorMessage: error?.message || 'Unknown error',
      responseTime: null
    };
  }
});

ipcMain.handle('get-sync-status', async () => {
  // Get last sync info from database
  const lastSync = await dbService.getLastSync();
  const isRunning = syncService.isRunningSync();
  
  return {
    isRunning,
    lastSyncTime: lastSync?.last_successful_sync || null,
    status: isRunning ? 'running' : 'idle'
  };
});

ipcMain.handle('test-tally-connectivity', async () => {
  const result = await tallyConnectivityService.checkConnectivity();
  console.log('Tally connectivity test result:', { success: result, status: tallyConnectivityService.getStatus() });
  return { success: result, status: tallyConnectivityService.getStatus() };
});

ipcMain.handle('test-api-connectivity', async () => {
  const result = await apiHealthService.checkHealth();
  return { success: result, status: apiHealthService.getStatus() };
});

// Staging data IPC handlers
ipcMain.handle('get-staging-customers', async (event, page?: number, limit?: number, search?: string) => {
  try {
    const profile = await dbService.getProfile();
    if (!profile || !profile.biller_id || !profile.apikey) {
      console.error('Staging customers: Missing profile, biller_id, or API key', { 
        hasProfile: !!profile, 
        hasBillerId: !!profile?.biller_id, 
        hasApiKey: !!profile?.apikey 
      });
      return { 
        success: false, 
        error: 'No profile, biller_id, or API key found. Please login again.',
        details: [],
        paginate_data: {
          page: page || 1,
          limit: limit || 10,
          totalPages: 0,
          totalResults: 0
        }
      };
    }

    const apiUrl = await getApiUrl(dbService);
    console.log('Fetching staging customers:', { apiUrl, page, limit, search, biller_id: profile.biller_id });
    
    if (!apiUrl) {
      console.error('Staging customers: API URL is empty');
      return {
        success: false,
        error: 'API URL is not configured. Please check settings.',
        details: [],
        paginate_data: {
          page: page || 1,
          limit: limit || 10,
          totalPages: 0,
          totalResults: 0
        }
      };
    }
    
    const response = await axios.get(`${apiUrl}/billers/tally/tally-pending-customers`, {
      params: {
        search: search || '',
        page: page || 1,
        pageSize: String(limit || 10),
        biller_id: profile.biller_id // Also send in query params as fallback
      },
      headers: {
        'API-KEY': profile.apikey,
        'X-Biller-Id': profile.biller_id
      },
      timeout: 15000,
      validateStatus: (status) => status < 500 // Accept 4xx as valid responses
    });

    console.log('response==>', response)
    
    console.log('Staging customers response:', { 
      status: response.status, 
      dataKeys: Object.keys(response.data || {}),
      hasStatus: 'status' in (response.data || {}),
      statusValue: response.data?.status,
      hasDetails: 'details' in (response.data || {}),
      detailsLength: Array.isArray(response.data?.details) ? response.data.details.length : 'not array',
      fullResponse: JSON.stringify(response.data).substring(0, 500) // First 500 chars for debugging
    });

    // Handle HTTP error status codes (4xx)
    if (response.status >= 400 && response.status < 500) {
      const errorMsg = response.data?.message || response.data?.error || response.data?.status === false ? (response.data?.message || response.data?.error || 'Bad request') : 'Bad request';
      console.error('Staging customers HTTP error:', { status: response.status, error: errorMsg, data: response.data });
      return {
        success: false,
        error: errorMsg,
        details: [],
        paginate_data: {
          page: page || 1,
          limit: limit || 10,
          totalPages: 0,
          totalResults: 0
        }
      };
    }

    // Check if response has data
    if (response.data) {
      // Backend returns { status: true, details: [], paginate_data: {} }
      if (typeof response.data.status === 'boolean') {
        if (response.data.status === true) {
          return {
            success: true,
            details: response.data.details || [],
            paginate_data: response.data.paginate_data || {
              page: page || 1,
              limit: limit || 10,
              totalPages: 1,
              totalResults: 0
            }
          };
        } else {
          // status is false - return error
          const errorMsg = response.data.message || response.data.error || 'Request failed';
          console.error('Staging customers request failed:', errorMsg);
          return {
            success: false,
            error: errorMsg,
            details: [],
            paginate_data: {
              page: page || 1,
              limit: limit || 10,
              totalPages: 0,
              totalResults: 0
            }
          };
        }
      }
      // If response has details directly (without status field), assume success
      if (Array.isArray(response.data.details) || Array.isArray(response.data)) {
        return {
          success: true,
          details: response.data.details || response.data,
          paginate_data: response.data.paginate_data || {
            page: page || 1,
            limit: limit || 10,
            totalPages: 1,
            totalResults: 0
          }
        };
      }
    }

    // If we get here, response format is unexpected
    const errorMsg = response.data?.message || response.data?.error || 'Invalid response format';
    console.error('Staging customers invalid response format:', { data: response.data });
    return { 
      success: false, 
      error: errorMsg,
      details: [],
      paginate_data: {
        page: page || 1,
        limit: limit || 10,
        totalPages: 0,
        totalResults: 0
      }
    };
  } catch (error: any) {
    let errorMessage = 'Failed to fetch staging customers';
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      errorMessage = 'Cannot connect to API server. Please check if the server is running and the API URL is correct.';
    } else if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      errorMessage = 'Request timed out. The server may be slow or unreachable.';
    } else if (error.response) {
      // HTTP error response
      const status = error.response.status;
      if (status === 401 || status === 403) {
        errorMessage = 'Authentication failed. Please login again.';
      } else if (status === 404) {
        errorMessage = 'API endpoint not found. Please check the API URL.';
      } else if (status >= 500) {
        errorMessage = 'Server error. Please try again later.';
      } else {
        errorMessage = error.response?.data?.message || 
                      error.response?.data?.error || 
                      `Request failed with status ${status}`;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    console.error('Error fetching staging customers:', {
      message: error.message,
      errorMessage,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url
    });
    
    return {
      success: false,
      error: errorMessage,
      details: [],
      paginate_data: {
        page: page || 1,
        limit: limit || 10,
        totalPages: 0,
        totalResults: 0
      }
    };
  }
});

ipcMain.handle('get-staging-invoices', async (event, page?: number, limit?: number, search?: string) => {
  try {
    const profile = await dbService.getProfile();
    if (!profile || !profile.biller_id || !profile.apikey) {
      console.error('Staging invoices: Missing profile, biller_id, or API key', { 
        hasProfile: !!profile, 
        hasBillerId: !!profile?.biller_id, 
        hasApiKey: !!profile?.apikey 
      });
      return { 
        success: false, 
        error: 'No profile, biller_id, or API key found. Please login again.',
        details: [],
        paginate_data: {
          page: page || 1,
          limit: limit || 10,
          totalPages: 0,
          totalResults: 0
        }
      };
    }

    const apiUrl = await getApiUrl(dbService);
    console.log('Fetching staging invoices:', { apiUrl, page, limit, search, biller_id: profile.biller_id });
    
    if (!apiUrl) {
      console.error('Staging invoices: API URL is empty');
      return {
        success: false,
        error: 'API URL is not configured. Please check settings.',
        details: [],
        paginate_data: {
          page: page || 1,
          limit: limit || 10,
          totalPages: 0,
          totalResults: 0
        }
      };
    }
    
    const response = await axios.get(`${apiUrl}/billers/tally/tally-pending-invoices`, {
      params: {
        search: search || '',
        page: page || 1,
        pageSize: String(limit || 10),
        biller_id: profile.biller_id // Also send in query params as fallback
      },
      headers: {
        'API-KEY': profile.apikey,
        'X-Biller-Id': profile.biller_id
      },
      timeout: 15000,
      validateStatus: (status) => status < 500 // Accept 4xx as valid responses
    });
    
    console.log('Staging invoices response:', { 
      status: response.status, 
      dataKeys: Object.keys(response.data || {}),
      hasStatus: 'status' in (response.data || {}),
      statusValue: response.data?.status
    });

    // Handle HTTP error status codes (4xx)
    if (response.status >= 400 && response.status < 500) {
      const errorMsg = response.data?.message || response.data?.error || response.data?.status === false ? (response.data?.message || response.data?.error || 'Bad request') : 'Bad request';
      console.error('Staging invoices HTTP error:', { status: response.status, error: errorMsg, data: response.data });
      return {
        success: false,
        error: errorMsg,
        details: [],
        paginate_data: {
          page: page || 1,
          limit: limit || 10,
          totalPages: 0,
          totalResults: 0
        }
      };
    }

    // Check if response has data
    if (response.data) {
      // Backend returns { status: true, details: [], paginate_data: {} }
      if (typeof response.data.status === 'boolean') {
        if (response.data.status === true) {
          return {
            success: true,
            details: response.data.details || [],
            paginate_data: response.data.paginate_data || {
              page: page || 1,
              limit: limit || 10,
              totalPages: 1,
              totalResults: 0
            }
          };
        } else {
          // status is false - return error
          const errorMsg = response.data.message || response.data.error || 'Request failed';
          console.error('Staging invoices request failed:', errorMsg);
          return {
            success: false,
            error: errorMsg,
            details: [],
            paginate_data: {
              page: page || 1,
              limit: limit || 10,
              totalPages: 0,
              totalResults: 0
            }
          };
        }
      }
      // If response has details directly (without status field), assume success
      if (Array.isArray(response.data.details) || Array.isArray(response.data)) {
        return {
          success: true,
          details: response.data.details || response.data,
          paginate_data: response.data.paginate_data || {
            page: page || 1,
            limit: limit || 10,
            totalPages: 1,
            totalResults: 0
          }
        };
      }
    }

    // If we get here, response format is unexpected
    const errorMsg = response.data?.message || response.data?.error || 'Invalid response format';
    console.error('Staging invoices invalid response format:', { data: response.data });
    return { 
      success: false, 
      error: errorMsg,
      details: [],
      paginate_data: {
        page: page || 1,
        limit: limit || 10,
        totalPages: 0,
        totalResults: 0
      }
    };
  } catch (error: any) {
    let errorMessage = 'Failed to fetch staging invoices';
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      errorMessage = 'Cannot connect to API server. Please check if the server is running and the API URL is correct.';
    } else if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      errorMessage = 'Request timed out. The server may be slow or unreachable.';
    } else if (error.response) {
      // HTTP error response
      const status = error.response.status;
      if (status === 401 || status === 403) {
        errorMessage = 'Authentication failed. Please login again.';
      } else if (status === 404) {
        errorMessage = 'API endpoint not found. Please check the API URL.';
      } else if (status >= 500) {
        errorMessage = 'Server error. Please try again later.';
      } else {
        errorMessage = error.response?.data?.message || 
                      error.response?.data?.error || 
                      `Request failed with status ${status}`;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    console.error('Error fetching staging invoices:', {
      message: error.message,
      errorMessage,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url
    });
    
    return {
      success: false,
      error: errorMessage,
      details: [],
      paginate_data: {
        page: page || 1,
        limit: limit || 10,
        totalPages: 0,
        totalResults: 0
      }
    };
  }
});

ipcMain.handle('get-staging-payments', async (event, page?: number, limit?: number, search?: string) => {
  try {
    const profile = await dbService.getProfile();
    if (!profile || !profile.biller_id || !profile.apikey) {
      console.error('Staging payments: Missing profile, biller_id, or API key', { 
        hasProfile: !!profile, 
        hasBillerId: !!profile?.biller_id, 
        hasApiKey: !!profile?.apikey 
      });
      return { 
        success: false, 
        error: 'No profile, biller_id, or API key found. Please login again.',
        details: [],
        paginate_data: {
          page: page || 1,
          limit: limit || 10,
          totalPages: 0,
          totalResults: 0
        }
      };
    }

    const apiUrl = await getApiUrl(dbService);
    console.log('Fetching staging payments:', { apiUrl, page, limit, search, biller_id: profile.biller_id });
    
    if (!apiUrl) {
      console.error('Staging payments: API URL is empty');
      return {
        success: false,
        error: 'API URL is not configured. Please check settings.',
        details: [],
        paginate_data: {
          page: page || 1,
          limit: limit || 10,
          totalPages: 0,
          totalResults: 0
        }
      };
    }
    
    const response = await axios.get(`${apiUrl}/billers/tally/tally-pending-payments`, {
      params: {
        search: search || '',
        page: page || 1,
        pageSize: String(limit || 10),
        biller_id: profile.biller_id // Also send in query params as fallback
      },
      headers: {
        'API-KEY': profile.apikey,
        'X-Biller-Id': profile.biller_id
      },
      timeout: 15000,
      validateStatus: (status) => status < 500 // Accept 4xx as valid responses
    });
    
    console.log('Staging payments response:', { 
      status: response.status, 
      dataKeys: Object.keys(response.data || {}),
      hasStatus: 'status' in (response.data || {}),
      statusValue: response.data?.status
    });

    // Handle HTTP error status codes (4xx)
    if (response.status >= 400 && response.status < 500) {
      const errorMsg = response.data?.message || response.data?.error || response.data?.status === false ? (response.data?.message || response.data?.error || 'Bad request') : 'Bad request';
      console.error('Staging payments HTTP error:', { status: response.status, error: errorMsg, data: response.data });
      return {
        success: false,
        error: errorMsg,
        details: [],
        paginate_data: {
          page: page || 1,
          limit: limit || 10,
          totalPages: 0,
          totalResults: 0
        }
      };
    }

    // Check if response has data
    if (response.data) {
      // Backend returns { status: true, details: [], paginate_data: {} }
      if (typeof response.data.status === 'boolean') {
        if (response.data.status === true) {
          return {
            success: true,
            details: response.data.details || [],
            paginate_data: response.data.paginate_data || {
              page: page || 1,
              limit: limit || 10,
              totalPages: 1,
              totalResults: 0
            }
          };
        } else {
          // status is false - return error
          const errorMsg = response.data.message || response.data.error || 'Request failed';
          console.error('Staging payments request failed:', errorMsg);
          return {
            success: false,
            error: errorMsg,
            details: [],
            paginate_data: {
              page: page || 1,
              limit: limit || 10,
              totalPages: 0,
              totalResults: 0
            }
          };
        }
      }
      // If response has details directly (without status field), assume success
      if (Array.isArray(response.data.details) || Array.isArray(response.data)) {
        return {
          success: true,
          details: response.data.details || response.data,
          paginate_data: response.data.paginate_data || {
            page: page || 1,
            limit: limit || 10,
            totalPages: 1,
            totalResults: 0
          }
        };
      }
    }

    // If we get here, response format is unexpected
    const errorMsg = response.data?.message || response.data?.error || 'Invalid response format';
    console.error('Staging payments invalid response format:', { data: response.data });
    return { 
      success: false, 
      error: errorMsg,
      details: [],
      paginate_data: {
        page: page || 1,
        limit: limit || 10,
        totalPages: 0,
        totalResults: 0
      }
    };
  } catch (error: any) {
    let errorMessage = 'Failed to fetch staging payments';
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      errorMessage = 'Cannot connect to API server. Please check if the server is running and the API URL is correct.';
    } else if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      errorMessage = 'Request timed out. The server may be slow or unreachable.';
    } else if (error.response) {
      // HTTP error response
      const status = error.response.status;
      if (status === 401 || status === 403) {
        errorMessage = 'Authentication failed. Please login again.';
      } else if (status === 404) {
        errorMessage = 'API endpoint not found. Please check the API URL.';
      } else if (status >= 500) {
        errorMessage = 'Server error. Please try again later.';
      } else {
        errorMessage = error.response?.data?.message || 
                      error.response?.data?.error || 
                      `Request failed with status ${status}`;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    console.error('Error fetching staging payments:', {
      message: error.message,
      errorMessage,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url
    });
    
    return {
      success: false,
      error: errorMessage,
      details: [],
      paginate_data: {
        page: page || 1,
        limit: limit || 10,
        totalPages: 0,
        totalResults: 0
      }
    };
  }
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (dashboardWindow) {
      dashboardWindow.show();
    } else if (loginWindow) {
      loginWindow.show();
    }
  });
}