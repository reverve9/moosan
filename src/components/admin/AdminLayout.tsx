import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  RectangleGroupIcon,
  Squares2X2Icon,
  DocumentTextIcon,
  MegaphoneIcon,
  BuildingStorefrontIcon,
  KeyIcon,
  SignalIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline'
import { fetchMonitorSummary, subscribeMonitor } from '@/lib/boothMonitor'
import styles from './AdminLayout.module.css'

const MONITOR_PATH = '/admin/monitor'

const NAV_ITEMS = [
  { label: '실시간 모니터', path: MONITOR_PATH, icon: SignalIcon },
  { label: '참가신청 관리', path: '/admin/applications', icon: DocumentTextIcon },
  { label: '페스티벌 관리', path: '/admin/festivals', icon: RectangleGroupIcon },
  { label: '프로그램 관리', path: '/admin/programs', icon: Squares2X2Icon },
  { label: '참여 매장 관리', path: '/admin/food', icon: BuildingStorefrontIcon },
  { label: '매장 계정 관리', path: '/admin/booth-accounts', icon: KeyIcon },
  { label: '공지사항 관리', path: '/admin/notices', icon: MegaphoneIcon },
]

const ADMIN_ID = 'moosanfesta'
const ADMIN_PW = '123456'

function isAuthenticated() {
  return sessionStorage.getItem('admin_auth') === 'true'
}

export default function AdminLayout() {
  const navigate = useNavigate()
  const [authed, setAuthed] = useState(isAuthenticated)
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState(false)
  const [monitorPending, setMonitorPending] = useState(0)

  // 사이드바 모니터 배지 — 인증된 동안만 fetch + Realtime 구독
  useEffect(() => {
    if (!authed) return
    let cancelled = false
    const refresh = async () => {
      try {
        const summaries = await fetchMonitorSummary()
        if (cancelled) return
        setMonitorPending(summaries.reduce((sum, s) => sum + s.count, 0))
      } catch {
        // 사이드바 배지는 silent fail
      }
    }
    refresh()
    const unsub = subscribeMonitor(() => {
      void refresh()
    }, 'admin-layout-monitor')
    return () => {
      cancelled = true
      unsub()
    }
  }, [authed])

  const handleLogin = () => {
    if (id === ADMIN_ID && pw === ADMIN_PW) {
      sessionStorage.setItem('admin_auth', 'true')
      setAuthed(true)
      setError(false)
    } else {
      setError(true)
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem('admin_auth')
    setAuthed(false)
    setId('')
    setPw('')
  }

  if (!authed) {
    return (
      <div className={styles.loginOverlay}>
        <div className={styles.loginModal}>
          <h2 className={styles.loginTitle}>관리자 로그인</h2>
          <p className={styles.loginSub}>설악무산문화축전 관리 페이지</p>
          <form
            className={styles.loginForm}
            onSubmit={(e) => { e.preventDefault(); handleLogin() }}
          >
            <input
              className={styles.loginInput}
              type="text"
              placeholder="아이디"
              value={id}
              onChange={(e) => { setId(e.target.value); setError(false) }}
              autoFocus
            />
            <input
              className={styles.loginInput}
              type="password"
              placeholder="비밀번호"
              value={pw}
              onChange={(e) => { setPw(e.target.value); setError(false) }}
            />
            {error && <p className={styles.loginError}>아이디 또는 비밀번호가 일치하지 않습니다.</p>}
            <button className={styles.loginBtn} type="submit">로그인</button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.logo} onClick={() => navigate('/admin')}>
          설악무산문화축전
          <span className={styles.badge}>Admin</span>
        </div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const showBadge = item.path === MONITOR_PATH && monitorPending > 0
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
                }
              >
                <Icon className={styles.navIcon} />
                <span>{item.label}</span>
                {showBadge && (
                  <span className={styles.navBadge}>{monitorPending}</span>
                )}
              </NavLink>
            )
          })}
        </nav>
        <div className={styles.sidebarFooter}>
          <button className={styles.logoutBtn} onClick={() => window.open('/', '_blank')}>
            <ArrowRightOnRectangleIcon className={styles.navIcon} />
            <span>사이트로 이동</span>
          </button>
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
  )
}
