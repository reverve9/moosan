import { useLocation, useNavigate } from 'react-router-dom'
import {
  HomeIcon,
  CalendarDaysIcon,
  RectangleGroupIcon,
  SparklesIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline'
import {
  HomeIcon as HomeIconSolid,
  CalendarDaysIcon as CalendarDaysIconSolid,
  RectangleGroupIcon as RectangleGroupIconSolid,
  SparklesIcon as SparklesIconSolid,
  PencilSquareIcon as PencilSquareIconSolid,
} from '@heroicons/react/24/solid'
import styles from './BottomNav.module.css'

const NAV_ITEMS = [
  { label: '홈', path: '/', icon: HomeIcon, activeIcon: HomeIconSolid },
  { label: '일정', path: '/schedule', icon: CalendarDaysIcon, activeIcon: CalendarDaysIconSolid },
  { label: '프로그램', path: '/programs', icon: RectangleGroupIcon, activeIcon: RectangleGroupIconSolid },
  { label: '페스티벌', path: '/festival', icon: SparklesIcon, activeIcon: SparklesIconSolid },
  { label: '참가신청', path: '/apply', icon: PencilSquareIcon, activeIcon: PencilSquareIconSolid },
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
