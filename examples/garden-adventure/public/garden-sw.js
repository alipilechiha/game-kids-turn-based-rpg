const CACHE_NAME = 'garden-adventure-v1';
const CACHE_PREFIX = 'garden-adventure-';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const scope = new URL(self.registration.scope);
      const indexUrl = new URL('./index.html', scope);
      const manifestUrl = new URL('./manifest.webmanifest', scope);
      await cache.addAll([
        indexUrl.href,
        manifestUrl.href,
        new URL('./icons/garden.svg', scope).href,
      ]);

      const page = await cache.match(indexUrl.href);
      const html = await page.text();
      const linkedAssets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
        .map((match) => new URL(match[1], indexUrl).href)
        .filter((url) => url.startsWith(scope.href));
      await cache.addAll([...new Set(linkedAssets)]);

      const cssAssets = linkedAssets.filter((url) => url.endsWith('.css'));
      for (const cssUrl of cssAssets) {
        const css = await (await cache.match(cssUrl)).text();
        const resources = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)]
          .map((match) => new URL(match[1], cssUrl).href)
          .filter((url) => url.startsWith(scope.href));
        if (resources.length > 0) await cache.addAll([...new Set(resources)]);
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const scope = new URL(self.registration.scope);
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.href.startsWith(scope.href)) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      if (request.mode === 'navigate') {
        const cachedPage = await cache.match(new URL('./index.html', scope).href);
        if (cachedPage) return cachedPage;
      }
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
      return response;
    })(),
  );
});
