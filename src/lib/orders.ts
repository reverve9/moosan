import { supabase } from './supabase'
import type { CartItem } from '@/store/cartStore'
import type { Order, OrderItem, Payment } from '@/types/database'

/**
 * 결제/주문 모델 (12_payments_booth_orders 이후):
 *
 *   payments (1건)
 *     ├── orders (부스 수만큼 N건)
 *     │    └── order_items (메뉴 라인 M건)
 *     └── ...
 *
 *  - payments.toss_order_id  : Toss 결제창에 넘기는 orderId (전역 sequence)
 *  - orders.order_number     : 부스별 표시 번호 (A01-0428-0001)
 *  - orders.confirmed_at     : 부스 "확인" 시각
 *  - orders.ready_at         : 부스 "준비완료" 시각
 *  - orders.status           : pending → paid → confirmed → completed / cancelled
 */

export interface CreatePaymentInput {
  phone: string
  /** 할인 적용 후 결제 실금액 (= subtotal - discountAmount). Toss 에 넘기는 금액 */
  totalAmount: number
  items: CartItem[]
  festivalId?: string | null
  /** 쿠폰 검증이 성공한 경우에만 전달 */
  couponId?: string | null
  discountAmount?: number
}

export interface CreatePaymentResult {
  payment: Payment
  orders: Order[]
}

/**
 * 결제 호출 직전에 호출.
 * 1) payments INSERT (status=pending, 트리거가 toss_order_id 자동 채움)
 * 2) 카트 → 부스별 group → 각 부스마다 orders INSERT + order_items INSERT
 *
 * 어느 단계에서 실패하면 던짐. payments 는 ON DELETE CASCADE 로 orders/items
 * 까지 내려가므로 호출자에서 복구 필요 시 payment.id 로 delete 가능.
 */
export async function createPendingPayment(
  input: CreatePaymentInput,
): Promise<CreatePaymentResult> {
  // 1) payments row (할인 적용 후 금액 + 쿠폰 정보 기록)
  const { data: payment, error: pErr } = await supabase
    .from('payments')
    .insert({
      phone: input.phone,
      total_amount: input.totalAmount,
      discount_amount: input.discountAmount ?? 0,
      coupon_id: input.couponId ?? null,
      status: 'pending',
      festival_id: input.festivalId ?? null,
    })
    .select()
    .single()

  if (pErr || !payment) {
    throw new Error(`결제 생성 실패: ${pErr?.message ?? 'unknown'}`)
  }

  // 2) 부스별 group
  const groups = new Map<string, CartItem[]>()
  for (const item of input.items) {
    const list = groups.get(item.boothId) ?? []
    list.push(item)
    groups.set(item.boothId, list)
  }

  // 3) 부스별 orders + items
  const createdOrders: Order[] = []
  for (const [boothId, boothItems] of groups) {
    const first = boothItems[0]
    const subtotal = boothItems.reduce((sum, it) => sum + it.price * it.quantity, 0)

    const { data: order, error: oErr } = await supabase
      .from('orders')
      .insert({
        payment_id: payment.id,
        booth_id: boothId,
        booth_no: first.boothNo,
        booth_name: first.boothName,
        subtotal,
        phone: input.phone,
        status: 'pending',
        festival_id: input.festivalId ?? null,
      })
      .select()
      .single()

    if (oErr || !order) {
      throw new Error(`주문 생성 실패(${first.boothName}): ${oErr?.message ?? 'unknown'}`)
    }

    const itemRows = boothItems.map((it) => ({
      order_id: order.id,
      menu_id: it.menuId,
      menu_name: it.menuName,
      menu_price: it.price,
      quantity: it.quantity,
      subtotal: it.price * it.quantity,
    }))

    const { error: iErr } = await supabase.from('order_items').insert(itemRows)
    if (iErr) {
      throw new Error(`주문 아이템 생성 실패(${first.boothName}): ${iErr.message}`)
    }

    createdOrders.push(order)
  }

  return { payment, orders: createdOrders }
}

/**
 * 결제 승인 후 호출 — payments 상태 paid + 모든 하위 orders 상태 paid.
 * 쿠폰이 있다면 원자 전이로 used 처리 (race safe: 이미 used 면 UPDATE 가 0행).
 *
 * 주의: 여러 단계 UPDATE 를 나눠 실행하므로 중간에 실패하면 payments 는
 * paid 인데 orders 가 paid 아닌 상태가 될 수 있음. 현재 운영 리스크는 낮아
 * 명시 트랜잭션 생략. 문제 생기면 Supabase RPC 로 감싸기.
 */
export async function markPaymentPaid(
  paymentId: string,
  paymentKey: string,
): Promise<void> {
  const now = new Date().toISOString()

  // 1) payments → paid
  const { data: payment, error: pErr } = await supabase
    .from('payments')
    .update({ status: 'paid', payment_key: paymentKey, paid_at: now })
    .eq('id', paymentId)
    .select()
    .single()
  if (pErr || !payment) throw new Error(`결제 업데이트 실패: ${pErr?.message ?? 'unknown'}`)

  // 2) 하위 orders → paid
  //    paid_at 도 같이 채워야 부스/어드민 elapsed 가 결제 직후 시점부터 측정됨
  //    (orders.created_at 은 결제하기 클릭 시점이라 토스 흐름 시간이 포함됨)
  const { error: oErr } = await supabase
    .from('orders')
    .update({ status: 'paid', paid_at: now })
    .eq('payment_id', paymentId)
  if (oErr) throw new Error(`주문 상태 업데이트 실패: ${oErr.message}`)

  // 3) 쿠폰이 연결돼 있으면 원자 전이
  if (payment.coupon_id) {
    const { data: updated, error: cErr } = await supabase
      .from('coupons')
      .update({
        status: 'used',
        used_at: now,
        used_payment_id: paymentId,
      })
      .eq('id', payment.coupon_id)
      .eq('status', 'active') // race safe — 이미 used 면 0행
      .select()
    if (cErr) throw new Error(`쿠폰 상태 업데이트 실패: ${cErr.message}`)
    if (!updated || updated.length === 0) {
      // 이미 누군가 사용함 — Toss 승인은 이미 성공했으니 결제는 유효.
      // 로그만 남기고 진행 (환불 대상은 어드민이 수동 판단).
      console.warn(
        `[markPaymentPaid] coupon ${payment.coupon_id} already used — payment ${paymentId}`,
      )
    }
  }
}

/** toss_order_id (Toss 의 orderId) 로 payment 조회. success/fail 페이지에서 사용 */
export async function findPaymentByTossOrderId(
  tossOrderId: string,
): Promise<Payment | null> {
  const { data, error } = await supabase
    .from('payments')
    .select()
    .eq('toss_order_id', tossOrderId)
    .maybeSingle()
  if (error) throw error
  return data
}

/** 주문 단건 + items 조회 (부스 대시보드 / admin 에서 개별 order 볼 때) */
export interface OrderWithItems {
  order: Order
  items: OrderItem[]
}

export async function fetchOrderWithItems(
  orderId: string,
): Promise<OrderWithItems | null> {
  const [orderRes, itemsRes] = await Promise.all([
    supabase.from('orders').select().eq('id', orderId).maybeSingle(),
    supabase
      .from('order_items')
      .select()
      .eq('order_id', orderId)
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

/** 결제 1건 + 연결된 모든 부스 주문 + 각 주문의 items 묶음 조회 (주문 상태 페이지용) */
export interface PaymentWithOrders {
  payment: Payment
  orders: OrderWithItems[]
}

export async function fetchPaymentWithOrders(
  paymentId: string,
): Promise<PaymentWithOrders | null> {
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
  if (!orders || orders.length === 0) {
    return { payment, orders: [] }
  }

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

  return {
    payment,
    orders: orders.map((o) => ({ order: o, items: itemsByOrder.get(o.id) ?? [] })),
  }
}

/**
 * 오늘 KST 자정 (UTC ISO) 을 반환.
 */
/** 오늘 KST 날짜를 "YYYY-MM-DD" 문자열로 반환 */
export function todayKstString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function startOfTodayKstAsUtc(): Date {
  return new Date(`${todayKstString()}T00:00:00+09:00`)
}

/**
 * 휴대폰 번호 + KST 당일 범위로 결제 목록 조회 (주문 조회 페이지용).
 * 각 payment 아래로 연결된 orders + items 를 전부 묶어 반환.
 */
export async function fetchPaymentsByPhoneToday(
  phone: string,
): Promise<PaymentWithOrders[]> {
  const start = startOfTodayKstAsUtc()
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  const { data: payments, error: pErr } = await supabase
    .from('payments')
    .select()
    .eq('phone', phone)
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('created_at', { ascending: false })
  if (pErr) throw pErr
  if (!payments || payments.length === 0) return []

  const paymentIds = payments.map((p) => p.id)
  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select()
    .in('payment_id', paymentIds)
    .order('booth_no', { ascending: true })
  if (oErr) throw oErr

  const orderIds = (orders ?? []).map((o) => o.id)
  let items: OrderItem[] = []
  if (orderIds.length > 0) {
    const { data: itemsData, error: iErr } = await supabase
      .from('order_items')
      .select()
      .in('order_id', orderIds)
      .order('created_at', { ascending: true })
    if (iErr) throw iErr
    items = itemsData ?? []
  }

  const itemsByOrder = new Map<string, OrderItem[]>()
  for (const item of items) {
    const list = itemsByOrder.get(item.order_id) ?? []
    list.push(item)
    itemsByOrder.set(item.order_id, list)
  }

  const ordersByPayment = new Map<string, OrderWithItems[]>()
  for (const order of orders ?? []) {
    const list = ordersByPayment.get(order.payment_id) ?? []
    list.push({ order, items: itemsByOrder.get(order.id) ?? [] })
    ordersByPayment.set(order.payment_id, list)
  }

  return payments.map((payment) => ({
    payment,
    orders: ordersByPayment.get(payment.id) ?? [],
  }))
}
