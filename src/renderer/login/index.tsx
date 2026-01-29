// src/renderer/login/index.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Login } from './Login';
import '../shared/styles/globals.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <Login />
    </React.StrictMode>
  );
}
