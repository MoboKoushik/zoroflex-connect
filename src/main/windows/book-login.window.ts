// src/main/windows/book-login.window.ts
import { BrowserWindow, app } from 'electron';
import * as path from 'path';

let bookLoginWindow: BrowserWindow | null = null;

export function createBookLoginWindow(): BrowserWindow | null {
  console.log('createBookLoginWindow called');
  
  if (bookLoginWindow && !bookLoginWindow.isDestroyed()) {
    console.log('Book login window already exists, focusing');
    bookLoginWindow.focus();
    return bookLoginWindow;
  }

  console.log('Creating new book login window');
  bookLoginWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    show: false,
    frame: true,
    resizable: true,
    maximizable: true,
    title: 'Zorrofin Connect - Connect New Book',
    icon: path.join(__dirname, '../../assets/icon.png'),
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/book-login-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  bookLoginWindow.loadFile(
    path.join(__dirname, '../../renderer/book-login/book-login.html')
  );

  // Open DevTools automatically only in development mode
  if (!app.isPackaged) {
    bookLoginWindow.webContents.once('did-finish-load', () => {
      bookLoginWindow?.webContents.openDevTools({ mode: 'detach' });
    });
  }

  bookLoginWindow.once('ready-to-show', () => {
    console.log('Book login window ready to show');
    if (bookLoginWindow) {
      bookLoginWindow.show();
      bookLoginWindow.center();
    }
  });

  bookLoginWindow.on('closed', () => {
    console.log('Book login window closed');
    bookLoginWindow = null;
  });

  return bookLoginWindow;
}

export function closeBookLoginWindow(): void {
  if (bookLoginWindow && !bookLoginWindow.isDestroyed()) {
    bookLoginWindow.close();
    bookLoginWindow = null;
  }
}

export function getBookLoginWindow(): BrowserWindow | null {
  return bookLoginWindow;
}
