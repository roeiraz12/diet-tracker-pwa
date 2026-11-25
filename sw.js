// Service worker: offline cache for the app files.
// כשמעדכנים קבצים באתר – מעלים את המספר כאן (v1 -> v2) כדי שהטלפון יקבל את הגרסה החדשה.
const VERSION = 'v3';
const CACHE = `diet-app-${VERSION}`;

const FILES = [
  './',
  'index.html',
  'styles.css',
  'css/home-summary.css',
  'css/dictionary-weight.css',
  'css/settings.css',
  'js/app.js',
  'js/backup.js',
  'js/banners.js',
  'js/calc.js',
  'js/chart.js',
  'js/pwa.js',
  'js/store.js',
  'js/ui.js',
  'js/views/home.js',
  'js/views/summary.js',
  'js/views/dictionary.js',
  'js/views/weight.js',
  'js/views/settings.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', event => {
  // No automatic skipWaiting: the page shows a "new version" banner instead.
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('diet-app-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// On the developer's own computer (localhost) always prefer fresh files, so edits show up
// immediately; the cache is only a fallback. On the real site: cache first (fast + offline).
const IS_LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req, { ignoreSearch: true }) ||
      (req.mode === 'navigate' ? await cache.match('index.html') : null);
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (IS_LOCAL) { event.respondWith(networkFirst(req)); return; }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (e) {
      if (req.mode === 'navigate') {
        const shell = await cache.match('./');
        if (shell) return shell;
      }
      throw e;
    }
  })());
});
