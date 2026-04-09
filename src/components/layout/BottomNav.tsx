import { useLocation, useNavigate } from 'react-router-dom'
import { Home, CalendarDays, LayoutGrid, Sparkles } from 'lucide-react'
import { isDevMode } from '@/config/flags'
import styles from './BottomNav.module.css'

const NAV_ITEMS = [
  { label: '홈', path: '/', icon: Home, dimmed: false },
  { label: '설악무산문화축전', path: '/program/musan', icon: CalendarDays, dimmed: false },
  { label: '청소년문화축전', path: '/program/youth', icon: LayoutGrid, dimmed: false },
  { label: '음식문화페스티벌', path: '/program/food', icon: Sparkles, dimmed: !isDevMode },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <div className={styles.wrapper}>
      <nav className={styles.nav}>
        <div className={styles.inner}>
          {NAV_ITEMS.map((item) => {
            const isActive = item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path)
            const Icon = item.icon

            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`${styles.item} ${isActive ? styles.active : ''} ${
                  item.dimmed ? styles.dimmed : ''
                }`}
              >
                <Icon className={styles.icon} />
                <span className={styles.label}>{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
