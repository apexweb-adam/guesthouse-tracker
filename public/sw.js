/**
 * Service Worker — Job Search OS
 *
 * Strategy:
 *  - App shell (JS/CSS/HTML) → Cache First (stale-while-revalidate)
 *  - Netlify Functions / API calls → Network Only. Never cache live business data.
 *  - Fonts → Cache First (immutable external resources)
 *  - Navigation fallback → /offline.html when fully offline
 *
 * SAFETY: Live operational data (opportunities, digest, apply packs) is NEVER
 * served from cache. This prevents stale data from misleading users about
 * application state, approval decisions, or readiness scores.
 *
 * OFFLINE HONESTY: When a navigation request fails offline, the user sees
 * offline.html which clearly explains that live data is unavailable.
 */

const CACHE_NAME = 'job-search-os-shell-v2';

// Static shell assets to cache on install
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

// API paths that must NEVER be served from cache
const API_PATHS = [
  '/.netlify/functions/',
];

// Font origins to cache
const FONT_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

// ─── Install ────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache shell assets — failures are non-fatal
      return Promise.allSettled(
        SHELL_ASSETS.map(url => cache.add(url).catch(() => null))
      );
    })
  );
  // Take control immediately so first page load is covered
  self.skipWaiting();
});

// ─── Activate ───────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  // Claim all clients so SW controls the page immediately
  self.clients.claim();
});

// ─── Fetch ──────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. API calls — Network Only. Never cache live business data.
  if (API_PATHS.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(fetch(request));
    return;
  }

  // 2. Non-GET — pass through
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  // 3. Font resources — Cache First (fonts are immutable)
  if (FONT_ORIGINS.some((o) => url.origin === o || url.href.startsWith(o))) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((res) => {
            if (res && res.status === 200) cache.put(request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // 4. Navigation requests — Stale-While-Revalidate with offline fallback.
  //    If fully offline, serve /offline.html so the user gets a clear message.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const networkFetch = fetch(request).then((res) => {
            if (res && res.status === 200 && res.type !== 'opaque') {
              cache.put(request, res.clone());
            }
            return res;
          }).catch(() =>
            // Offline: return the offline fallback page
            cache.match('/offline.html').then((offlinePage) =>
              offlinePage || new Response(
                '<html><body><h1>Offline</h1><p>Please reconnect.</p></body></html>',
                { headers: { 'Content-Type': 'text/html' } }
              )
            )
          );
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // 5. App shell / static assets — Stale-While-Revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        const networkFetch = fetch(request).then((res) => {
          if (res && res.status === 200 && res.type !== 'opaque') {
            cache.put(request, res.clone());
          }
          return res;
        }).catch(() => cached); // Fallback to cache if network fails

        // Return cached immediately if available, also refresh in background
        return cached || networkFetch;
      })
    )
  );
});
