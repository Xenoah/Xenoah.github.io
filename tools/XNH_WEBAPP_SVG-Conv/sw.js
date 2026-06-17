/* Service Worker — オフライン用最小キャッシュ。
 * バージョンを bump すると古いキャッシュが破棄される。 */

const VERSION = 'xnh-svg-conv-v0.4.0';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/favicon.svg',
  './styles/base.css',
  './styles/layout.css',
  './styles/components.css',
  './js/main.js',
  './js/store.js',
  './js/ui/dropZone.js',
  './js/ui/preview.js',
  './js/ui/controls.js',
  './js/ui/toolbar.js',
  './js/ui/viewport.js',
  './js/ui/splitter.js',
  './js/ui/brush.js',
  './js/engine/preprocess.js',
  './js/engine/optimizeSvg.js',
  './js/engine/tracer.js',
  './js/engine/trace.js',
  './js/engine/quantize.js',
  './js/engine/edges.js',
  './js/engine/thinning.js',
  './js/engine/export.js',
  './js/workers/trace.worker.js',
  './js/i18n/index.js',
  './js/i18n/ja.json',
  './js/i18n/en.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      cache.addAll(CORE_ASSETS).catch((err) => {
        console.warn('[sw] precache partial failure', err);
      }),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

/* Network-first for navigation, cache-first for static assets. */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      });
    }),
  );
});
