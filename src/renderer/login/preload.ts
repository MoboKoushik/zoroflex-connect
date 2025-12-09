// src/renderer/login/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

// Define the API shape
interface ElectronAPI {
  login: (credentials: { email: string; password: string }) => Promise<{ success: boolean; message?: string }>;
  onLoginSuccess: (callback: () => void) => void;
}

// Augment Window globally (safe in preload as it's a module)
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// Expose to main world (renderer)
contextBridge.exposeInMainWorld('electronAPI', {
  login: (credentials: { email: string; password: string }) => 
    ipcRenderer.invoke('login', credentials) as Promise<{ success: boolean; message?: string }>,
  onLoginSuccess: (callback: () => void) => 
    ipcRenderer.on('login-success', callback)
} as ElectronAPI);