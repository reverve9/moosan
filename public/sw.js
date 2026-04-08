// Minimal service worker for PWA install eligibility.
// Network-first passthrough; no caching yet (will be revisited when push notifications land).

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  // Only handle same-origin GET; let everything else pass through to the network.
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  event.respondWith(fetch(event.request))
})
