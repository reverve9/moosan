import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { sendPickupAlimtalk } from '../_lib/alimtalk'

/**
 * 부스 "준비완료" 처리 — 기존 client 직호출 markBoothOrderReady 를 server 화.
 *
 * 환경변수:
 *   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — Vercel 에서 process.env 로 노출
 *   (api/orders/cancel.ts 와 동일 패턴 — anon + RLS 신뢰)
 *
 * 호출:
 *   POST /api/booth-orders/ready
 *   { orderId: string, boothId: string }
 *
 * 흐름:
 *   1) 본문 검증
 *   2) orders 조회 — booth_id 정합성 + phone / booth_name
 *      - 잘못된 booth 가 임의 ready 처리하는 사고 방지 (sanity guard)
 *   3) confirmed_at / ready_at 멱등 업데이트
 *   4) 200 응답 즉시
 *   5) 함수 종료 전 sendPickupAlimtalk (fire-and-forget on path)
 *      - Vercel Node runtime 은 res.json() 후 await 완료까지 함수 유지
 *      - 알림톡 실패는 alimtalk_logs 에 기록 + console — 비즈 흐름 영향 X
 *
 * 인증:
 *   기존 booth 세션이 sessionStorage 전용 (jwt/token 없음) — 서버측 token 검증 불가.
 *   api/orders/cancel.ts 와 동일하게 RLS 신뢰. boothId / orderId 정합성만 application-level 체크.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { orderId, boothId } = (req.body ?? {}) as {
    orderId?: string
    boothId?: string
  }

  if (!orderId || !boothId) {
    return res.status(400).json({ error: 'orderId, boothId are required' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return res
      .status(500)
      .json({ error: 'Server is missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY' })
  }
  const supabase = createClient(supabaseUrl, supabaseKey)

  // 1) order 조회 + 정합성 검증
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, booth_id, phone, ready_at, food_booths!inner(id, name)')
    .eq('id', orderId)
    .maybeSingle()

  if (orderErr) {
    return res.status(500).json({ error: `order 조회 실패: ${orderErr.message}` })
  }
  if (!order) {
    return res.status(404).json({ error: 'order not found' })
  }
  if (order.booth_id !== boothId) {
    return res.status(403).json({ error: 'booth/order mismatch' })
  }

  // food_booths join 결과는 객체 또는 배열일 수 있음 (supabase-js 관례)
  const boothRow = Array.isArray(order.food_booths)
    ? order.food_booths[0]
    : order.food_booths
  const boothName: string = boothRow?.name ?? '매장'

  // 2) confirmed_at + ready_at 멱등 업데이트 (이미 set 됐으면 no-op)
  const now = new Date().toISOString()

  const { error: cErr } = await supabase
    .from('orders')
    .update({ confirmed_at: now, status: 'confirmed' })
    .eq('id', orderId)
    .is('confirmed_at', null)
  if (cErr) {
    return res.status(500).json({ error: `confirmed 처리 실패: ${cErr.message}` })
  }

  const { error: rErr } = await supabase
    .from('orders')
    .update({ ready_at: now })
    .eq('id', orderId)
    .is('ready_at', null)
  if (rErr) {
    return res.status(500).json({ error: `ready 처리 실패: ${rErr.message}` })
  }

  // 3) 200 응답 먼저 — Solapi 응답 속도에 비즈 흐름 묶지 않음
  res.status(200).json({ ok: true })

  // 4) 함수 종료 전 알림톡. 실패는 alimtalk_logs 에 기록됨 — 추가 처리 X.
  //    Vercel Node runtime 은 핸들러가 끝날 때까지 함수를 유지함.
  await sendPickupAlimtalk(orderId, order.phone, boothName, boothId).catch(
    (err) => {
      console.error('[booth-orders/ready] alimtalk error', err)
    },
  )
}
