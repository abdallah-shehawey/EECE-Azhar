/* ============================================================================
 * EECE Class of 2026 — Service Worker
 *
 * Goals:
 *   • Instant repeat loads (the app shell is served from cache, then refreshed).
 *   • Works offline once visited (countdown + last-seen yearbook/projects shell).
 *   • Never serves a stale HTML document — navigations are network-first.
 *   • Never caches live data — Firebase + Cloudflare R2 are always fetched fresh.
 *
 * Strategy:
 *   • HTML navigations  → network-first  (your edits show up on the next visit).
 *   • Same-origin static (css/js/woff2/img/svg/json) → stale-while-revalidate.
 *   • Cross-origin (Firebase / R2) and audio → bypassed (straight to network).
 *
 * Bump CACHE_VERSION whenever you want every client to drop the old cache.
 * ========================================================================== */

const CACHE_VERSION = "eece-v1";
const CACHE_NAME = `eece-cache-${CACHE_VERSION}`;

// App shell precached on install so the very first offline load works.
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./style.css",
  "./mobile_perf.css",
  "./script.js",
  "./manifest.webmanifest",
  "./font/PoetsenOne-Regular.woff2",
  "./logo-faculty.webp",
  "./logo-university.webp",
  "./favicon.ico",
  "./websiteicon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// ── Install: precache the shell, then take over immediately ──
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => {}) // a single 404 in the list must not abort the whole install
  );
});

// ── Activate: drop old caches, claim open pages ──
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("eece-cache-") && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Same-origin static assets we are happy to cache at runtime.
const CACHEABLE_DEST = new Set(["style", "script", "font", "image"]);

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET is cacheable; everything else goes straight to the network.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Cross-origin (Firebase Realtime DB, Cloudflare R2 photos, Google Fonts…)
  // is never intercepted — those must always hit the network for fresh data.
  if (url.origin !== self.location.origin) return;

  // Never cache audio — the playlist is ~2 MB and not worth the storage.
  if (request.destination === "audio" || url.pathname.includes("/audio/")) return;

  // HTML documents → network-first (fall back to cache when offline).
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((hit) => hit || caches.match("./index.html"))
        )
    );
    return;
  }

  // Static same-origin assets → stale-while-revalidate.
  if (CACHEABLE_DEST.has(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
