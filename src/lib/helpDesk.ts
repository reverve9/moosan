import { supabase } from './supabase'
import { startOfTodayKstAsUtc, todayKstString } from './orders'
import type { CashSession, Payment, Order, OrderItem, PaymentMethod } from '@/types/database'

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
 * 오늘 KST 기준 특정 도우미가 처리한 결제 내역 (assisted_by 매칭).
 * 본인 처리분만 시간 역순으로 반환.
 */
export async function fetchTodayHelpDeskHistory(
  assistedBy: string,
): Promise<HelpDeskHistoryItem[]> {
  const start = startOfTodayKstAsUtc()
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  const { data: payments, error } = await supabase
    .from('payments')
    .select()
    .eq('assisted_by', assistedBy)
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('created_at', { ascending: false })
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

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pg: 'PG (앱 결제)',
  external_card: '직영카드',
  cash: '현금',
  voucher_only: '식권 100%',
}

export const PAYMENT_METHOD_SHORT: Record<PaymentMethod, string> = {
  pg: 'PG',
  external_card: '직영카드',
  cash: '현금',
  voucher_only: '식권',
}
