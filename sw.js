const CACHE = 'tips-v6';

const SHELL = [
  './',
  './index.html',
  './cashier.html',
  './manager.html',
  './db.js',
  './manifest.json',
  './icon.svg',
];

// Always fetch fresh from network — never cache API calls
const NETWORK_DOMAINS = [
  'api.github.com',
  'firebasedatabase.app',
  'firebaseapp.com',
  'firebaseio.com',
  'googleapis.com',
  'gstatic.com',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  if (NETWORK_DOMAINS.some(d => url.hostname.includes(d))) {
    e.respondWith(fetch(e.request).catch(() => new Response('')));
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(res => {
        if (res.ok) {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => null);
      return cached || net || caches.match('./index.html');
    })
  );
});
