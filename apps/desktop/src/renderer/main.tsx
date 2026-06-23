import React from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted fonts so the UI renders identically on macOS and Windows instead
// of falling back to each OS's default (San Francisco vs Segoe UI / Arial).
import '@fontsource-variable/inter';
import '@fontsource/fira-code';
import App from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found.');
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
