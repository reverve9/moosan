import bcrypt from 'bcryptjs'
import { supabase } from '@/lib/supabase'

const STORAGE_KEY = 'moosan-booth-session-v1'

export interface BoothSession {
  boothId: string
  boothName: string
  boothNo: string | null
  loginId: string
}

export function loadBoothSession(): BoothSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BoothSession>
    if (!parsed.boothId || !parsed.boothName || !parsed.loginId) return null
    return {
      boothId: parsed.boothId,
      boothName: parsed.boothName,
      boothNo: typeof parsed.boothNo === 'string' ? parsed.boothNo : null,
      loginId: parsed.loginId,
    }
  } catch {
    return null
  }
}

export function saveBoothSession(session: BoothSession): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function clearBoothSession(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

export type BoothLoginError =
  | 'invalid_credentials'
  | 'booth_not_found'
  | 'network_error'

export interface BoothLoginResult {
  ok: boolean
  session?: BoothSession
  error?: BoothLoginError
}

/**
 * booth_accounts 에서 login_id 로 조회 후 bcrypt 비교.
 * 성공 시 booth meta 까지 join 해서 BoothSession 반환.
 */
export async function verifyBoothLogin(
  loginId: string,
  password: string,
): Promise<BoothLoginResult> {
  const trimmedId = loginId.trim()
  if (!trimmedId || !password) {
    return { ok: false, error: 'invalid_credentials' }
  }

  const { data, error } = await supabase
    .from('booth_accounts')
    .select('id, booth_id, login_id, password_hash, food_booths!inner(id, name, booth_no)')
    .eq('login_id', trimmedId)
    .maybeSingle()

  if (error) {
    return { ok: false, error: 'network_error' }
  }
  if (!data) {
    return { ok: false, error: 'invalid_credentials' }
  }

  const matched = await bcrypt.compare(password, data.password_hash)
  if (!matched) {
    return { ok: false, error: 'invalid_credentials' }
  }

  // supabase-js 가 join 결과를 객체 또는 배열로 줄 수 있어 양쪽 처리
  const boothRow = Array.isArray(data.food_booths) ? data.food_booths[0] : data.food_booths
  if (!boothRow) {
    return { ok: false, error: 'booth_not_found' }
  }

  const session: BoothSession = {
    boothId: boothRow.id,
    boothName: boothRow.name,
    boothNo: typeof boothRow.booth_no === 'string' ? boothRow.booth_no : null,
    loginId: data.login_id,
  }

  return { ok: true, session }
}

/**
 * 어드민 부스 계정 생성/PW 변경 시 사용. cost 10 (기본).
 */
export async function hashBoothPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}
