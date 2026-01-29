// src/main/windows/dashboard.window.ts
import { BrowserWindow } from 'electron';
import * as path from 'path';
import { app } from 'electron';

let dashboardWindow: BrowserWindow | null = null;

export function createDashboardWindow(profile: any): BrowserWindow | null {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.focus();
    return dashboardWindow;
  }

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets/icon.png')
    : path.join(__dirname, '../../../assets/icon.png');

  dashboardWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    frame: false,
    resizable: true,
    maximizable: true,
    title: 'Zorrofin Connect - Dashboard',
    icon: iconPath,
    backgroundColor: '#1e1e1e',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, '../../preload/dashboard-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  dashboardWindow.loadFile(path.join(__dirname, '../../renderer/dashboard/index.html'));

  dashboardWindow.once('ready-to-show', () => {
    dashboardWindow?.show();
    dashboardWindow?.focus();
  });

  dashboardWindow.webContents.once('did-finish-load', () => {
    try {
      if (dashboardWindow && !dashboardWindow.isDestroyed()) {
        dashboardWindow.webContents.send('profile-data', profile);
      }
    } catch (error) {
      console.error('Error sending profile-data event:', error);
    }
  });

  dashboardWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Dashboard failed to load:', errorCode, errorDescription);
  });

  dashboardWindow.webContents.on('console-message', (event, level, message) => {
    if (level >= 2) {
      console.error('Dashboard console:', message);
    }
  });

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });

  dashboardWindow.on('maximize', () => {
    try {
      if (dashboardWindow && !dashboardWindow.isDestroyed()) {
        dashboardWindow.webContents.send('window-maximized');
      }
    } catch (error) {
      console.error('Error sending window-maximized event:', error);
    }
  });

  dashboardWindow.on('unmaximize', () => {
    try {
      if (dashboardWindow && !dashboardWindow.isDestroyed()) {
        dashboardWindow.webContents.send('window-unmaximized');
      }
    } catch (error) {
      console.error('Error sending window-unmaximized event:', error);
    }
  });

  return dashboardWindow;
}

export function getDashboardWindow(): BrowserWindow | null {
  return dashboardWindow;
}

export function closeDashboardWindow(): void {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.close();
    dashboardWindow = null;
  }
}
