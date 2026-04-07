/**
 * 헤더 우측 메뉴(공지사항/참가신청/오시는 길)에서 진입하는 서브 페이지 여부 판단.
 * 해당 페이지에서는 BottomNav 를 숨기고 헤더에 뒤로가기 버튼을 노출한다.
 */
const SUB_PAGE_PREFIXES = ['/notice', '/apply', '/location']

export function isSubPage(pathname: string): boolean {
  return SUB_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  )
}
