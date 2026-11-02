const VERSION = 'v16_08';
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

// v16.08: pedir SIEMPRE la copia más nueva al servidor (ignorar la caché HTTP del navegador)
function fresh(url){ return new Request(url, { cache: 'reload' }); }

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Critical: must succeed
      await Promise.all(URLS_TO_CACHE.map(async url => {
        const resp = await fetch(fresh(url));
        if (!resp || !resp.ok) throw new Error('No se pudo descargar ' + url);
        await cache.put(url, resp);
      }));
      // Optional: cache what we can, ignore failures
      await Promise.allSettled(URLS_OPTIONAL.map(async url => {
        try {
          const resp = await fetch(fresh(url));
          if (resp && resp.ok) await cache.put(url, resp);
        } catch (e) { console.warn('[SW] No se pudo cachear:', url, e.message); }
      }));
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

  // v16.08: la página (HTML) va "red primero": siempre la versión más nueva; la copia guardada solo si no hay internet.
  const esPagina = request.mode === 'navigate' || request.destination === 'document' ||
    (url.origin === self.location.origin && (url.pathname === '/' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')));
  if (esPagina) {
    event.respondWith((async () => {
      try {
        const resp = await fetch(request, { cache: 'no-cache' });
        if (resp && resp.ok && url.origin === self.location.origin) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, copy)).catch(() => {});
        }
        return resp;
      } catch (e) {
        const cached = await caches.match(request, { ignoreSearch: true }) || await caches.match('./index.html') || await caches.match('./');
        if (cached) return cached;
        throw e;
      }
    })());
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
