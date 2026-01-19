// src/preload/book-login-preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Login
  login: (credentials: { email: string; password: string }) => 
    ipcRenderer.invoke('login', credentials),
  
  // Fetch books after login
  fetchBooksFromApi: () => ipcRenderer.invoke('fetch-books-from-api'),
  
  // Send book login success event to main process
  sendBookLoginSuccess: (data: any) => {
    ipcRenderer.send('book-login-success', data);
  },
  
  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
});
