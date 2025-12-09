import { app, BrowserWindow, Tray, Menu, ipcMain, dialog } from 'electron';
import * as path from 'path';
import axios from 'axios';
import { DatabaseService } from '../services/database/database.service';  // Adjust path
// Assume existing: import { ConfigService } from '../services/config/config.service';
// Assume: import { SyncService } from '../services/sync/sync.service';

let tray: Tray | null = null;
const dbService = new DatabaseService();
// Assume: const configService = new ConfigService();
// Assume: const syncService = new SyncService();

let loginWindow: BrowserWindow | null = null;

app.whenReady().then(async () => {
  try {
    // Prevent default menu
    Menu.setApplicationMenu(null);

    const profile = await dbService.getProfile();
    if (profile) {
      console.log('Profile found:', profile.email, 'starting background tray mode');
      // Set auto-start
      if (!app.getLoginItemSettings().openAtLogin) {
        app.setLoginItemSettings({ openAtLogin: true });
      }
      // Directly create tray and start sync (no window)
      createTrayAndStartSync(profile);
    } else {
      console.log('No profile, opening login window');
      createLoginWindow();
    }
  } catch (err: any) {
    console.error('App ready error:', err);
    dialog.showErrorBox('Startup Error', 'Failed to initialize: ' + err?.message);
    app.quit();
  }
});

// Create small login window (modal-like, but frameless for hide)
function createLoginWindow(): void {
  loginWindow = new BrowserWindow({
    width: 400,
    height: 300,
    show: false,
    frame: false,  // Frameless for clean look (add custom close if needed)
    resizable: false,
    alwaysOnTop: true,  // Keep on top during login
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../renderer/login/preload.js')
    }
  });

  loginWindow.loadFile(path.join(__dirname, '../renderer/login/login.html'));

  loginWindow.once('ready-to-show', () => {
    loginWindow?.center();  // Center on screen
    loginWindow?.show();
  });

  loginWindow.on('closed', () => {
    loginWindow = null;
    // If closed without success, quit (no background run)
    app.quit();
  });

  // Escape key to close (optional)
  loginWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.code === 'Escape') {
      loginWindow?.close();
    }
  });
}

// IPC: Handle login (same as before, but trigger success event)
ipcMain.handle('login', async (event, credentials: { email: string; password: string }) => {
  try {
    const backendUrl = 'http://localhost:3000';  // Or configService.get('backendUrl') || 'http://localhost:9000';
    const response = await axios.post(`${backendUrl}/auth/login`, credentials, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000  // 10s timeout
    });

    const { token, biller_id, apikey, organization } = response.data;

    if (!token) {
      throw new Error('No token received from server');
    }

    // Save profile
    await dbService.saveProfile(credentials.email, token, biller_id, apikey, organization);

    // Optional: Update config
    // configService.setMultiple({ apiToken: token, billerId: biller_id, apikey, organization });

    // Emit success to renderer (for close)
    setTimeout(() => {
      ipcMain.emit('login-success');  // Wait for DB save
    }, 100);

    return { success: true };
  } catch (error: any) {
    console.error('Login error:', error);
    return {
      success: false,
      message: error.response?.data?.message || error.message || 'Login failed. Check credentials and server.'
    };
  }
});

// Listen for login success (from renderer or main)
ipcMain.on('login-success', async () => {
  console.log('Login successful, hiding window and starting background');
  if (loginWindow) {
    loginWindow.hide();  // Hide first
    loginWindow.close();  // Then close to free resources
    loginWindow = null;
  }
  // Reload profile and start tray
  const profile = await dbService.getProfile();
  if (profile) {
    createTrayAndStartSync(profile);
  }
  // Enable auto-start
  app.setLoginItemSettings({ openAtLogin: true });
});

// Core: Create tray for background mode
function createTrayAndStartSync(profile?: any): void {
  if (tray) return;  // Already created

  // Icon path (add to assets/ or build)
  const iconPath = path.join(__dirname, '../../assets/icon.png');  // 16x16 PNG for tray

  tray = new Tray(iconPath);

  // Tooltip with status
  tray.setToolTip('Zoroflex Connect - Running (Biller: ' + (profile?.biller_id || 'N/A') + ')');

  // Context menu for tray (right-click)
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Status: Connected',
      enabled: false,
      icon: path.join(__dirname, profile ? '../../assets/check.png' : '../../assets/error.png')  // Optional icons
    },
    { type: 'separator' },
    {
      label: 'Sync Now',
      click: () => {
        // Assume syncService.manualSync(profile);
        console.log('Manual sync triggered');
        dbService.logSync('manual', 'started');
      }
    },
    {
      label: 'Open Dashboard',  // If you add main window later
      click: () => {
        // createMainWindow();  // Uncomment if needed
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Zoroflex',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  // Double-click tray to show/hide (optional, for status)
  tray.on('double-click', () => {
    // Show notification or log
    console.log('Tray double-click: App is running in background');
  });

  // Start background sync
  console.log('Creating tray and starting sync in background');
  // syncService.startBackground(profile);  // Assume your sync loop/cron
  // Example: setInterval(() => syncService.syncTallyToBackend(profile), 60000);  // Every min
  dbService.logSync('startup', 'success', { profile: profile?.email });

  // Hide dock icon (macOS) or minimize
  app.dock?.hide();  // macOS
}

// Optional: Create main window (for dashboard, if needed later)

// App events: Stay in tray, no quit on window close
app.on('window-all-closed', () => {
  // Don't quit if tray exists (background mode)
  if (!tray && process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (tray) {
    tray.destroy();
    tray = null;
  }
  dbService.close();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && !tray) {
    createLoginWindow();
  }
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus if another instance
    if (loginWindow) loginWindow.show();
  });
}