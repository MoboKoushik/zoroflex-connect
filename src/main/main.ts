import { app, BrowserWindow, Tray, Menu, ipcMain, dialog } from 'electron';
import * as path from 'path';
import axios from 'axios';
import { DatabaseService } from '../services/database/database.service'; // Adjust path as per your structure
import { SyncService } from '../services/sync/sync.service';
import { OrganizationService } from '../services/sync/send-to-platfrom/organization.service';


let tray: Tray | null = null;
let loginWindow: BrowserWindow | null = null;
let dashboardWindow: BrowserWindow | null = null; // New: Dashboard window

const dbService = new DatabaseService();
const organizationService = new OrganizationService(dbService);
const syncService = new SyncService(dbService, organizationService);

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
    width: 380,
    height: 280,
    show: false,
    frame: true,
    resizable: false,
    maximizable: false,
    title: 'Zoroflex Connect - Login',
    icon: path.join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../renderer/login/preload.js'), // Adjust if separate
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  loginWindow.loadFile(path.join(__dirname, '../renderer/login/login.html'));

  // Open DevTools automatically in development
  loginWindow.webContents.once('did-finish-load', () => {
    loginWindow?.webContents.openDevTools({ mode: 'detach' }); // or 'right', 'bottom', etc.
  });

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
    width: 1200,
    height: 800,
    show: false, // Start hidden; show on tray click
    frame: true,
    resizable: true,
    maximizable: true,
    title: 'Zoroflex Connect - Dashboard',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '../preload/dashboard-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the dashboard HTML (which renders React Dashboard)
  dashboardWindow.loadFile(path.join(__dirname, '../renderer/dashboard/index.html'));

  // Pass profile data via IPC once loaded
  dashboardWindow.webContents.once('did-finish-load', () => {
    dashboardWindow?.webContents.send('profile-data', profile);
  });

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });

  // Auto-show after a delay if you want (optional)
  // setTimeout(() => dashboardWindow?.show(), 1000);
}

ipcMain.handle('login', async (event, credentials: { email: string; password: string }) => {
  console.log('Login attempt:', credentials.email);

  try {
    const { data } = await axios.post('https://uatarm.a10s.in/billers/tally/login', credentials, {
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
    return {
      success: false,
      message: error.response?.data?.message || 'Server not reachable',
    };
  }
});

// New IPC for manual sync from dashboard
ipcMain.handle('manual-sync', async (event) => {
  const profile = await dbService.getProfile();
  if (profile && dashboardWindow) {
    dashboardWindow.webContents.send('sync-started');
    await syncService.manualSync(profile);
    dashboardWindow.webContents.send('sync-completed');
  }
  return { success: true };
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
  return await dbService.getProfile();
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

function createTrayAndStartSync(profile: any): void {
  if (tray) return;

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets/icon.png')
    : path.join(__dirname, '../../assets/icon.png');

  tray = new Tray(iconPath);
  tray.setToolTip('Zoroflex Connect - Connected');

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