// Library Teachers App service worker: network first (always the newest version
// when online), cached copy when offline. School data (/api/) is never cached.
const VERSION = '2.0.0';
const PREFIX = 'slp-library-';
const CACHE = PREFIX + VERSION;
const SHELL = [
  '/library/', '/library/app.js', '/library/common.js', '/library/i18n.js', '/library/admin.js', '/library/library.css',
  '/library/manifest.json', '/library/icons/icon-192.png', '/library/icons/icon-512.png',
  '/shared/core.js', '/shared/auth.js', '/shared/forms.js', '/shared/base.css', '/shared/auth.css'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/version.json') return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? caches.match('/library/') : Response.error()))
  );
});
