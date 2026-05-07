/**
 * 주문번호 표시용 헬퍼.
 *
 * 신 포맷 (28_order_number_v2): '{booth_no}-{day_code}{NNNN}'
 *   예) 'M01-10001' → counter '0001', 풀코드 'M01-10001'
 *
 * 구 포맷 (12_payments_booth_orders): '{booth_no}-{MMDD}-{NNNN}'
 *   예) 'A01-0428-0001' → counter '0001', 풀코드 'A01-0428-0001'
 *
 * 두 포맷 모두 끝 4자리가 카운터. 손님/부스 호출용 큰 표시는 카운터만 사용.
 */
export interface ParsedOrderNumber {
  /** 풀코드 (DB 원문) */
  full: string
  /** 카운터 — 손님/부스에서 크게 보여주는 호출 번호 (예: '0001') */
  counter: string
}

export function parseOrderNumber(orderNumber: string | null | undefined): ParsedOrderNumber {
  const full = orderNumber ?? ''
  if (full.length < 4) return { full, counter: full }
  return { full, counter: full.slice(-4) }
}
