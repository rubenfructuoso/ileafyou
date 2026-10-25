// i leaf you Service Worker: App-Shell und Schriften offline.
// Bei jeder Änderung an Shell-Dateien VERSION erhöhen, sonst sehen Nutzer die alte Version.
const VERSION = 'ileafyou-v5';
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/i18n.js',
  'js/care.js',
  'js/app.js',
  'js/account.js',
  'manifest.json',
  'img/icon.svg',
  'img/icon-192.png',
  'img/icon-512.png',
  'fonts/atkinson-hyperlegible-400.woff2',
  'fonts/atkinson-hyperlegible-700.woff2',
  'fonts/gluten-variable.woff2'
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

  // Eigene Dateien: Netz zuerst, offline aus dem Cache
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return r; })
        .catch(() => caches.match(req).then(r => r || caches.match('index.html')))
    );
  }
});
