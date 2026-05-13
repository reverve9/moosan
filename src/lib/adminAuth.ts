/**
 * 어드민 로컬 인증 — Supabase auth 사용 X.
 * 행사 운영 단순성을 위해 하드코딩 계정 + sessionStorage 기반.
 *
 * 역할:
 *   - super  : 모든 영역 접근 (운영본부)
 *   - helper : 결제 도우미 부스만 접근 (/help-desk 외 redirect)
 *
 * 신규 도우미 계정 추가는 ADMIN_ACCOUNTS 배열에 한 줄 추가.
 */

export type AdminRole = 'super' | 'helper'

export interface AdminAccount {
  id: string
  pw: string
  displayName: string
  role: AdminRole
}

export const ADMIN_ACCOUNTS: AdminAccount[] = [
  { id: 'musanfesta', pw: '123456', displayName: '운영본부', role: 'super' },
  { id: 'admin01', pw: 'M12345678!', displayName: '도우미01', role: 'helper' },
  { id: 'admin02', pw: 'M12345678!', displayName: '도우미02', role: 'helper' },
  { id: 'admin03', pw: 'M12345678!', displayName: '도우미03', role: 'helper' },
]

const SESSION_KEY = 'admin_session_v2'
const LEGACY_KEY = 'admin_auth' // 이전 boolean 키 — 호환을 위해 자동 마이그레이션

interface AdminSession {
  id: string
  displayName: string
  role: AdminRole
}

export function findAccount(id: string, pw: string): AdminAccount | null {
  return ADMIN_ACCOUNTS.find((a) => a.id === id && a.pw === pw) ?? null
}

export function loadAdminSession(): AdminSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AdminSession>
      if (
        typeof parsed.id === 'string' &&
        typeof parsed.displayName === 'string' &&
        (parsed.role === 'super' || parsed.role === 'helper')
      ) {
        return parsed as AdminSession
      }
    }
    // 레거시: 'admin_auth' === 'true' 인 사용자는 musanfesta super 로 간주
    if (sessionStorage.getItem(LEGACY_KEY) === 'true') {
      const legacy = ADMIN_ACCOUNTS.find((a) => a.id === 'musanfesta')
      if (legacy) {
        const session: AdminSession = {
          id: legacy.id,
          displayName: legacy.displayName,
          role: legacy.role,
        }
        saveAdminSession(session)
        sessionStorage.removeItem(LEGACY_KEY)
        return session
      }
    }
    return null
  } catch {
    return null
  }
}

export function saveAdminSession(session: AdminSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearAdminSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(LEGACY_KEY)
}
