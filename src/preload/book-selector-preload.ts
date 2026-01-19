// src/preload/book-selector-preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Fetch books from API
  fetchBooksFromApi: () => ipcRenderer.invoke('fetch-books-from-api'),
  
  // Connect to selected book
  connectBook: (organizationId: string) => ipcRenderer.invoke('connect-book', organizationId),
  
  // Listen for profile data
  onProfileData: (callback: any) => {
    ipcRenderer.removeAllListeners('profile-data');
    ipcRenderer.on('profile-data', callback);
    return () => ipcRenderer.removeListener('profile-data', callback);
  },
  
  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
});
