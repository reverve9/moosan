import { supabase } from './supabase'
import { startOfTodayKstAsUtc } from './orders'
import type { OrderItem } from '@/types/database'

/**
 * 어드민 모니터는 "부스별 미확인(paid + confirmed_at IS NULL)" 을 카드로 보여준다.
 * 단위: orders row (메뉴 아이템이 아니라 카드 1장).
 */

export interface MonitorOrderRow {
  id: string                 // order.id
  order_number: string
  phone: string
  subtotal: number
  paid_at: string            // 결제 승인 완료 시각 (elapsed 계산 기준)
  items: OrderItem[]         // 상세 모달 표시용 (메뉴명, 수량 나열)
}

/** 확인 완료 + 준비 미완료 주문 (조리시간 초과 모니터링용) */
export interface MonitorConfirmedRow {
  id: string
  order_number: string
  booth_id: string
  booth_name: string
  confirmed_at: string
  estimated_minutes: number
}

export interface MonitorBoothSummary {
  boothId: string
  boothName: string
  boothNo: string | null
  count: number              // 미확인 주문 건수
  oldestPaidAt: string | null
  orders: MonitorOrderRow[]
}

/**
 * 부스별 운영 종합 상태 — 매장 모니터 페이지 메인 카드용.
 * 영업 상태 + 단계별 진행 건수 + 오늘 매출 + 오래된 대기 시점.
 */
export interface BoothStatusSummary {
  boothId: string
  boothName: string
  boothNo: string | null
  /** 영업 중 여부 (food_booths.is_open) */
  isOpen: boolean
  /** 일시중지 여부 (영업 중이지만 잠시 멈춤) */
  isPaused: boolean
  /** 미확인 — paid + confirmed_at IS NULL */
  unconfirmedCount: number
  /** 조리중 — status='confirmed' + ready_at IS NULL */
  confirmedCount: number
  /** 조리완료 — ready_at IS NOT NULL + picked_up_at IS NULL + 취소 아님 */
  readyCount: number
  /** 픽업완료 — status='completed' OR picked_up_at IS NOT NULL */
  pickedUpCount: number
  /** 취소 — payment 단위 / 매장 거절 모두 포함 */
  cancelledCount: number
  /** 오늘 누적 매출 (취소 제외, subtotal 합) */
  grossAmount: number
  /** 미확인 중 가장 오래된 paid_at */
  oldestUnconfirmedAt: string | null
  /** 조리완료(미픽업) 중 가장 오래된 ready_at */
  oldestReadyAt: string | null
}

export interface MonitorData {
  summaries: MonitorBoothSummary[]
  confirmedOrders: MonitorConfirmedRow[]
  boothStatuses: BoothStatusSummary[]
}

export async function fetchMonitorSummary(): Promise<MonitorData> {
  const start = startOfTodayKstAsUtc()
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  // 부스 + 오늘 전체 주문 (모든 상태) 1쿼리 — 보쓰 종합 상태 + 기존 summaries/confirmed
  // 둘 다 클라이언트 측에서 derive.
  const [boothsRes, ordersRes] = await Promise.all([
    supabase
      .from('food_booths')
      .select('id, name, booth_no, is_open, is_paused')
      .eq('is_active', true)
      .order('booth_no', { ascending: true }),
    supabase
      .from('orders')
      .select(
        'id, payment_id, booth_id, booth_name, order_number, phone, subtotal, status, confirmed_at, ready_at, picked_up_at, paid_at, created_at, estimated_minutes',
      )
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('paid_at', { ascending: true, nullsFirst: false }),
  ])

  if (boothsRes.error) throw new Error(`부스 조회 실패: ${boothsRes.error.message}`)
  if (ordersRes.error) throw new Error(`주문 조회 실패: ${ordersRes.error.message}`)

  const booths = boothsRes.data ?? []
  const orders = ordersRes.data ?? []

  // 미확인 주문 (paid + confirmed_at NULL) — order_items 도 같이 (모달 상세용)
  const unconfirmed = orders.filter(
    (o) => o.status === 'paid' && o.confirmed_at === null && o.booth_id !== null,
  )

  let itemsByOrder = new Map<string, OrderItem[]>()
  if (unconfirmed.length > 0) {
    const orderIds = unconfirmed.map((o) => o.id)
    const { data: items, error: iErr } = await supabase
      .from('order_items')
      .select()
      .in('order_id', orderIds)
      .order('created_at', { ascending: true })
    if (iErr) throw new Error(`아이템 조회 실패: ${iErr.message}`)
    for (const item of items ?? []) {
      const list = itemsByOrder.get(item.order_id) ?? []
      list.push(item)
      itemsByOrder.set(item.order_id, list)
    }
  }

  // summaries (미확인 주문 그룹) — 기존 모달용 데이터
  const groupedByBooth = new Map<string, MonitorOrderRow[]>()
  for (const order of unconfirmed) {
    if (!order.booth_id) continue
    const paidAt = order.paid_at ?? order.created_at
    const list = groupedByBooth.get(order.booth_id) ?? []
    list.push({
      id: order.id,
      order_number: order.order_number,
      phone: order.phone,
      subtotal: order.subtotal,
      paid_at: paidAt,
      items: itemsByOrder.get(order.id) ?? [],
    })
    groupedByBooth.set(order.booth_id, list)
  }
  const summaries = booths.map((booth) => {
    const list = groupedByBooth.get(booth.id) ?? []
    return {
      boothId: booth.id,
      boothName: booth.name,
      boothNo: booth.booth_no,
      count: list.length,
      oldestPaidAt: list[0]?.paid_at ?? null,
      orders: list,
    }
  })

  // confirmedOrders (조리중 + estimated_minutes 가 있는 row — 조리시간 초과 모니터링)
  const confirmedOrders: MonitorConfirmedRow[] = orders
    .filter(
      (o) =>
        o.status === 'confirmed' &&
        o.ready_at === null &&
        o.estimated_minutes !== null &&
        o.confirmed_at !== null &&
        o.booth_id !== null,
    )
    .map((o) => ({
      id: o.id,
      order_number: o.order_number,
      booth_id: o.booth_id as string,
      booth_name: o.booth_name,
      confirmed_at: o.confirmed_at as string,
      estimated_minutes: o.estimated_minutes as number,
    }))

  // boothStatuses — 부스별 종합 운영 상태 (모니터 페이지 메인 카드)
  const statusByBooth = new Map<string, BoothStatusSummary>()
  for (const booth of booths) {
    statusByBooth.set(booth.id, {
      boothId: booth.id,
      boothName: booth.name,
      boothNo: booth.booth_no,
      isOpen: booth.is_open ?? true,
      isPaused: booth.is_paused ?? false,
      unconfirmedCount: 0,
      confirmedCount: 0,
      readyCount: 0,
      pickedUpCount: 0,
      cancelledCount: 0,
      grossAmount: 0,
      oldestUnconfirmedAt: null,
      oldestReadyAt: null,
    })
  }
  for (const o of orders) {
    if (!o.booth_id) continue
    const s = statusByBooth.get(o.booth_id)
    if (!s) continue
    // 분류 — 우선순위: cancelled > pickedup > ready > confirmed > unconfirmed
    if (o.status === 'cancelled') {
      s.cancelledCount += 1
      continue
    }
    // 매출 — 취소 외 모든 결제된 주문 (payment_pending 은 제외)
    if (o.status !== 'pending' && o.status !== 'payment_pending') {
      s.grossAmount += o.subtotal ?? 0
    }
    if (o.status === 'completed' || o.picked_up_at !== null) {
      s.pickedUpCount += 1
    } else if (o.ready_at !== null) {
      s.readyCount += 1
      if (s.oldestReadyAt === null || o.ready_at < s.oldestReadyAt) {
        s.oldestReadyAt = o.ready_at
      }
    } else if (o.status === 'confirmed') {
      s.confirmedCount += 1
    } else if (o.status === 'paid') {
      s.unconfirmedCount += 1
      const paidAt = o.paid_at ?? o.created_at
      if (s.oldestUnconfirmedAt === null || paidAt < s.oldestUnconfirmedAt) {
        s.oldestUnconfirmedAt = paidAt
      }
    }
  }

  return {
    summaries,
    confirmedOrders,
    boothStatuses: Array.from(statusByBooth.values()),
  }
}

/**
 * 어드민 모니터 Realtime 구독.
 * orders 테이블 변화만 구독하면 충분 (items 는 주문 후 변하지 않음).
 */
export function subscribeMonitor(
  onChange: () => void,
  channelPrefix: string = 'admin-monitor',
): () => void {
  const ordersChannel = supabase
    .channel(`${channelPrefix}-orders`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders' },
      () => {
        onChange()
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(ordersChannel)
  }
}
