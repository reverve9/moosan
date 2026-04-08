import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

/**
 * 토스페이먼츠 결제 취소(환불) API.
 *
 * 환경변수:
 *   TOSS_SECRET_KEY      — Toss Basic Auth 키
 *   VITE_SUPABASE_URL    — Supabase project URL (server 에서도 process.env 로 읽힘)
 *   VITE_SUPABASE_ANON_KEY — anon key (RLS 신뢰 전제 — 기존 client 패턴과 동일)
 *
 * 호출:
 *   POST /api/payments/cancel
 *   { paymentId: string, reason: string }
 *
 * 흐름:
 *   1) payments + 하위 orders 조회
 *   2) 적격성 검증 — payment.status='paid' AND 하위 orders 전부 status='paid'
 *      (하나라도 confirmed/completed 이면 거부 — 조리 시작분 환불 불가)
 *   3) Toss /v1/payments/{paymentKey}/cancel 호출 (cancelReason)
 *   4) DB 업데이트 — payments(status=cancelled, cancelled_at, meta.cancel_reason)
 *      + orders 전부 status=cancelled
 *   5) 200 {ok:true, payment} 반환
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { paymentId, reason } = (req.body ?? {}) as {
    paymentId?: string
    reason?: string
  }

  if (!paymentId || !reason || reason.trim().length === 0) {
    return res.status(400).json({ error: 'paymentId, reason are required' })
  }

  const secretKey = process.env.TOSS_SECRET_KEY
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!secretKey || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error:
        'Server is missing TOSS_SECRET_KEY / VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY',
    })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // 1) 조회
  const { data: payment, error: pErr } = await supabase
    .from('payments')
    .select()
    .eq('id', paymentId)
    .maybeSingle()
  if (pErr) return res.status(500).json({ error: `payment 조회 실패: ${pErr.message}` })
  if (!payment) return res.status(404).json({ error: '결제를 찾을 수 없습니다' })

  if (payment.status !== 'paid') {
    return res.status(400).json({
      error: `취소 불가 상태 (${payment.status}). paid 상태만 취소 가능합니다`,
    })
  }
  if (!payment.payment_key) {
    return res.status(400).json({ error: 'payment_key 가 없습니다' })
  }

  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select()
    .eq('payment_id', paymentId)
  if (oErr) return res.status(500).json({ error: `orders 조회 실패: ${oErr.message}` })

  // 2) 적격성 — 하나라도 확인/조리 시작된 주문이 있으면 거부
  const blocking = (orders ?? []).find(
    (o) => o.status !== 'paid' || o.confirmed_at !== null || o.ready_at !== null,
  )
  if (blocking) {
    return res.status(409).json({
      error: `이미 매장에서 확인한 주문이 포함되어 있어 취소할 수 없습니다 (${blocking.booth_name} ${blocking.order_number})`,
      code: 'ORDER_ALREADY_CONFIRMED',
    })
  }

  // 3) Toss cancel
  const authHeader = 'Basic ' + Buffer.from(secretKey + ':').toString('base64')
  let tossJson: unknown
  try {
    const tossResponse = await fetch(
      `https://api.tosspayments.com/v1/payments/${encodeURIComponent(payment.payment_key)}/cancel`,
      {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cancelReason: reason.trim() }),
      },
    )
    tossJson = await tossResponse.json()
    if (!tossResponse.ok) {
      return res.status(tossResponse.status).json(tossJson)
    }
  } catch (err) {
    return res.status(502).json({
      error: 'Toss cancel API 호출 실패',
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  // 4) DB 업데이트
  const now = new Date().toISOString()
  const meta =
    payment.meta && typeof payment.meta === 'object' && !Array.isArray(payment.meta)
      ? { ...(payment.meta as Record<string, unknown>) }
      : {}
  meta.cancel_reason = reason.trim()
  meta.cancelled_via = 'admin'

  const { error: updPErr } = await supabase
    .from('payments')
    .update({ status: 'cancelled', cancelled_at: now, meta })
    .eq('id', paymentId)
  if (updPErr) {
    return res.status(500).json({
      error: `Toss 취소는 성공했으나 DB 업데이트 실패: ${updPErr.message}`,
      tossResult: tossJson,
    })
  }

  const { error: updOErr } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('payment_id', paymentId)
  if (updOErr) {
    return res.status(500).json({
      error: `payments 는 취소됐지만 orders 업데이트 실패: ${updOErr.message}`,
      tossResult: tossJson,
    })
  }

  return res.status(200).json({ ok: true, paymentId, tossResult: tossJson })
}
