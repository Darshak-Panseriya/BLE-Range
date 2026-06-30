// Service worker for BLE Range Logger.
// Caches the app shell so it launches offline and works as an installed PWA.
// Network-first would risk stale failures offline; we use cache-first for the
// small, versioned shell and fall back to the network for anything else.

const CACHE = 'ble-range-v3';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './js/app.js',
  './js/geo.js',
  './js/ble.js',
  './js/logger.js',
  './js/compass.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).catch(() => cached)
    )
  );
});
