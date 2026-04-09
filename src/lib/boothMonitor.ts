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

export interface MonitorBoothSummary {
  boothId: string
  boothName: string
  boothNo: string | null
  count: number              // 미확인 주문 건수
  oldestPaidAt: string | null
  orders: MonitorOrderRow[]
}

export async function fetchMonitorSummary(): Promise<MonitorBoothSummary[]> {
  const start = startOfTodayKstAsUtc()
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  const [boothsRes, ordersRes] = await Promise.all([
    supabase
      .from('food_booths')
      .select('id, name, booth_no')
      .eq('is_active', true)
      .order('booth_no', { ascending: true }),
    supabase
      .from('orders')
      .select()
      .eq('status', 'paid')
      .is('confirmed_at', null)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('paid_at', { ascending: true }),
  ])

  if (boothsRes.error) throw new Error(`부스 조회 실패: ${boothsRes.error.message}`)
  if (ordersRes.error) throw new Error(`미확인 주문 조회 실패: ${ordersRes.error.message}`)

  const booths = boothsRes.data ?? []
  const orders = ordersRes.data ?? []

  // order_items 한 번에 fetch (모달 상세용)
  let itemsByOrder = new Map<string, OrderItem[]>()
  if (orders.length > 0) {
    const orderIds = orders.map((o) => o.id)
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

  const groupedByBooth = new Map<string, MonitorOrderRow[]>()
  for (const order of orders) {
    if (!order.booth_id) continue
    // status='paid' 만 필터링했으므로 paid_at 이 NULL 일 수 없지만, 마이그 18
    // 적용 직후 backfill 누락을 대비해 created_at 으로 fallback.
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

  return booths.map((booth) => {
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
