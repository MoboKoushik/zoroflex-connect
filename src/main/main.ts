import { app, BrowserWindow, Tray, Menu, ipcMain, dialog } from 'electron';
import * as path from 'path';
import axios from 'axios';
import { DatabaseService } from '../services/database/database.service';
import { SyncService } from '../services/sync/sync.service';  // Now import

let tray: Tray | null = null;
const dbService = new DatabaseService();
const syncService = new SyncService();  // Instantiate

let loginWindow: BrowserWindow | null = null;

app.whenReady().then(async () => {
  try {
    Menu.setApplicationMenu(null);

    let profile: any = null;
    try {
      profile = await dbService.getProfile();
    } catch (dbErr) {
      console.error('Profile check failed, treating as no profile:', dbErr);
      // Don't quit – open login anyway
    }

    if (profile) {
      console.log('Profile found:', profile.email, 'starting background tray mode');
      if (!app.getLoginItemSettings().openAtLogin) {
        app.setLoginItemSettings({ openAtLogin: true });
      }
      createTrayAndStartSync(profile);
    } else {
      console.log('No profile or DB error, opening login window');
      createLoginWindow();
    }
  } catch (err: any) {
    console.error('App ready error:', err);
    dialog.showErrorBox('Startup Error', 'Failed to initialize: ' + err?.message);
    // Don't quit – try open login
    setTimeout(() => createLoginWindow(), 1000);
  }
});

function createLoginWindow(): void {
  if (loginWindow) return;  // Prevent multiple

  loginWindow = new BrowserWindow({
    width: 400,
    height: 300,
    show: false,
    frame: true,  // Change to true for close button visibility
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../renderer/login/preload.js')
    }
  });

  const htmlPath = path.join(__dirname, '../renderer/login/login.html');
  loginWindow.loadFile(htmlPath).catch((loadErr) => {
    console.error('Load login.html failed:', loadErr);
    dialog.showErrorBox('UI Error', 'Login UI missing. Check files.');
    loginWindow?.close();
  });

  loginWindow.webContents.on('did-fail-load', (event, errorCode, errorDesc, validatedURL) => {
    console.error('Login load fail:', errorDesc);
    // Force show empty window or quit
    setTimeout(() => {
      loginWindow?.show();
      loginWindow?.center();
    }, 500);
  });

  loginWindow.once('ready-to-show', () => {
    loginWindow?.center();
    loginWindow?.show();
    console.log('Login window shown');
  });

  loginWindow.on('closed', () => {
    loginWindow = null;
    app.quit();  // Quit if no login
  });

  loginWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.code === 'Escape') {
      loginWindow?.close();
    }
  });
}

// IPC login (backend 3000)
ipcMain.handle('login', async (event, credentials: { email: string; password: string }) => {
  try {
    const backendUrl = 'http://localhost:3000';
    const response = await axios.post(`${backendUrl}/auth/login`, credentials, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    const { token, biller_id, apikey, organization } = response.data;

    if (!token) throw new Error('No token received');

    await dbService.saveProfile(credentials.email, token, biller_id, apikey, organization);

    setTimeout(() => ipcMain.emit('login-success'), 100);

    return { success: true };
  } catch (error: any) {
    console.error('Login error:', error);
    return {
      success: false,
      message: error.response?.data?.message || error.message || 'Login failed.'
    };
  }
});

ipcMain.on('login-success', async () => {
  console.log('Login successful, starting background');
  if (loginWindow) {
    loginWindow.hide();
    loginWindow.close();
  }
  let profile = await dbService.getProfile().catch(() => null);
  if (profile) {
    createTrayAndStartSync(profile);
  }
  app.setLoginItemSettings({ openAtLogin: true });
});

function createTrayAndStartSync(profile?: any): void {
  if (tray) return;

  const iconPath = path.join(__dirname, '../../assets/icon.png');
  tray = new Tray(iconPath);

  tray.setToolTip('Zoroflex Connect - Running (Biller: ' + (profile?.biller_id || 'N/A') + ')');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Status: Connected', enabled: false },
    { type: 'separator' },
    {
      label: 'Sync Now',
      click: () => {
        syncService.manualSync(profile);  // Now calls real sync
        console.log('Manual sync triggered');
      }
    },
    { label: 'Open Dashboard', click: () => {} },  // Add later
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => console.log('App running in background'));

  // Start background sync
  console.log('Starting background sync');
  syncService.startBackground(profile);  // Now real
  dbService.logSync('startup', 'success', { profile: profile?.email });

  app.dock?.hide();
}

// App events
app.on('window-all-closed', () => {
  if (!tray && process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (tray) tray.destroy();
  dbService.close();
  syncService.stop();  // Add stop method
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && !tray) createLoginWindow();
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) app.quit();
else {
  app.on('second-instance', () => loginWindow?.show());
}