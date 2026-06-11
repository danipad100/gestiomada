const VERSION = 'v14_88';
const CACHE_NAME = 'gestiomada-' + VERSION;

const URLS_TO_CACHE = [
  './',
  './index.html'
];

const URLS_OPTIONAL = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-180.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Critical: must succeed
      await cache.addAll(URLS_TO_CACHE);
      // Optional: cache what we can, ignore failures
      await Promise.allSettled(URLS_OPTIONAL.map(url =>
        cache.add(url).catch(e => console.warn('[SW] No se pudo cachear:', url, e.message))
      ));
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => (k !== CACHE_NAME) ? caches.delete(k) : null));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', event => {
  const data = event && event.data ? event.data : null;
  if (!data) return;
  if (data.type === 'SKIP_WAITING') { self.skipWaiting(); return; }
  if (data.type === 'GET_VERSION') {
    try {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ type: 'VERSION', version: VERSION });
      }
    } catch(e) {}
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('dolarapi.com') ||
    url.hostname.includes('criptoya.com') ||
    url.hostname.includes('ve.dolarapi.com')
  ) {
    event.respondWith(fetch(request));
    return;
  }
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(resp => {
        try {
          if (url.origin === self.location.origin) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
          }
        } catch(e) {}
        return resp;
      });
    })
  );
});
