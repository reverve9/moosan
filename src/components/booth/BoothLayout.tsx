import { createContext, useCallback, useContext, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  ArrowRightOnRectangleIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  NoSymbolIcon,
} from '@heroicons/react/24/outline'
import {
  type BoothSession,
  clearBoothSession,
  loadBoothSession,
  saveBoothSession,
  verifyBoothLogin,
} from '@/lib/boothAuth'
import styles from './BoothLayout.module.css'

const NAV_ITEMS = [
  { label: '주문 현황', path: '/booth', icon: ClipboardDocumentListIcon, end: true },
  { label: '품절 관리', path: '/booth/menu', icon: NoSymbolIcon, end: false },
  { label: '오늘 현황', path: '/booth/today', icon: ChartBarIcon, end: false },
]

interface BoothContextValue {
  session: BoothSession
  logout: () => void
}

const BoothContext = createContext<BoothContextValue | null>(null)

export function useBoothSession(): BoothSession {
  const ctx = useContext(BoothContext)
  if (!ctx) {
    throw new Error('useBoothSession must be used inside <BoothLayout>')
  }
  return ctx.session
}

export function useBoothLogout(): () => void {
  const ctx = useContext(BoothContext)
  if (!ctx) {
    throw new Error('useBoothLogout must be used inside <BoothLayout>')
  }
  return ctx.logout
}

export default function BoothLayout() {
  const [session, setSession] = useState<BoothSession | null>(loadBoothSession)
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleLogout = useCallback(() => {
    clearBoothSession()
    setSession(null)
    setLoginId('')
    setPassword('')
    setError(null)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(null)

    const result = await verifyBoothLogin(loginId, password)

    if (result.ok && result.session) {
      saveBoothSession(result.session)
      setSession(result.session)
      setLoginId('')
      setPassword('')
    } else if (result.error === 'network_error') {
      setError('네트워크 오류가 발생했습니다. 다시 시도해주세요.')
    } else {
      setError('아이디 또는 비밀번호가 일치하지 않습니다.')
    }

    setSubmitting(false)
  }

  if (!session) {
    return (
      <div className={styles.loginOverlay}>
        <div className={styles.loginModal}>
          <h2 className={styles.loginTitle}>매장 로그인</h2>
          <p className={styles.loginSub}>설악무산문화축전 음식페스티벌</p>
          <form className={styles.loginForm} onSubmit={handleSubmit}>
            <input
              className={styles.loginInput}
              type="text"
              inputMode="text"
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="아이디"
              value={loginId}
              onChange={(e) => {
                setLoginId(e.target.value)
                setError(null)
              }}
              autoFocus
            />
            <input
              className={styles.loginInput}
              type="password"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError(null)
              }}
            />
            {error && <p className={styles.loginError}>{error}</p>}
            <button className={styles.loginBtn} type="submit" disabled={submitting}>
              {submitting ? '확인 중...' : '로그인'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <BoothContext.Provider value={{ session, logout: handleLogout }}>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <div className={styles.boothName}>{session.boothName}</div>
            {session.boothNo && (
              <div className={styles.boothNo}>{session.boothNo}번 매장</div>
            )}
          </div>
          <nav className={styles.nav}>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  className={({ isActive }) =>
                    `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
                  }
                >
                  <Icon className={styles.navIcon} />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </nav>
          <div className={styles.sidebarFooter}>
            <button className={styles.logoutBtn} onClick={handleLogout}>
              <ArrowRightOnRectangleIcon className={styles.navIcon} />
              <span>로그아웃</span>
            </button>
          </div>
        </aside>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </BoothContext.Provider>
  )
}
