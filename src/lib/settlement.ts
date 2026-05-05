import { supabase } from './supabase'

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
  /** PG 거래액 합계 (= user_paid 합 = payments.total_amount) */
  pgAmount: number
  /** Toss 수수료 = menuSales × 0.0374 */
  tossFee: number
  /** 매장 송금액 = menuSales × 0.9626 */
  boothPayout: number
  /** 운영자 PG 실입금 = pgAmount × 0.9626 */
  organizerPgIn: number
  /** 운영자 순지출 = boothPayout − organizerPgIn */
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
  orders: RawOrder[]
}

export interface SettlementFilters {
  /** KST 'YYYY-MM-DD' (inclusive) — paid_at 기준 */
  dateFrom?: string
  dateTo?: string
}

/** 정산 페이지가 한 번에 읽는 raw 데이터 — paid 상태 + 환불 제외 */
export async function fetchSettlementRawData(
  filters: SettlementFilters = {},
): Promise<SettlementRawData> {
  let pq = supabase
    .from('payments')
    .select('id, paid_at, total_amount, discount_amount, status, coupon_id')
    .eq('status', 'paid')
  if (filters.dateFrom) {
    pq = pq.gte('paid_at', new Date(`${filters.dateFrom}T00:00:00+09:00`).toISOString())
  }
  if (filters.dateTo) {
    pq = pq.lt('paid_at', new Date(`${filters.dateTo}T24:00:00+09:00`).toISOString())
  }
  const { data: payments, error: pErr } = await pq
  if (pErr) throw pErr
  const paymentRows = (payments ?? []) as RawPayment[]
  if (paymentRows.length === 0) return { payments: [], orders: [] }

  const paymentIds = paymentRows.map((p) => p.id)
  // 부스 주문 — payments.id 매칭 + 환불(cancelled) 제외
  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('id, payment_id, booth_id, booth_name, subtotal, voucher_consumed, voucher_burned, status')
    .in('payment_id', paymentIds)
    .neq('status', 'cancelled')
  if (oErr) throw oErr

  return {
    payments: paymentRows,
    orders: (orders ?? []) as RawOrder[],
  }
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
  >,
): SettlementRow {
  const tossFee = base.menuSales * TOSS_FEE_RATE
  const boothPayout = base.menuSales * PAYOUT_RATE
  const organizerPgIn = base.pgAmount * PAYOUT_RATE
  const organizerLoss = boothPayout - organizerPgIn
  return {
    ...base,
    tossFee,
    boothPayout,
    organizerPgIn,
    organizerLoss,
  }
}

// ─── 일별 집계 (전체 정산 탭) ──────────────────────────────────

export function aggregateByDay(raw: SettlementRawData): SettlementRow[] {
  // payment_id → date 매핑
  const paymentDate = new Map<string, string>()
  const paymentDiscount = new Map<string, number>()
  const paymentPgAmount = new Map<string, number>()
  for (const p of raw.payments) {
    if (!p.paid_at) continue
    const d = toKstDateString(p.paid_at)
    paymentDate.set(p.id, d)
    paymentDiscount.set(p.id, p.discount_amount)
    paymentPgAmount.set(p.id, p.total_amount)
  }

  // 날짜별 누적
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
    b.orderCount += 1
    b.menuSales += o.subtotal
    b.voucherUsed += o.voucher_consumed
    b.voucherBurned += o.voucher_burned
    byDate.set(d, b)
  }

  const rows: SettlementRow[] = []
  for (const [date, b] of [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    let couponDiscount = 0
    let pgAmount = 0
    for (const pid of b.paymentIds) {
      couponDiscount += paymentDiscount.get(pid) ?? 0
      pgAmount += paymentPgAmount.get(pid) ?? 0
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
      }),
    )
  }
  return rows
}

// ─── 매장별 집계 (매장별 정산 탭) ──────────────────────────────

export function aggregateByBooth(raw: SettlementRawData): SettlementRow[] {
  const paymentPgAmount = new Map<string, number>()
  const paymentDiscount = new Map<string, number>()
  const paymentOrderCount = new Map<string, number>() // payment 별 order 수 (PG 비례 분배용)
  for (const p of raw.payments) {
    paymentPgAmount.set(p.id, p.total_amount)
    paymentDiscount.set(p.id, p.discount_amount)
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
    }
    b.paymentIds.add(o.payment_id)
    b.orderCount += 1
    b.menuSales += o.subtotal
    b.voucherUsed += o.voucher_consumed
    b.voucherBurned += o.voucher_burned

    // 부스 비례 분배
    const pSubtotalSum = paymentSubtotalSum.get(o.payment_id) ?? 0
    const ratio = pSubtotalSum > 0 ? o.subtotal / pSubtotalSum : 0
    b.pgAmountAccum += (paymentPgAmount.get(o.payment_id) ?? 0) * ratio
    b.couponDiscountAccum += (paymentDiscount.get(o.payment_id) ?? 0) * ratio

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
  })
}

// ─── 정합성 검증 ───────────────────────────────────────────────

export interface IntegrityCheck {
  ok: boolean
  /** 매장 송금 합계 */
  boothPayoutTotal: number
  /** 운영자 PG 실입금 합계 */
  organizerPgInTotal: number
  /** 운영자 순지출 합계 */
  organizerLossTotal: number
  /** 검증식 좌변 = 매장 송금 */
  lhs: number
  /** 검증식 우변 = PG입금 + 운영자순지출 */
  rhs: number
  /** 차액 (|lhs − rhs|) — 부동소수 오차 0.5원 이내면 OK */
  diff: number
}

export function checkIntegrity(totals: SettlementTotals): IntegrityCheck {
  const lhs = totals.boothPayout
  const rhs = totals.organizerPgIn + totals.organizerLoss
  const diff = Math.abs(lhs - rhs)
  return {
    ok: diff < 0.5,
    boothPayoutTotal: totals.boothPayout,
    organizerPgInTotal: totals.organizerPgIn,
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
