// 결제 호출 후 사용자 복귀를 감지하기 위한 pending payment id 저장소.
// - sessionStorage: 결제 호출했던 같은 탭/창에서 유지 (origin 이 PG 로 갔다 돌아와도 유지)
// - localStorage : 새 탭/PWA 새 인스턴스 등 sessionStorage 가 끊기는 케이스 fallback (1시간 TTL)
//
// 두 저장소에 동시에 쓰고 동시에 정리. 읽을 때 sessionStorage 우선.

const KEY_SESSION = 'pending_payment_id'
const KEY_LOCAL = 'musanfesta-pending-payment'
const TTL_MS = 60 * 60 * 1000

interface PendingValue {
  id: string
  ts: number
}

export function setPendingPaymentId(id: string): void {
  try {
    sessionStorage.setItem(KEY_SESSION, id)
  } catch {
    /* iOS private 모드 등 — fallback localStorage 만으로도 동작 */
  }
  try {
    const payload: PendingValue = { id, ts: Date.now() }
    localStorage.setItem(KEY_LOCAL, JSON.stringify(payload))
  } catch {
    /* storage 차단 환경 — sessionStorage 만으로 fallback */
  }
}

export function getPendingPaymentId(): string | null {
  try {
    const ss = sessionStorage.getItem(KEY_SESSION)
    if (ss) return ss
  } catch {
    /* noop */
  }
  try {
    const raw = localStorage.getItem(KEY_LOCAL)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PendingValue>
    if (typeof parsed?.id !== 'string' || typeof parsed?.ts !== 'number') return null
    if (Date.now() - parsed.ts > TTL_MS) {
      try { localStorage.removeItem(KEY_LOCAL) } catch { /* noop */ }
      return null
    }
    return parsed.id
  } catch {
    return null
  }
}

export function clearPendingPaymentId(): void {
  try { sessionStorage.removeItem(KEY_SESSION) } catch { /* noop */ }
  try { localStorage.removeItem(KEY_LOCAL) } catch { /* noop */ }
}
