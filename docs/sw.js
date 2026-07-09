const CACHE_NAME = 'sosyoku-41f095e813';
const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './favicon.svg',
  './fonts/material-symbols-outlined-subset.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// ネットワーク優先、失敗時はキャッシュへフォールバック(オフライン対応)。取得できたレスポンスは都度キャッシュを更新する。
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match('./index.html'))),
  );
});
