import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted rather than fetched from Google: no third-party request on every load,
// and the dashboard keeps working without external network access.
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import '@fontsource-variable/inter/opsz.css';
import './styles.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The service worker caches the shell so the app opens offline and installs as a PWA.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
