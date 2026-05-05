import { supabase } from './supabase'
import { normalizePhone } from './phone'
import type { Coupon } from '@/types/database'

/**
 * 쿠폰 라이브러리 — 수동 발급 / 목록 조회 / client-side validate 호출 / 집계.
 *
 * 정책
 *  - 고정 금액 할인 (퍼센트 아님)
 *  - 1결제당 1쿠폰
 *  - 최소 주문 금액 기본 10,000원 (coupons.min_order_amount, 발급시 조정 가능)
 *  - 만료 = expires_at < now() — status 는 active 유지하되 쿼리 시점에 판정
 *  - 사용 완료 전이는 결제 confirm 시점에 server-side 에서 원자 전이
 *    (orders.ts markPaymentPaid 에서 처리)
 *
 * 쿠폰 코드 포맷: MS-XXXXXX  (대문자 영숫자 6자리, 혼동 글자 제외 0/O/1/I)
 */

// ─── 코드 생성 ────────────────────────────────────────────────

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ' // 0/1/O/I 제외

function randomCode(): string {
  let s = ''
  for (let i = 0; i < 6; i += 1) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return `MS-${s}`
}

/** 충돌 나지 않는 unique 코드 생성 (최대 5회 재시도) */
async function generateUniqueCouponCode(): Promise<string> {
  for (let i = 0; i < 5; i += 1) {
    const code = randomCode()
    const { data } = await supabase
      .from('coupons')
      .select('id')
      .eq('code', code)
      .maybeSingle()
    if (!data) return code
  }
  throw new Error('쿠폰 코드 생성 실패 — 잠시 후 다시 시도해주세요')
}

/**
 * N개 unique 코드 한 번에 생성. 충돌 시 재추첨.
 * 50건 일괄 발급 시 사용. sequential check 라 N=50 기준 ≤ 50 회 select.
 */
async function generateUniqueCouponCodes(count: number): Promise<string[]> {
  const out: string[] = []
  const seen = new Set<string>()
  while (out.length < count) {
    const code = await generateUniqueCouponCode()
    if (seen.has(code)) continue
    seen.add(code)
    out.push(code)
  }
  return out
}

// ─── source enum (v1 스키마) ─────────────────────────────────

/** 어드민 수동 발급용 할인쿠폰 source */
export type DiscountSource = 'manual_compensation' | 'manual_external'

/** 어드민 수동 발급용 식권 source */
export type VoucherSource =
  | 'voucher_participant'
  | 'voucher_staff'
  | 'voucher_vip'
  | 'voucher_other'

export type CouponSource =
  | 'auto_survey'
  | DiscountSource
  | VoucherSource

// ─── 설문 자동 발급 만료일 ──────────────────────────────────
// 축제 종료 시점 — 2026-05-17 23:59:59 KST 로 하드코딩. 활성 festival
// 조회 lib 가 들어오면 이 상수를 동적으로 교체.
export const SURVEY_COUPON_EXPIRES_AT = new Date(
  '2026-05-17T23:59:59+09:00',
).toISOString()

// 설문 쿠폰 기본값
const SURVEY_COUPON_DISCOUNT = 2000
const SURVEY_COUPON_MIN_ORDER = 10000

/** 설문 자동 발급 중복 에러 — surveys 저장 이전에 throw 해서 호출부에서 팝업 */
export class DuplicateSurveyCouponError extends Error {
  constructor() {
    super('이미 쿠폰이 발급된 번호입니다')
    this.name = 'DuplicateSurveyCouponError'
  }
}

// ─── 전화번호 기반 조회 (체크아웃 자동 적용) ────────────────

/**
 * 전화번호로 지금 사용 가능한 쿠폰 1장 조회.
 *  - status='active'
 *  - expires_at > now()
 *  - 가장 최근 생성된 1장
 * 수동 발급 쿠폰이 여러 장 있을 수 있으므로 최신 1장만 반환.
 */
export async function fetchAvailableCouponByPhone(
  phone: string,
): Promise<Coupon | null> {
  if (!phone) return null
  const { data, error } = await supabase
    .from('coupons')
    .select()
    .eq('phone', normalizePhone(phone))
    .eq('type', 'discount')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

// ─── 보유 쿠폰 복수 조회 (체크아웃 라디오 리스트) ────────────

/** 결제 화면 라디오용 보유 쿠폰 옵션 */
export type AvailableCouponOption =
  | {
      kind: 'discount'
      /** 사용할 row id */
      couponId: string
      code: string
      discount: number
      minOrderAmount: number
    }
  | {
      kind: 'voucher'
      /** 같은 (amount, source) 그룹 중 FIFO 첫 row id (= 선택 시 실제 차감) */
      couponId: string
      code: string
      amount: number
      source: VoucherSource
      /** 남은 매수 (그룹 전체) */
      remainingCount: number
    }

/**
 * 전화번호로 지금 사용 가능한 모든 쿠폰을 결제 라디오에 표시할 형태로 반환.
 *  - 식권: (amount, source) 그룹핑 후 그룹당 1옵션 (가장 오래된 row 부터 사용 = FIFO)
 *  - 할인쿠폰: 가장 최근 1장만 반환 (다중 활성 시에도 1장만)
 *  - 만료/사용은 제외
 */
export async function fetchAvailableCouponsByPhone(
  phone: string,
): Promise<AvailableCouponOption[]> {
  if (!phone) return []
  const normalized = normalizePhone(phone)
  const { data, error } = await supabase
    .from('coupons')
    .select()
    .eq('phone', normalized)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true })
  if (error) throw error
  const rows = data ?? []

  const out: AvailableCouponOption[] = []

  // 할인쿠폰 — 최신 1장만
  const discounts = rows
    .filter((c) => c.type === 'discount')
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  if (discounts.length > 0) {
    const c = discounts[0]
    out.push({
      kind: 'discount',
      couponId: c.id,
      code: c.code,
      discount: c.discount_amount,
      minOrderAmount: c.min_order_amount ?? 0,
    })
  }

  // 식권 — (amount, source) 그룹핑, 그룹당 가장 오래된 row 1개 (FIFO 사용)
  const vouchers = rows.filter((c) => c.type === 'meal_voucher')
  const groups = new Map<string, Coupon[]>()
  for (const c of vouchers) {
    const key = `${c.discount_amount}|${c.source}`
    const list = groups.get(key) ?? []
    list.push(c)
    groups.set(key, list)
  }
  for (const list of groups.values()) {
    // created_at ASC 보장 (위 select order)
    const head = list[0]
    out.push({
      kind: 'voucher',
      couponId: head.id,
      code: head.code,
      amount: head.discount_amount,
      source: head.source as VoucherSource,
      remainingCount: list.length,
    })
  }

  return out
}

// ─── 식권 source 라벨 ────────────────────────────────────────

export const VOUCHER_SOURCE_LABEL: Record<VoucherSource, string> = {
  voucher_participant: '참가자',
  voucher_staff: '스태프',
  voucher_vip: 'VIP',
  voucher_other: '기타',
}

/**
 * 전화번호로 발급된 설문 자동쿠폰 1장 조회 (status/만료 무관 · 최신 1장).
 * AdminSurvey 상세 모달 배지용.
 */
export async function fetchSurveyCouponByPhone(
  phone: string,
): Promise<Coupon | null> {
  if (!phone) return null
  const { data, error } = await supabase
    .from('coupons')
    .select()
    .eq('phone', normalizePhone(phone))
    .eq('issued_source', 'survey')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

/**
 * 전화번호로 이미 설문 자동발급 쿠폰이 존재하는지 확인 (used/expired 포함).
 * 설문 제출 시 중복 체크용 — 과거에 발급됐으면 재설문 자체를 차단.
 */
export async function hasSurveyCouponByPhone(phone: string): Promise<boolean> {
  if (!phone) return false
  const { data, error } = await supabase
    .from('coupons')
    .select('id')
    .eq('phone', normalizePhone(phone))
    .eq('issued_source', 'survey')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return !!data
}

/**
 * 설문 제출 직후 자동 쿠폰 발급.
 *  - 할인 2,000원 / 최소 10,000원 / 만료 2026-05-17 23:59 KST 고정
 *  - partial unique index (issued_source='survey' + phone) 로 DB 수준에서도
 *    중복 방지. unique 위반이면 DuplicateSurveyCouponError 로 변환.
 */
export async function issueSurveyCoupon(phone: string): Promise<Coupon> {
  const normalized = normalizePhone(phone)
  if (normalized.length !== 11) {
    throw new Error('전화번호 형식이 올바르지 않습니다')
  }
  const code = await generateUniqueCouponCode()
  const { data, error } = await supabase
    .from('coupons')
    .insert({
      code,
      type: 'discount',
      source: 'auto_survey',
      discount_amount: SURVEY_COUPON_DISCOUNT,
      min_order_amount: SURVEY_COUPON_MIN_ORDER,
      status: 'active',
      issued_source: 'survey',
      expires_at: SURVEY_COUPON_EXPIRES_AT,
      phone: normalized,
      note: '만족도조사 참여 쿠폰',
    })
    .select()
    .single()
  if (error || !data) {
    // Postgres unique_violation = 23505
    if (error?.code === '23505') {
      throw new DuplicateSurveyCouponError()
    }
    throw new Error(`설문 쿠폰 발급 실패: ${error?.message ?? 'unknown'}`)
  }
  return data
}

// ─── 수동 발급 — 할인쿠폰 (어드민) ─────────────────────────

export interface CreateCouponManualInput {
  discountAmount: number
  minOrderAmount?: number
  expiresAt: string // ISO
  source: DiscountSource
  note?: string
  memo?: string
  issuedPhone?: string
  festivalId?: string | null
}

export async function createCouponManually(
  input: CreateCouponManualInput,
): Promise<Coupon> {
  const code = await generateUniqueCouponCode()
  const { data, error } = await supabase
    .from('coupons')
    .insert({
      code,
      type: 'discount',
      source: input.source,
      discount_amount: input.discountAmount,
      min_order_amount: input.minOrderAmount ?? 10000,
      status: 'active',
      issued_source: 'manual',
      expires_at: input.expiresAt,
      note: input.note ?? null,
      memo: input.memo ?? null,
      issued_phone: input.issuedPhone ? normalizePhone(input.issuedPhone) : null,
      festival_id: input.festivalId ?? null,
    })
    .select()
    .single()
  if (error || !data) throw new Error(`쿠폰 생성 실패: ${error?.message ?? 'unknown'}`)
  return data
}

// ─── 수동 발급 — 식권 (어드민) ─────────────────────────────

/** 식권 만료 default — 5/17 23:59:59 KST. UI 에서 변경 가능. */
export const MEAL_VOUCHER_DEFAULT_EXPIRES_AT = new Date(
  '2026-05-17T23:59:59+09:00',
).toISOString()

export interface CreateMealVoucherBulkInput {
  /** E.164 normalize 전후 모두 허용. 내부에서 normalize. */
  phone: string
  /** 액면가 (원) */
  amount: number
  /** 발급 매수 (1~50) */
  quantity: number
  /** 식권 source (대상 분류) */
  source: VoucherSource
  /** 만료 시각 ISO. 미지정 시 5/17 23:59:59 KST */
  expiresAt?: string
  /** CSV 일괄 업로드 시 묶음 식별자. 직접 입력은 미지정. */
  batchId?: string
  /** 메모 */
  memo?: string
  festivalId?: string | null
}

export interface MealVoucherIssueResult {
  /** 발급된 row 수 */
  count: number
  /** 발급된 unique 코드 목록 (UI 표시용) */
  codes: string[]
}

/**
 * 식권 N장 일괄 발급 (한 번호에 N row).
 * 단일 phone — 모든 row 가 같은 phone, amount, source, expires_at, batch_id 를 공유.
 * code 는 row 별 unique.
 */
export async function createMealVouchersBulk(
  input: CreateMealVoucherBulkInput,
): Promise<MealVoucherIssueResult> {
  if (input.quantity < 1 || input.quantity > 50) {
    throw new Error('식권 발급 매수는 1~50장 사이여야 합니다')
  }
  if (input.amount <= 0) {
    throw new Error('식권 액면가는 1원 이상이어야 합니다')
  }
  const phone = normalizePhone(input.phone)
  if (phone.length !== 11) {
    throw new Error('전화번호 형식이 올바르지 않습니다')
  }
  const codes = await generateUniqueCouponCodes(input.quantity)
  const expiresAt = input.expiresAt ?? MEAL_VOUCHER_DEFAULT_EXPIRES_AT
  const rows = codes.map((code) => ({
    code,
    type: 'meal_voucher' as const,
    source: input.source,
    discount_amount: input.amount,
    min_order_amount: null,
    status: 'active' as const,
    issued_source: 'manual' as const,
    expires_at: expiresAt,
    phone,
    issued_phone: phone,
    batch_id: input.batchId ?? null,
    memo: input.memo ?? null,
    festival_id: input.festivalId ?? null,
  }))
  const { data, error } = await supabase.from('coupons').insert(rows).select('code')
  if (error || !data) {
    throw new Error(`식권 발급 실패: ${error?.message ?? 'unknown'}`)
  }
  return { count: data.length, codes: data.map((r) => r.code) }
}

// ─── 목록 조회 (어드민) ─────────────────────────────────────

export interface CouponsListFilters {
  /** active / used / expired(클라이언트 계산) / all */
  status?: 'all' | 'active' | 'used' | 'expired'
  source?: 'all' | 'manual' | 'survey'
  codeQuery?: string
}

export interface CouponRow extends Coupon {
  /** 만료 여부 (쿼리 시점 now 기준) */
  isExpired: boolean
  /** 표시용 실질 상태 */
  effectiveStatus: 'active' | 'used' | 'expired'
}

function computeEffectiveStatus(c: Coupon): CouponRow['effectiveStatus'] {
  if (c.status === 'used') return 'used'
  if (new Date(c.expires_at).getTime() < Date.now()) return 'expired'
  return 'active'
}

export async function fetchCouponsList(
  filters: CouponsListFilters,
): Promise<CouponRow[]> {
  let q = supabase.from('coupons').select().order('created_at', { ascending: false })
  if (filters.source && filters.source !== 'all') q = q.eq('issued_source', filters.source)
  if (filters.codeQuery && filters.codeQuery.trim().length > 0) {
    q = q.ilike('code', `%${filters.codeQuery.trim().toUpperCase()}%`)
  }
  const { data, error } = await q.limit(500)
  if (error) throw error
  const rows = (data ?? []).map<CouponRow>((c) => ({
    ...c,
    isExpired: new Date(c.expires_at).getTime() < Date.now(),
    effectiveStatus: computeEffectiveStatus(c),
  }))
  if (filters.status && filters.status !== 'all') {
    return rows.filter((r) => r.effectiveStatus === filters.status)
  }
  return rows
}

// ─── 집계 (매출관리 탭 쿠폰 섹션) ─────────────────────────

export interface CouponStats {
  issuedCount: number
  usedCount: number
  expiredCount: number
  activeCount: number
  usageRate: number // used / issued
  totalDiscount: number // 사용 완료된 쿠폰의 할인 합계
}

export async function fetchCouponStats(filters: {
  /** KST 'YYYY-MM-DD' inclusive — coupons.created_at 기준 */
  dateFrom?: string
  dateTo?: string
}): Promise<CouponStats> {
  let q = supabase.from('coupons').select()
  if (filters.dateFrom) {
    q = q.gte('created_at', new Date(`${filters.dateFrom}T00:00:00+09:00`).toISOString())
  }
  if (filters.dateTo) {
    q = q.lt('created_at', new Date(`${filters.dateTo}T24:00:00+09:00`).toISOString())
  }
  const { data, error } = await q
  if (error) throw error
  const rows = data ?? []
  let issued = 0
  let used = 0
  let expired = 0
  let active = 0
  let totalDiscount = 0
  const now = Date.now()
  for (const c of rows) {
    issued += 1
    if (c.status === 'used') {
      used += 1
      totalDiscount += c.discount_amount
    } else if (new Date(c.expires_at).getTime() < now) {
      expired += 1
    } else {
      active += 1
    }
  }
  return {
    issuedCount: issued,
    usedCount: used,
    expiredCount: expired,
    activeCount: active,
    usageRate: issued > 0 ? used / issued : 0,
    totalDiscount,
  }
}

// ─── v4: 식권 / 할인쿠폰 분리 통계 ────────────────────────

export interface VoucherSourceStat {
  source: VoucherSource
  /** 발급 매수 */
  issuedCount: number
  /** 발급 액면 합계 */
  issuedTotal: number
  /** 사용 매수 */
  usedCount: number
  /** 사용된 식권 액면 합계 (= 운영자 부담 가산) */
  usedFaceValue: number
}

export interface VoucherStats {
  /** source별 분리 */
  bySource: VoucherSourceStat[]
  /** 전체 합계 */
  totalIssuedCount: number
  totalIssuedFaceValue: number
  totalUsedCount: number
  totalUsedFaceValue: number
  /** orders 기준 — 실제 차감액 */
  organizerCost: number
  /** orders 기준 — 잔액 소멸 */
  burned: number
  /** 사용률 (used / issued) */
  usageRate: number
  /** 미사용 매수 (만료 또는 active) */
  unusedCount: number
  /** 미사용 액면 합계 */
  unusedFaceValue: number
}

export type DiscountSourceLabel =
  | 'auto_survey'
  | 'manual_compensation'
  | 'manual_external'

export interface DiscountSourceStat {
  source: DiscountSourceLabel
  issuedCount: number
  usedCount: number
  /** 사용 완료된 쿠폰의 할인액 합계 */
  totalDiscount: number
}

export interface DiscountStatsBySource {
  bySource: DiscountSourceStat[]
}

/**
 * 식권 운영 통계 — coupons + orders 두 테이블에서 합산.
 * coupons.created_at 기준 기간 필터.
 */
export async function fetchVoucherStats(filters: {
  dateFrom?: string
  dateTo?: string
}): Promise<VoucherStats> {
  let cq = supabase.from('coupons').select().eq('type', 'meal_voucher')
  if (filters.dateFrom) {
    cq = cq.gte('created_at', new Date(`${filters.dateFrom}T00:00:00+09:00`).toISOString())
  }
  if (filters.dateTo) {
    cq = cq.lt('created_at', new Date(`${filters.dateTo}T24:00:00+09:00`).toISOString())
  }
  const { data: coupons, error: cErr } = await cq
  if (cErr) throw cErr

  // orders 기준 차감/소멸 합계 — paid_at 기준은 매장 정산이고
  // 여기서는 발급 기간 필터(쿠폰 created_at)를 따라가므로 coupons 검색결과의 used_payment_id 만 추적
  const usedPaymentIds = (coupons ?? [])
    .map((c) => c.used_payment_id)
    .filter((v): v is string => !!v)
  let organizerCost = 0
  let burned = 0
  if (usedPaymentIds.length > 0) {
    const { data: orderRows, error: oErr } = await supabase
      .from('orders')
      .select('payment_id, voucher_consumed, voucher_burned')
      .in('payment_id', usedPaymentIds)
      .neq('status', 'cancelled')
    if (oErr) throw oErr
    for (const o of orderRows ?? []) {
      organizerCost += o.voucher_consumed
      burned += o.voucher_burned
    }
  }

  // source별 합산
  const sources: VoucherSource[] = [
    'voucher_participant',
    'voucher_staff',
    'voucher_vip',
    'voucher_other',
  ]
  const bySource: VoucherSourceStat[] = sources.map((s) => ({
    source: s,
    issuedCount: 0,
    issuedTotal: 0,
    usedCount: 0,
    usedFaceValue: 0,
  }))
  let totalIssuedCount = 0
  let totalIssuedFaceValue = 0
  let totalUsedCount = 0
  let totalUsedFaceValue = 0
  let unusedCount = 0
  let unusedFaceValue = 0

  for (const c of coupons ?? []) {
    const bucket = bySource.find((b) => b.source === c.source)
    totalIssuedCount += 1
    totalIssuedFaceValue += c.discount_amount
    if (bucket) {
      bucket.issuedCount += 1
      bucket.issuedTotal += c.discount_amount
    }
    if (c.status === 'used') {
      totalUsedCount += 1
      totalUsedFaceValue += c.discount_amount
      if (bucket) {
        bucket.usedCount += 1
        bucket.usedFaceValue += c.discount_amount
      }
    } else {
      unusedCount += 1
      unusedFaceValue += c.discount_amount
    }
  }

  return {
    bySource,
    totalIssuedCount,
    totalIssuedFaceValue,
    totalUsedCount,
    totalUsedFaceValue,
    organizerCost,
    burned,
    usageRate: totalIssuedCount > 0 ? totalUsedCount / totalIssuedCount : 0,
    unusedCount,
    unusedFaceValue,
  }
}

/**
 * 할인쿠폰 source별 통계 — type='discount' 한정.
 * auto_survey / manual_compensation / manual_external 3개 카테고리.
 */
export async function fetchDiscountStatsBySource(filters: {
  dateFrom?: string
  dateTo?: string
}): Promise<DiscountStatsBySource> {
  let q = supabase.from('coupons').select().eq('type', 'discount')
  if (filters.dateFrom) {
    q = q.gte('created_at', new Date(`${filters.dateFrom}T00:00:00+09:00`).toISOString())
  }
  if (filters.dateTo) {
    q = q.lt('created_at', new Date(`${filters.dateTo}T24:00:00+09:00`).toISOString())
  }
  const { data, error } = await q
  if (error) throw error

  const sources: DiscountSourceLabel[] = [
    'auto_survey',
    'manual_compensation',
    'manual_external',
  ]
  const bySource: DiscountSourceStat[] = sources.map((s) => ({
    source: s,
    issuedCount: 0,
    usedCount: 0,
    totalDiscount: 0,
  }))
  for (const c of data ?? []) {
    const bucket = bySource.find((b) => b.source === c.source)
    if (!bucket) continue
    bucket.issuedCount += 1
    if (c.status === 'used') {
      bucket.usedCount += 1
      bucket.totalDiscount += c.discount_amount
    }
  }
  return { bySource }
}

export const DISCOUNT_SOURCE_LABEL: Record<DiscountSourceLabel, string> = {
  auto_survey: '자동 발급 (만족도조사)',
  manual_compensation: '수동 — 민원 보상',
  manual_external: '수동 — 외부업체',
}

// ─── Client-side validate 호출 ─────────────────────────────

export type ValidateCouponResponse =
  | {
      valid: true
      type: 'discount'
      couponId: string
      code: string
      discount: number
      finalAmount: number
    }
  | {
      valid: true
      type: 'meal_voucher'
      couponId: string
      code: string
      voucherAmount: number
      consumed: number
      burned: number
      finalAmount: number
    }
  | { valid: false; error: string }

/**
 * /api/coupons/validate 호출. 결과가 valid=true 여야 실제 결제에 반영 가능.
 */
export async function validateCouponByCode(
  code: string,
  subtotal: number,
): Promise<ValidateCouponResponse> {
  const response = await fetch('/api/coupons/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim().toUpperCase(), subtotal }),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    return {
      valid: false,
      error: typeof json?.error === 'string' ? json.error : '쿠폰 검증 실패',
    }
  }
  return json as ValidateCouponResponse
}

// ─── 식권 정산 (다부스 비례 분배) ─────────────────────────

/**
 * 식권 1장이 부스 N개에 어떻게 분배되는지 계산.
 *
 *  - consumed = min(voucherAmount, orderTotal)
 *  - burned   = voucherAmount - consumed   (액면가 잔액 소멸)
 *  - userPaid = max(0, orderTotal - voucherAmount)
 *
 *  부스별 voucher_consumed 는 부스 subtotal 비율로 분배 (floor),
 *  rounding 잔여는 마지막 부스에 몰아 보장: SUM(consumed) === consumed.
 *  burned 는 마지막 부스에 몰아 한 번만 기록 (정산 SQL 의 SUM 정합성 유지).
 */
export interface BoothShare {
  /** 같은 입력 순서로 반환 */
  boothId: string
  subtotal: number
}

export interface BoothVoucherDistribution extends BoothShare {
  voucherConsumed: number
  voucherBurned: number
}

export interface VoucherSettlement {
  consumed: number
  burned: number
  userPaid: number
  distributions: BoothVoucherDistribution[]
}

export function calcVoucherSettlement(
  booths: BoothShare[],
  voucherAmount: number,
): VoucherSettlement {
  const orderTotal = booths.reduce((s, b) => s + b.subtotal, 0)
  const consumed = Math.min(voucherAmount, orderTotal)
  const burned = voucherAmount - consumed
  const userPaid = Math.max(0, orderTotal - voucherAmount)

  const distributions: BoothVoucherDistribution[] = []
  let remaining = consumed
  for (let i = 0; i < booths.length; i += 1) {
    const b = booths[i]
    const isLast = i === booths.length - 1
    let boothConsumed: number
    if (isLast) {
      boothConsumed = remaining
    } else {
      // 비례 분배 + 부스 subtotal 상한
      const proportional = orderTotal > 0
        ? Math.floor((consumed * b.subtotal) / orderTotal)
        : 0
      boothConsumed = Math.min(proportional, b.subtotal, remaining)
    }
    distributions.push({
      boothId: b.boothId,
      subtotal: b.subtotal,
      voucherConsumed: boothConsumed,
      voucherBurned: isLast ? burned : 0,
    })
    remaining -= boothConsumed
  }

  return { consumed, burned, userPaid, distributions }
}
