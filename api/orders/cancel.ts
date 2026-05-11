import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { sendRefundAlimtalk } from '../_lib/alimtalk.js'

/**
 * 부스 단위 주문 거절 + 부분 환불.
 *
 * 환경변수 — api/payments/cancel.ts 와 동일.
 *
 * 호출:
 *   POST /api/orders/cancel
 *   { orderId: string, reason: string, cancelledBy?: 'booth' | 'admin', force?: boolean }
 *     cancelledBy 미지정 시 'booth' (부스 클라이언트 기존 호환).
 *     'admin' 은 어드민 화면에서 부스 단위로 환불할 때 사용.
 *     - admin: paid/confirmed/completed + picked_up_at 무관 모두 환불 가능
 *       (force 는 호환용 - admin 은 항상 force 동등 권한)
 *     - booth: paid/confirmed 만, picked_up_at IS NULL 한정 (기존 정책)
 *
 * 흐름:
 *   1) order + parent payment 조회
 *   2) 적격성 검증 (cancelledBy 별 분기)
 *   3) 환불액 — 멀티 부스 + 쿠폰 분배 비례:
 *      - 같은 결제 내 살아있는(=cancelled 아님) 부스가 1개 이상 남으면
 *        refundAmount = floor(order.subtotal × payment.total_amount / sum_all_subtotals)
 *      - 마지막 살아있는 부스를 취소할 때는 끝수 보정을 위해 remaining 사용
 *      - voucher_only 등 total_amount=0 결제는 refundAmount=0 (DB 만 cancelled)
 *   4) Toss /v1/payments/{paymentKey}/cancel 부분 환불 (cancelAmount, pg 만)
 *   5) DB 업데이트
 *      - orders 해당 row: status='cancelled', cancelled_at, cancel_reason, cancelled_by
 *      - payments: refunded_amount += refund_amount
 *      - 마지막 부스(=결제 내 살아있는 부스가 더 없을 때) 인 경우만 payments.status='cancelled'
 *   6) 200 응답
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { orderId, reason, cancelledBy, force } = (req.body ?? {}) as {
    orderId?: string
    reason?: string
    cancelledBy?: 'booth' | 'admin'
    force?: boolean
  }

  if (!orderId || !reason || reason.trim().length === 0) {
    return res.status(400).json({ error: 'orderId, reason are required' })
  }
  const cancelledByValue: 'booth' | 'admin' =
    cancelledBy === 'admin' ? 'admin' : 'booth'
  // admin 은 항상 force 동등 — picked_up_at/completed 무관 환불 허용 (운영 요구사항)
  // force 파라미터는 booth 클라이언트와의 하위 호환을 위해 유지하되 실효 X
  void force
  const isAdmin = cancelledByValue === 'admin'

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

  // 1) order 조회
  const { data: order, error: oErr } = await supabase
    .from('orders')
    .select()
    .eq('id', orderId)
    .maybeSingle()
  if (oErr) return res.status(500).json({ error: `order 조회 실패: ${oErr.message}` })
  if (!order) return res.status(404).json({ error: '주문을 찾을 수 없습니다' })

  // 2) 적격성 — booth path 만 픽업완료 차단, admin 은 픽업완료/completed 모두 허용
  if (!isAdmin && order.picked_up_at !== null) {
    return res.status(409).json({
      error: '이미 픽업 완료된 주문은 거절할 수 없습니다',
      code: 'ORDER_ALREADY_PICKED_UP',
    })
  }
  // 이미 cancelled 면 재환불 방지
  if (order.status === 'cancelled') {
    return res.status(409).json({
      error: `거절 불가 상태 (${order.status})`,
      code: 'ORDER_NOT_CANCELLABLE',
    })
  }
  const allowedStatuses = isAdmin
    ? ['paid', 'confirmed', 'completed']
    : ['paid', 'confirmed']
  if (!allowedStatuses.includes(order.status)) {
    return res.status(409).json({
      error: `거절 불가 상태 (${order.status})`,
      code: 'ORDER_NOT_CANCELLABLE',
    })
  }

  // payment 조회
  const { data: payment, error: pErr } = await supabase
    .from('payments')
    .select()
    .eq('id', order.payment_id)
    .maybeSingle()
  if (pErr) return res.status(500).json({ error: `payment 조회 실패: ${pErr.message}` })
  if (!payment) return res.status(404).json({ error: '결제 정보를 찾을 수 없습니다' })

  if (payment.status !== 'paid') {
    return res.status(400).json({
      error: `결제가 ${payment.status} 상태라 환불할 수 없습니다`,
    })
  }

  // payment_method 분기 — pg 만 Toss 호출, 나머지는 DB 만 업데이트.
  // helpdesk(현금/외부카드/식권100%) 결제는 Toss 결제건이 없어서 환불 API 가 없음.
  // 실 환불은 운영진 수동 (현금 직접 반환 / 외부 단말기 환불 / 식권 복구 X).
  type Method = 'pg' | 'external_card' | 'cash' | 'voucher_only'
  const paymentMethod: Method =
    (payment as { payment_method?: Method }).payment_method ?? 'pg'

  if (paymentMethod === 'pg' && !payment.payment_key) {
    return res.status(400).json({ error: 'payment_key 가 없습니다' })
  }

  // 3) 환불액 — 멀티 부스 + 쿠폰 분배 비례 + 마지막 부스 끝수 보정
  const remaining = payment.total_amount - (payment.refunded_amount ?? 0)
  const isZeroAmountPayment = payment.total_amount === 0

  // 같은 결제 내 모든 부스 조회 — 비례 분배 + 마지막 부스 감지용
  const { data: siblingOrders, error: sErr } = await supabase
    .from('orders')
    .select('id, subtotal, status')
    .eq('payment_id', payment.id)
  if (sErr) {
    return res.status(500).json({ error: `결제 내 부스 조회 실패: ${sErr.message}` })
  }
  const allOrders = siblingOrders ?? []
  const sumSubtotal = allOrders.reduce((acc, o) => acc + (o.subtotal ?? 0), 0)
  // 자기 자신 제외, cancelled 아닌 부스 = 살아있는 다른 부스
  const otherLiveCount = allOrders.filter(
    (o) => o.id !== orderId && o.status !== 'cancelled',
  ).length
  const isLastLiveBooth = otherLiveCount === 0

  let refundAmount: number
  if (isZeroAmountPayment) {
    // voucher_only 100% 또는 0원 결제 — 손님 부담분 없음. DB 만 cancelled.
    refundAmount = 0
  } else if (remaining <= 0) {
    return res.status(400).json({ error: '이미 전액 환불된 결제입니다' })
  } else if (isLastLiveBooth) {
    // 마지막 살아있는 부스 — 끝수 보정 위해 잔액 전체 환불
    refundAmount = remaining
  } else if (sumSubtotal > 0) {
    // 비례 분배 — order.subtotal 의 결제실액 점유율 기준. floor 로 끝수 누락 → 마지막 부스에서 흡수.
    refundAmount = Math.min(
      Math.floor((order.subtotal * payment.total_amount) / sumSubtotal),
      remaining,
    )
  } else {
    // fallback (이론상 도달 불가) — 기존 동작 유지
    refundAmount = Math.min(order.subtotal, remaining)
  }

  // 4) Toss 부분 환불 (pg 결제만, refundAmount > 0 일 때만)
  let tossJson: unknown = null
  if (paymentMethod === 'pg' && refundAmount > 0) {
    const authHeader = 'Basic ' + Buffer.from(secretKey + ':').toString('base64')
    try {
      const tossResponse = await fetch(
        `https://api.tosspayments.com/v1/payments/${encodeURIComponent(payment.payment_key as string)}/cancel`,
        {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cancelReason: reason.trim(),
            cancelAmount: refundAmount,
          }),
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
  }
  // external_card / cash / voucher_only / 0원 환불 은 DB 업데이트로만 진행.

  // 5) DB 업데이트
  const now = new Date().toISOString()

  // (a) orders 해당 row → cancelled
  const { error: updOErr } = await supabase
    .from('orders')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      cancel_reason: reason.trim(),
      cancelled_by: cancelledByValue,
    })
    .eq('id', orderId)
  if (updOErr) {
    return res.status(500).json({
      error: `Toss 환불은 성공했으나 order 업데이트 실패: ${updOErr.message}`,
      tossResult: tossJson,
    })
  }

  // (b) payments → refunded_amount += refundAmount
  //     payment.status='cancelled' 전환은 "결제 내 마지막 살아있는 부스" 기준 (=isLastLiveBooth).
  //     쿠폰 비례 분배로 인해 누적 refunded_amount < total_amount 인 채로 마지막 부스가
  //     올 수 있으므로 amount 기반이 아닌 부스 카운트 기반으로 판정해야 안전.
  const newRefundedTotal = (payment.refunded_amount ?? 0) + refundAmount
  const reachedFull = isLastLiveBooth

  const updatePayload: Record<string, unknown> = {
    refunded_amount: newRefundedTotal,
  }
  if (reachedFull) {
    updatePayload.status = 'cancelled'
    updatePayload.cancelled_at = now
  }

  const { error: updPErr } = await supabase
    .from('payments')
    .update(updatePayload)
    .eq('id', payment.id)
  if (updPErr) {
    return res.status(500).json({
      error: `order 는 cancelled 됐지만 payments 업데이트 실패: ${updPErr.message}`,
      tossResult: tossJson,
    })
  }

  // 환불 알림톡 — voucher_only / 0원 환불은 skip.
  // 응답 전에 await — Vercel serverless 가 res.json() 직후 함수를 suspend 시켜서
  // alimtalk_logs UPDATE 가 끝나기 전에 종료되는 경우 관찰됨.
  if (paymentMethod !== 'voucher_only' && refundAmount > 0) {
    await sendRefundAlimtalk(
      orderId,
      order.phone,
      refundAmount,
      order.booth_id,
    ).catch((err) => {
      console.error('[orders/cancel] alimtalk error', err)
    })
  }

  return res.status(200).json({
    ok: true,
    orderId,
    paymentId: payment.id,
    refundAmount,
    paymentFullyCancelled: reachedFull,
    isLastLiveBooth,
    tossResult: tossJson,
  })
}
