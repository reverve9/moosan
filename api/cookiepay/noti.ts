// 쿠키페이먼츠 Server to Server 통지(Noti) 수신 endpoint.
//
// 쿠키페이 콘솔 → API 연동 → 통지전문(Noti) 입력란에 등록:
//   https://{도메인}/api/cookiepay/noti
//
// payload 종류:
//   (A) 승인 통지 — PAY_METHOD/ORDERNO/AMOUNT/TID/ACCEPT_NO/ETC1 등
//                   → 우리는 RETURNURL 에서 이미 paid 처리. 멱등 skip.
//   (B) 취소 통지 — noti_type='cancel' 또는 'deposit_cancel'
//                   paymethod/orderno/cancel_amount/tid/cancel_date
//                   → 사용자가 카카오/네이버페이 앱에서 직접 취소한 경우 발생.
//                     B안 정책상 자동 환불 안 되는 KAKAOPAY/NAVERPAY 의
//                     외부 취소를 우리 DB 에 반영하는 게 핵심 목적.
//
// 보호:
//   매뉴얼에 noti 인증 토큰 명시 없음. 다음으로 보호:
//   1) orderno + tid 가 우리 DB 와 일치해야 동작 (외부에서 우리 tid 모름)
//   2) cancel_amount 가 remaining 초과하면 거부
//   3) 멱등성 — payment.status='cancelled' 이면 skip

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { sendRefundAlimtalk } from '../_lib/alimtalk.js'

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase env not configured')
  return createClient(url, key)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  // JSON / form-urlencoded 양쪽 모두 req.body 객체화 (Vercel default body parser)
  const body = (req.body ?? {}) as Record<string, unknown>

  // 디버깅용 로그 — 운영 중 noti 페이로드 추적
  console.log('[cookiepay/noti] received', JSON.stringify(body))

  // 취소 통지 여부 판정 — noti_type 필드로 분기 (취소 통지의 필드명은 소문자)
  const notiType = (body.noti_type ?? body.NOTI_TYPE) as string | undefined
  const isCancel = notiType === 'cancel' || notiType === 'deposit_cancel'

  if (!isCancel) {
    // 승인 통지: RETURNURL 에서 이미 처리. 200 OK 응답만.
    return res.status(200).json({ ok: true, skipped: 'approval_noti' })
  }

  // ── 취소 통지 처리 ──
  const orderNo = (body.orderno ?? body.ORDERNO) as string | undefined
  const cancelAmountRaw = (body.cancel_amount ?? body.CANCEL_AMOUNT) as
    | string
    | number
    | undefined
  const tid = (body.tid ?? body.TID) as string | undefined
  const paymethod = (body.paymethod ?? body.PAY_METHOD) as string | undefined

  if (!orderNo || !tid || cancelAmountRaw === undefined) {
    console.error('[cookiepay/noti] cancel missing fields', { orderNo, tid, cancelAmountRaw })
    return res.status(400).json({ error: 'missing_fields' })
  }

  const cancelAmount =
    typeof cancelAmountRaw === 'string' ? Number(cancelAmountRaw) : cancelAmountRaw
  if (!Number.isFinite(cancelAmount) || cancelAmount < 0) {
    return res.status(400).json({ error: 'invalid_cancel_amount' })
  }

  const supabase = getSupabase()

  // 1) payment 조회 — orderno 로 (toss_order_id 컬럼 재사용 / generic PG order ID)
  //    tid 도 추가 검증 (변조 차단)
  const { data: payment, error: pErr } = await supabase
    .from('payments')
    .select()
    .eq('toss_order_id', orderNo)
    .maybeSingle()
  if (pErr) {
    console.error('[cookiepay/noti] payment fetch failed', pErr)
    return res.status(500).json({ error: 'db_error' })
  }
  if (!payment) {
    console.error('[cookiepay/noti] payment not found', { orderNo })
    return res.status(404).json({ error: 'payment_not_found' })
  }

  // 2) tid 정합성 — pg_tid 또는 payment_key (legacy) 와 일치 확인
  const storedTid = payment.pg_tid ?? payment.payment_key
  if (storedTid && storedTid !== tid) {
    console.error('[cookiepay/noti] tid mismatch', {
      paymentId: payment.id,
      stored: storedTid,
      received: tid,
    })
    return res.status(403).json({ error: 'tid_mismatch' })
  }

  // 3) 멱등성 — 이미 cancelled 면 200 skip
  if (payment.status === 'cancelled') {
    return res.status(200).json({ ok: true, skipped: 'already_cancelled' })
  }

  // 4) 적격성
  if (payment.status !== 'paid') {
    console.error('[cookiepay/noti] payment not paid', {
      paymentId: payment.id,
      status: payment.status,
    })
    return res.status(400).json({ error: `payment_status_${payment.status}` })
  }

  const remaining = payment.total_amount - (payment.refunded_amount ?? 0)
  if (cancelAmount > remaining) {
    console.error('[cookiepay/noti] cancel exceeds remaining', {
      paymentId: payment.id,
      cancelAmount,
      remaining,
    })
    return res.status(400).json({ error: 'cancel_exceeds_remaining' })
  }

  // 부분 취소는 운영진 수동 대응 영역 (B안 정책) — 자동 처리 X, 로그만 남기고 알람
  const isFullCancel = cancelAmount === remaining
  if (!isFullCancel) {
    console.error(
      '[cookiepay/noti] partial cancel — manual ops required',
      JSON.stringify({
        paymentId: payment.id,
        cancelAmount,
        remaining,
        paymethod,
        tid,
        orderNo,
      }),
    )
    // 부분 취소도 DB 상 refunded_amount 누적만 반영 — orders 는 운영진이 수동 판단
    const { error: pUpdErr } = await supabase
      .from('payments')
      .update({ refunded_amount: (payment.refunded_amount ?? 0) + cancelAmount })
      .eq('id', payment.id)
    if (pUpdErr) {
      console.error('[cookiepay/noti] partial cancel refunded_amount update failed', pUpdErr)
    }
    return res.status(200).json({ ok: true, partial: true })
  }

  // 5) 전체 취소 — payments cancelled, 살아있는 orders cancelled, 쿠폰 복원
  const now = new Date().toISOString()
  const meta =
    payment.meta && typeof payment.meta === 'object' && !Array.isArray(payment.meta)
      ? { ...(payment.meta as Record<string, unknown>) }
      : {}
  meta.cancel_reason = 'external_cancel_via_noti'
  meta.cancelled_via = 'cookiepay_noti'

  const { error: updPErr } = await supabase
    .from('payments')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      refunded_amount: payment.total_amount,
      meta,
    })
    .eq('id', payment.id)
  if (updPErr) {
    console.error('[cookiepay/noti] payments update failed', updPErr)
    return res.status(500).json({ error: 'payments_update_failed' })
  }

  // 살아있는 orders → cancelled
  const { data: liveOrders, error: oFetchErr } = await supabase
    .from('orders')
    .select('id, phone, subtotal, booth_id')
    .eq('payment_id', payment.id)
    .neq('status', 'cancelled')
  if (oFetchErr) {
    console.error('[cookiepay/noti] orders fetch failed', oFetchErr)
  }

  const liveIds = (liveOrders ?? []).map((o) => o.id)
  if (liveIds.length > 0) {
    const { error: updOErr } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        cancelled_at: now,
        cancel_reason: '외부 결제 취소',
        cancelled_by: 'admin',
      })
      .in('id', liveIds)
    if (updOErr) {
      console.error('[cookiepay/noti] orders update failed', updOErr)
    }
  }

  // 쿠폰 복원
  if (payment.coupon_id) {
    const { error: cErr } = await supabase
      .from('coupons')
      .update({ status: 'active', used_at: null, used_payment_id: null })
      .eq('id', payment.coupon_id)
      .eq('used_payment_id', payment.id)
    if (cErr) {
      console.error('[cookiepay/noti] coupon restore failed', cErr)
    }
  }

  // 환불 알림톡 — 살아있던 부스 각각에 발송
  if (liveOrders && liveOrders.length > 0) {
    const results = await Promise.allSettled(
      liveOrders.map((o) =>
        sendRefundAlimtalk(o.id, o.phone, o.subtotal, o.booth_id ?? undefined),
      ),
    )
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error('[cookiepay/noti] alimtalk error', r.reason)
      }
    }
  }

  return res.status(200).json({ ok: true, fullyCancelled: true })
}
