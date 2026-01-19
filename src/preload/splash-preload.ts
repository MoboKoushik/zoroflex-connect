// src/preload/splash-preload.ts
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // No special APIs needed for splash screen
});
