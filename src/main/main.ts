import { app, BrowserWindow, Tray, Menu, ipcMain } from 'electron';
import * as path from 'path';
import axios from 'axios';
import { DatabaseService } from '../services/database/database.service';
import { SyncService } from '../services/sync/sync.service';

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

  loginWindow.once('ready-to-show', () => {
    loginWindow?.center();
    loginWindow?.show();
  });
}
ipcMain.handle('login', async (event, credentials: { email: string; password: string }) => {
  try {
    const response = await axios.post('http://localhost:3000/auth/login', credentials);
    const { token, biller_id, apikey, organization } = response.data;
    await dbService.saveProfile(credentials.email, token, biller_id, apikey, organization);
    setTimeout(() => ipcMain.emit('login-success'), 100);
    return { success: true };
  } catch (error: any) {
    return { success: false, message: error.response?.data?.message || 'Login failed' };
  }
});

ipcMain.on('login-success', async () => {
  if (loginWindow) loginWindow.close();
  const profile = await dbService.getProfile();
  if (profile) createTrayAndStartSync(profile);
  app.setLoginItemSettings({ openAtLogin: true });
});

function createTrayAndStartSync(profile: any): void {
  if (tray) return;
  const iconPath = process.env.NODE_ENV === 'development'
    ? path.join(__dirname, '../../assets/icon.png')
    : path.join(process.resourcesPath, 'assets/icon.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Zoroflex Connect Running');

  if (process.platform === 'win32') {
    app.setAppUserModelId('com.zoroflex.connect');
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Sync Now', click: () => syncService.manualSync(profile) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setContextMenu(contextMenu);

  syncService.startBackground(profile);
  app.dock?.hide();
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