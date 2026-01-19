// src/renderer/book-selector/index.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BookSelector } from './BookSelector';
import '../shared/styles/globals.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <BookSelector />
    </React.StrictMode>
  );
}
