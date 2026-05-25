const CACHE_NAME = 'osho-player-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './catalog-backup.json'
];

const CATALOG_URL = 'https://rajneesh-live.github.io/rajneesh/catalog.json';

// Install: cache the app shell and catalog
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll([...APP_SHELL, CATALOG_URL]);
      })
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn('[SW] Install cache failed:', err);
      })
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => {
              console.log('[SW] Removing old cache:', key);
              return caches.delete(key);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Helper: check if a request is for the app shell or catalog
function isAppShellOrCatalog(url) {
  const parsed = new URL(url);
  // Match catalog URL exactly
  if (url === CATALOG_URL) return true;
  // Match app shell paths
  const pathname = parsed.pathname;
  if (pathname.endsWith('/') || pathname.endsWith('/index.html') || pathname.endsWith('/manifest.json')) {
    return true;
  }
  return false;
}

// Helper: check if a request is for audio from archive.org
function isAudioRequest(url) {
  return url.includes('archive.org');
}



// Fetch handler
self.addEventListener('fetch', (event) => {
  const requestUrl = event.request.url;

  // Strategy 1: Cache-first for app shell and catalog
  if (isAppShellOrCatalog(requestUrl)) {
    event.respondWith(
      caches.match(event.request)
        .then((cached) => {
          if (cached) {
            // Return cache hit, but also update the cache in the background
            const fetchPromise = fetch(event.request)
              .then((networkResponse) => {
                if (networkResponse && networkResponse.ok) {
                  const clone = networkResponse.clone();
                  caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return networkResponse;
              })
              .catch(() => {});
            return cached;
          }
          // No cache hit — go to network
          return fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.ok) {
                const clone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
              }
              return networkResponse;
            });
        })
        .catch(() => {
          // Ultimate fallback for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        })
    );
    return;
  }

  // Strategy 2: Network-only for audio (archive.org) requests
  // The main app handles IndexedDB-first lookup before setting audio.src,
  // so the SW just passes these through to the network.
  if (isAudioRequest(requestUrl)) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response('Audio unavailable offline. Download the album first.', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
    );
    return;
  }

  // Strategy 3: Network-first for everything else
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request))
      .then((response) => response || new Response('Offline', { status: 503, statusText: 'Service Unavailable' }))
  );
});
