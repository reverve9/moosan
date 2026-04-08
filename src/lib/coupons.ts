import { supabase } from './supabase'
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
      issued_phone: input.issuedPhone ?? null,
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
