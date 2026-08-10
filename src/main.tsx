import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted rather than fetched from Google: no third-party request on every load,
// and the dashboard keeps working without external network access.
import '@fontsource-variable/figtree';
import './styles.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
