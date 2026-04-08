import { supabase } from './supabase'
import { startOfTodayKstAsUtc } from './orders'

export interface MonitorItem {
  id: string
  order_id: string
  order_number: string
  phone: string
  menu_name: string
  quantity: number
  created_at: string
}

export interface MonitorBoothSummary {
  boothId: string
  boothName: string
  boothNo: string | null
  count: number
  oldestCreatedAt: string | null
  items: MonitorItem[]
}

/**
 * 어드민 모니터 페이지 데이터.
 * - 모든 활성 부스 row 보장 (0건 부스도 카드로 표시)
 * - 미확인 (confirmed_at IS NULL) + 부모 orders.status in ('paid', 'completed') 조건
 * - KST 당일만 (오늘 영업분)
 */
export async function fetchMonitorSummary(): Promise<MonitorBoothSummary[]> {
  const start = startOfTodayKstAsUtc()
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  const [boothsRes, itemsRes] = await Promise.all([
    supabase
      .from('food_booths')
      .select('id, name, booth_no')
      .eq('is_active', true)
      .order('booth_no', { ascending: true }),
    supabase
      .from('order_items')
      .select()
      .is('confirmed_at', null)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: true }),
  ])

  if (boothsRes.error) throw new Error(`부스 조회 실패: ${boothsRes.error.message}`)
  if (itemsRes.error) throw new Error(`미확인 조회 실패: ${itemsRes.error.message}`)

  const booths = boothsRes.data ?? []
  const items = itemsRes.data ?? []

  let orderMap = new Map<string, { order_number: string; phone: string }>()
  if (items.length > 0) {
    const orderIds = Array.from(new Set(items.map((i) => i.order_id)))
    const { data: orders, error: ordersErr } = await supabase
      .from('orders')
      .select('id, order_number, phone, status')
      .in('id', orderIds)
      .in('status', ['paid', 'completed'])
    if (ordersErr) throw new Error(`주문 조회 실패: ${ordersErr.message}`)
    orderMap = new Map(
      (orders ?? []).map((o) => [o.id, { order_number: o.order_number, phone: o.phone }]),
    )
  }

  const groupedByBooth = new Map<string, MonitorItem[]>()
  for (const item of items) {
    if (!item.booth_id) continue
    const order = orderMap.get(item.order_id)
    if (!order) continue
    const list = groupedByBooth.get(item.booth_id) ?? []
    list.push({
      id: item.id,
      order_id: item.order_id,
      order_number: order.order_number,
      phone: order.phone,
      menu_name: item.menu_name,
      quantity: item.quantity,
      created_at: item.created_at,
    })
    groupedByBooth.set(item.booth_id, list)
  }

  return booths.map((booth) => {
    const boothItems = groupedByBooth.get(booth.id) ?? []
    return {
      boothId: booth.id,
      boothName: booth.name,
      boothNo: booth.booth_no,
      count: boothItems.length,
      oldestCreatedAt: boothItems[0]?.created_at ?? null,
      items: boothItems,
    }
  })
}

/**
 * 어드민 모니터 Realtime 구독.
 * Phase 1.9 채널 분리 패턴 — 같은 채널에 postgres_changes 여러 개 chain 회피.
 * channelPrefix 로 다중 호출자 (AdminLayout + AdminMonitor) 가 채널 이름을 분리.
 */
export function subscribeMonitor(
  onChange: () => void,
  channelPrefix: string = 'admin-monitor',
): () => void {
  const itemsChannel = supabase
    .channel(`${channelPrefix}-items`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'order_items' },
      () => {
        onChange()
      },
    )
    .subscribe()

  const ordersChannel = supabase
    .channel(`${channelPrefix}-orders`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders' },
      (payload) => {
        const newStatus = (payload.new as { status?: string } | null)?.status
        const oldStatus = (payload.old as { status?: string } | null)?.status
        if (newStatus && oldStatus && newStatus === oldStatus) return
        onChange()
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(itemsChannel)
    void supabase.removeChannel(ordersChannel)
  }
}
