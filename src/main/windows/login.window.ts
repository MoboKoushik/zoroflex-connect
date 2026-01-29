// src/main/windows/login.window.ts
import { BrowserWindow } from 'electron';
import * as path from 'path';
import { app } from 'electron';

let loginWindow: BrowserWindow | null = null;

export function createLoginWindow(): BrowserWindow | null {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return loginWindow;
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
    icon: path.join(__dirname, '../../../assets/icon.png'),
    backgroundColor: '#ffffff',
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, '../../preload/login-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  loginWindow.loadFile(path.join(__dirname, '../../renderer/login/login.html'));

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

  return loginWindow;
}

export function getLoginWindow(): BrowserWindow | null {
  return loginWindow;
}

export function closeLoginWindow(): void {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.close();
    loginWindow = null;
  }
}
