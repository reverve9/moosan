import { useLocation, useNavigate } from 'react-router-dom'
import {
  HomeIcon,
  CalendarDaysIcon,
  RectangleGroupIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import {
  HomeIcon as HomeIconSolid,
  CalendarDaysIcon as CalendarDaysIconSolid,
  RectangleGroupIcon as RectangleGroupIconSolid,
  SparklesIcon as SparklesIconSolid,
} from '@heroicons/react/24/solid'
import styles from './BottomNav.module.css'

const NAV_ITEMS = [
  { label: '홈', path: '/', icon: HomeIcon, activeIcon: HomeIconSolid },
  { label: '설악무산문화축전', path: '/program/musan', icon: CalendarDaysIcon, activeIcon: CalendarDaysIconSolid },
  { label: '청소년문화축전', path: '/program/youth', icon: RectangleGroupIcon, activeIcon: RectangleGroupIconSolid },
  { label: '음식문화페스티벌', path: '/program/food', icon: SparklesIcon, activeIcon: SparklesIconSolid },
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
            const Icon = isActive ? item.activeIcon : item.icon

            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`${styles.item} ${isActive ? styles.active : ''}`}
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
