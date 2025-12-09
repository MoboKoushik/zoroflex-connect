import { app, BrowserWindow, Tray, Menu, ipcMain } from 'electron';
import * as path from 'path';
import axios from 'axios';
import { DatabaseService } from '../services/database/database.service';
import { SyncService } from '../services/sync/sync.service';

// TALLY ODBC : TallyODBC64_9000

let tray: Tray | null = null;
const dbService = new DatabaseService();
const syncService = new SyncService();
let loginWindow: BrowserWindow | null = null;

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  let profile = null;
  try {
    profile = await dbService.getProfile();
  } catch (err) {
    console.error('Profile check failed:', err);
  }

  if (profile) {
    console.log('Profile found, starting background');
    app.setLoginItemSettings({ openAtLogin: true });
    createTrayAndStartSync(profile);
  } else {
    console.log('No profile, opening login');
    createLoginWindow();
  }
});

function createLoginWindow(): void {
  loginWindow = new BrowserWindow({
    width: 340,
    height: 280,
    show: false,
    frame: true,
    resizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, '../renderer/login/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const loginPath = path.join(__dirname, '../renderer/login/login.html');
  console.log('Loading login:', loginPath);
  loginWindow.loadFile(loginPath);
  loginWindow?.webContents.openDevTools({ mode: 'detach' });

  loginWindow.once('ready-to-show', () => {
    loginWindow?.center();
    loginWindow?.show();
  });
}
ipcMain.handle('login', async (event, credentials: { email: string; password: string }) => {
  console.log('Electron received login request:', credentials);

  try {
    const response = await axios.post('http://localhost:3000/billers/tally/login', credentials, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('Backend responded SUCCESS:', response.data);

    const { token, biller_id, apikey, organization } = response.data;
    await dbService.saveProfile(credentials.email, token, biller_id, apikey, organization);

    event.sender.send('login-success');

    return { success: true };

  } catch (error: any) {
    console.error('Backend ERROR:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('Backend is not running on port 3000!');
      return { success: false, message: 'Server not running (port 3000)' };
    }
    if (error.response) {
      console.error('Backend returned error:', error.response.data);
      return { success: false, message: error.response.data.message || 'Invalid credentials' };
    }
    return { success: false, message: 'Network error' };
  }
});

ipcMain.on('login-success', async () => {
  console.log('Login successful! Closing login window...');

  if (loginWindow) {
    loginWindow.close();
    loginWindow = null;
  }

  let profile = null;
  try {
    profile = await dbService.getProfile();
  } catch (err) {
    console.error('Profile load failed after login:', err);
  }

  if (profile) {
    createTrayAndStartSync(profile);
    app.setLoginItemSettings({ openAtLogin: true });
  }
});

function createTrayAndStartSync(profile: any): void {
  if (tray) return;

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets/icon.png')
    : path.join(__dirname, '../../assets/icon.png');

  tray = new Tray(iconPath);
  tray.setToolTip('Zoroflex Connect - Running in background');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Sync Now', click: () => syncService.manualSync(profile) },
    { type: 'separator' },
    { label: 'Open Login Again', click: () => createLoginWindow() },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setContextMenu(contextMenu);

  syncService.startBackground(profile);

  console.log('App is now running in background (Tray mode)');
}

app.on('window-all-closed', () => {
  if (!tray && process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  dbService.close();
  syncService.stop();
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) app.quit();