/**
 * 휴대폰 번호 정규화/검증 (서버사이드 — api/_lib 전용).
 *
 * src/lib/phone.ts 의 normalizePhone / isValidPhone 의 사본.
 * 원본은 client-only 함수 (localStorage 등) 와 같은 파일에 있어
 * api/ 컨텍스트에서 그대로 import 하면 DOM 타입 의존이 따라옴.
 * 정규화 로직은 두 군데에서 동시에 바뀌면 안 되므로, 변경 시 두 파일 모두 수정 필요.
 */

/** 숫자만 추출 → 최대 11자리. DB 저장/조회/비교 용. */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.replace(/\D/g, '').slice(0, 11)
}

/** 정규화 후 11자리 010 패턴 검증. 솔라피 발송 가능 형식. */
export function isValidNormalizedPhone(normalized: string): boolean {
  return /^010\d{8}$/.test(normalized)
}
