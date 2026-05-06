// 簡易 Service Worker - 讓網頁離線也能用
const CACHE = 'duskin-quote-v1';
const ASSETS = [
  './',
  'index.html',
  'app.js',
  'style.css',
  'manifest.webmanifest',
  'icon.svg',
  '../engine.js',
  '../builders/quote.js',
  '../catalog.json',
  'https://unpkg.com/docx@8.5.0/build/index.umd.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
