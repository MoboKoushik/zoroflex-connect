// src/preload/login-preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  login: (credentials: { email: string; password: string }) =>
    ipcRenderer.invoke('login', credentials),

  setSetting: (key: string, value: string) =>
    ipcRenderer.invoke('set-setting', key, value),

  onLoginSuccess: (callback: () => void) => {
    ipcRenderer.removeAllListeners('login-success');
    ipcRenderer.on('login-success', () => callback());
  }
});
