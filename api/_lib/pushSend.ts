import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

/**
 * 서버 내부에서 직접 부스 푸시 발송 (HTTP 라운드 트립 없음).
 *
 * api/cookiepay/noti.ts, api/cookiepay/return.ts 처럼 같은 Vercel function
 * 환경에서 paid 전이 직후 fire-and-forget 으로 호출.
 *
 * 클라이언트 호출은 별도로 POST /api/push/notify-booth (이 헬퍼를 감쌈).
 *
 * 실패는 throw 안 함 — 결제 완료 흐름에 영향 주지 않게 silent (console.error 만).
 */
export async function sendBoothPush(
  boothId: string,
  payload?: {
    title?: string
    body?: string
    tag?: string
    url?: string
    /** 단일 주문 식별자. 같은 paid 이벤트에 대한 realtime+push 중복 알람을
     *  클라이언트 alarmEngine 의 dedup key 로 흡수하기 위해 전달. */
    orderId?: string
  },
): Promise<{ sent: number; total: number; pruned: number } | null> {
  const supaUrl = process.env.VITE_SUPABASE_URL
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const vapidPublic = process.env.VITE_VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  const vapidSubject = process.env.VAPID_SUBJECT
  if (!supaUrl || !supaKey || !vapidPublic || !vapidPrivate || !vapidSubject) {
    console.error('[pushSend] missing env — skip', {
      hasUrl: !!supaUrl,
      hasKey: !!supaKey,
      hasVapid: !!vapidPublic && !!vapidPrivate && !!vapidSubject,
    })
    return null
  }

  try {
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
    const supabase = createClient(supaUrl, supaKey)

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('booth_id', boothId)
    if (error) {
      console.error('[pushSend] subscriptions fetch failed', error)
      return null
    }
    if (!subs || subs.length === 0) {
      return { sent: 0, total: 0, pruned: 0 }
    }

    const body = JSON.stringify({
      title: payload?.title ?? '새 주문',
      body: payload?.body ?? '미확인 주문을 확인하세요',
      tag: payload?.tag ?? `booth-${boothId}`,
      url: payload?.url ?? '/dashboard',
      boothId,
      orderId: payload?.orderId,
    })

    const staleEndpoints: string[] = []
    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        ),
      ),
    )
    let sent = 0
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        sent += 1
        return
      }
      const status = (r.reason as { statusCode?: number } | undefined)?.statusCode
      if (status === 404 || status === 410) {
        staleEndpoints.push(subs[i].endpoint)
      } else {
        console.warn('[pushSend] send failed', { endpoint: subs[i].endpoint, status })
      }
    })
    if (staleEndpoints.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
    }
    return { sent, total: subs.length, pruned: staleEndpoints.length }
  } catch (e) {
    console.error('[pushSend] unexpected error', e)
    return null
  }
}
