import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * 토스페이먼츠 결제 승인 API.
 *
 * 환경변수: TOSS_SECRET_KEY  (test_sk_... 또는 live_sk_...)
 *   - Vercel 대시보드의 Project Settings → Environment Variables 에 등록
 *   - 로컬 개발 시: `vercel dev` 실행 시 .env 의 TOSS_SECRET_KEY 가 자동 주입됨
 *
 * 호출:
 *   POST /api/payments/confirm
 *   { paymentKey: string, orderId: string, amount: number }
 *
 * 응답:
 *   200 → 토스 응답 그대로
 *   4xx/5xx → 에러 메시지
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { paymentKey, orderId, amount } = (req.body ?? {}) as {
    paymentKey?: string
    orderId?: string
    amount?: number
  }

  if (!paymentKey || !orderId || typeof amount !== 'number') {
    return res.status(400).json({
      error: 'paymentKey, orderId, amount are required',
    })
  }

  const secretKey = process.env.TOSS_SECRET_KEY
  if (!secretKey) {
    return res.status(500).json({
      error: 'TOSS_SECRET_KEY is not configured',
    })
  }

  // 토스 confirm API: Basic Auth = base64(secretKey + ':')
  const authHeader = 'Basic ' + Buffer.from(secretKey + ':').toString('base64')

  try {
    const tossResponse = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    })

    const data = await tossResponse.json()

    if (!tossResponse.ok) {
      // 토스가 보낸 에러 (예: 카드 거절, 금액 불일치) 그대로 전달
      return res.status(tossResponse.status).json(data)
    }

    return res.status(200).json(data)
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to call Toss confirm API',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}
