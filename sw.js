/* Service worker — қолданбаны желісіз ашу үшін.
 * Жаңа нұсқа шыққанда CACHE_VERSION мәнін өзгертіңіз.
 * Бұл файл тек қолданба файлдарының кэшін басқарады; localStorage-тағы профильдер мен тарихқа тимейді. */
var CACHE_VERSION = 'tarif-model-v1.0.0';
var ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/tariffs.js',
  './js/engine.js',
  './js/storage.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE_VERSION).then(function (c) { return c.addAll(ASSETS); }));
  // Жаңа нұсқа пайдаланушы «Жаңарту» батырмасын басқанша күтеді (skipWaiting автоматты емес).
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf('tarif-model-') === 0 && k !== CACHE_VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // сыртқы сілтемелер (оператор беттері) кэштелмейді

  if (req.mode === 'navigate') {
    // Бет: алдымен кэш (желісіз жылдам ашылу), фонда жаңарту жоқ — нұсқа SW арқылы ауысады
    event.respondWith(caches.match('./index.html').then(function (r) { return r || fetch(req); }));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (cached) {
      return cached || fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') { var copy = res.clone(); caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); }); }
        return res;
      });
    })
  );
});
