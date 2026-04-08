import { supabase } from './supabase'
import { startOfTodayKstAsUtc } from './orders'

/**
 * 부스 대시보드용 평탄화 모델.
 * order_items + 부모 orders 의 일부 필드를 한 객체로 묶어 카드 렌더링이 단순해진다.
 */
export interface BoothOrderItem {
  id: string
  order_id: string
  order_number: string
  phone: string
  order_status: string
  order_created_at: string

  menu_id: string | null
  menu_name: string
  menu_price: number
  quantity: number
  subtotal: number

  is_ready: boolean
  confirmed_at: string | null
  item_created_at: string
}

/**
 * 본인 부스의 KST 당일 활성 주문 아이템 목록.
 * - orders.status in ('paid', 'completed') 만 (pending 은 결제 미완)
 * - 두 번 쿼리 후 클라이언트에서 join (fetchOrdersByPhoneToday 와 동일 패턴, 안전)
 */
export async function fetchTodayBoothOrderItems(
  boothId: string,
): Promise<BoothOrderItem[]> {
  const start = startOfTodayKstAsUtc()
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select()
    .eq('booth_id', boothId)
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('created_at', { ascending: false })

  if (itemsErr) throw itemsErr
  if (!items || items.length === 0) return []

  const orderIds = Array.from(new Set(items.map((i) => i.order_id)))
  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('id, order_number, phone, status, created_at')
    .in('id', orderIds)
    .in('status', ['paid', 'completed'])

  if (ordersErr) throw ordersErr
  if (!orders) return []

  const orderMap = new Map(orders.map((o) => [o.id, o]))

  const result: BoothOrderItem[] = []
  for (const item of items) {
    const order = orderMap.get(item.order_id)
    if (!order) continue
    result.push({
      id: item.id,
      order_id: item.order_id,
      order_number: order.order_number,
      phone: order.phone,
      order_status: order.status,
      order_created_at: order.created_at,
      menu_id: item.menu_id,
      menu_name: item.menu_name,
      menu_price: item.menu_price,
      quantity: item.quantity,
      subtotal: item.subtotal,
      is_ready: item.is_ready,
      confirmed_at: item.confirmed_at,
      item_created_at: item.created_at,
    })
  }
  return result
}

/**
 * 카드 단위 (한 손님이 같은 부스에서 시킨 모든 메뉴) 일괄 확인.
 * 동시성 안전: confirmed_at 이 이미 채워진 row 는 건드리지 않음.
 */
export async function confirmBoothOrderItems(
  orderId: string,
  boothId: string,
): Promise<void> {
  const { error } = await supabase
    .from('order_items')
    .update({ confirmed_at: new Date().toISOString() })
    .eq('order_id', orderId)
    .eq('booth_id', boothId)
    .is('confirmed_at', null)
  if (error) throw new Error(`확인 처리 실패: ${error.message}`)
}

/**
 * 카드 단위 일괄 준비완료. is_ready false 인 row 만 업데이트.
 */
export async function markBoothOrderItemsReady(
  orderId: string,
  boothId: string,
): Promise<void> {
  const { error } = await supabase
    .from('order_items')
    .update({ is_ready: true })
    .eq('order_id', orderId)
    .eq('booth_id', boothId)
    .eq('is_ready', false)
  if (error) throw new Error(`준비완료 처리 실패: ${error.message}`)
}

export type BoothOrderItemStatus = 'waiting' | 'inProgress' | 'completed'

export function getBoothOrderItemStatus(item: BoothOrderItem): BoothOrderItemStatus {
  if (item.is_ready) return 'completed'
  if (item.confirmed_at) return 'inProgress'
  return 'waiting'
}

/**
 * Realtime 구독 — Phase 1.9 의 채널 분리 패턴 그대로:
 *   - order_items 채널: event '*', filter booth_id (INSERT 시 highlight 콜백)
 *   - orders 채널: event 'UPDATE' (pending → paid 시 새 주문 노출)
 *
 * 호출자가 unsubscribe 함수를 cleanup 에 등록해야 한다.
 */
export interface BoothOrdersSubscribeCallbacks {
  /** 본인 부스에 새 order_item INSERT — id 알려줘서 highlight 트리거에 사용 */
  onItemInsert?: (itemId: string) => void
  /** 모든 이벤트 (INSERT/UPDATE/DELETE/orders.UPDATE) 후 호출 — 보통 refetch */
  onChange?: () => void
}

export function subscribeBoothOrders(
  boothId: string,
  callbacks: BoothOrdersSubscribeCallbacks,
): () => void {
  const itemsChannel = supabase
    .channel(`booth-orders-${boothId}-items`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'order_items',
        filter: `booth_id=eq.${boothId}`,
      },
      (payload) => {
        if (payload.eventType === 'INSERT') {
          const id = (payload.new as { id?: string } | null)?.id
          if (id) callbacks.onItemInsert?.(id)
        }
        callbacks.onChange?.()
      },
    )
    .subscribe()

  const ordersChannel = supabase
    .channel(`booth-orders-${boothId}-orders`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
      },
      (payload) => {
        const newStatus = (payload.new as { status?: string } | null)?.status
        const oldStatus = (payload.old as { status?: string } | null)?.status
        if (newStatus && oldStatus && newStatus === oldStatus) return
        callbacks.onChange?.()
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(itemsChannel)
    void supabase.removeChannel(ordersChannel)
  }
}
