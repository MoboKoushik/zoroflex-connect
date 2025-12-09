import { contextBridge, ipcRenderer } from 'electron';

interface ElectronAPI {
  login: (credentials: { email: string; password: string }) => Promise<{ success: boolean; message?: string }>;
  onLoginSuccess: (callback: () => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  login: (credentials: { email: string; password: string }) => 
    ipcRenderer.invoke('login', credentials) as Promise<{ success: boolean; message?: string }>,
  onLoginSuccess: (callback: () => void) => 
    ipcRenderer.on('login-success', callback)
} as ElectronAPI);