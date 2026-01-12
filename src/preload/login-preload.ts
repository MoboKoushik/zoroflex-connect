// src/preload/login-preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  login: (credentials: { email: string; password: string }) => 
    ipcRenderer.invoke('login', credentials),
  
  onLoginSuccess: (callback: () => void) => {
    ipcRenderer.removeAllListeners('login-success');
    ipcRenderer.on('login-success', () => callback());
  }
});
