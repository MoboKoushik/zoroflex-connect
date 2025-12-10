import { app, BrowserWindow, Tray, Menu, ipcMain, dialog } from 'electron';
import * as path from 'path';
import axios from 'axios';
import { DatabaseService } from '../services/database/database.service';
import { SyncService } from '../services/sync/sync.service';

let tray: Tray | null = null;
let loginWindow: BrowserWindow | null = null;

const dbService = new DatabaseService();
const syncService = new SyncService();


ipcMain.on('login-success', async () => {
  console.log('login-success event received → Starting background mode');
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
});


app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  const profile = await dbService.getProfile().catch(() => null);

  if (profile) {
    console.log('Profile found → Starting in background');
    app.setLoginItemSettings({ openAtLogin: true });
    createTrayAndStartSync(profile);
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
    height: 300,
    show: false,
    frame: true,
    resizable: false,
    maximizable: false,
    title: 'Zoroflex Connect',
    icon: path.join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../renderer/login/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  loginWindow.loadFile(path.join(__dirname, '../renderer/login/login.html'));

  loginWindow.once('ready-to-show', () => {
    loginWindow?.show();
    loginWindow?.center();
  });

  loginWindow.on('closed', () => {
    loginWindow = null;
  });
}

ipcMain.handle('login', async (event, credentials: { email: string; password: string }) => {
  console.log('Login attempt:', credentials.email);

  try {
    const { data } = await axios.post('http://localhost:3000/billers/tally/login', credentials, {
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

function createTrayAndStartSync(profile: any): void {
  if (tray) return;

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets/icon.png')
    : path.join(__dirname, '../../assets/icon.png');

  tray = new Tray(iconPath);
  tray.setToolTip('Zoroflex Connect - Connected');

  const contextMenu = Menu.buildFromTemplate([
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
          await dbService.clearProfile();
          tray?.destroy();
          tray = null;
          createLoginWindow();
        }
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => tray?.popUpContextMenu());

  // syncService.startBackground(profile);
  console.log('Tray created + Background sync started');
}

app.on('window-all-closed', () => {
  // 
});

app.on('before-quit', () => {
  console.log('App quitting → cleaning up...');
  syncService.stop();
  dbService.close();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createLoginWindow();
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    loginWindow?.show();
  });
}