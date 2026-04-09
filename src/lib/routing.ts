/**
 * 헤더 우측 메뉴(공지사항/참가신청/오시는 길)에서 진입하는 서브 페이지 여부 판단.
 * 해당 페이지에서는 BottomNav 를 숨기고 헤더에 뒤로가기 버튼을 노출한다.
 */
const SUB_PAGE_PREFIXES = ['/notice', '/apply', '/location', '/cart', '/checkout', '/order', '/survey']

export function isSubPage(pathname: string): boolean {
  return SUB_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  )
}

/**
 * 헤더 뒤로가기 버튼을 무조건 숨겨야 하는 페이지.
 * 결제 결과 페이지에서 history 로 한 칸 뒤로 가면 토스 도메인이 남아 있어
 * 사용자가 외부 잔해 페이지로 튕긴다. 페이지 내부에 명시적 CTA 가 있으므로
 * 헤더 back 버튼은 숨긴다.
 */
export function isNoBackPage(pathname: string): boolean {
  return pathname === '/checkout/success' || pathname === '/checkout/fail'
}
