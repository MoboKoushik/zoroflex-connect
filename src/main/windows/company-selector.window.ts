// src/main/windows/company-selector.window.ts
import { BrowserWindow } from 'electron';
import * as path from 'path';
import { app } from 'electron';

let companySelectorWindow: BrowserWindow | null = null;

export function createCompanySelectorWindow(profile: any): BrowserWindow | null {
  if (companySelectorWindow && !companySelectorWindow.isDestroyed()) {
    companySelectorWindow.focus();
    return companySelectorWindow;
  }

  companySelectorWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: true,
    resizable: true,
    maximizable: true,
    title: 'Zorrofin Connect - Select Company',
    icon: path.join(__dirname, '../../../assets/icon.png'),
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, '../../preload/company-selector-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  companySelectorWindow.loadFile(path.join(__dirname, '../../renderer/company-selector/company-selector.html'));

  if (!app.isPackaged) {
    companySelectorWindow.webContents.once('did-finish-load', () => {
      companySelectorWindow?.webContents.openDevTools({ mode: 'detach' });
    });
  }

  companySelectorWindow.once('ready-to-show', () => {
    companySelectorWindow?.show();
    companySelectorWindow?.center();
  });

  companySelectorWindow.webContents.once('did-finish-load', () => {
    try {
      if (companySelectorWindow && !companySelectorWindow.isDestroyed()) {
        companySelectorWindow.webContents.send('profile-data', profile);
      }
    } catch (error) {
      console.error('Error sending profile-data to company selector:', error);
    }
  });

  companySelectorWindow.on('closed', () => {
    companySelectorWindow = null;
  });

  return companySelectorWindow;
}

export function getCompanySelectorWindow(): BrowserWindow | null {
  return companySelectorWindow;
}

export function closeCompanySelectorWindow(): void {
  if (companySelectorWindow && !companySelectorWindow.isDestroyed()) {
    companySelectorWindow.close();
    companySelectorWindow = null;
  }
}
