/**
 * 휴대폰 번호 유틸.
 *
 * 계층별 포맷 정책:
 *  - DB 저장 / API payload: 하이픈 없음 (01012345678)  — `normalizePhone()`
 *  - 입력 UI (타이핑 중):    하이픈 있음 (010-1234-5678) — `formatPhone()`
 *  - 표시 (리스트/모달):     하이픈 있음 (010-1234-5678) — `formatPhoneDisplay()`
 *  - Placeholder:            하이픈 있음 (010-0000-0000)
 *
 * 제출 직전 `normalizePhone()` 한 번 태워서 DB 에 들어가고,
 * 조회/표시 시 `formatPhoneDisplay()` 로 감싸서 화면에 출력.
 */

/** 입력 UI 용. 타이핑 중 010-XXXX-XXXX 자동 포맷. 숫자만 추출 후 11자리 기준 분할. */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  if (digits.length < 4) return digits
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

/** DB 저장/조회/비교 용. 숫자만 추출 → 11자리. 하이픈 유무 관용. */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.replace(/\D/g, '').slice(0, 11)
}

/**
 * 표시 전용. DB 값(하이픈 없음 기준)을 010-XXXX-XXXX 로 포맷.
 * 과거 하이픈 포함 데이터가 섞여 있어도 숫자만 추출해 동일하게 처리.
 * 11자리가 아니면 원본을 그대로 반환.
 */
export function formatPhoneDisplay(raw: string | null | undefined): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 11) return raw
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

/** 입력 UI 검증용 — 하이픈 포함된 완성 포맷 검사. */
export const PHONE_RE = /^010-\d{4}-\d{4}$/

export function isValidPhone(phone: string): boolean {
  return PHONE_RE.test(phone)
}

/**
 * 마지막 결제에 사용한 휴대폰 번호를 localStorage 에 저장 / 조회.
 * /cart 통합 페이지의 주문 내역 섹션에서 자동 prefill 용.
 */
const LAST_PHONE_KEY = 'moosan-last-phone-v1'

export function saveLastPhone(phone: string): void {
  try {
    if (isValidPhone(phone)) {
      window.localStorage.setItem(LAST_PHONE_KEY, phone)
    }
  } catch {
    /* localStorage 비활성/quota 등은 무시 */
  }
}

export function loadLastPhone(): string | null {
  try {
    const raw = window.localStorage.getItem(LAST_PHONE_KEY)
    if (raw && isValidPhone(raw)) return raw
    return null
  } catch {
    return null
  }
}
