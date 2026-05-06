// Service Worker - 網路優先策略
// 升級版號可強制清掉舊快取（v2 之後修正了範本彈窗無法關閉的問題）
const CACHE = 'duskin-quote-v4';
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
  self.skipWaiting();   // 立即取代舊 SW
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// network-first：永遠先去拉新版，網路失敗才用快取（離線時）
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // 跨網域（docx CDN）改用 cache-first 比較穩
  const isCrossOrigin = url.origin !== self.location.origin;

  if (isCrossOrigin) {
    e.respondWith(
      caches.match(e.request).then(cached => cached ||
        fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
      )
    );
    return;
  }

  // 同網域：network-first
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
