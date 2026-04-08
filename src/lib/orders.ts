import { supabase } from './supabase'
import type { CartItem } from '@/store/cartStore'
import type { Order, OrderItem } from '@/types/database'

export interface CreateOrderInput {
  phone: string
  totalAmount: number
  items: CartItem[]
  festivalId?: string | null
}

/**
 * 결제 호출 직전에 호출.
 * 1) orders INSERT (status: pending) — 트리거가 order_number 자동 생성
 * 2) 받은 order.id 로 order_items INSERT
 * 둘 중 하나라도 실패하면 던짐. 부분 INSERT 정리는 호출자 책임 (현재는 단순화 — 실패 빈도 낮음)
 */
export async function createPendingOrder(input: CreateOrderInput): Promise<Order> {
  const { data: orderRow, error: orderErr } = await supabase
    .from('orders')
    .insert({
      phone: input.phone,
      total_amount: input.totalAmount,
      status: 'pending',
      festival_id: input.festivalId ?? null,
    })
    .select()
    .single()

  if (orderErr || !orderRow) {
    throw new Error(`주문 생성 실패: ${orderErr?.message ?? 'unknown'}`)
  }

  const itemRows = input.items.map((item) => ({
    order_id: orderRow.id,
    booth_id: item.boothId,
    menu_id: item.menuId,
    booth_name: item.boothName,
    menu_name: item.menuName,
    menu_price: item.price,
    quantity: item.quantity,
    subtotal: item.price * item.quantity,
  }))

  const { error: itemsErr } = await supabase.from('order_items').insert(itemRows)
  if (itemsErr) {
    throw new Error(`주문 아이템 생성 실패: ${itemsErr.message}`)
  }

  return orderRow
}

/**
 * 결제 승인 후 호출 — orders 상태 paid + payment_key + paid_at 업데이트
 */
export async function markOrderPaid(
  orderId: string,
  paymentKey: string,
): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({
      status: 'paid',
      payment_key: paymentKey,
      paid_at: new Date().toISOString(),
    })
    .eq('id', orderId)

  if (error) {
    throw new Error(`주문 상태 업데이트 실패: ${error.message}`)
  }
}

/** order_number 로 orders 조회 (success/fail 페이지에서 사용) */
export async function findOrderByNumber(orderNumber: string): Promise<Order | null> {
  const { data, error } = await supabase
    .from('orders')
    .select()
    .eq('order_number', orderNumber)
    .maybeSingle()
  if (error) throw error
  return data
}

/** 주문 헤더 + 모든 order_items 한 번에 조회 (주문 상태 페이지용) */
export interface OrderWithItems {
  order: Order
  items: OrderItem[]
}

export async function fetchOrderWithItems(orderId: string): Promise<OrderWithItems | null> {
  const [orderRes, itemsRes] = await Promise.all([
    supabase.from('orders').select().eq('id', orderId).maybeSingle(),
    supabase
      .from('order_items')
      .select()
      .eq('order_id', orderId)
      .order('booth_name', { ascending: true })
      .order('created_at', { ascending: true }),
  ])

  if (orderRes.error) throw orderRes.error
  if (itemsRes.error) throw itemsRes.error
  if (!orderRes.data) return null

  return {
    order: orderRes.data,
    items: itemsRes.data ?? [],
  }
}

/**
 * 오늘 KST 자정 (UTC ISO) 을 반환.
 * 자정 ~ 익일 자정 범위 비교에 사용.
 */
export function startOfTodayKstAsUtc(): Date {
  const now = new Date()
  // KST 기준 YYYY-MM-DD 추출 (Intl 로 timezone 처리)
  const kstDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  // KST 자정을 UTC Date 로 변환 (KST = UTC+09:00)
  return new Date(`${kstDateStr}T00:00:00+09:00`)
}

/**
 * 휴대폰 번호 + KST 당일 범위로 주문 목록 조회 (전화번호 조회 페이지용).
 * orders 와 order_items 를 두 번 쿼리 후 client 에서 묶음.
 */
export async function fetchOrdersByPhoneToday(phone: string): Promise<OrderWithItems[]> {
  const start = startOfTodayKstAsUtc()
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select()
    .eq('phone', phone)
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('created_at', { ascending: false })

  if (ordersErr) throw ordersErr
  if (!orders || orders.length === 0) return []

  const orderIds = orders.map((o) => o.id)
  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select()
    .in('order_id', orderIds)
    .order('booth_name', { ascending: true })
    .order('created_at', { ascending: true })

  if (itemsErr) throw itemsErr

  // order_id 기준으로 items 그룹핑
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
