import { app, Tray, Menu, nativeImage, Notification } from 'electron';
import * as path from 'path';
import { createWindow, showWindow, hideWindow } from './window';
import { initializeBackgroundServices, getSyncManager, getScheduledSync, restartSyncServices } from './background';

let tray: Tray | null = null;
let isQuitting = false;

app.setAppUserModelId('com.zorroflex.tally-sync');

// Handle app ready
app.whenReady().then(() => {
  // Initialize background services
  initializeBackgroundServices();

  // Create system tray
  createTray();

  // Create window (hidden initially)
  createWindow();

  // Show notification
  if (Notification.isSupported()) {
    new Notification({
      title: 'Tally Sync',
      body: 'Tally sync service is running in the background',
    }).show();
  }

  // Handle app activation (macOS)
  app.on('activate', () => {
    // Show a window if none are open (macOS convention)
    // BrowserWindow.getAllWindows() returns the current open windows
    const { BrowserWindow } = require('electron');
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      showWindow();
    }
  });
  });

// Prevent app from closing when all windows are closed
app.on('window-all-closed', (event: { preventDefault: () => void; }) => {
  if (!isQuitting) {
    event.preventDefault();
    hideWindow();
  }
});

// Handle app quit
app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  // Cleanup
  if (tray) {
    tray.destroy();
  }
});

function createTray(): void {
  // Create tray icon (using a simple icon path - you can replace with actual icon)
  const iconPath = path.join(__dirname, '../../assets/tray-icon.png');
  let trayIcon: ReturnType<typeof nativeImage.createFromPath>;

  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      // If icon file doesn't exist, create empty icon
      trayIcon = nativeImage.createEmpty();
    }
  } catch {
    // Fallback: create a simple icon
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Window',
      click: () => {
        showWindow();
      },
    },
    {
      label: 'Sync Now',
      click: async () => {
        const syncManager = getSyncManager();
        if (syncManager) {
          try {
            await syncManager.syncAll();
            showNotification('Sync completed successfully');
          } catch (error: any) {
            showNotification(`Sync failed: ${error.message}`, 'error');
          }
        }
      },
    },
    {
      type: 'separator',
    },
    {
      label: 'Restart Sync Services',
      click: () => {
        restartSyncServices();
        showNotification('Sync services restarted');
      },
    },
    {
      type: 'separator',
    },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Tally Sync Service');
  tray.setContextMenu(contextMenu);

  // Double click to show window
  tray.on('double-click', () => {
    showWindow();
  });
}

function showNotification(message: string, type: 'info' | 'error' = 'info'): void {
  if (Notification.isSupported()) {
    new Notification({
      title: 'Tally Sync',
      body: message,
    }).show();
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

