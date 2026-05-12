// 쿠키페이먼츠 RETURNURL 수신 endpoint.
//
// 결제창 → Form POST (application/x-www-form-urlencoded) → 이 endpoint.
//   body: { RESULTCODE, RESULTMSG, ENC_DATA }
//
// 처리:
//   1) RESULTCODE !== '0000' → /payment/cancel?reason= 으로 302
//   2) decryptEdi(ENC_DATA) → ORDERNO/AMOUNT/TID/ACCEPT_NO/PAY_METHOD/ETC1
//   3) ETC1(payment.id) 또는 ORDERNO 로 payments 조회
//   4) AMOUNT === payment.total_amount 검증 (위변조 방어)
//   5) payments → paid, payment_key=tid, meta 갱신
//   6) orders → paid
//   7) coupon used 전이
//   8) /order/:paymentId?from=checkout 로 302
//
// 인증: 외부 endpoint 지만 ENC_DATA 가 ApiKey 없이는 복호화 불가
//      + 금액 검증으로 위변조 차단. 추가 인증 토큰 X.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { decryptEdi, normalizePayMethod } from '../_lib/cookiepay.js'

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase env not configured')
  return createClient(url, key)
}

function redirect(res: VercelResponse, location: string) {
  res.setHeader('Location', location)
  res.status(302).end()
}

function failRedirect(res: VercelResponse, reason: string) {
  const param = encodeURIComponent(reason)
  redirect(res, `/payment/cancel?reason=${param}`)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    // 직접 GET 으로 접근한 경우(브라우저 새로고침 등) cancel 페이지로 안내
    return redirect(res, '/payment/cancel?reason=invalid_access')
  }

  // Vercel 은 application/x-www-form-urlencoded 를 자동 파싱해 req.body 객체화.
  const body = (req.body ?? {}) as Record<string, string | undefined>
  const resultCode = body.RESULTCODE
  const resultMsg = body.RESULTMSG
  const encData = body.ENC_DATA

  if (!resultCode) {
    return failRedirect(res, 'invalid_response')
  }
  if (resultCode !== '0000') {
    return failRedirect(res, resultMsg || `error_${resultCode}`)
  }
  if (!encData) {
    return failRedirect(res, 'no_enc_data')
  }

  // ── 1) 복호화 ──
  let decrypted
  try {
    const decryptRes = await decryptEdi(encData)
    if (decryptRes.RESULTCODE !== '0000' || !decryptRes.decryptData) {
      console.error('[cookiepay/return] decrypt failed', decryptRes)
      return failRedirect(res, 'decrypt_failed')
    }
    decrypted = decryptRes.decryptData
  } catch (err) {
    console.error('[cookiepay/return] decrypt threw', err)
    return failRedirect(res, 'decrypt_error')
  }

  const orderNo = decrypted.ORDERNO
  const amountRaw = decrypted.AMOUNT
  const tid = decrypted.TID
  const acceptNo = decrypted.ACCEPT_NO
  const payMethod = decrypted.PAY_METHOD
  const paymentIdFromEtc1 = decrypted.ETC1

  if (!orderNo || !tid || amountRaw === undefined) {
    console.error('[cookiepay/return] missing required fields', { orderNo, tid, amountRaw })
    return failRedirect(res, 'missing_fields')
  }

  const amount = typeof amountRaw === 'string' ? Number(amountRaw) : amountRaw
  if (!Number.isFinite(amount)) {
    return failRedirect(res, 'invalid_amount')
  }

  // ── 2) payment 조회 (ETC1 우선, fallback ORDERNO) ──
  const supabase = getSupabase()
  let payment: { id: string; total_amount: number; status: string; coupon_id: string | null } | null = null

  if (paymentIdFromEtc1) {
    const r = await supabase
      .from('payments')
      .select('id, total_amount, status, coupon_id')
      .eq('id', paymentIdFromEtc1)
      .maybeSingle()
    if (r.error) {
      console.error('[cookiepay/return] payment fetch by id failed', r.error)
    }
    payment = r.data
  }
  if (!payment) {
    const r = await supabase
      .from('payments')
      .select('id, total_amount, status, coupon_id')
      .eq('toss_order_id', orderNo)
      .maybeSingle()
    if (r.error) {
      console.error('[cookiepay/return] payment fetch by orderno failed', r.error)
    }
    payment = r.data
  }

  if (!payment) {
    console.error('[cookiepay/return] payment not found', { orderNo, paymentIdFromEtc1 })
    return failRedirect(res, 'payment_not_found')
  }

  // 멱등성: 이미 paid 면 그대로 /order 로 보냄 (Form POST 재전송 케이스 방어)
  if (payment.status === 'paid') {
    return redirect(res, `/order/${payment.id}?from=checkout`)
  }

  // ── 3) 금액 검증 ──
  if (payment.total_amount !== amount) {
    console.error('[cookiepay/return] amount mismatch', {
      paymentId: payment.id,
      expected: payment.total_amount,
      actual: amount,
    })
    return failRedirect(res, 'amount_mismatch')
  }

  // ── 4) payments → paid ──
  const now = new Date().toISOString()
  const pgMethod = normalizePayMethod(payMethod)
  const meta = {
    pg_provider: 'cookiepay',
    pg_method: pgMethod,
    accept_no: acceptNo ?? null,
    pg_orderno: orderNo,
  }

  const { error: pErr } = await supabase
    .from('payments')
    .update({
      status: 'paid',
      paid_at: now,
      payment_key: tid,
      meta,
    })
    .eq('id', payment.id)
  if (pErr) {
    console.error('[cookiepay/return] payments update failed', pErr)
    return failRedirect(res, 'db_update_failed')
  }

  // ── 5) orders → paid (paid_at 도 함께) ──
  const { error: oErr } = await supabase
    .from('orders')
    .update({ status: 'paid', paid_at: now })
    .eq('payment_id', payment.id)
  if (oErr) {
    console.error('[cookiepay/return] orders update failed', oErr)
    // 이미 payments 는 paid — redirect 진행, 후속 핸드오프에서 처리
  }

  // ── 6) coupon 원자 전이 ──
  if (payment.coupon_id) {
    const { error: cErr } = await supabase
      .from('coupons')
      .update({ status: 'used', used_at: now, used_payment_id: payment.id })
      .eq('id', payment.coupon_id)
      .eq('status', 'active')
    if (cErr) {
      console.error('[cookiepay/return] coupon update failed', cErr)
    }
  }

  // ── 7) 카트 비우기는 클라에서. ?from=checkout 마킹으로 OrderStatusPage 에서 처리 ──
  return redirect(res, `/order/${payment.id}?from=checkout`)
}
