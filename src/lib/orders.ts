import { supabase } from './supabase'
import type { CartItem } from '@/store/cartStore'
import type { Order } from '@/types/database'

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
