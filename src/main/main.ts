import { app, BrowserWindow, Tray, Menu, ipcMain, dialog } from 'electron';
import * as path from 'path';
import axios from 'axios';
import { DatabaseService } from '../services/database/database.service'; // Adjust path as per your structure
import { SyncService } from '../services/sync/sync.service';
import { OrganizationService } from '../services/sync/send-to-platfrom/organization.service';
import { ApiLoggerService } from '../services/api/api-logger.service';
import { getApiUrl, getDefaultApiUrl } from '../services/config/api-url-helper';


let tray: Tray | null = null;
let loginWindow: BrowserWindow | null = null;
let dashboardWindow: BrowserWindow | null = null; // New: Dashboard window

const dbService = new DatabaseService();
const organizationService = new OrganizationService(dbService);
const syncService = new SyncService(dbService, organizationService);
const apiLogger = new ApiLoggerService(dbService);

// Setup API logging interceptor
apiLogger.setupInterceptor(axios);

ipcMain.on('login-success', async () => {
  console.log('login-success event received → Starting background mode & loading dashboard');
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

  if (tray) {
    tray.destroy();
    tray = null;
  }

  app.setLoginItemSettings({ openAtLogin: true });
  createTrayAndStartSync(profile);
  createDashboardWindow(profile); // New: Create dashboard window after login
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
    console.log('Profile found → Starting in background + dashboard');
    app.setLoginItemSettings({ openAtLogin: true });
    createTrayAndStartSync(profile);
    createDashboardWindow(profile); // Load dashboard if profile exists
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
      preload: path.join(__dirname, '../renderer/login/preload.js'),
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

// New: Create Dashboard Window
function createDashboardWindow(profile: any): void {
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

  // Show window once loaded
  dashboardWindow.once('ready-to-show', () => {
    dashboardWindow?.show();
    dashboardWindow?.focus();
  });

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
    // getApiUrl already normalizes localhost to 127.0.0.1
    console.log(`Attempting login to: ${apiUrl}/billers/tally/login`);

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

      const profile = await dbService.getProfile();
      if (profile) {
        if (tray) {
          tray.destroy();
          tray = null;
        }
        app.setLoginItemSettings({ openAtLogin: true });
        createTrayAndStartSync(profile);
        createDashboardWindow(profile); // Create and prepare dashboard
      }

      return { success: true };
    } else {
      return { success: false, message: data.message || 'Login failed' };
    }
  } catch (error: any) {
    console.error('Login error:', error.message);

    // Provide more helpful error messages
    const apiUrl = await getApiUrl(dbService);
    const normalizedUrl = apiUrl.replace('localhost', '127.0.0.1');
    let errorMessage = 'Server not reachable';
    if (error.code === 'ECONNREFUSED') {
      errorMessage = `Cannot connect to backend at ${normalizedUrl}. Please ensure tally-gateway is running on port 5000. Run: npx nx run tally-gateway:serve`;
    } else if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      errorMessage = 'Connection timeout. Please check if the backend server is running.';
    } else if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      success: false,
      message: errorMessage,
    };
  }
});

// New IPC for manual sync from dashboard
ipcMain.handle('manual-sync', async (event) => {
  try {
    const profile = await dbService.getProfile();
    if (!profile) {
      return { success: false, error: 'No profile found' };
    }
    if (dashboardWindow && !dashboardWindow.isDestroyed() && !dashboardWindow.webContents.isDestroyed()) {
      try {
        dashboardWindow.webContents.send('sync-started');
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
    return { success: true };
  } catch (error: any) {
    console.error('Manual sync error:', error);
    if (dashboardWindow && !dashboardWindow.isDestroyed() && !dashboardWindow.webContents.isDestroyed()) {
      try {
        dashboardWindow.webContents.send('sync-completed');
      } catch (err) {
        console.error('Error sending sync-completed event:', err);
      }
    }
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

ipcMain.handle('get-logs', async (event, limit?: number) => {
  return await dbService.getLogs(limit || 500);
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
ipcMain.handle('clear-logs', async (event, logType: 'system' | 'api') => {
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
  // sync_record_details table removed in thin client architecture
  // Return sync batch details instead
  try {
    const batches = await dbService.getSyncBatchesByRunId(syncHistoryId);
    return batches || [];
  } catch (error: any) {
    console.error('get-sync-record-details error:', error);
    return [];
  }
});

ipcMain.handle('get-voucher-sync-summary', async () => {
  return await dbService.getVoucherSyncSummary();
});

// Dashboard query handlers - Now fetch from backend API
ipcMain.handle('get-dashboard-stats', async () => {
  try {
    const profile = await dbService.getProfile();
    if (!profile) {
      return {
        totalCustomers: 0,
        totalVouchers: 0,
        invoiceCount: 0,
        receiptCount: 0,
        jvCount: 0,
        lastSyncTime: null
      };
    }

    const apiUrl = await getApiUrl(dbService);
    // getApiUrl already normalizes localhost to 127.0.0.1, but ensure port 5000
    const baseUrl = apiUrl.replace(/:\d+/, ':5000').replace('localhost', '127.0.0.1');

    // Fetch customers and vouchers count from backend
    const [customersRes, vouchersRes] = await Promise.allSettled([
      axios.get(`${baseUrl}/customers`, {
        headers: {
          'API-KEY': profile.apikey || '7061797A6F72726F74616C6C79',
          'Authorization': `Bearer ${profile.token}`
        },
        params: { page: 1, limit: 1 }
      }),
      axios.get(`${baseUrl}/vouchers`, {
        headers: {
          'API-KEY': profile.apikey || '7061797A6F72726F74616C6C79',
          'Authorization': `Bearer ${profile.token}`
        },
        params: { page: 1, limit: 1 }
      })
    ]);

    const totalCustomers = customersRes.status === 'fulfilled' ? customersRes.value.data?.pagination?.total || 0 : 0;
    const totalVouchers = vouchersRes.status === 'fulfilled' ? vouchersRes.value.data?.pagination?.total || 0 : 0;

    const lastSync = await dbService.getLastSync();

    return {
      totalCustomers,
      totalVouchers,
      invoiceCount: 0, // Can be calculated from vouchers if needed
      receiptCount: 0,
      jvCount: 0,
      lastSyncTime: lastSync?.last_successful_sync || null
    };
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
  try {
    const profile = await dbService.getProfile();
    if (!profile) {
      return { customers: [], total: 0 };
    }

    const apiUrl = await getApiUrl(dbService);
    // getApiUrl already normalizes localhost to 127.0.0.1, but ensure port 5000
    const baseUrl = apiUrl.replace(/:\d+/, ':5000').replace('localhost', '127.0.0.1');

    const page = offset && limit ? Math.floor(offset / limit) + 1 : 1;
    const pageLimit = limit || 20;

    const response = await axios.get(`${baseUrl}/customers`, {
      headers: {
        'API-KEY': profile.apikey || '7061797A6F72726F74616C6C79',
        'Authorization': `Bearer ${profile.token}`
      },
      params: {
        page,
        limit: pageLimit,
        ...(search && { search })
      }
    });

    return {
      customers: response.data.data || [],
      total: response.data.pagination?.total || 0
    };
  } catch (error: any) {
    console.error('get-customers error:', error);
    return { customers: [], total: 0 };
  }
});

ipcMain.handle('get-vouchers', async (event, limit?: number, offset?: number, search?: string, voucherType?: string) => {
  try {
    const profile = await dbService.getProfile();
    if (!profile) {
      return { vouchers: [], total: 0 };
    }

    const apiUrl = await getApiUrl(dbService);
    // getApiUrl already normalizes localhost to 127.0.0.1, but ensure port 5000
    const baseUrl = apiUrl.replace(/:\d+/, ':5000').replace('localhost', '127.0.0.1');

    const page = offset && limit ? Math.floor(offset / limit) + 1 : 1;
    const pageLimit = limit || 20;

    const response = await axios.get(`${baseUrl}/vouchers`, {
      headers: {
        'API-KEY': profile.apikey || '7061797A6F72726F74616C6C79',
        'Authorization': `Bearer ${profile.token}`
      },
      params: {
        page,
        limit: pageLimit,
        ...(voucherType && { type: voucherType }),
        ...(search && { search })
      }
    });

    return {
      vouchers: response.data.data || [],
      total: response.data.pagination?.total || 0
    };
  } catch (error: any) {
    console.error('get-vouchers error:', error);
    return { vouchers: [], total: 0 };
  }
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

function createTrayAndStartSync(profile: any): void {
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
    { label: 'Sync Now', click: () => syncService.manualSync(profile) },
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

  // Start background sync
  syncService.startBackgroundSync(profile);
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