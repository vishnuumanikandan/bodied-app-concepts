/* BODIED SJ · service worker — precache the shell, keep fonts, work offline */
const CACHE = 'bodied-v2';
const SHELL = [
  './',
  'index.html',
  'assets/app.css',
  'assets/app.js',
  'assets/data.js',
  'manifest.webmanifest',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if(e.request.method !== 'GET') return;

  /* navigations: network first so updates land, shell as offline fallback */
  if(e.request.mode === 'navigate'){
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return r;
        })
        .catch(() => caches.match('index.html'))
    );
    return;
  }

  /* fonts: cache first (they never change) */
  if(url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
        if(r.ok || r.type === 'opaque'){
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return r;
      }))
    );
    return;
  }

  /* same-origin assets: stale-while-revalidate so app updates reach installed phones */
  if(url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then(hit => {
      const refresh = fetch(e.request).then(r => {
        if(r.ok){
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return r;
      }).catch(() => hit);
      return hit || refresh;
    })
  );
});
