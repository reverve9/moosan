import { supabase } from './supabase'
import { startOfTodayKstAsUtc } from './orders'
import type { Order, OrderItem } from '@/types/database'

/**
 * 부스 대시보드 카드 모델.
 *  - 1 order = 1 card
 *  - items 는 order_items 를 그대로 보유 (메뉴명 × 수량 렌더링)
 *  - status: waiting (paid, 미확인) / inProgress (confirmed) / completed (ready)
 */
export interface BoothOrderCardData {
  order: Order
  items: OrderItem[]
}

export type BoothOrderCardStatus = 'waiting' | 'inProgress' | 'completed'

export function getBoothOrderCardStatus(order: Order): BoothOrderCardStatus {
  if (order.ready_at || order.status === 'completed') return 'completed'
  if (order.confirmed_at || order.status === 'confirmed') return 'inProgress'
  return 'waiting'
}

/**
 * 본인 부스의 KST 당일 활성 주문 목록.
 * - orders.status in ('paid','confirmed','completed') 만 (pending/cancelled 제외)
 * - 두 번 쿼리 (orders → order_items) 후 client 에서 join
 */
export async function fetchTodayBoothOrders(
  boothId: string,
): Promise<BoothOrderCardData[]> {
  const start = startOfTodayKstAsUtc()
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select()
    .eq('booth_id', boothId)
    .in('status', ['paid', 'confirmed', 'completed'])
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('created_at', { ascending: false })

  if (oErr) throw oErr
  if (!orders || orders.length === 0) return []

  const orderIds = orders.map((o) => o.id)
  const { data: items, error: iErr } = await supabase
    .from('order_items')
    .select()
    .in('order_id', orderIds)
    .order('created_at', { ascending: true })
  if (iErr) throw iErr

  const itemsByOrder = new Map<string, OrderItem[]>()
  for (const item of items ?? []) {
    const list = itemsByOrder.get(item.order_id) ?? []
    list.push(item)
    itemsByOrder.set(item.order_id, list)
  }

  return orders.map((order) => ({
    order,
    items: itemsByOrder.get(order.id) ?? [],
  }))
}

/**
 * 주문 "확인" — confirmed_at 채우고 status 를 'confirmed' 로 전이.
 * estimatedMinutes 가 주어지면 estimated_minutes 도 함께 기록.
 * 이미 confirmed/ready 인 row 는 건드리지 않음.
 */
export async function confirmBoothOrder(
  orderId: string,
  estimatedMinutes?: number,
): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({
      confirmed_at: new Date().toISOString(),
      status: 'confirmed',
      ...(estimatedMinutes != null && { estimated_minutes: estimatedMinutes }),
    })
    .eq('id', orderId)
    .is('confirmed_at', null)
  if (error) throw new Error(`확인 처리 실패: ${error.message}`)
}

/**
 * 주문 거절 — Toss 부분 환불 + DB 전이.
 * 서버 endpoint /api/orders/cancel 에 위임 (Toss API 키가 server-only).
 *
 * 환불액은 order.subtotal 그대로 (큰 쿠폰 edge case 만 cap). 쿠폰 할인은
 * 운영자 부담이라 영업점은 비율 분배 없이 풀 금액 환불.
 *
 * 거절 가능 조건:
 *  - order.status in ('paid','confirmed')
 *  - order.ready_at IS NULL
 *  - payment.status='paid'
 */
export async function cancelBoothOrder(
  orderId: string,
  reason: string,
): Promise<{ refundAmount: number; paymentFullyCancelled: boolean }> {
  const response = await fetch('/api/orders/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, reason }),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    const msg = typeof json?.error === 'string' ? json.error : '주문 거절 실패'
    throw new Error(msg)
  }
  return {
    refundAmount: typeof json.refundAmount === 'number' ? json.refundAmount : 0,
    paymentFullyCancelled: json.paymentFullyCancelled === true,
  }
}

/**
 * 주문 "준비완료" — ready_at 채우고 status 를 'completed' 로 전이.
 * 확인을 건너뛴 경우 confirmed_at 도 함께 채움.
 */
export async function markBoothOrderReady(orderId: string): Promise<void> {
  const now = new Date().toISOString()

  // 확인이 아직이면 confirmed_at 도 채움
  const { error: cErr } = await supabase
    .from('orders')
    .update({ confirmed_at: now })
    .eq('id', orderId)
    .is('confirmed_at', null)
  if (cErr) throw new Error(`준비완료 처리 실패: ${cErr.message}`)

  const { error } = await supabase
    .from('orders')
    .update({ ready_at: now, status: 'completed' })
    .eq('id', orderId)
    .is('ready_at', null)
  if (error) throw new Error(`준비완료 처리 실패: ${error.message}`)
}

/**
 * Realtime 구독 — orders 테이블 (booth_id 필터) 단일 채널.
 * 새 INSERT 는 payments → orders 흐름에서 orders INSERT 시점에 알림이 오지만,
 * 아직 status 가 'pending' 이라 리스트에 안 들어옴. pending → paid UPDATE
 * 이벤트에서 새 주문 등장으로 취급한다. onOrderPaidInsert 는 "새 주문 등장"
 * 콜백.
 */
export interface BoothOrdersSubscribeCallbacks {
  /** 새 주문이 paid 상태로 전이됐을 때 (새 카드 등장) */
  onOrderPaid?: (orderId: string) => void
  /** 어드민이 환불해서 주문이 cancelled 로 전이됐을 때 */
  onOrderCancelled?: (orderId: string) => void
  /** orders 또는 order_items 변화 후 refetch 트리거 */
  onChange?: () => void
}

export function subscribeBoothOrders(
  boothId: string,
  callbacks: BoothOrdersSubscribeCallbacks,
): () => void {
  const ordersChannel = supabase
    .channel(`booth-orders-${boothId}-orders`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `booth_id=eq.${boothId}`,
      },
      (payload) => {
        if (payload.eventType === 'UPDATE') {
          const newRow = payload.new as { id?: string; status?: string } | null
          const oldRow = payload.old as { status?: string } | null
          if (newRow?.status === 'paid' && oldRow?.status !== 'paid' && newRow.id) {
            callbacks.onOrderPaid?.(newRow.id)
          }
          if (
            newRow?.status === 'cancelled' &&
            oldRow?.status !== 'cancelled' &&
            newRow.id
          ) {
            callbacks.onOrderCancelled?.(newRow.id)
          }
        }
        callbacks.onChange?.()
      },
    )
    .subscribe()

  // order_items 는 order_id 로만 join 가능 → booth 필터 못 걸어서 전체 구독.
  // 사실상 item 변경은 거의 없지만 INSERT/UPDATE 시 refetch 트리거로만 사용.
  const itemsChannel = supabase
    .channel(`booth-orders-${boothId}-items`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'order_items' },
      () => {
        callbacks.onChange?.()
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(ordersChannel)
    void supabase.removeChannel(itemsChannel)
  }
}
