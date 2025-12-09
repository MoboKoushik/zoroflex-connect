import { BrowserWindow, app } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;

export function createWindow(): BrowserWindow {
  // Create the browser window
  const preloadPath = path.join(__dirname, '../preload/preload.js');
  
  mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    show: false, // Don't show window initially (background mode)
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  });

  // Load the index.html
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Hide window instead of closing
  let isQuitting = false;

  app.on('before-quit', () => {
    isQuitting = true;
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  return mainWindow;
}

export function getWindow(): BrowserWindow | null {
  return mainWindow;
}

export function showWindow(): void {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

export function hideWindow(): void {
  if (mainWindow) {
    mainWindow.hide();
  }
}

