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

  // An installed iOS app resumes from memory without asking the server for anything, so a
  // deploy never lands until it is force-closed. On returning to the foreground, compare
  // the live bundle with the running one and reload if it changed — unless an editor is
  // open, where a reload would throw away what is being typed.
  const bundle = (html: string) => html.match(/\/assets\/index-[\w-]+\.js/)?.[0] ?? null;
  const running = bundle(document.documentElement.outerHTML);
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !running || document.querySelector('.modal')) return;
    try {
      const live = bundle(await (await fetch('/index.html', { cache: 'no-store' })).text());
      if (live && live !== running) window.location.reload();
    } catch {
      // Offline: keep running what we have.
    }
  });
}
