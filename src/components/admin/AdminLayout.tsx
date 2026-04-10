import { Sparkles, GraduationCap, Cake, FileText, Megaphone, Store, Key, Signal, ChartColumn, ClipboardList, ReceiptText, Ticket, LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import type { ComponentType, SVGProps } from 'react'
import ConnectionBanner from '@/components/ui/ConnectionBanner'
import { AdminAlertProvider, useAdminAlert } from './AdminAlertContext'
import styles from './AdminLayout.module.css'

const MONITOR_PATH = '/monitor'

interface NavItem {
  label: string
  path: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  end?: boolean
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: '운영',
    items: [
      { label: '공지사항 관리', path: '/notices', icon: Megaphone },
      { label: '참가신청 관리', path: '/applications', icon: FileText },
      { label: '쿠폰 관리', path: '/coupons', icon: Ticket },
      { label: '매출 관리', path: '/revenue', icon: ChartColumn },
      { label: '만족도조사 관리', path: '/survey', icon: ClipboardList },
    ],
  },
  {
    title: '콘텐츠',
    items: [
      { label: '설악무산문화축전', path: '/content/musan', icon: Sparkles },
      { label: '청소년문화축전', path: '/content/youth', icon: GraduationCap },
      { label: '음식문화페스티벌', path: '/content/food', icon: Cake },
    ],
  },
  {
    title: '매장 관리',
    items: [
      { label: '실시간 모니터', path: MONITOR_PATH, icon: Signal },
      { label: '주문/결제 관리', path: '/orders', icon: ReceiptText },
      { label: '참여 매장 관리', path: '/food', icon: Store },
      { label: '매장 계정 관리', path: '/booth-accounts', icon: Key },
    ],
  },
  {
    title: '설정',
    items: [],
  },
]

const ADMIN_ID = 'musanfesta'
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
    <AdminAlertProvider>
      <AdminLayoutInner navigate={navigate} onLogout={handleLogout} />
    </AdminAlertProvider>
  )
}

interface AdminLayoutInnerProps {
  navigate: ReturnType<typeof useNavigate>
  onLogout: () => void
}

function AdminLayoutInner({ navigate, onLogout }: AdminLayoutInnerProps) {
  const { alertCount, warnCount, totalPending } = useAdminAlert()

  // document.title 동적 변경 — 미확인 주문 있으면 prefix `(N) `
  useEffect(() => {
    const BASE = '설악무산문화축전 어드민'
    if (totalPending > 0) {
      document.title = `(${totalPending}) 실시간 모니터 · ${BASE}`
    } else {
      document.title = BASE
    }
    return () => {
      document.title = BASE
    }
  }, [totalPending])

  return (
    <div className={styles.layout}>
      <ConnectionBanner />
      <aside className={styles.sidebar}>
        <div className={styles.logo} onClick={() => navigate('/notices')}>
          설악무산문화축전
          <span className={styles.badge}>Admin</span>
        </div>
        <nav className={styles.nav}>
          {NAV_GROUPS.filter((g) => g.items.length > 0).map((group) => (
            <div key={group.title} className={styles.navGroup}>
              <div className={styles.navGroupTitle}>{group.title}</div>
              {group.items.map((item) => {
                const Icon = item.icon
                const isMonitor = item.path === MONITOR_PATH
                const badgeCount = isMonitor ? totalPending : 0
                const badgeTone = isMonitor
                  ? alertCount > 0
                    ? 'alert'
                    : warnCount > 0
                      ? 'warn'
                      : 'pending'
                  : 'pending'
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
                    {isMonitor && badgeCount > 0 && (
                      <span
                        className={`${styles.navBadge} ${
                          badgeTone === 'alert'
                            ? styles.navBadgeAlert
                            : badgeTone === 'warn'
                              ? styles.navBadgeWarn
                              : styles.navBadgePending
                        }`}
                      >
                        {badgeCount}
                      </span>
                    )}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <button className={styles.logoutBtn} onClick={onLogout}>
            <LogOut className={styles.navIcon} />
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
