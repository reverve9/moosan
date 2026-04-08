import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

/**
 * 쿠폰 검증 API.
 *
 * 호출:
 *   POST /api/coupons/validate
 *   { code: string, subtotal: number }
 *
 * 응답 (200):
 *   { valid: true, couponId, code, discount, finalAmount }
 *
 * 에러 (4xx):
 *   { valid: false, error: string }
 *
 * 검증 항목 (서버에서 단독 책임)
 *   · 쿠폰 존재
 *   · status === 'active'
 *   · expires_at > now
 *   · subtotal >= min_order_amount
 *
 * 이 API 는 read-only — 쿠폰 상태는 전이하지 않음.
 * 실제 사용(used) 전이는 결제 confirm 시점에 markPaymentPaid 에서 처리.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ valid: false, error: 'Method Not Allowed' })
  }

  const { code, subtotal } = (req.body ?? {}) as {
    code?: string
    subtotal?: number
  }

  if (!code || typeof subtotal !== 'number' || subtotal < 0) {
    return res.status(400).json({ valid: false, error: '잘못된 요청' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      valid: false,
      error: 'Server missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY',
    })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  const normalized = code.trim().toUpperCase()
  const { data: coupon, error } = await supabase
    .from('coupons')
    .select()
    .eq('code', normalized)
    .maybeSingle()
  if (error) {
    return res.status(500).json({ valid: false, error: `조회 실패: ${error.message}` })
  }
  if (!coupon) {
    return res.status(404).json({ valid: false, error: '존재하지 않는 쿠폰입니다' })
  }

  if (coupon.status === 'used') {
    return res.status(409).json({ valid: false, error: '이미 사용된 쿠폰입니다' })
  }

  if (new Date(coupon.expires_at).getTime() < Date.now()) {
    return res.status(410).json({ valid: false, error: '만료된 쿠폰입니다' })
  }

  if (subtotal < coupon.min_order_amount) {
    return res.status(400).json({
      valid: false,
      error: `최소 주문 금액 ${coupon.min_order_amount.toLocaleString()}원 이상부터 사용 가능합니다`,
    })
  }

  const discount = Math.min(coupon.discount_amount, subtotal)
  const finalAmount = Math.max(0, subtotal - discount)

  return res.status(200).json({
    valid: true,
    couponId: coupon.id,
    code: coupon.code,
    discount,
    finalAmount,
  })
}
