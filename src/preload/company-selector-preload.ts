// src/preload/company-selector-preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Company selection
  fetchCompanies: () => ipcRenderer.invoke('fetch-companies'),
  selectCompany: (companyId: number) => ipcRenderer.invoke('select-company', companyId),
  getActiveCompany: () => ipcRenderer.invoke('get-active-company'),
  getAllCompanies: () => ipcRenderer.invoke('get-all-companies'),
  continueToDashboard: () => ipcRenderer.invoke('continue-to-dashboard'),
  
  // Profile
  getProfile: () => ipcRenderer.invoke('get-profile'),
  
  // Events
  onProfileData: (callback: (data: any) => void) => {
    // Remove any existing listeners for this channel to prevent duplicates
    ipcRenderer.removeAllListeners('profile-data');
    const handler = (event: any, data: any) => callback(data);
    ipcRenderer.on('profile-data', handler);
    return () => ipcRenderer.removeListener('profile-data', handler);
  },
  
  onAutoSelectInfo: (callback: (data: { companyId: number }) => void) => {
    // Remove any existing listeners for this channel to prevent duplicates
    ipcRenderer.removeAllListeners('auto-select-info');
    const handler = (event: any, data: { companyId: number }) => callback(data);
    ipcRenderer.on('auto-select-info', handler);
    return () => ipcRenderer.removeListener('auto-select-info', handler);
  },
  
  onInitialError: (callback: (data: { error: string }) => void) => {
    // Remove any existing listeners for this channel to prevent duplicates
    ipcRenderer.removeAllListeners('initial-error');
    const handler = (event: any, data: { error: string }) => callback(data);
    ipcRenderer.on('initial-error', handler);
    return () => ipcRenderer.removeListener('initial-error', handler);
  },
  
  onWarningMessage: (callback: (data: { warning: string }) => void) => {
    // Remove any existing listeners for this channel to prevent duplicates
    ipcRenderer.removeAllListeners('warning-message');
    const handler = (event: any, data: { warning: string }) => callback(data);
    ipcRenderer.on('warning-message', handler);
    return () => ipcRenderer.removeListener('warning-message', handler);
  },
  
  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
});
