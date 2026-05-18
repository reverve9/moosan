import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendBoothPush } from '../_lib/pushSend.js'

/**
 * 특정 부스의 모든 구독에 Web Push 발송 (HTTP wrapper).
 *
 * 호출:
 *   POST /api/push/notify-booth
 *   { boothId: string, payload?: { title?, body?, tag?, url? } }
 *
 * 클라이언트 호출자:
 *   - 헬프데스크 confirmKioskPayment (cash/card paid 직후, src/lib/pushNotify.ts)
 *
 * 서버 호출자는 fetch 대신 api/_lib/pushSend.ts 의 sendBoothPush 직접 import.
 *
 * 인증: 현재 open POST (내부망 가정). 운영 안정화 후 INTERNAL_PUSH_KEY 헤더
 * 검증 추가 검토.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { boothId, payload } = (req.body ?? {}) as {
    boothId?: string
    payload?: {
      title?: string
      body?: string
      tag?: string
      url?: string
      orderId?: string
    }
  }

  if (!boothId) {
    return res.status(400).json({ error: 'boothId required' })
  }

  const result = await sendBoothPush(boothId, payload)
  if (!result) {
    return res.status(500).json({ error: 'send_failed_or_not_configured' })
  }
  return res.status(200).json({ ok: true, ...result })
}
