// src/main/windows/splash.window.ts
import { BrowserWindow } from 'electron';
import * as path from 'path';

let splashWindow: BrowserWindow | null = null;

export function createSplashWindow(): BrowserWindow {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.focus();
    return splashWindow;
  }

  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    resizable: false,
    maximizable: false,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/splash-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  splashWindow.loadFile(path.join(__dirname, '../../renderer/splash/splash.html'));

  splashWindow.once('ready-to-show', () => {
    if (splashWindow) {
      splashWindow.show();
      splashWindow.center();
    }
  });

  splashWindow.on('closed', () => {
    splashWindow = null;
  });

  return splashWindow;
}

export function closeSplashWindow(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

export function getSplashWindow(): BrowserWindow | null {
  return splashWindow;
}
