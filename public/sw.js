/* Sumry service worker: the shell is cached so the app opens instantly and offline;
 * the API is never cached, because a stale balance is worse than no balance. */
const VERSION = 'sumry-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Hashed assets: cache first, they never change under the same name.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.open(VERSION).then(async (c) => (await c.match(event.request)) ?? fetch(event.request).then((r) => { c.put(event.request, r.clone()); return r; })));
    return;
  }
  // Everything else (the shell): network first, cache as the fallback.
  event.respondWith(
    fetch(event.request)
      .then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(event.request, copy)); return r; })
      .catch(() => caches.match(event.request).then((r) => r ?? caches.match('/index.html'))),
  );
});
