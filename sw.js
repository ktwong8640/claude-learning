// Minimal app-shell cache so the page installs on Android and loads offline.
// User data (items, photos) lives in IndexedDB, not here — this only caches static files.

const CACHE_NAME = 'dostadning-shell-v3';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/db.js',
  './js/google-sync.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
// Deliberately NOT precached: js/google-config.js. It's gitignored/user-provided and may
// not exist — cache.addAll() below fails atomically if any single URL 404s, which would
// break the service worker entirely for anyone who hasn't set up Google sync yet. The
// generic fetch handler below still serves/caches it fine on demand if it does exist.

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

// Network-first, falling back to cache only when offline. A cache-first strategy would
// mean every deploy needs a manual CACHE_NAME bump to actually reach open tabs/devices —
// this way the app shell still works offline, but online users always get the latest files.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
