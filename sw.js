const CACHE = 'saude-familia-v41';
const FILES = ['./', './index.html', './styles.css', './app.js', './supabase-config.js', './manifest.webmanifest', './icon.svg', './icon-saude.svg'];
const NETWORK_TIMEOUT_MS = 2500;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirstWithTimeout(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const res = await fetch(request, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(request, copy));
    }
    return res;
  } catch {
    clearTimeout(timer);
    const cached = await caches.match(request);
    return cached || caches.match('./index.html');
  }
}

self.addEventListener('fetch', e => {
  if (e.request.method === 'GET' && new URL(e.request.url).origin === location.origin) {
    e.respondWith(networkFirstWithTimeout(e.request));
  }
});
