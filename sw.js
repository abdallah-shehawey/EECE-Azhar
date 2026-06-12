/* ============================================================================
 * EECE Class of 2026 — Service Worker
 *
 * Strategy: ALWAYS-FRESH (network-first).
 *   Every visit fetches the latest files from the network, so any deploy is
 *   seen by everyone the moment they open the site — no stale CSS/JS.
 *   The cache is only an OFFLINE fallback (and a fast first-load shell).
 *
 *   • Same-origin HTML + static (css/js/woff2/img) → network-first,
 *     fall back to cache only when the network is unavailable.
 *   • Cross-origin (Firebase / Cloudflare R2) and audio → bypassed (network only).
 *
 * skipWaiting + clients.claim mean a new version takes over immediately, so
 * one reload is enough to move every visitor onto the newest build.
 *
 * Bump CACHE_VERSION on any deploy you want to wipe the offline cache entirely.
 * ========================================================================== */

const CACHE_VERSION = "eece-v2";
const CACHE_NAME = `eece-cache-${CACHE_VERSION}`;

// App shell precached on install so the very first offline load still works.
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

  const isNavigation =
    request.mode === "navigate" || request.destination === "document";

  // Network-first: always try the live network, fall back to cache offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Refresh the cached copy whenever the network succeeds.
        if (response && response.status === 200 && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(isNavigation ? "./index.html" : request, copy);
          });
        }
        return response;
      })
      .catch(() =>
        caches
          .match(request)
          .then((hit) => hit || (isNavigation ? caches.match("./index.html") : undefined))
      )
  );
});
