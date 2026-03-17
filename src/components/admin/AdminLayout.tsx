import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  RectangleGroupIcon,
  DocumentTextIcon,
  MegaphoneIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline'
import styles from './AdminLayout.module.css'

const NAV_ITEMS = [
  { label: '참가신청 관리', path: '/admin/applications', icon: DocumentTextIcon },
  { label: '프로그램 관리', path: '/admin/programs', icon: RectangleGroupIcon },
  { label: '공지사항 관리', path: '/admin/notices', icon: MegaphoneIcon },
]

export default function AdminLayout() {
  const navigate = useNavigate()

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
              </NavLink>
            )
          })}
        </nav>
        <div className={styles.sidebarFooter}>
          <button className={styles.logoutBtn} onClick={() => navigate('/')}>
            <ArrowRightOnRectangleIcon className={styles.navIcon} />
            <span>사이트로 이동</span>
          </button>
        </div>
      </aside>
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  )
}
