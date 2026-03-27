// ================================================================
// OpsMate ERP — Service Worker
// Strategy: Network-first with cache fallback (stale-while-revalidate)
// ================================================================

var CACHE_NAME = 'opsmate-v3';

// Files to pre-cache on install
var PRECACHE_URLS = [
  '/',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ── Install: pre-cache app shell ──
self.addEventListener('install', function(event) {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] Pre-caching app shell');
      return cache.addAll(PRECACHE_URLS).catch(function(err) {
        // Don't fail install if some resources can't be cached
        console.warn('[SW] Pre-cache partial fail (non-fatal):', err.message);
      });
    }).then(function() {
      return self.skipWaiting(); // Activate immediately
    })
  );
});

// ── Activate: clean old caches, take control ──
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) { return name !== CACHE_NAME; })
             .map(function(name) {
               console.log('[SW] Deleting old cache:', name);
               return caches.delete(name);
             })
      );
    }).then(function() {
      return self.clients.claim(); // Take control of all pages immediately
    })
  );
});

// ── Fetch: network-first, fall back to cache ──
self.addEventListener('fetch', function(event) {
  var request = event.request;

  // Skip non-GET requests (POST, etc.)
  if (request.method !== 'GET') return;

  // Skip Firebase/Firestore API calls — never cache these
  if (request.url.indexOf('firestore.googleapis.com') !== -1) return;
  if (request.url.indexOf('identitytoolkit.googleapis.com') !== -1) return;
  if (request.url.indexOf('securetoken.googleapis.com') !== -1) return;

  // For navigation requests (HTML pages): network-first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(function(response) {
        // Cache the fresh HTML
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(request, clone); });
        return response;
      }).catch(function() {
        // Offline: serve from cache
        return caches.match(request).then(function(cached) {
          return cached || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // For CDN resources (fonts, Chart.js): cache-first (they rarely change)
  if (request.url.indexOf('cdnjs.cloudflare.com') !== -1 ||
      request.url.indexOf('fonts.googleapis.com') !== -1 ||
      request.url.indexOf('fonts.gstatic.com') !== -1 ||
      request.url.indexOf('gstatic.com/firebasejs') !== -1) {
    event.respondWith(
      caches.match(request).then(function(cached) {
        if (cached) return cached;
        return fetch(request).then(function(response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) { cache.put(request, clone); });
          }
          return response;
        });
      })
    );
    return;
  }

  // For everything else: network-first with cache fallback
  event.respondWith(
    fetch(request).then(function(response) {
      if (response && response.status === 200) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(request, clone); });
      }
      return response;
    }).catch(function() {
      return caches.match(request);
    })
  );
});
