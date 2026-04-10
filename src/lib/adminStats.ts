import { supabase } from './supabase'
import type { FoodMenu, Order, OrderItem, Payment } from '@/types/database'

/**
 * 어드민 매출관리 탭 전용 통계 라이브러리.
 *
 *  - fetchStatsData: 기간 내 모든 payments + orders + order_items 를 한 번에 긁어와
 *    client 에서 집계. (페이징 없음. 한 축제당 수천 건 수준이라 메모리 여유 있음)
 *  - calcXxx: 순수 함수. 테스트/재사용 용이.
 *
 * payments.status 는 'pending' / 'paid' / 'cancelled' 3종.
 * 통계에서는:
 *   - 매출/객단가/부스/메뉴/시간/고객 → 'paid' 만 (cancelled 제외)
 *   - 결제 성공률 → paid / pending / cancelled 전체
 *   - 취소 지표 → cancelled 만
 *
 * 부분 환불 대응 (17_order_rejection.sql 이후):
 *   - 매출 = sum(payment.total_amount - payment.refunded_amount) for paid
 *   - 부스/메뉴 통계는 orders.status='cancelled' 인 row 를 제외
 */

export interface StatsFilters {
  /** KST 'YYYY-MM-DD' inclusive */
  dateFrom?: string
  /** KST 'YYYY-MM-DD' inclusive */
  dateTo?: string
}

export interface StatsRawData {
  payments: Payment[]
  orders: Order[]
  orderItems: OrderItem[]
  allMenus: FoodMenu[]
}

function kstDateToUtc(dateStr: string, endOfDay: boolean): string {
  const time = endOfDay ? '24:00:00' : '00:00:00'
  return new Date(`${dateStr}T${time}+09:00`).toISOString()
}

export async function fetchStatsData(filters: StatsFilters): Promise<StatsRawData> {
  let q = supabase.from('payments').select().order('created_at', { ascending: true })
  if (filters.dateFrom) q = q.gte('created_at', kstDateToUtc(filters.dateFrom, false))
  if (filters.dateTo) q = q.lt('created_at', kstDateToUtc(filters.dateTo, true))

  const { data: payments, error: pErr } = await q
  if (pErr) throw pErr
  if (!payments || payments.length === 0) {
    return { payments: [], orders: [], orderItems: [], allMenus: [] }
  }

  const paymentIds = payments.map((p) => p.id)

  const [ordersRes, menusRes] = await Promise.all([
    supabase.from('orders').select().in('payment_id', paymentIds),
    supabase.from('food_menus').select(),
  ])
  if (ordersRes.error) throw ordersRes.error
  if (menusRes.error) throw menusRes.error

  const orders = ordersRes.data ?? []
  const allMenus = menusRes.data ?? []

  let orderItems: OrderItem[] = []
  if (orders.length > 0) {
    const orderIds = orders.map((o) => o.id)
    const { data: items, error: iErr } = await supabase
      .from('order_items')
      .select()
      .in('order_id', orderIds)
    if (iErr) throw iErr
    orderItems = items ?? []
  }

  return { payments, orders, orderItems, allMenus }
}

// ─── 1. KPI ──────────────────────────────────────

export interface KpiStats {
  totalRevenue: number
  paidCount: number
  cancelledCount: number
  cancelledAmount: number
  pendingCount: number
  totalBoothOrders: number
  avgTicket: number
  avgBoothsPerPayment: number
}

export function calcKpi(data: StatsRawData): KpiStats {
  let totalRevenue = 0
  let paidCount = 0
  let cancelledCount = 0
  let cancelledAmount = 0
  let pendingCount = 0
  for (const p of data.payments) {
    if (p.status === 'paid') {
      // 부분환불(부스 거절) 차감
      totalRevenue += p.total_amount - (p.refunded_amount ?? 0)
      paidCount += 1
    } else if (p.status === 'cancelled') {
      cancelledCount += 1
      cancelledAmount += p.total_amount
    } else if (p.status === 'pending') {
      pendingCount += 1
    }
  }
  const paidPaymentIds = new Set(
    data.payments.filter((p) => p.status === 'paid').map((p) => p.id),
  )
  // 부스 거절(cancelled) order 는 KPI 카운트에서 제외
  const paidOrders = data.orders.filter(
    (o) => paidPaymentIds.has(o.payment_id) && o.status !== 'cancelled',
  )
  const totalBoothOrders = paidOrders.length
  return {
    totalRevenue,
    paidCount,
    cancelledCount,
    cancelledAmount,
    pendingCount,
    totalBoothOrders,
    avgTicket: paidCount > 0 ? Math.round(totalRevenue / paidCount) : 0,
    avgBoothsPerPayment:
      paidCount > 0 ? Math.round((totalBoothOrders / paidCount) * 100) / 100 : 0,
  }
}

// ─── 2. 시간 분석 ────────────────────────────────

export interface TimeStats {
  hourly: { hour: number; revenue: number; count: number }[]
  daily: { date: string; revenue: number; count: number }[]
  topHours: { hour: number; revenue: number; count: number }[]
}

function kstHour(iso: string): number {
  // Intl 로 KST 시각 뽑기
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  return Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
}

function kstDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

export function calcTimeStats(data: StatsRawData): TimeStats {
  const hourlyMap = new Map<number, { revenue: number; count: number }>()
  const dailyMap = new Map<string, { revenue: number; count: number }>()
  for (const p of data.payments) {
    if (p.status !== 'paid') continue
    const netRevenue = p.total_amount - (p.refunded_amount ?? 0)
    const hour = kstHour(p.created_at)
    const date = kstDate(p.created_at)
    const h = hourlyMap.get(hour) ?? { revenue: 0, count: 0 }
    h.revenue += netRevenue
    h.count += 1
    hourlyMap.set(hour, h)
    const d = dailyMap.get(date) ?? { revenue: 0, count: 0 }
    d.revenue += netRevenue
    d.count += 1
    dailyMap.set(date, d)
  }

  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    revenue: hourlyMap.get(hour)?.revenue ?? 0,
    count: hourlyMap.get(hour)?.count ?? 0,
  }))

  const daily = Array.from(dailyMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const topHours = [...hourly]
    .filter((h) => h.count > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3)

  return { hourly, daily, topHours }
}

// ─── 3. 부스 성과 ────────────────────────────────

export interface BoothRankingRow {
  boothId: string | null
  boothNo: string
  boothName: string
  revenue: number
  orderCount: number
  avgTicket: number
}

export interface BoothStats {
  ranking: BoothRankingRow[]
  topRevenue: BoothRankingRow | null
  topOrderCount: BoothRankingRow | null
}

export function calcBoothStats(data: StatsRawData): BoothStats {
  const paidPaymentIds = new Set(
    data.payments.filter((p) => p.status === 'paid').map((p) => p.id),
  )
  const bucket = new Map<
    string,
    {
      boothId: string | null
      boothNo: string
      boothName: string
      revenue: number
      orderCount: number
    }
  >()
  for (const o of data.orders) {
    if (!paidPaymentIds.has(o.payment_id)) continue
    // 부스 거절(부분환불) 건은 매출/카운트에서 제외
    if (o.status === 'cancelled') continue
    const key = o.booth_id ?? `__no_id__${o.booth_name}`
    const row =
      bucket.get(key) ??
      {
        boothId: o.booth_id,
        boothNo: o.booth_no,
        boothName: o.booth_name,
        revenue: 0,
        orderCount: 0,
      }
    row.revenue += o.subtotal
    row.orderCount += 1
    bucket.set(key, row)
  }
  const ranking: BoothRankingRow[] = Array.from(bucket.values())
    .map((row) => ({
      ...row,
      avgTicket: row.orderCount > 0 ? Math.round(row.revenue / row.orderCount) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  const topRevenue = ranking[0] ?? null
  const topOrderCount =
    [...ranking].sort((a, b) => b.orderCount - a.orderCount)[0] ?? null

  return { ranking, topRevenue, topOrderCount }
}

// ─── 4. 메뉴 분석 ────────────────────────────────

export interface MenuRankRow {
  menuName: string
  boothName: string
  quantity: number
  revenue: number
}

export interface MenuStats {
  byQuantity: MenuRankRow[]
  byRevenue: MenuRankRow[]
  perBoothBest: { boothName: string; menuName: string; quantity: number }[]
  unsoldMenus: { boothName: string; menuName: string }[]
}

export function calcMenuStats(data: StatsRawData): MenuStats {
  const paidPaymentIds = new Set(
    data.payments.filter((p) => p.status === 'paid').map((p) => p.id),
  )
  // 부스 거절 건은 메뉴 통계에서도 제외
  const paidOrderIds = new Set(
    data.orders
      .filter((o) => paidPaymentIds.has(o.payment_id) && o.status !== 'cancelled')
      .map((o) => o.id),
  )
  const orderBoothName = new Map<string, string>()
  for (const o of data.orders) orderBoothName.set(o.id, o.booth_name)

  // 메뉴 집계 key = `${boothName}__${menuName}`
  interface MenuAcc {
    menuName: string
    boothName: string
    quantity: number
    revenue: number
  }
  const menuMap = new Map<string, MenuAcc>()
  for (const it of data.orderItems) {
    if (!paidOrderIds.has(it.order_id)) continue
    const boothName = orderBoothName.get(it.order_id) ?? '-'
    const key = `${boothName}__${it.menu_name}`
    const row = menuMap.get(key) ?? {
      menuName: it.menu_name,
      boothName,
      quantity: 0,
      revenue: 0,
    }
    row.quantity += it.quantity
    row.revenue += it.subtotal
    menuMap.set(key, row)
  }
  const allRanked = Array.from(menuMap.values())
  const byQuantity = [...allRanked].sort((a, b) => b.quantity - a.quantity).slice(0, 10)
  const byRevenue = [...allRanked].sort((a, b) => b.revenue - a.revenue).slice(0, 10)

  // 부스별 1등 메뉴
  const boothBest = new Map<string, MenuAcc>()
  for (const row of allRanked) {
    const prev = boothBest.get(row.boothName)
    if (!prev || row.quantity > prev.quantity) boothBest.set(row.boothName, row)
  }
  const perBoothBest = Array.from(boothBest.entries())
    .map(([boothName, row]) => ({
      boothName,
      menuName: row.menuName,
      quantity: row.quantity,
    }))
    .sort((a, b) => b.quantity - a.quantity)

  // 주문 안 된 메뉴 — food_menus 전체에서 한 번도 안 팔린 것
  const soldKeys = new Set(allRanked.map((r) => `${r.boothName}__${r.menuName}`))
  const boothNameById = new Map<string, string>()
  for (const o of data.orders) {
    if (o.booth_id) boothNameById.set(o.booth_id, o.booth_name)
  }
  const unsoldMenus: { boothName: string; menuName: string }[] = []
  for (const m of data.allMenus) {
    const bName = boothNameById.get(m.booth_id) ?? '-'
    const key = `${bName}__${m.name}`
    if (!soldKeys.has(key)) unsoldMenus.push({ boothName: bName, menuName: m.name })
  }

  return { byQuantity, byRevenue, perBoothBest, unsoldMenus }
}

// ─── 5. 고객 분석 ────────────────────────────────

export interface CustomerStats {
  totalUniquePhones: number
  revisitCount: number
  revisitRate: number
  distribution: { label: string; customers: number }[]
  topRepeaters: { phoneMasked: string; visits: number; totalAmount: number }[]
}

function maskPhone(phone: string): string {
  // 01012345678 또는 010-1234-5678 → 010-****-5678
  // DB 저장 포맷은 하이픈 없음 (normalizePhone 통과), 표시용 마스킹.
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length >= 8) {
    return `${cleaned.slice(0, 3)}-****-${cleaned.slice(-4)}`
  }
  return phone
}

export function calcCustomerStats(data: StatsRawData): CustomerStats {
  const byPhone = new Map<string, { visits: number; totalAmount: number }>()
  for (const p of data.payments) {
    if (p.status !== 'paid') continue
    // 과거 하이픈 포함 row 와 신규 하이픈 없는 row 가 섞여 있어도 동일인으로 집계
    const key = p.phone.replace(/\D/g, '')
    const row = byPhone.get(key) ?? { visits: 0, totalAmount: 0 }
    row.visits += 1
    row.totalAmount += p.total_amount - (p.refunded_amount ?? 0)
    byPhone.set(key, row)
  }

  const totalUniquePhones = byPhone.size
  let revisitCount = 0
  const buckets = { once: 0, twice: 0, three: 0, four_plus: 0 }
  for (const row of byPhone.values()) {
    if (row.visits >= 2) revisitCount += 1
    if (row.visits === 1) buckets.once += 1
    else if (row.visits === 2) buckets.twice += 1
    else if (row.visits === 3) buckets.three += 1
    else buckets.four_plus += 1
  }
  const distribution = [
    { label: '1회', customers: buckets.once },
    { label: '2회', customers: buckets.twice },
    { label: '3회', customers: buckets.three },
    { label: '4회+', customers: buckets.four_plus },
  ]
  const topRepeaters = Array.from(byPhone.entries())
    .map(([phone, row]) => ({
      phoneMasked: maskPhone(phone),
      visits: row.visits,
      totalAmount: row.totalAmount,
    }))
    .filter((r) => r.visits >= 2)
    .sort((a, b) => b.visits - a.visits || b.totalAmount - a.totalAmount)
    .slice(0, 5)

  return {
    totalUniquePhones,
    revisitCount,
    revisitRate: totalUniquePhones > 0 ? revisitCount / totalUniquePhones : 0,
    distribution,
    topRepeaters,
  }
}

// ─── 6. 결제 행동 ────────────────────────────────

export interface PaymentBehaviorStats {
  ticketSizeBuckets: { label: string; count: number }[]
  successRate: {
    paid: number
    cancelled: number
    successPct: number
  }
}

export function calcPaymentBehaviorStats(data: StatsRawData): PaymentBehaviorStats {
  // 객단가 분포 (paid 만, 부분환불 차감)
  const buckets = { b10: 0, b20: 0, b30: 0, b30plus: 0 }
  for (const p of data.payments) {
    if (p.status !== 'paid') continue
    const net = p.total_amount - (p.refunded_amount ?? 0)
    if (net < 10_000) buckets.b10 += 1
    else if (net < 20_000) buckets.b20 += 1
    else if (net < 30_000) buckets.b30 += 1
    else buckets.b30plus += 1
  }
  const ticketSizeBuckets = [
    { label: '- 1만원', count: buckets.b10 },
    { label: '1–2만원', count: buckets.b20 },
    { label: '2–3만원', count: buckets.b30 },
    { label: '3만원+', count: buckets.b30plus },
  ]

  // 결제 성공률 — pending 은 테스트/이탈 성격이라 계산에서 제외
  let paid = 0
  let cancelled = 0
  for (const p of data.payments) {
    if (p.status === 'paid') paid += 1
    else if (p.status === 'cancelled') cancelled += 1
  }
  const denom = paid + cancelled
  return {
    ticketSizeBuckets,
    successRate: {
      paid,
      cancelled,
      successPct: denom > 0 ? Math.round((paid / denom) * 1000) / 10 : 0,
    },
  }
}

// ─── 날짜 유틸 ────────────────────────────────────

