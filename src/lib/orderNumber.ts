/**
 * 주문번호 표시용 헬퍼.
 *
 * 신 포맷 (28_order_number_v2): '{booth_no}-{day_code}{NNNN}'
 *   예) 'M01-10001' → counter '10001' (day_code 포함, 5자리)
 *
 * 구 포맷 (12_payments_booth_orders): '{booth_no}-{MMDD}-{NNNN}'
 *   예) 'A01-0428-0001' → counter '0001' (마지막 dash 뒤 4자리)
 *
 * counter = 마지막 dash 이후 전체. 신 포맷에선 day_code 가 자연스럽게 포함되어
 * '10001' (1=5/15, 2=5/16, 3=5/17) 형태로 손님/부스에서 일자 식별 가능.
 */
interface ParsedOrderNumber {
  /** 풀코드 (DB 원문) */
  full: string
  /** 카운터 — 손님/부스에서 크게 보여주는 호출 번호 (예: '10001') */
  counter: string
}

export function parseOrderNumber(orderNumber: string | null | undefined): ParsedOrderNumber {
  const full = orderNumber ?? ''
  const dashIdx = full.lastIndexOf('-')
  if (dashIdx === -1 || dashIdx === full.length - 1) {
    return { full, counter: full }
  }
  return { full, counter: full.slice(dashIdx + 1) }
}
