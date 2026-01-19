// src/renderer/book-login/index.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BookLogin } from './BookLogin';
import '../shared/styles/globals.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <BookLogin />
    </React.StrictMode>
  );
}
