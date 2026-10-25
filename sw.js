// i leaf you Service Worker: App-Shell offline, Schriften aus dem Cache.
// Bei jeder Änderung an Shell-Dateien VERSION erhöhen, sonst sehen Nutzer die alte Version.
const VERSION = 'ileafyou-v5';
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/i18n.js',
  'js/app.js',
  'manifest.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API nie cachen
  if (url.pathname.includes('/api/')) return;

  // Google Fonts: Cache zuerst, im Hintergrund aktualisieren
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(VERSION).then(async c => {
        const hit = await c.match(req);
        const net = fetch(req).then(r => { c.put(req, r.clone()); return r; }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // Eigene Dateien: Netz zuerst, offline aus dem Cache
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return r; })
        .catch(() => caches.match(req).then(r => r || caches.match('index.html')))
    );
  }
});
