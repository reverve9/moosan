import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

/**
 * Web Push subscription 등록.
 *
 * 호출:
 *   POST /api/push/subscribe
 *   {
 *     boothId: string,
 *     subscription: { endpoint, keys: { p256dh, auth } },
 *     userAgent?: string,
 *   }
 *
 * 동작:
 *   - push_subscriptions 테이블에 endpoint(PK) upsert
 *   - 부스 태블릿 PWA 가 알림 권한 허용 직후 1회 호출
 *
 * 환경변수:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  — push_subscriptions 는 RLS-only-service-role 정책
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { boothId, subscription, userAgent } = (req.body ?? {}) as {
    boothId?: string
    subscription?: {
      endpoint?: string
      keys?: { p256dh?: string; auth?: string }
    }
    userAgent?: string
  }

  if (!boothId || !subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return res.status(400).json({ error: 'boothId, subscription{endpoint, keys.p256dh, keys.auth} required' })
  }

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('[push/subscribe] missing env', { hasUrl: !!url, hasKey: !!key })
    return res.status(500).json({ error: 'server_not_configured' })
  }
  const supabase = createClient(url, key)

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        endpoint: subscription.endpoint,
        booth_id: boothId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: userAgent ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )
  if (error) {
    console.error('[push/subscribe] upsert failed', error)
    return res.status(500).json({ error: 'db_error' })
  }
  return res.status(200).json({ ok: true })
}
