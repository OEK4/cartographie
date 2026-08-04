const CACHE = 'hmimv-v1';
const BASE = [
  './',
  './index.html',
  './Saisie terrain - NHM.html',
  './manifest.webmanifest',
  './icone-192.png',
  './icone-512.png'
];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE).catch(() => {})));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.hostname.indexOf('script.google.com') >= 0 || u.hostname.indexOf('raw.githubusercontent.com') >= 0) return;
  e.respondWith(
    fetch(r).then(rep => {
      if (rep && rep.ok && u.origin === location.origin) {
        const cp = rep.clone();
        caches.open(CACHE).then(c => c.put(r, cp));
      }
      return rep;
    }).catch(() => caches.match(r).then(m => m || caches.match('./index.html')))
  );
});
self.addEventListener('message', e => { if (e.data === 'maj') self.skipWaiting(); });
