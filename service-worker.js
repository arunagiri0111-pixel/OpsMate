// ================================================================
//  OpsMate ERP — Service Worker
//  Strategy: Cache-First for static assets, Network-First for data
// ================================================================

const APP_VERSION   = 'v1.0.0';
const CACHE_STATIC  = `opsmate-static-${APP_VERSION}`;
const CACHE_DYNAMIC = `opsmate-dynamic-${APP_VERSION}`;

// All files that make the shell of the app
const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // External CDN assets — pre-cached so app works offline
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap',
];

// ── INSTALL ─────────────────────────────────────────────────────
// Fired once when SW is first installed.
// Pre-cache all static assets so the app shell is immediately available.
self.addEventListener('install', event => {
  console.log('[SW] Installing…', APP_VERSION);

  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => {
        console.log('[SW] Pre-caching static assets');
        // addAll() fails atomically — if one asset fails, none are cached.
        // Use individual add() calls with fallback for CDN assets.
        return cache.addAll(
          STATIC_ASSETS.filter(url => !url.startsWith('http'))
        ).then(() => {
          // CDN assets: best-effort (don't block install if offline)
          const cdnAssets = STATIC_ASSETS.filter(url => url.startsWith('http'));
          return Promise.allSettled(cdnAssets.map(url =>
            fetch(url).then(res => {
              if (res.ok) return cache.put(url, res);
            }).catch(() => {
              console.warn('[SW] Could not pre-cache CDN asset (offline?):', url);
            })
          ));
        });
      })
      .then(() => {
        console.log('[SW] Install complete');
        // Force this SW to become active immediately
        return self.skipWaiting();
      })
  );
});

// ── ACTIVATE ────────────────────────────────────────────────────
// Fired after install, when old SW is gone.
// Clean up outdated caches from previous versions.
self.addEventListener('activate', event => {
  console.log('[SW] Activating…', APP_VERSION);

  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        const deletions = cacheNames
          .filter(name =>
            // Keep only caches that belong to current version
            (name.startsWith('opsmate-static-') || name.startsWith('opsmate-dynamic-')) &&
            name !== CACHE_STATIC && name !== CACHE_DYNAMIC
          )
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          });
        return Promise.all(deletions);
      })
      .then(() => {
        console.log('[SW] Activate complete — claiming clients');
        // Take control of all open pages immediately
        return self.clients.claim();
      })
  );
});

// ── FETCH ───────────────────────────────────────────────────────
// Intercepts every network request the page makes.
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET requests (POST, PUT, DELETE — these are localStorage ops, not network)
  if (request.method !== 'GET') return;

  // Ignore browser extension requests and non-http(s) schemes
  if (!url.protocol.startsWith('http')) return;

  // ── Google Fonts — Cache First ──────────────────────────────
  // Fonts don't change; serve from cache, fall back to network.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  // ── CDN Assets (Chart.js etc.) — Cache First ────────────────
  if (url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  // ── App HTML — Network First with Cache Fallback ─────────────
  // Always try to get the freshest HTML; fallback to cache when offline.
  if (url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === './') {
    event.respondWith(networkFirst(request));
    return;
  }

  // ── Everything else — Stale While Revalidate ─────────────────
  event.respondWith(staleWhileRevalidate(request));
});

// ================================================================
//  CACHING STRATEGIES
// ================================================================

/**
 * Cache First
 * Serve from cache if available; otherwise fetch and cache.
 * Best for: fonts, icons, CDN libraries — things that rarely change.
 */
async function cacheFirst(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return offlineFallback(request);
  }
}

/**
 * Network First
 * Always try the network; fall back to cache when offline.
 * Best for: the main HTML document.
 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_DYNAMIC);

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    // Last resort: serve the app shell
    const shell = await caches.match('./index.html');
    if (shell) return shell;

    return offlineFallback(request);
  }
}

/**
 * Stale While Revalidate
 * Serve from cache immediately (fast), then update cache in background.
 * Best for: any other assets — balances speed and freshness.
 */
async function staleWhileRevalidate(request) {
  const cache  = await caches.open(CACHE_DYNAMIC);
  const cached = await cache.match(request);

  // Kick off a background fetch regardless
  const networkFetch = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  // Return cached version immediately if we have one
  return cached || networkFetch || offlineFallback(request);
}

/**
 * Offline Fallback
 * Returns a friendly offline page for navigation requests,
 * or a blank response for asset requests.
 */
function offlineFallback(request) {
  const acceptsHtml = request.headers.get('Accept')?.includes('text/html');

  if (acceptsHtml) {
    return new Response(OFFLINE_PAGE, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  // For non-HTML assets, return an empty 503
  return new Response('', {
    status: 503,
    statusText: 'Service Unavailable'
  });
}

// ── OFFLINE PAGE ────────────────────────────────────────────────
// Shown when the user tries to navigate while fully offline
// and no cached version exists.
const OFFLINE_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpsMate — Offline</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:'DM Sans',system-ui,sans-serif;
    background:#0F172A;color:#E2E8F0;
    min-height:100vh;display:flex;align-items:center;justify-content:center;
    text-align:center;padding:24px;
  }
  .card{
    background:#1E293B;border-radius:20px;padding:40px 32px;
    max-width:400px;width:100%;
    border:1px solid rgba(99,102,241,.2);
    box-shadow:0 20px 60px rgba(0,0,0,.4);
  }
  .icon{font-size:3.5rem;margin-bottom:20px}
  h1{font-size:1.4rem;font-weight:700;margin-bottom:10px;
     background:linear-gradient(135deg,#6366F1,#8B5CF6);
     -webkit-background-clip:text;-webkit-text-fill-color:transparent;}
  p{color:#94A3B8;font-size:.9rem;line-height:1.6;margin-bottom:24px}
  .badge{
    display:inline-block;background:rgba(99,102,241,.15);
    color:#a5b4fc;border-radius:50px;padding:6px 16px;
    font-size:.78rem;font-weight:600;margin-bottom:20px;
  }
  button{
    background:linear-gradient(135deg,#6366F1,#8B5CF6);
    color:#fff;border:none;border-radius:12px;padding:12px 28px;
    font-size:.9rem;font-weight:700;cursor:pointer;width:100%;
    box-shadow:0 4px 16px rgba(99,102,241,.35);
  }
  button:hover{opacity:.9}
  .note{margin-top:16px;font-size:.78rem;color:#64748B}
</style>
</head>
<body>
<div class="card">
  <div class="icon">📡</div>
  <h1>You're Offline</h1>
  <p>OpsMate ERP needs a connection to load for the first time. Once loaded, it works fully offline.</p>
  <div class="badge">✓ Your data is saved locally — nothing is lost</div>
  <button onclick="window.location.reload()">Try Again</button>
  <p class="note">All your business data stays on your device even without internet.</p>
</div>
</body>
</html>`;

// ── MESSAGE HANDLER ─────────────────────────────────────────────
// Allows the app to communicate with the SW (e.g. force skip-waiting)
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
