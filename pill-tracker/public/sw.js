// Minimal service worker: caches the app shell so it loads instantly and works
// offline. API responses are always fetched fresh (never cached).
const CACHE = 'pill-buddy-v1';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Never cache API calls — always go to the network.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  // App shell: cache-first, fall back to network.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
