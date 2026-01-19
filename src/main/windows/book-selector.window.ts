// src/main/windows/book-selector.window.ts
import { BrowserWindow } from 'electron';
import * as path from 'path';

let bookSelectorWindow: BrowserWindow | null = null;

export function createBookSelectorWindow(profile: any): BrowserWindow | null {
  console.log('createBookSelectorWindow called', { profile: profile?.email });
  
  if (bookSelectorWindow) {
    console.log('Book selector window already exists, focusing');
    bookSelectorWindow.focus();
    return bookSelectorWindow;
  }

  console.log('Creating new book selector window');
  bookSelectorWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: true,
    resizable: true,
    maximizable: true,
    title: 'Zorrofin Connect - Select Book',
    icon: path.join(__dirname, '../../assets/icon.png'),
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/book-selector-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  bookSelectorWindow.loadFile(
    path.join(__dirname, '../../renderer/book-selector/book-selector.html')
  );

  bookSelectorWindow.once('ready-to-show', () => {
    console.log('Book selector window ready to show');
    if (bookSelectorWindow) {
      bookSelectorWindow.show();
      // Send profile data to renderer
      bookSelectorWindow.webContents.send('profile-data', profile);
    }
  });

  bookSelectorWindow.on('closed', () => {
    console.log('Book selector window closed');
    bookSelectorWindow = null;
  });

  return bookSelectorWindow;
}

export function closeBookSelectorWindow(): void {
  if (bookSelectorWindow) {
    bookSelectorWindow.close();
    bookSelectorWindow = null;
  }
}

export function getBookSelectorWindow(): BrowserWindow | null {
  return bookSelectorWindow;
}
