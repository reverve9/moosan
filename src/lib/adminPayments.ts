import { supabase } from './supabase'
import { normalizePhone } from './phone'
import type { Order, OrderItem, Payment } from '@/types/database'

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
}

export interface PaymentRowWithSummary {
  payment: Payment
  boothCount: number
  /** 부스명 리스트 (매장 검색 필터용 + 테이블 표시용) */
  boothNames: string[]
  /** 부스별 order_number 리스트 (booth_no 오름차순) */
  boothOrderNumbers: string[]
  /** 전체 order_items (부스 순 + 생성 순) — 메뉴 컬럼 표시용 */
  menuLines: { name: string; quantity: number }[]
  /** orders 의 status 요약 — 전부 cancelled 이면 cancelled 로 렌더 */
  orderStatusSummary: {
    paid: number
    confirmed: number
    completed: number
    cancelled: number
  }
}

function kstDateToUtc(dateStr: string, endOfDay: boolean): string {
  // dateStr: 'YYYY-MM-DD' → KST 자정/24시 → UTC ISO
  const time = endOfDay ? '24:00:00' : '00:00:00'
  return new Date(`${dateStr}T${time}+09:00`).toISOString()
}

export async function fetchPaymentsList(
  filters: PaymentsListFilters,
): Promise<PaymentRowWithSummary[]> {
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

  const { data: payments, error } = await q.limit(300)
  if (error) throw error
  if (!payments || payments.length === 0) return []

  const paymentIds = payments.map((p) => p.id)
  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('id, payment_id, status, booth_name, booth_no, order_number')
    .in('payment_id', paymentIds)
    .order('booth_no', { ascending: true })
  if (oErr) throw oErr

  const orderIds = (orders ?? []).map((o) => o.id)
  let items: { order_id: string; menu_name: string; quantity: number; created_at: string }[] =
    []
  if (orderIds.length > 0) {
    const { data: itemsData, error: iErr } = await supabase
      .from('order_items')
      .select('order_id, menu_name, quantity, created_at')
      .in('order_id', orderIds)
      .order('created_at', { ascending: true })
    if (iErr) throw iErr
    items = itemsData ?? []
  }

  const itemsByOrder = new Map<string, { name: string; quantity: number }[]>()
  for (const it of items) {
    const list = itemsByOrder.get(it.order_id) ?? []
    list.push({ name: it.menu_name, quantity: it.quantity })
    itemsByOrder.set(it.order_id, list)
  }

  interface Bucket {
    count: number
    status: PaymentRowWithSummary['orderStatusSummary']
    boothNames: string[]
    boothOrderNumbers: string[]
    menuLines: { name: string; quantity: number }[]
  }

  const summaryByPayment = new Map<string, Bucket>()
  for (const o of orders ?? []) {
    const bucket =
      summaryByPayment.get(o.payment_id) ??
      ({
        count: 0,
        status: { paid: 0, confirmed: 0, completed: 0, cancelled: 0 },
        boothNames: [],
        boothOrderNumbers: [],
        menuLines: [],
      } satisfies Bucket)
    bucket.count += 1
    if (o.status in bucket.status) {
      bucket.status[o.status as keyof typeof bucket.status] += 1
    }
    bucket.boothNames.push(o.booth_name)
    bucket.boothOrderNumbers.push(o.order_number)
    const orderItems = itemsByOrder.get(o.id) ?? []
    bucket.menuLines.push(...orderItems)
    summaryByPayment.set(o.payment_id, bucket)
  }

  return payments.map((payment) => {
    const s = summaryByPayment.get(payment.id)
    return {
      payment,
      boothCount: s?.count ?? 0,
      boothNames: s?.boothNames ?? [],
      boothOrderNumbers: s?.boothOrderNumbers ?? [],
      menuLines: s?.menuLines ?? [],
      orderStatusSummary: s?.status ?? {
        paid: 0,
        confirmed: 0,
        completed: 0,
        cancelled: 0,
      },
    }
  })
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
 * 어드민 풀환불 가능 여부 (client 측 pre-check, 서버도 동일하게 검증함).
 * 부분 환불 모델 도입 후:
 *  - 이미 cancelled 된 부스 order 는 무시 (부스가 자체 거절한 이력)
 *  - 남은 잔액 (total_amount - refunded_amount) > 0
 *  - 남은 paid orders 가 전부 confirmed_at IS NULL AND ready_at IS NULL
 *  - 환불액 = 남은 잔액
 */
export function isRefundable(detail: PaymentDetail): boolean {
  if (detail.payment.status !== 'paid') return false
  const remaining = detail.payment.total_amount - (detail.payment.refunded_amount ?? 0)
  if (remaining <= 0) return false
  const liveOrders = detail.orders.filter(({ order }) => order.status !== 'cancelled')
  if (liveOrders.length === 0) return false
  return liveOrders.every(
    ({ order }) =>
      order.status === 'paid' && order.confirmed_at === null && order.ready_at === null,
  )
}

/** 남은 환불 가능 잔액 */
export function remainingRefundable(detail: PaymentDetail): number {
  return Math.max(0, detail.payment.total_amount - (detail.payment.refunded_amount ?? 0))
}

export interface CancelPaymentResponse {
  ok: boolean
  paymentId: string
}

export async function cancelPayment(paymentId: string, reason: string): Promise<CancelPaymentResponse> {
  const response = await fetch('/api/payments/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentId, reason }),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    const msg = typeof json?.error === 'string' ? json.error : '취소 실패'
    throw new Error(msg)
  }
  return json as CancelPaymentResponse
}
