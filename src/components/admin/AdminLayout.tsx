// [비상 비활성 — 만족도조사] 원복 시 ClipboardList 재추가
import { Sparkles, GraduationCap, Cake, FileText, Megaphone, Store, Key, Signal, ChartColumn, ReceiptText, Ticket, QrCode, LogOut, Wallet, HandHeart } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom'
import type { ComponentType, SVGProps } from 'react'
import ConnectionBanner from '@/components/ui/ConnectionBanner'
import { AdminAlertProvider, useAdminAlert } from './AdminAlertContext'
import {
  type AdminRole,
  clearAdminSession,
  findAccount,
  loadAdminSession,
  saveAdminSession,
} from '@/lib/adminAuth'
import styles from './AdminLayout.module.css'

const MONITOR_PATH = '/monitor'
const HELPDESK_PATH = '/help-desk'

interface NavItem {
  label: string
  path: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  end?: boolean
  /** 접근 가능한 역할. 미지정 = 'super' 만 */
  roles?: AdminRole[]
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
      { label: '정산 관리', path: '/settlement', icon: Wallet },
      { label: '결제 도우미', path: HELPDESK_PATH, icon: HandHeart, roles: ['super', 'helper'] },
      // [비상 비활성 — 만족도조사] 원복 시 주석 해제
      // { label: '만족도조사 관리', path: '/survey', icon: ClipboardList },
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
      { label: 'QR 코드', path: '/qrcodes', icon: QrCode },
    ],
  },
  {
    title: '설정',
    items: [],
  },
]

/** 역할별 접근 가능 path prefix.
 *  helper 는 /help-desk 만 (그 외 경로 직접 입력 시 자동 redirect). */
const HELPER_ALLOWED_PREFIXES = [HELPDESK_PATH]

function isHelperAllowed(pathname: string): boolean {
  return HELPER_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export default function AdminLayout() {
  const navigate = useNavigate()
  const [session, setSession] = useState(() => loadAdminSession())
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState(false)

  const handleLogin = () => {
    const account = findAccount(id.trim(), pw)
    if (account) {
      const next = { id: account.id, displayName: account.displayName, role: account.role }
      saveAdminSession(next)
      setSession(next)
      setError(false)
      // helper 는 헬프데스크로, super 는 기본 페이지로
      if (account.role === 'helper') {
        navigate(HELPDESK_PATH, { replace: true })
      }
    } else {
      setError(true)
    }
  }

  const handleLogout = () => {
    clearAdminSession()
    setSession(null)
    setId('')
    setPw('')
  }

  if (!session) {
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
      <AdminLayoutInner
        navigate={navigate}
        onLogout={handleLogout}
        role={session.role}
        displayName={session.displayName}
      />
    </AdminAlertProvider>
  )
}

interface AdminLayoutInnerProps {
  navigate: ReturnType<typeof useNavigate>
  onLogout: () => void
  role: AdminRole
  displayName: string
}

function AdminLayoutInner({ navigate, onLogout, role, displayName }: AdminLayoutInnerProps) {
  const { alertCount, warnCount, totalPending, overdueCount } = useAdminAlert()
  const location = useLocation()

  // helper 가 허용 경로 외로 진입한 경우 헬프데스크로 강제 redirect
  if (role === 'helper' && !isHelperAllowed(location.pathname)) {
    return <Navigate to={HELPDESK_PATH} replace />
  }

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

  // role 기반 메뉴 필터 — helper 는 roles 에 'helper' 가 포함된 항목만 노출
  const visibleGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) =>
      role === 'super' ? true : (it.roles ?? []).includes(role),
    ),
  })).filter((g) => g.items.length > 0)

  const homePath = role === 'helper' ? HELPDESK_PATH : '/notices'

  return (
    <div className={styles.layout}>
      <ConnectionBanner />
      <aside className={styles.sidebar}>
        <div className={styles.logo} onClick={() => navigate(homePath)}>
          설악무산문화축전
          <span className={styles.badge}>Admin</span>
        </div>
        <div className={styles.userBadge}>
          <span className={styles.userBadgeLabel}>로그인</span>
          <span className={styles.userBadgeName}>{displayName}</span>
        </div>
        <nav className={styles.nav}>
          {visibleGroups.map((group) => (
            <div key={group.title} className={styles.navGroup}>
              <div className={styles.navGroupTitle}>{group.title}</div>
              {group.items.map((item) => {
                const Icon = item.icon
                const isMonitor = item.path === MONITOR_PATH
                const badgeCount = isMonitor ? totalPending + overdueCount : 0
                const badgeTone = isMonitor
                  ? alertCount > 0
                    ? 'alert'
                    : warnCount > 0
                      ? 'warn'
                      : overdueCount > 0
                        ? 'overdue'
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
                              : badgeTone === 'overdue'
                                ? styles.navBadgeOverdue
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
