// Teachers App service worker: network first (always the newest version when
// online), cached copy when offline. School data (/api/) is never cached, and the
// other apps on this site (/library/, /supervisors/, /download/) are left alone.
const VERSION = '2.2.0';
const PREFIX = 'slp-teachers-';
const CACHE = PREFIX + VERSION;
const SHELL = [
  '/', '/index.html', '/teachers-app.js', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png',
  '/shared/core.js', '/shared/auth.js', '/shared/auth.css', '/shared/theme.css', '/shared/chooser.js', '/shared/guide.js', '/shared/guide.css'
];
const OTHER_APPS = ['/library/', '/supervisors/', '/download/', '/api/'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  // Remove this app's old caches (and the caches of the previous version of the app).
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => (k.startsWith(PREFIX) && k !== CACHE) || k.startsWith('library-booking-')).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname === '/version.json' || OTHER_APPS.some(p => url.pathname.startsWith(p))) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? caches.match('/index.html') : Response.error()))
  );
});
