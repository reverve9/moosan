import { supabase } from './supabase'
import { markPaymentPaid, startOfTodayKstAsUtc, todayKstString } from './orders'
import type {
  CashSession,
  Json,
  Payment,
  Order,
  OrderItem,
  PaymentMethod,
} from '@/types/database'

/**
 * 결제 도우미 부스 — 시재 관리 + 오늘 처리 내역 헬퍼.
 *
 * 시재 관리:
 *   - 하루 1세션 (session_date UNIQUE)
 *   - expected_amount = starting + 현금 결제 합 - 현금 환불 합 (조회 시점 계산)
 *   - 마감 시 ending_amount + difference + notes 저장
 */

// ─── 시재 세션 ────────────────────────────────────────────

export async function fetchTodayCashSession(): Promise<CashSession | null> {
  const today = todayKstString()
  const { data, error } = await supabase
    .from('cash_sessions')
    .select()
    .eq('session_date', today)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function startCashSession(input: {
  startingAmount: number
  startedBy: string
}): Promise<CashSession> {
  const today = todayKstString()
  const { data, error } = await supabase
    .from('cash_sessions')
    .insert({
      session_date: today,
      starting_amount: input.startingAmount,
      started_by: input.startedBy,
    })
    .select()
    .single()
  if (error) throw new Error(`시재 세션 시작 실패: ${error.message}`)
  return data
}

export async function endCashSession(input: {
  sessionId: string
  endingAmount: number
  expectedAmount: number
  notes: string | null
  endedBy: string
}): Promise<CashSession> {
  const difference = input.endingAmount - input.expectedAmount
  const { data, error } = await supabase
    .from('cash_sessions')
    .update({
      ending_amount: input.endingAmount,
      expected_amount: input.expectedAmount,
      difference,
      notes: input.notes,
      ended_by: input.endedBy,
      ended_at: new Date().toISOString(),
    })
    .eq('id', input.sessionId)
    .is('ended_at', null) // 이미 마감된 세션 재마감 방지
    .select()
    .single()
  if (error) throw new Error(`시재 세션 마감 실패: ${error.message}`)
  return data
}

/**
 * 마감된 세션 재오픈 — 잘못 마감 / 테스트 케이스 대응.
 * ended_* 와 expected/difference 를 NULL 로 되돌려 진행 중 상태로 복귀.
 * notes 는 보존 (이전 마감 메모를 참고하고 싶을 수 있음).
 */
export async function reopenCashSession(sessionId: string): Promise<CashSession> {
  const { data, error } = await supabase
    .from('cash_sessions')
    .update({
      ended_at: null,
      ended_by: null,
      ending_amount: null,
      expected_amount: null,
      difference: null,
    })
    .eq('id', sessionId)
    .select()
    .single()
  if (error) throw new Error(`시재 세션 재오픈 실패: ${error.message}`)
  return data
}

/**
 * 오늘 현금 결제 합 - 현금 환불 합 계산 (KST 당일).
 * cash 결제건의 paid 상태 total_amount 합산, 그 중 부분환불 refunded_amount 빼기.
 *
 * 정책: payment.payment_method='cash' 결제만 시재에 영향. 직영카드(external_card) / pg / voucher_only 는 무관.
 */
export async function calcTodayCashFlow(): Promise<{
  cashIn: number
  cashOut: number
  paidCount: number
  cancelledCount: number
}> {
  const start = startOfTodayKstAsUtc()
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  const { data: payments, error } = await supabase
    .from('payments')
    .select('total_amount, refunded_amount, status')
    .eq('payment_method', 'cash')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
  if (error) throw error

  let cashIn = 0
  let cashOut = 0
  let paidCount = 0
  let cancelledCount = 0
  for (const p of payments ?? []) {
    if (p.status === 'paid') {
      cashIn += p.total_amount
      cashOut += p.refunded_amount ?? 0
      paidCount += 1
    } else if (p.status === 'cancelled') {
      // 전액 환불 — 받은 금액 0, refunded 가 total 과 같아 양쪽 상쇄해도 되지만
      // 명시적으로 0 처리 (cashIn 누락) + cashOut 도 누락 — 시재엔 영향 없음
      cancelledCount += 1
    }
  }
  return { cashIn, cashOut, paidCount, cancelledCount }
}

// ─── 오늘 처리 내역 (도우미별) ─────────────────────────────

export interface HelpDeskHistoryItem {
  payment: Payment
  orders: Order[]
  items: OrderItem[]
}

/**
 * 오늘 KST 기준 도우미 처리분 결제 내역 (assisted_by IS NOT NULL).
 * 인자가 비어 있으면 전체 도우미 — 도우미간 인계·취소를 위해 본인 외 처리분도 노출.
 * 인자가 있으면 해당 도우미 처리분만 (legacy 호환).
 *
 * 시간 역순. payments.assisted_by 는 항상 ADMIN_ACCOUNTS.id 와 매칭.
 */
export async function fetchTodayHelpDeskHistory(
  assistedBy?: string | null,
): Promise<HelpDeskHistoryItem[]> {
  const start = startOfTodayKstAsUtc()
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  let q = supabase
    .from('payments')
    .select()
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('created_at', { ascending: false })
  if (assistedBy) {
    q = q.eq('assisted_by', assistedBy)
  } else {
    q = q.not('assisted_by', 'is', null)
  }

  const { data: payments, error } = await q
  if (error) throw error
  if (!payments || payments.length === 0) return []

  const paymentIds = payments.map((p) => p.id)
  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select()
    .in('payment_id', paymentIds)
  if (oErr) throw oErr

  const orderIds = (orders ?? []).map((o) => o.id)
  let items: OrderItem[] = []
  if (orderIds.length > 0) {
    const { data: itemsData, error: iErr } = await supabase
      .from('order_items')
      .select()
      .in('order_id', orderIds)
    if (iErr) throw iErr
    items = itemsData ?? []
  }

  const ordersByPayment = new Map<string, Order[]>()
  for (const o of orders ?? []) {
    const list = ordersByPayment.get(o.payment_id) ?? []
    list.push(o)
    ordersByPayment.set(o.payment_id, list)
  }
  const itemsByOrder = new Map<string, OrderItem[]>()
  for (const it of items) {
    const list = itemsByOrder.get(it.order_id) ?? []
    list.push(it)
    itemsByOrder.set(it.order_id, list)
  }

  return payments.map((payment) => {
    const ords = ordersByPayment.get(payment.id) ?? []
    const allItems = ords.flatMap((o) => itemsByOrder.get(o.id) ?? [])
    return { payment, orders: ords, items: allItems }
  })
}

// ─── method 라벨 ─────────────────────────────────────────
// 운영 정책: "식권" 단어는 어드민 UI 에서 모두 "쿠폰" 으로 통일.
// DB 컬럼/enum (voucher_only, voucher_consumed, type='meal_voucher') 은
// 호환성을 위해 그대로 유지하고 표시 라벨만 변경.

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pg: 'PG (앱 결제)',
  external_card: '직영카드',
  cash: '현금',
  voucher_only: '쿠폰',
}

export const PAYMENT_METHOD_SHORT: Record<PaymentMethod, string> = {
  pg: 'PG',
  external_card: '직영카드',
  cash: '현금',
  voucher_only: '쿠폰',
}

/**
 * 결제수단 복합 표시 — 어드민 결제수단 컬럼/상세 공통 helper.
 *
 * 정책:
 *  - `voucher_only` (잔액 0, 쿠폰 단독) → `'쿠폰'`
 *  - 그 외 결제수단 + 쿠폰 사용 (discount_amount>0 OR voucher_consumed>0)
 *    → `'쿠폰 + PG' / '쿠폰 + 직영카드' / '쿠폰 + 현금'`
 *  - 쿠폰 미사용 → `'PG' / '직영카드' / '현금'`
 *
 * 입력은 결제 단위(payments) 또는 부스 단위(orders) 어느 쪽에서든 호출 가능
 * 하도록 평탄화한 인자만 받는다.
 */
export function formatPaymentMethodCompound(input: {
  paymentMethod: PaymentMethod | null | undefined
  discountAmount: number
  voucherConsumed: number
}): string {
  const m = (input.paymentMethod ?? 'pg') as PaymentMethod
  if (m === 'voucher_only') return '쿠폰'
  const usedCoupon = (input.discountAmount ?? 0) > 0 || (input.voucherConsumed ?? 0) > 0
  const base = PAYMENT_METHOD_SHORT[m] ?? m
  return usedCoupon ? `쿠폰 + ${base}` : base
}

// ─── 헬프데스크 키오스크 — 결제 대기 큐 ────────────────────────────

export interface KioskQueueItem {
  menu_name: string
  quantity: number
  menu_price: number
  subtotal: number
}

export interface KioskQueueOrder {
  id: string
  order_number: string
  booth_id: string
  booth_no: string
  booth_name: string
  subtotal: number
  items: KioskQueueItem[]
}

export interface KioskQueueGroup {
  paymentId: string
  phone: string
  /** 메뉴 정가 합계 (= SUM(orders.subtotal)). 쿠폰 적용 전 기준. */
  menuSubtotal: number
  /** 결제 시점에 payments.total_amount 에 기록된 값 (쿠폰 적용 전이면 menuSubtotal 과 동일). */
  totalAmount: number
  /** 키오스크 단계에서 손님이 미리 적용한 쿠폰 차감액 합계 (현 운영: 항상 0). */
  voucherConsumed: number
  createdAt: string
  /** 키오스크 단말 식별자. 키오스크 결제는 'helpdesk-1'/'helpdesk-2'/'helpdesk-3', 직원 직접 입력은 NULL. */
  kioskStationId: string | null
  orders: KioskQueueOrder[]
}

/**
 * 헬프데스크 키오스크 결제 대기 큐 조회.
 * orders.status='payment_pending' AND payment_channel='helpdesk' 인
 * 모든 주문을 payment_id 별로 그룹화하여 반환. 오래된 것부터 표시.
 */
export async function fetchKioskPendingQueue(): Promise<KioskQueueGroup[]> {
  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select(
      'id, payment_id, order_number, booth_id, booth_no, booth_name, subtotal, voucher_consumed, phone, created_at, kiosk_station_id',
    )
    .eq('status', 'payment_pending')
    .eq('payment_channel', 'helpdesk')
    .order('created_at', { ascending: true })

  if (oErr) throw new Error(`결제 대기 큐 조회 실패: ${oErr.message}`)
  if (!orders || orders.length === 0) return []

  const paymentIds = Array.from(new Set(orders.map((o) => o.payment_id)))
  const orderIds = orders.map((o) => o.id)

  const [{ data: payments, error: pErr }, { data: items, error: iErr }] = await Promise.all([
    supabase
      .from('payments')
      .select('id, phone, total_amount, created_at')
      .in('id', paymentIds),
    supabase
      .from('order_items')
      .select('order_id, menu_name, quantity, menu_price, subtotal')
      .in('order_id', orderIds),
  ])
  if (pErr) throw new Error(`결제 대기 큐 결제 정보 조회 실패: ${pErr.message}`)
  if (iErr) throw new Error(`결제 대기 큐 아이템 조회 실패: ${iErr.message}`)

  const paymentById = new Map(payments?.map((p) => [p.id, p]) ?? [])
  const itemsByOrder = new Map<string, KioskQueueItem[]>()
  for (const it of items ?? []) {
    const list = itemsByOrder.get(it.order_id) ?? []
    list.push({
      menu_name: it.menu_name,
      quantity: it.quantity,
      menu_price: it.menu_price,
      subtotal: it.subtotal,
    })
    itemsByOrder.set(it.order_id, list)
  }

  const grouped = new Map<string, KioskQueueGroup>()
  for (const o of orders) {
    const payment = paymentById.get(o.payment_id)
    if (!payment) continue
    let group = grouped.get(o.payment_id)
    if (!group) {
      group = {
        paymentId: o.payment_id,
        phone: payment.phone,
        menuSubtotal: 0,
        totalAmount: payment.total_amount,
        voucherConsumed: 0,
        createdAt: payment.created_at,
        kioskStationId: o.kiosk_station_id,
        orders: [],
      }
      grouped.set(o.payment_id, group)
    }
    group.menuSubtotal += o.subtotal
    group.voucherConsumed += o.voucher_consumed ?? 0
    group.orders.push({
      id: o.id,
      order_number: o.order_number,
      booth_id: o.booth_id ?? '',
      booth_no: o.booth_no,
      booth_name: o.booth_name,
      subtotal: o.subtotal,
      items: itemsByOrder.get(o.id) ?? [],
    })
  }

  return Array.from(grouped.values())
}

/**
 * 헬프데스크 키오스크 결제 완료 처리.
 *
 * 직원이 카드/현금 결제를 받은 뒤 호출. 흐름:
 *   1) (쿠폰 적용 시) payments.coupon_id/total_amount 업데이트 + 부스별
 *      orders.voucher_consumed/burned 분배 업데이트
 *   2) payments.payment_method + assisted_by 업데이트
 *   3) markPaymentPaid(paymentId, null) → status='paid', orders 도 paid,
 *      쿠폰 status='used' 원자 전이
 *
 * `method` 도메인:
 *   - 'external_card' — 카드 (쿠폰 + 카드 케이스 포함)
 *   - 'cash'          — 현금 (쿠폰 + 현금 케이스 포함)
 *   - 'voucher_only'  — 쿠폰 100% (잔액 0)
 *
 * `couponApplication` (선택):
 *   헬프데스크 직원이 모달에서 손님 보유 쿠폰을 적용한 경우 전달.
 *   주문 요청 시점엔 쿠폰 미적용 상태(메뉴 정가 합)로 들어오고, 결제 완료
 *   처리 단계에서 적용 여부를 결정하는 흐름. 미전달 시 쿠폰 미적용으로 진행.
 */
export async function confirmKioskPayment(
  paymentId: string,
  method: 'external_card' | 'cash' | 'voucher_only',
  adminId: string,
  couponApplication?: {
    couponId: string
    /** 쿠폰 차감 후 손님이 추가 결제할 금액 (전액 쿠폰이면 0) */
    totalAmount: number
    distributions: { boothId: string; voucherConsumed: number; voucherBurned: number }[]
  },
): Promise<void> {
  // 1) 쿠폰 적용 — payments.coupon_id/total_amount + 부스별 orders 분배
  if (couponApplication) {
    const { error: cpErr } = await supabase
      .from('payments')
      .update({
        coupon_id: couponApplication.couponId,
        total_amount: couponApplication.totalAmount,
      })
      .eq('id', paymentId)
    if (cpErr) throw new Error(`쿠폰 적용(결제) 실패: ${cpErr.message}`)

    for (const d of couponApplication.distributions) {
      const { error: oErr } = await supabase
        .from('orders')
        .update({
          voucher_consumed: d.voucherConsumed,
          voucher_burned: d.voucherBurned,
        })
        .eq('payment_id', paymentId)
        .eq('booth_id', d.boothId)
      if (oErr) throw new Error(`쿠폰 분배(주문) 실패: ${oErr.message}`)
    }
  }

  // 2) 결제수단 + 처리 도우미 기록
  const { error: pErr } = await supabase
    .from('payments')
    .update({
      payment_method: method,
      assisted_by: adminId,
    })
    .eq('id', paymentId)
  if (pErr) throw new Error(`결제 수단 업데이트 실패: ${pErr.message}`)

  // 3) paid 전이 (markPaymentPaid 가 쿠폰 status='used' 도 처리)
  await markPaymentPaid(paymentId, null)
}

/**
 * 키오스크 강제 리셋 broadcast 전송 — `kiosk:{stationId}` 채널에만 송신.
 * DB 거치지 않고 broadcast 만으로 키오스크 측에 force-reset 이벤트 송신.
 */
/**
 * 헬프데스크에서 결제 전액 취소 — /api/payments/cancel 호출.
 *
 * 적용 가능 상태:
 *   - payments.status='paid'
 *   - 하위 orders 가 모두 booth confirmed_at=NULL AND ready_at=NULL
 *
 * 부스가 이미 확인/조리 시작한 결제는 서버에서 409 반환 → 운영본부 (super)
 * 가 AdminOrders 에서 부분 환불 처리.
 *
 * 결제수단(external_card/cash/voucher_only) 별 분기는 서버측에서 처리:
 *   PG 호출 없이 DB 만 cancelled 로 전이.
 */
export async function cancelHelpdeskPayment(
  paymentId: string,
  reason: string,
): Promise<void> {
  const trimmed = reason.trim()
  if (!trimmed) throw new Error('취소 사유는 필수입니다')
  const response = await fetch('/api/payments/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentId, reason: trimmed }),
  })
  const json = (await response.json().catch(() => ({}))) as {
    error?: string
    code?: string
  }
  if (!response.ok) {
    if (json.code === 'ORDER_ALREADY_CONFIRMED') {
      throw new Error(
        json.error ?? '이미 부스에서 처리한 주문이 포함돼 헬프데스크 단위로는 취소 불가 (운영본부 환불)',
      )
    }
    throw new Error(json.error ?? `취소 실패 (HTTP ${response.status})`)
  }
}

export async function sendKioskForceReset(
  stationId: 'helpdesk-1' | 'helpdesk-2' | 'helpdesk-3',
): Promise<void> {
  const channel = supabase.channel(`kiosk:${stationId}`)
  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve()
    })
  })
  await channel.send({ type: 'broadcast', event: 'force-reset', payload: {} })
  await supabase.removeChannel(channel)
}

/**
 * 헬프데스크 결제 대기 큐 항목 취소.
 *
 * 조건: payments.status='pending' AND 하위 orders 가 모두 status='payment_pending'.
 *   결제 아직 발생 전 (PG 미진행) 상태만 취소 — 이미 paid 면 별도 환불 API 사용.
 *
 * 호출처 두 가지:
 *   (a) 어드민 헬프데스크 큐 — adminId 전달 (기록용)
 *   (b) 키오스크 손님 자가 취소 — adminId=null, broadcastForceReset=false
 *       (자기 자신이 호출 → 호출 측에서 직접 reset 처리하므로 broadcast 불필요)
 *
 * 흐름:
 *   1) payments → status='cancelled', cancelled_at, meta.cancel_reason
 *   2) orders (payment_pending only) → status='cancelled', cancelled_at, cancel_reason, cancelled_by
 *      · adminId 있으면 cancelled_by='admin'
 *      · 없으면 NULL + meta.cancelled_via='customer'
 *   3) broadcastForceReset && kioskStationId → force-reset broadcast 송신
 *
 * 쿠폰은 payment_pending 단계에선 아직 'used' 가 아님 (markPaymentPaid 시점 전이)
 * → 복원 불필요.
 */
export async function cancelKioskPending(input: {
  paymentId: string
  adminId: string | null
  reason: string
  kioskStationId: string | null
  broadcastForceReset?: boolean
}): Promise<void> {
  const trimmedReason = input.reason.trim()
  if (!trimmedReason) throw new Error('취소 사유는 필수입니다')

  const { data: payment, error: pErr } = await supabase
    .from('payments')
    .select('id, status, meta')
    .eq('id', input.paymentId)
    .maybeSingle()
  if (pErr) throw new Error(`결제 조회 실패: ${pErr.message}`)
  if (!payment) throw new Error('결제 정보를 찾을 수 없습니다')
  if (payment.status !== 'pending') {
    throw new Error(`이미 처리된 결제입니다 (현재 상태: ${payment.status})`)
  }

  const now = new Date().toISOString()
  const baseMeta: Record<string, Json> =
    payment.meta && typeof payment.meta === 'object' && !Array.isArray(payment.meta)
      ? { ...(payment.meta as Record<string, Json>) }
      : {}
  baseMeta.cancel_reason = trimmedReason
  baseMeta.cancelled_via = input.adminId ? 'admin' : 'customer'
  if (input.adminId) baseMeta.cancelled_by_admin = input.adminId

  const { error: updPErr } = await supabase
    .from('payments')
    .update({ status: 'cancelled', cancelled_at: now, meta: baseMeta })
    .eq('id', input.paymentId)
  if (updPErr) throw new Error(`결제 취소 실패: ${updPErr.message}`)

  const { error: updOErr } = await supabase
    .from('orders')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      cancel_reason: trimmedReason,
      cancelled_by: input.adminId ? 'admin' : null,
    })
    .eq('payment_id', input.paymentId)
    .eq('status', 'payment_pending')
  if (updOErr) throw new Error(`주문 취소 실패: ${updOErr.message}`)

  if (
    input.broadcastForceReset !== false &&
    (input.kioskStationId === 'helpdesk-1' ||
      input.kioskStationId === 'helpdesk-2' ||
      input.kioskStationId === 'helpdesk-3')
  ) {
    try {
      await sendKioskForceReset(input.kioskStationId)
    } catch (e) {
      console.error('[cancelKioskPending] force-reset broadcast failed', e)
      // broadcast 실패해도 DB 취소는 성공 — 운영진이 수동 리셋 가능
    }
  }
}
