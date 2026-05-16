import { supabase } from './supabase'
import { normalizePhone } from './phone'
import type { Order, OrderItem, Payment } from '@/types/database'

// PostgREST `.in(...)` URL 길이 한계(~8KB) 회피 — UUID 36자×150 ≈ 5.5KB.
const IN_CHUNK_SIZE = 150

function chunkArray<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return []
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * 어드민 결제/주문 관리용 쿼리 모음.
 *  - 목록: payments 단위 (부스 주문 단위가 아님). status/일자/전화 필터.
 *  - 상세: payment + 하위 orders + orders.items 전부 묶음.
 *  - 취소: /api/payments/cancel 호출 (서버에서 Toss + DB 처리).
 */

export interface PaymentsListFilters {
  /** 'all' = paid + cancelled (pending 제외). 정산 뷰라 결제대기/고아 row 는 기본 미노출 */
  status?: 'all' | 'paid' | 'cancelled'
  /** inclusive, 로컬 'YYYY-MM-DD' (KST 해석) */
  dateFrom?: string
  dateTo?: string
  phone?: string
  /** 결제수단 필터. 'all' = 전체. */
  paymentMethod?: 'all' | 'pg' | 'external_card' | 'cash' | 'voucher_only'
}

/**
 * 어드민 주문/결제 목록의 한 행. 결제 단위가 아닌 **부스 단위(=order)** 행.
 * 한 결제(payment)에 여러 부스 주문이 묶여 있어도 부스별로 분리해서 노출 →
 * 정산 시 매장별로 한 줄씩 보이도록.
 */
export interface BoothOrderRow {
  /** 상위 결제 (환불/쿠폰 할인 등 결제 전체 정보) */
  payment: Payment
  /** 이 행이 가리키는 단일 부스 주문 */
  order: {
    id: string
    payment_id: string
    status: 'pending' | 'payment_pending' | 'paid' | 'confirmed' | 'completed' | 'cancelled'
    booth_name: string
    booth_no: string
    order_number: string
    /** 이 부스의 메뉴 합계 (쿠폰 할인 적용 전, 정산 기준 금액) */
    subtotal: number
    /** 포장 여부 */
    is_takeout: boolean
    /** 식권 사용액 (부스별 분배). voucher 미사용 시 0. */
    voucher_consumed: number
    /** 식권 소멸액 (액면가 - 사용액). 첫 부스에만 기록. */
    voucher_burned: number
    /** 부스 확인 시각 (paid → confirmed). null = 아직 미확인. */
    confirmed_at: string | null
    /** 조리완료 시각. null = 아직 조리중. */
    ready_at: string | null
    /** 손님 픽업 완료 시각. null = 아직 미수령. */
    picked_up_at: string | null
  }
  /** 해당 부스 주문의 메뉴 라인 */
  menuLines: { name: string; quantity: number }[]
  /** 같은 결제에 묶인 부스가 몇 개인지 (UI 힌트용) */
  siblingCount: number
}

function kstDateToUtc(dateStr: string, endOfDay: boolean): string {
  // dateStr: 'YYYY-MM-DD' → KST 자정/24시 → UTC ISO
  const time = endOfDay ? '24:00:00' : '00:00:00'
  return new Date(`${dateStr}T${time}+09:00`).toISOString()
}

export async function fetchPaymentsList(
  filters: PaymentsListFilters,
): Promise<BoothOrderRow[]> {
  let q = supabase
    .from('payments')
    .select()
    .order('created_at', { ascending: false })

  if (filters.status && filters.status !== 'all') {
    // 단일 상태 필터
    q = q.eq('status', filters.status)
  } else {
    // 기본(전체) = paid + cancelled. pending 은 정산 뷰에서 제외
    q = q.in('status', ['paid', 'cancelled'])
  }
  if (filters.dateFrom) {
    q = q.gte('created_at', kstDateToUtc(filters.dateFrom, false))
  }
  if (filters.dateTo) {
    q = q.lt('created_at', kstDateToUtc(filters.dateTo, true))
  }
  if (filters.phone && filters.phone.trim().length > 0) {
    // 입력값이 하이픈 유무 어떤 형태든 숫자만 추출해서 ilike 부분매칭
    // (DB 는 normalizePhone 통과한 숫자 11자리로 저장)
    const digits = normalizePhone(filters.phone)
    if (digits.length > 0) q = q.ilike('phone', `%${digits}%`)
  }
  if (filters.paymentMethod && filters.paymentMethod !== 'all') {
    q = q.eq('payment_method', filters.paymentMethod)
  }

  const { data: payments, error } = await q
  if (error) throw error
  if (!payments || payments.length === 0) return []

  const paymentIds = payments.map((p) => p.id)
  // PostgREST `.in(...)` URL 길이 한계(~8KB) 회피 — UUID 36자×150 ≈ 5.5KB 안전 마진.
  // 운영중 일별 300+ 결제 누적 시 단일 .in 으로 일부 orders 응답 누락 → 매출 누락 발생.
  type OrderRow = BoothOrderRow['order']
  const orders: OrderRow[] = []
  for (const chunk of chunkArray(paymentIds, IN_CHUNK_SIZE)) {
    const { data, error: oErr } = await supabase
      .from('orders')
      .select(
        'id, payment_id, status, booth_name, booth_no, order_number, subtotal, is_takeout, voucher_consumed, voucher_burned, confirmed_at, ready_at, picked_up_at',
      )
      .in('payment_id', chunk)
      .order('booth_no', { ascending: true })
    if (oErr) throw oErr
    if (data) orders.push(...(data as unknown as OrderRow[]))
  }

  const orderIds = orders.map((o) => o.id)
  const items: { order_id: string; menu_name: string; quantity: number; created_at: string }[] =
    []
  if (orderIds.length > 0) {
    for (const chunk of chunkArray(orderIds, IN_CHUNK_SIZE)) {
      const { data: itemsData, error: iErr } = await supabase
        .from('order_items')
        .select('order_id, menu_name, quantity, created_at')
        .in('order_id', chunk)
        .order('created_at', { ascending: true })
      if (iErr) throw iErr
      if (itemsData) items.push(...itemsData)
    }
  }

  const itemsByOrder = new Map<string, { name: string; quantity: number }[]>()
  for (const it of items) {
    const list = itemsByOrder.get(it.order_id) ?? []
    list.push({ name: it.menu_name, quantity: it.quantity })
    itemsByOrder.set(it.order_id, list)
  }

  // 결제별로 그룹핑해서, 결제 최신순 + 결제 내 booth_no 오름차순으로 펼침
  const ordersByPayment = new Map<string, OrderRow[]>()
  for (const o of orders) {
    const list = ordersByPayment.get(o.payment_id) ?? []
    list.push(o)
    ordersByPayment.set(o.payment_id, list)
  }

  const rows: BoothOrderRow[] = []
  for (const payment of payments) {
    const list = ordersByPayment.get(payment.id) ?? []
    if (list.length === 0) continue // 결제는 있는데 부스 주문이 없는 경우(데이터 불일치) — 행 생성 안 함
    for (const o of list) {
      rows.push({
        payment,
        order: {
          id: o.id,
          payment_id: o.payment_id,
          status: o.status,
          booth_name: o.booth_name,
          booth_no: o.booth_no,
          order_number: o.order_number,
          subtotal: o.subtotal,
          is_takeout: o.is_takeout,
          voucher_consumed: o.voucher_consumed ?? 0,
          voucher_burned: o.voucher_burned ?? 0,
          confirmed_at: o.confirmed_at ?? null,
          ready_at: o.ready_at ?? null,
          picked_up_at: o.picked_up_at ?? null,
        },
        menuLines: itemsByOrder.get(o.id) ?? [],
        siblingCount: list.length,
      })
    }
  }
  return rows
}

export interface PaymentDetail {
  payment: Payment
  orders: { order: Order; items: OrderItem[] }[]
}

export async function fetchPaymentDetail(paymentId: string): Promise<PaymentDetail | null> {
  const { data: payment, error: pErr } = await supabase
    .from('payments')
    .select()
    .eq('id', paymentId)
    .maybeSingle()
  if (pErr) throw pErr
  if (!payment) return null

  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select()
    .eq('payment_id', paymentId)
    .order('booth_no', { ascending: true })
  if (oErr) throw oErr

  if (!orders || orders.length === 0) return { payment, orders: [] }

  const orderIds = orders.map((o) => o.id)
  const { data: items, error: iErr } = await supabase
    .from('order_items')
    .select()
    .in('order_id', orderIds)
    .order('created_at', { ascending: true })
  if (iErr) throw iErr

  const itemsByOrder = new Map<string, OrderItem[]>()
  for (const it of items ?? []) {
    const list = itemsByOrder.get(it.order_id) ?? []
    list.push(it)
    itemsByOrder.set(it.order_id, list)
  }

  return {
    payment,
    orders: orders.map((o) => ({ order: o, items: itemsByOrder.get(o.id) ?? [] })),
  }
}

/**
 * 어드민이 특정 부스 주문 1건을 환불 가능한지 (client 측 pre-check, 서버도 동일 검증).
 * 어드민 정책:
 *  - 결제는 paid (잔액 > 0 또는 voucher_only / 0원 결제)
 *  - 부스 주문이 cancelled 가 아니면 환불 가능 (paid / confirmed / completed / picked_up_at 무관)
 *  - 픽업까지 끝난 주문도 환불 가능 (운영 요구사항 — 부스와 별도 협의 전제)
 */
export function isBoothOrderRefundable(detail: PaymentDetail, orderId: string): boolean {
  if (detail.payment.status !== 'paid') return false
  const remaining = detail.payment.total_amount - (detail.payment.refunded_amount ?? 0)
  const isZeroAmount = detail.payment.total_amount === 0
  if (remaining <= 0 && !isZeroAmount) return false
  const target = detail.orders.find(({ order }) => order.id === orderId)
  if (!target) return false
  return target.order.status !== 'cancelled'
}

/**
 * 어드민 환불 시 손님에게 환불할 실 금액 (쿠폰 비례 분배 + 끝수 보정).
 *  - voucher_only / 0원 결제: 0 환불 (DB only)
 *  - 마지막 살아있는 부스: 잔액 전체 환불 (끝수 흡수)
 *  - 그 외: floor(order.subtotal × total_amount / sum_subtotal), 잔액으로 cap.
 */
export function boothOrderRefundAmount(detail: PaymentDetail, orderId: string): number {
  const remaining = Math.max(
    0,
    detail.payment.total_amount - (detail.payment.refunded_amount ?? 0),
  )
  const target = detail.orders.find(({ order }) => order.id === orderId)
  if (!target) return 0
  if (detail.payment.total_amount === 0) return 0
  if (remaining <= 0) return 0

  const sumSubtotal = detail.orders.reduce(
    (acc, { order }) => acc + (order.subtotal ?? 0),
    0,
  )
  const otherLiveCount = detail.orders.filter(
    ({ order }) => order.id !== orderId && order.status !== 'cancelled',
  ).length
  const isLastLive = otherLiveCount === 0

  if (isLastLive) return remaining
  if (sumSubtotal > 0) {
    return Math.min(
      Math.floor((target.order.subtotal * detail.payment.total_amount) / sumSubtotal),
      remaining,
    )
  }
  return Math.min(target.order.subtotal, remaining)
}

export interface RefundBoothOrderResponse {
  ok: boolean
  orderId: string
  paymentId: string
  refundAmount: number
  paymentFullyCancelled: boolean
  /** 결제 내 마지막 살아있던 부스를 취소한 경우 true */
  isLastLiveBooth?: boolean
}

/**
 * 어드민이 특정 부스 주문만 환불.
 * 서버는 부스 거절과 동일한 endpoint(/api/orders/cancel)에 cancelledBy='admin' 으로 호출.
 * admin path 는 picked_up_at/completed 무관 모두 환불 허용.
 */
export async function refundBoothOrder(
  orderId: string,
  reason: string,
): Promise<RefundBoothOrderResponse> {
  const response = await fetch('/api/orders/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      reason,
      cancelledBy: 'admin',
    }),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    const msg = typeof json?.error === 'string' ? json.error : '환불 실패'
    throw new Error(msg)
  }
  return json as RefundBoothOrderResponse
}
