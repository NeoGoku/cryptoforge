// Fetch current releases first and keep the matching static assets for offline play.
const PREFIX = 'cryptoforge-';
const CACHE = PREFIX + 'v3';
self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = req.mode === 'navigate' ? new URL('./', self.registration.scope).href : req;
    const cached = () => cache.match(key);
    try {
      const response = await fetch(req, req.mode === 'navigate' ? { cache: 'no-cache' } : undefined);
      if (!response.ok) return (await cached()) ?? response;
      await cache.put(key, response.clone()).catch(() => undefined);
      return response;
    } catch {
      return (await cached()) ?? Response.error();
    }
  })());
});
