import { supabase } from './supabase'
import { fetchAllPages } from './supabasePaginate'

/**
 * 정산관리 라이브러리.
 *
 * 정책 (v4 핸드오프 — meal_voucher_v4_stats.md §2):
 *  - 매장 매출 기준 = subtotal (메뉴 정가 합)
 *  - Toss 수수료(매장 부담) = subtotal × 3.74% (모든 매출 / 식권 포함)
 *  - 매장 송금 = subtotal × (1 - 0.0374) = subtotal × 0.9626
 *  - 운영자 PG 실입금 = user_paid × 0.9626
 *  - 운영자 부담 = 쿠폰 + 식권 = subtotal − user_paid
 *  - 운영자 순지출 = 매장 송금 − 운영자 PG 입금 = (subtotal − user_paid) × 0.9626
 *  - 절사 없음 (소수점 그대로)
 *  - 환불(`status='cancelled'`) 정산 제외
 *  - 일별 그룹 = payments.paid_at KST
 */

export const TOSS_FEE_RATE = 0.0374 // 3.4 + 0.34 = 3.74%
export const PAYOUT_RATE = 1 - TOSS_FEE_RATE // 0.9626

/**
 * 정산 한 행 — 일별/매장별 그룹 단위로 동일 schema 사용.
 * 정산 페이지의 row + 엑셀 export row 의 source of truth.
 */
export interface SettlementRow {
  /** 그룹 식별자 — 'YYYY-MM-DD' (일별) 또는 boothId (매장별) */
  groupKey: string
  /** 표시 라벨 — 날짜 또는 부스명 */
  label: string
  /** 결제 건수 (payment 단위) */
  paymentCount: number
  /** 부스 주문 건수 (orders 단위) */
  orderCount: number
  /** 매장 매출 (= SUM(subtotal)) */
  menuSales: number
  /** 식권 사용액 합계 */
  voucherUsed: number
  /** 식권 잔액 소멸 합계 */
  voucherBurned: number
  /** 쿠폰 차감액 합계 — payments.discount_amount 기준 */
  couponDiscount: number
  /** PG 거래액 합계 (= user_paid 합 = payments.total_amount) — pgPaidAmount + helpDeskPaidAmount */
  pgAmount: number
  /** PG 결제 합계 (payment_method='pg' 의 user_paid 합) — 운영자 PG 계좌 입금 대상 */
  pgPaidAmount: number
  /** 헬프데스크 결제 합계 (payment_method ≠ 'pg' 의 user_paid 합) — 운영자 헬프데스크 계좌 입금 대상 */
  helpDeskPaidAmount: number
  /** Toss 수수료 = menuSales × 0.0374 */
  tossFee: number
  /** 매장 송금액 = menuSales × 0.9626 */
  boothPayout: number
  /** 운영자 PG 실입금 = pgPaidAmount × 0.9626 (Toss 수수료 차감 후) */
  organizerPgIn: number
  /** 운영자 헬프데스크 실입금 = helpDeskPaidAmount × 1.0 (단말기 수수료는 후정산, 매출 그대로 잡음) */
  organizerHelpDeskIn: number
  /** 운영자 순지출 = boothPayout − organizerPgIn − organizerHelpDeskIn
   *  양수: 운영자 부담 (쿠폰/식권), 음수: 운영자 마진 (PG 외 매출의 매장 수수료 차감분) */
  organizerLoss: number
}

/** 정산 totals — 합계 행. SettlementRow 와 동일 schema (groupKey/label만 다름) */
export type SettlementTotals = SettlementRow

/** KST 'YYYY-MM-DD' 변환 — Intl.DateTimeFormat 사용 */
function toKstDateString(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

// ─── 원본 fetch ────────────────────────────────────────────────

interface RawPayment {
  id: string
  paid_at: string | null
  total_amount: number
  discount_amount: number
  status: 'pending' | 'paid' | 'cancelled'
  coupon_id: string | null
  payment_method: 'pg' | 'external_card' | 'cash' | 'voucher_only' | null
}

interface RawOrder {
  id: string
  payment_id: string
  booth_id: string | null
  booth_name: string
  subtotal: number
  voucher_consumed: number
  voucher_burned: number
  status: 'pending' | 'paid' | 'confirmed' | 'completed' | 'cancelled'
}

export interface SettlementRawData {
  payments: RawPayment[]
  /** cancelled 포함 전체 — aggregateBy* 함수에서 status 분기로 처리. */
  orders: RawOrder[]
}

export interface SettlementFilters {
  /** KST 'YYYY-MM-DD' (inclusive) — paid_at 기준 */
  dateFrom?: string
  dateTo?: string
}

/** 정산 페이지가 한 번에 읽는 raw 데이터 — paid 상태 + 환불 제외.
 *  cancelled 부스의 voucher 사용분은 별도 합산 → 액면가 정합성 유지 (운영자 손실로 burned 처리) */
export async function fetchSettlementRawData(
  filters: SettlementFilters = {},
): Promise<SettlementRawData> {
  // PostgREST max-rows(1000) 자동 절단 회피 — 페이지네이션. 행사일 paid 결제가
  // 1000+ 누적 시 단일 fetch 로 마지막 페이지 누락되어 정산 매출 누락 발생.
  const paymentRows = await fetchAllPages<RawPayment>((from, to) => {
    let pq = supabase
      .from('payments')
      .select('id, paid_at, total_amount, discount_amount, status, coupon_id, payment_method')
      .eq('status', 'paid')
      .order('paid_at', { ascending: true })
      .range(from, to)
    if (filters.dateFrom) {
      pq = pq.gte('paid_at', new Date(`${filters.dateFrom}T00:00:00+09:00`).toISOString())
    }
    if (filters.dateTo) {
      pq = pq.lt('paid_at', new Date(`${filters.dateTo}T24:00:00+09:00`).toISOString())
    }
    return pq
  })
  if (paymentRows.length === 0) return { payments: [], orders: [] }

  const paymentIds = paymentRows.map((p) => p.id)
  // cancelled 포함 전체 — aggregate 단계에서 status 분기. cancelled 부스의 voucher 는
  // 매장 매출/송금엔 미포함이지만 식권 액면가 정합성을 위해 burned 로 회수.
  // PostgREST `in(...)` 는 URL 길이 한계(~8KB)가 있어 UUID 약 200건이면 400. 청크 분할.
  // 청크 1개 안에서도 1000 초과 가능 — fetchAllPages 로 페이지네이션.
  const orders: RawOrder[] = []
  for (const chunk of chunkArray(paymentIds, IN_CHUNK_SIZE)) {
    const part = await fetchAllPages<RawOrder>((from, to) =>
      supabase
        .from('orders')
        .select('id, payment_id, booth_id, booth_name, subtotal, voucher_consumed, voucher_burned, status')
        .in('payment_id', chunk)
        .range(from, to),
    )
    orders.push(...part)
  }

  return {
    payments: paymentRows,
    orders,
  }
}

/** PostgREST `.in()` URL 길이 한계 회피용 청크 크기 — UUID 36자 × 150 ≈ 5.5KB.
 *  헤더/select 컬럼 포함해도 8KB 안전 마진. */
const IN_CHUNK_SIZE = 150

function chunkArray<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return []
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ─── 행 계산 (수식 단일 진입점) ─────────────────────────────────

/**
 * 그룹의 raw 합계 (subtotal/voucher/coupon/pgAmount/주문수) 가 주어지면
 * 정산 룰 적용해서 SettlementRow 의 파생 필드 (tossFee/payout/...) 채움.
 */
function computeDerived(
  base: Pick<
    SettlementRow,
    | 'groupKey'
    | 'label'
    | 'paymentCount'
    | 'orderCount'
    | 'menuSales'
    | 'voucherUsed'
    | 'voucherBurned'
    | 'couponDiscount'
    | 'pgAmount'
    | 'pgPaidAmount'
    | 'helpDeskPaidAmount'
  >,
): SettlementRow {
  const tossFee = base.menuSales * TOSS_FEE_RATE
  const boothPayout = base.menuSales * PAYOUT_RATE
  // 운영자 PG 실입금: cookiepay 가 Toss 수수료 차감 후 입금
  const organizerPgIn = base.pgPaidAmount * PAYOUT_RATE
  // 운영자 헬프데스크 실입금: 단말기/현금 수수료는 별도(후정산)이라 매출 그대로 잡음
  const organizerHelpDeskIn = base.helpDeskPaidAmount
  // 매장에는 결제수단 무관 0.9626 일괄 송금하므로, PG 외 매출의 0.0374 만큼은
  // 운영자가 매장 수수료를 가상 차감해 송금한 셈 → organizerLoss 가 음수면 운영자 마진.
  const organizerLoss = boothPayout - organizerPgIn - organizerHelpDeskIn
  return {
    ...base,
    tossFee,
    boothPayout,
    organizerPgIn,
    organizerHelpDeskIn,
    organizerLoss,
  }
}

// ─── 일별 집계 (전체 정산 탭) ──────────────────────────────────

export function aggregateByDay(raw: SettlementRawData): SettlementRow[] {
  // payment_id → date 매핑
  const paymentDate = new Map<string, string>()
  const paymentDiscount = new Map<string, number>()
  const paymentPgAmount = new Map<string, number>()
  const paymentMethod = new Map<string, RawPayment['payment_method']>()
  for (const p of raw.payments) {
    if (!p.paid_at) continue
    const d = toKstDateString(p.paid_at)
    paymentDate.set(p.id, d)
    paymentDiscount.set(p.id, p.discount_amount)
    paymentPgAmount.set(p.id, p.total_amount)
    paymentMethod.set(p.id, p.payment_method)
  }

  // 날짜별 누적 — cancelled 부스는 매장매출/주문수 제외하지만
  // voucher_consumed 는 burned 로 옮겨 액면가 정합성 유지 (운영자 손실 처리).
  type Bucket = {
    paymentIds: Set<string>
    orderCount: number
    menuSales: number
    voucherUsed: number
    voucherBurned: number
  }
  const byDate = new Map<string, Bucket>()
  for (const o of raw.orders) {
    const d = paymentDate.get(o.payment_id)
    if (!d) continue
    const b = byDate.get(d) ?? {
      paymentIds: new Set<string>(),
      orderCount: 0,
      menuSales: 0,
      voucherUsed: 0,
      voucherBurned: 0,
    }
    b.paymentIds.add(o.payment_id)
    if (o.status === 'cancelled') {
      // 부스 매장 매출엔 미포함. 식권은 회수 불가라 burned 로 누적.
      b.voucherBurned += o.voucher_consumed + o.voucher_burned
    } else {
      b.orderCount += 1
      b.menuSales += o.subtotal
      b.voucherUsed += o.voucher_consumed
      b.voucherBurned += o.voucher_burned
    }
    byDate.set(d, b)
  }

  const rows: SettlementRow[] = []
  for (const [date, b] of [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    let couponDiscount = 0
    let pgAmount = 0
    let pgPaidAmount = 0
    let helpDeskPaidAmount = 0
    for (const pid of b.paymentIds) {
      const amt = paymentPgAmount.get(pid) ?? 0
      couponDiscount += paymentDiscount.get(pid) ?? 0
      pgAmount += amt
      if (paymentMethod.get(pid) === 'pg') pgPaidAmount += amt
      else helpDeskPaidAmount += amt
    }
    rows.push(
      computeDerived({
        groupKey: date,
        label: date,
        paymentCount: b.paymentIds.size,
        orderCount: b.orderCount,
        menuSales: b.menuSales,
        voucherUsed: b.voucherUsed,
        voucherBurned: b.voucherBurned,
        couponDiscount,
        pgAmount,
        pgPaidAmount,
        helpDeskPaidAmount,
      }),
    )
  }
  return rows
}

// ─── 매장별 집계 (매장별 정산 탭) ──────────────────────────────

export function aggregateByBooth(raw: SettlementRawData): SettlementRow[] {
  const paymentPgAmount = new Map<string, number>()
  const paymentDiscount = new Map<string, number>()
  const paymentMethod = new Map<string, RawPayment['payment_method']>()
  const paymentOrderCount = new Map<string, number>() // payment 별 order 수 (PG 비례 분배용)
  for (const p of raw.payments) {
    paymentPgAmount.set(p.id, p.total_amount)
    paymentDiscount.set(p.id, p.discount_amount)
    paymentMethod.set(p.id, p.payment_method)
  }
  for (const o of raw.orders) {
    paymentOrderCount.set(o.payment_id, (paymentOrderCount.get(o.payment_id) ?? 0) + 1)
  }

  type Bucket = {
    boothId: string
    boothName: string
    paymentIds: Set<string>
    orderCount: number
    menuSales: number
    voucherUsed: number
    voucherBurned: number
    /** 부스별 PG 거래액 분배 (payment 의 total_amount 를 부스 subtotal 비율로) */
    pgAmountAccum: number
    /** 부스별 쿠폰 차감 분배 */
    couponDiscountAccum: number
    /** 부스별 PG 결제 (method='pg') 분배 */
    pgPaidAccum: number
    /** 부스별 헬프데스크 결제 (method ≠ 'pg') 분배 */
    helpDeskPaidAccum: number
  }
  const byBooth = new Map<string, Bucket>()

  // payment 단위로 부스 subtotal 합과 user_paid/discount 분배 비율 계산
  // user_paid 의 부스별 분배 = subtotal 비례
  // 단, 한 payment 에 여러 부스가 있을 때만 비례 분배. 한 부스만 있으면 그대로.
  const paymentSubtotalSum = new Map<string, number>()
  for (const o of raw.orders) {
    paymentSubtotalSum.set(
      o.payment_id,
      (paymentSubtotalSum.get(o.payment_id) ?? 0) + o.subtotal,
    )
  }

  for (const o of raw.orders) {
    // 매장별 정산은 cancelled 부스 제외 — 매출 0, 송금 0, 식권은 운영자 손실 (전체 합계에서만 잡힘).
    if (o.status === 'cancelled') continue
    const boothId = o.booth_id ?? `__unknown__:${o.booth_name}`
    const b = byBooth.get(boothId) ?? {
      boothId,
      boothName: o.booth_name,
      paymentIds: new Set<string>(),
      orderCount: 0,
      menuSales: 0,
      voucherUsed: 0,
      voucherBurned: 0,
      pgAmountAccum: 0,
      couponDiscountAccum: 0,
      pgPaidAccum: 0,
      helpDeskPaidAccum: 0,
    }
    b.paymentIds.add(o.payment_id)
    b.orderCount += 1
    b.menuSales += o.subtotal
    b.voucherUsed += o.voucher_consumed
    b.voucherBurned += o.voucher_burned

    // 부스 비례 분배
    const pSubtotalSum = paymentSubtotalSum.get(o.payment_id) ?? 0
    const ratio = pSubtotalSum > 0 ? o.subtotal / pSubtotalSum : 0
    const pgAmtShare = (paymentPgAmount.get(o.payment_id) ?? 0) * ratio
    b.pgAmountAccum += pgAmtShare
    b.couponDiscountAccum += (paymentDiscount.get(o.payment_id) ?? 0) * ratio
    if (paymentMethod.get(o.payment_id) === 'pg') b.pgPaidAccum += pgAmtShare
    else b.helpDeskPaidAccum += pgAmtShare

    byBooth.set(boothId, b)
  }

  const rows: SettlementRow[] = []
  for (const b of [...byBooth.values()].sort((a, b) => b.menuSales - a.menuSales)) {
    rows.push(
      computeDerived({
        groupKey: b.boothId,
        label: b.boothName,
        paymentCount: b.paymentIds.size,
        orderCount: b.orderCount,
        menuSales: b.menuSales,
        voucherUsed: b.voucherUsed,
        voucherBurned: b.voucherBurned,
        couponDiscount: b.couponDiscountAccum,
        pgAmount: b.pgAmountAccum,
        pgPaidAmount: b.pgPaidAccum,
        helpDeskPaidAmount: b.helpDeskPaidAccum,
      }),
    )
  }
  return rows
}

// ─── 합계 ──────────────────────────────────────────────────────

export function calcTotals(rows: SettlementRow[], label = '합계'): SettlementTotals {
  const sum = (key: keyof SettlementRow) =>
    rows.reduce((s, r) => s + (typeof r[key] === 'number' ? (r[key] as number) : 0), 0)
  return computeDerived({
    groupKey: '__total__',
    label,
    paymentCount: sum('paymentCount'),
    orderCount: sum('orderCount'),
    menuSales: sum('menuSales'),
    voucherUsed: sum('voucherUsed'),
    voucherBurned: sum('voucherBurned'),
    couponDiscount: sum('couponDiscount'),
    pgAmount: sum('pgAmount'),
    pgPaidAmount: sum('pgPaidAmount'),
    helpDeskPaidAmount: sum('helpDeskPaidAmount'),
  })
}

// ─── 정합성 검증 ───────────────────────────────────────────────

export interface IntegrityCheck {
  ok: boolean
  /** 매장 송금 합계 */
  boothPayoutTotal: number
  /** 운영자 PG 실입금 합계 */
  organizerPgInTotal: number
  /** 운영자 헬프데스크 실입금 합계 */
  organizerHelpDeskInTotal: number
  /** 운영자 순지출 합계 */
  organizerLossTotal: number
  /** 검증식 좌변 = 매장 송금 */
  lhs: number
  /** 검증식 우변 = PG입금 + 헬프데스크입금 + 운영자순지출 */
  rhs: number
  /** 차액 (|lhs − rhs|) — 부동소수 오차 0.5원 이내면 OK */
  diff: number
}

export function checkIntegrity(totals: SettlementTotals): IntegrityCheck {
  const lhs = totals.boothPayout
  const rhs = totals.organizerPgIn + totals.organizerHelpDeskIn + totals.organizerLoss
  const diff = Math.abs(lhs - rhs)
  return {
    ok: diff < 0.5,
    boothPayoutTotal: totals.boothPayout,
    organizerPgInTotal: totals.organizerPgIn,
    organizerHelpDeskInTotal: totals.organizerHelpDeskIn,
    organizerLossTotal: totals.organizerLoss,
    lhs,
    rhs,
    diff,
  }
}

// ─── 표시용 포맷 ───────────────────────────────────────────────

/** 절사 없이 소수점 2자리까지 표시 (정책: "절사 없이 그대로 반영") */
export function fmtMoney(n: number): string {
  // 정수면 소수점 생략, 아니면 소수점 1~2자리
  if (Number.isInteger(n)) return `${n.toLocaleString()}원`
  return `${n.toLocaleString('ko-KR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })}원`
}

// ─── 단일 매장 정산서 (주문 단위 명세) ─────────────────────────

export interface BoothSettlementDetailRow {
  orderId: string
  orderNumber: string
  paidAt: string
  paymentMethod: 'pg' | 'external_card' | 'cash' | 'voucher_only'
  externalReceiptNo: string | null
  isTakeout: boolean
  /** "{대표 메뉴} × {수량} 외 N" 형태 요약 */
  menuSummary: string
  /** 매장 금액 (메뉴 정가 합) */
  subtotal: number
  voucherConsumed: number
  voucherBurned: number
  /** 부스 비율 분배 쿠폰 차감 (aggregateByBooth 와 동일 룰) */
  couponShare: number
  /** 부스 비율 분배 PG 거래액 */
  pgShare: number
  /** 매장 송금액 = subtotal × PAYOUT_RATE */
  payout: number
}

/**
 * 단일 매장의 정산 명세 (주문 단위) 조회.
 * aggregateByBooth 와 동일한 부스 비율 분배 룰을 사용해서
 * 주문 단위 합이 매장별 정산표 행과 일치하도록 보장.
 */
export async function fetchBoothSettlementDetail(
  boothId: string,
  filters: SettlementFilters = {},
): Promise<BoothSettlementDetailRow[]> {
  type PaymentLite = {
    id: string
    paid_at: string | null
    total_amount: number
    discount_amount: number
    payment_method: BoothSettlementDetailRow['paymentMethod'] | null
    external_receipt_no: string | null
  }
  // PostgREST max-rows(1000) 자동 절단 회피 — 페이지네이션.
  const payments = await fetchAllPages<PaymentLite>((from, to) => {
    let pq = supabase
      .from('payments')
      .select('id, paid_at, total_amount, discount_amount, payment_method, external_receipt_no, status')
      .eq('status', 'paid')
      .order('paid_at', { ascending: true })
      .range(from, to)
    if (filters.dateFrom) {
      pq = pq.gte('paid_at', new Date(`${filters.dateFrom}T00:00:00+09:00`).toISOString())
    }
    if (filters.dateTo) {
      pq = pq.lt('paid_at', new Date(`${filters.dateTo}T24:00:00+09:00`).toISOString())
    }
    return pq
  })
  if (payments.length === 0) return []

  const paymentMap = new Map<string, PaymentLite>(payments.map((p) => [p.id, p]))
  const paymentIds = [...paymentMap.keys()]

  // 같은 결제 안에 다른 부스가 있을 수 있어서 비율 계산을 위해 모든 부스 주문 fetch.
  // IN URL 길이 한계 회피 — 청크 분할 + 청크당 1000 초과 회피 페이지네이션.
  type OrderLiteRaw = {
    id: string
    payment_id: string
    booth_id: string | null
    order_number: string
    subtotal: number
    voucher_consumed: number
    voucher_burned: number
    is_takeout: boolean | null
    status: string
  }
  const orders: OrderLiteRaw[] = []
  for (const chunk of chunkArray(paymentIds, IN_CHUNK_SIZE)) {
    const part = await fetchAllPages<OrderLiteRaw>((from, to) =>
      supabase
        .from('orders')
        .select(
          'id, payment_id, booth_id, order_number, subtotal, voucher_consumed, voucher_burned, is_takeout, status',
        )
        .in('payment_id', chunk)
        .neq('status', 'cancelled')
        .range(from, to),
    )
    orders.push(...part)
  }
  if (orders.length === 0) return []

  const orderRows = orders

  const paymentSubtotalSum = new Map<string, number>()
  for (const o of orderRows) {
    paymentSubtotalSum.set(
      o.payment_id,
      (paymentSubtotalSum.get(o.payment_id) ?? 0) + o.subtotal,
    )
  }

  const myOrders = orderRows.filter((o) => o.booth_id === boothId)
  if (myOrders.length === 0) return []

  // 메뉴 요약을 위해 order_items — 부스 단독 주문이라도 청크 한계 안전 마진.
  const myOrderIds = myOrders.map((o) => o.id)
  type ItemLite = { order_id: string; menu_name: string; quantity: number }
  const items: ItemLite[] = []
  for (const chunk of chunkArray(myOrderIds, IN_CHUNK_SIZE)) {
    const { data } = await supabase
      .from('order_items')
      .select('order_id, menu_name, quantity')
      .in('order_id', chunk)
    if (data) items.push(...(data as ItemLite[]))
  }
  const itemsByOrder = new Map<string, { menu_name: string; quantity: number }[]>()
  for (const it of items) {
    const list = itemsByOrder.get(it.order_id) ?? []
    list.push({ menu_name: it.menu_name, quantity: it.quantity })
    itemsByOrder.set(it.order_id, list)
  }

  const rows: BoothSettlementDetailRow[] = []
  for (const o of myOrders) {
    const p = paymentMap.get(o.payment_id)
    if (!p || !p.paid_at) continue
    const pSubtotal = paymentSubtotalSum.get(o.payment_id) ?? 0
    const ratio = pSubtotal > 0 ? o.subtotal / pSubtotal : 0
    const its = itemsByOrder.get(o.id) ?? []
    const menuSummary =
      its.length === 0
        ? '—'
        : its.length === 1
          ? `${its[0].menu_name} × ${its[0].quantity}`
          : `${its[0].menu_name} × ${its[0].quantity} 외 ${its.length - 1}`

    rows.push({
      orderId: o.id,
      orderNumber: o.order_number,
      paidAt: p.paid_at,
      paymentMethod: (p.payment_method ?? 'pg') as BoothSettlementDetailRow['paymentMethod'],
      externalReceiptNo: p.external_receipt_no,
      isTakeout: o.is_takeout ?? false,
      menuSummary,
      subtotal: o.subtotal,
      voucherConsumed: o.voucher_consumed,
      voucherBurned: o.voucher_burned,
      couponShare: (p.discount_amount ?? 0) * ratio,
      pgShare: (p.total_amount ?? 0) * ratio,
      payout: o.subtotal * PAYOUT_RATE,
    })
  }

  rows.sort((a, b) => b.paidAt.localeCompare(a.paidAt))
  return rows
}
