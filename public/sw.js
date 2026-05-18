// Service Worker — PWA 설치 + Web Push 알림
//
// 정책
//  - install/activate: skipWaiting + clients.claim (새 SW 즉시 활성)
//  - fetch: 캐시 안 함 (network-first passthrough) — 빌드 갱신 즉시 반영 우선
//  - push:
//      · 항상 OS notification + 기본 알림음 발화 (belt-and-suspenders).
//        예전엔 foreground 일 때 silent 처리로 mp3 와 이중 방지했으나, 첫 행사
//        (2026-05)에서 mp3 가 락 stuck 으로 silent drop 되는 케이스가 있었음.
//        OS 기본음은 짧지만 신뢰성이 매우 높아 mp3 실패 시 백업으로 작동시킴.
//      · visible 부스 client 가 있으면 → postMessage 로 client 에 위임 (client 가
//        alarmEngine 큐로 mp3 재생). 큐가 중복 알람을 coalesce 하므로 안전.
//      · visible client 없음 (background / screen-off) → OS 기본음만. SW 컨텍스트
//        에선 임의 Audio 재생이 spec 상 불가.
//  - notificationclick: 부스 대시보드 탭이 있으면 focus, 없으면 새 탭으로 open

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
  event.waitUntil((async () => {
    let data = {}
    try {
      data = event.data ? event.data.json() : {}
    } catch {
      data = { title: '새 주문', body: '' }
    }

    const clientsList = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    })
    let foregroundBooth = null
    for (const c of clientsList) {
      try {
        const u = new URL(c.url)
        if (c.visibilityState === 'visible' && u.pathname.startsWith('/dashboard')) {
          foregroundBooth = c
          break
        }
      } catch {
        /* ignore */
      }
    }

    if (foregroundBooth) {
      // 기존 audioCue.playSound (mp3) 가 울리도록 client 에 위임
      foregroundBooth.postMessage({ type: 'booth-push', payload: data })
    }

    const title = data.title || '새 주문'
    const options = {
      body: data.body || '미확인 주문을 확인하세요',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'booth-order',
      renotify: true,
      requireInteraction: false,
      vibrate: [300, 100, 300, 100, 300],
      // 항상 OS 기본음 발화 (belt-and-suspenders) — mp3 실패 백업.
      silent: false,
      data: {
        url: data.url || '/dashboard',
        boothId: data.boothId,
      },
    }
    return self.registration.showNotification(title, options)
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          const url = new URL(client.url)
          if (url.pathname.startsWith('/dashboard')) {
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
