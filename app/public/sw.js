const CACHE = 'daily-balance-v2'
const SHELL = ['/', '/index.html', '/manifest.webmanifest']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)))
})

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return
  const update = fetch(e.request)
    .then((res) => {
      const copy = res.clone()
      return caches.open(CACHE).then((c) => c.put(e.request, copy)).then(() => res)
    })
    .catch(() => null)
  e.waitUntil(update)
  e.respondWith(
    caches.match(e.request).then((hit) => hit || update.then((res) => res || caches.match('/index.html')))
  )
})
