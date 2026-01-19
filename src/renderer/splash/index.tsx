// src/renderer/splash/index.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { SplashScreen } from './SplashScreen';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <SplashScreen />
    </React.StrictMode>
  );
}
