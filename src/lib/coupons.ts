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
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ?? null
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

// ─── 수동 발급 (어드민) ─────────────────────────────────────

export interface CreateCouponManualInput {
  discountAmount: number
  minOrderAmount?: number
  expiresAt: string // ISO
  note?: string
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
      discount_amount: input.discountAmount,
      min_order_amount: input.minOrderAmount ?? 10000,
      status: 'active',
      issued_source: 'manual',
      expires_at: input.expiresAt,
      note: input.note ?? null,
      issued_phone: input.issuedPhone ? normalizePhone(input.issuedPhone) : null,
      festival_id: input.festivalId ?? null,
    })
    .select()
    .single()
  if (error || !data) throw new Error(`쿠폰 생성 실패: ${error?.message ?? 'unknown'}`)
  return data
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

// ─── Client-side validate 호출 ─────────────────────────────

export interface ValidateCouponResponse {
  valid: boolean
  couponId?: string
  code?: string
  discount?: number
  finalAmount?: number
  error?: string
}

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
