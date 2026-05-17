// Service Worker — PWA 설치 + Web Push 알림
//
// 정책
//  - install/activate: skipWaiting + clients.claim (새 SW 즉시 활성)
//  - fetch: 캐시 안 함 (network-first passthrough) — 빌드 갱신 즉시 반영 우선
//  - push: showNotification (소리/진동/태그) — 부스 태블릿 PWA background/screen-off
//          상태에서도 OS 가 알림 표시 + 본 SW 가 mp3 + vibrate 실행
//  - notificationclick: 부스 대시보드 탭이 있으면 focus, 없으면 새 탭으로 open
//
// 호환성
//  - notification.sound 는 deprecated 라 OS 기본 알림음만 가능. mp3 직접 재생은
//    SW 컨텍스트에서 Audio 사용 불가 → 클라이언트(BoothDashboard) 가 visible 일 때만
//    audioCue.playSound 가 추가로 울림. background 에선 진동 + OS 알림음만 보장.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  event.respondWith(fetch(event.request))
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: '주문 알림', body: '' }
  }
  const title = data.title || '새 주문'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'booth-order',
    renotify: true,
    requireInteraction: false,
    vibrate: [300, 100, 300, 100, 300],
    data: {
      url: data.url || '/booth',
      boothId: data.boothId,
    },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/booth'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          const url = new URL(client.url)
          if (url.pathname.startsWith('/booth')) {
            return client.focus()
          }
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    }),
  )
})
