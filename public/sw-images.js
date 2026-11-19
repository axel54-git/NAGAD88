const CACHE_NAME = 'maneishop-permanent-images-v3';

const IMAGE_EXT_RE = /\.(?:webp|png|jpe?g|gif|svg|avif|ico)(?:$|\?)/i;

function isCacheableImageRequest(request) {
  if (request.method !== 'GET') return false;
  const url = request.url;
  if (!url.startsWith('http')) return false;
  if (url.includes('/api/') || url.includes('firebaseio.com')) return false;

  // Never intercept Vite module transformation requests
  if (url.includes('?import') || url.includes('?url') || url.includes('?raw')) {
    return false;
  }

  return (
    request.destination === 'image' ||
    IMAGE_EXT_RE.test(url) ||
    url.includes('i.ytimg.com/') ||
    url.includes('i.ibb.co')
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('maneishop-permanent-images-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (!isCacheableImageRequest(event.request)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request, { ignoreVary: true });
      if (cached) {
        return cached;
      }

      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
          cache.put(event.request, networkResponse.clone()).catch(() => {});
        }
        return networkResponse;
      } catch (err) {
        if (cached) return cached;
        throw err;
      }
    })
  );
});
