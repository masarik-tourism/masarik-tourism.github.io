const CACHE_VERSION = 'masarik-cache-84-mwlx892t';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_VERSION)
            .map((oldName) => caches.delete(oldName))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_ALL_CACHES') {
    event.waitUntil(
      caches
        .keys()
        .then((names) => Promise.all(names.map((name) => caches.delete(name))))
        .then(() => self.skipWaiting())
    );
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept or cache GitHub API, .apk files, version check files, sw.js, API routes, or Vite dev source modules
  if (
    url.hostname.includes('github.com') ||
    url.hostname.includes('githubusercontent.com') ||
    url.pathname.toLowerCase().endsWith('.apk') ||
    url.pathname.endsWith('version.json') ||
    url.pathname.endsWith('sw.js') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.endsWith('.ts') ||
    url.pathname.endsWith('.tsx') ||
    url.pathname.endsWith('.jsx')
  ) {
    return;
  }

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Network-First strategy for HTML navigations so new deployments load immediately
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(new Request(request, { cache: 'no-store' }))
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const copy = networkResponse.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || caches.match(request)))
    );
    return;
  }

  // Network-First for JS/CSS scripts to prevent stale module export mismatches
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Stale-While-Revalidate for images and static manifest/font assets
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
