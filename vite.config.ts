// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'src/renderer'),
  base: './', // Use relative paths for Electron file:// protocol
  css: {
    postcss: path.resolve(__dirname, 'postcss.config.js'),
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: false, // Don't empty to preserve other files
    rollupOptions: {
      input: {
        'dashboard/index': path.resolve(__dirname, 'src/renderer/dashboard/index.html'),
        'company-selector/company-selector': path.resolve(__dirname, 'src/renderer/company-selector/company-selector.html'),
        'login/login': path.resolve(__dirname, 'src/renderer/login/login.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
});
