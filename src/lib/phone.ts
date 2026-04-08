/**
 * 휴대폰 번호 유틸 — 010-XXXX-XXXX 포맷 통일.
 * orders 테이블 phone 컬럼이 dash 포함 형태로 저장되므로, 입력/조회 모두 동일 포맷 사용.
 */

/** 010-XXXX-XXXX 포맷으로 정리. 숫자만 추출 후 11자리 기준 분할. */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  if (digits.length < 4) return digits
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

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
