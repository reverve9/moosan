import { useLocation, useNavigate } from 'react-router-dom'
import {
  HomeIcon,
  RectangleGroupIcon,
  PencilSquareIcon,
  MapPinIcon,
  MegaphoneIcon,
} from '@heroicons/react/24/outline'
import {
  HomeIcon as HomeIconSolid,
  RectangleGroupIcon as RectangleGroupIconSolid,
  PencilSquareIcon as PencilSquareIconSolid,
  MapPinIcon as MapPinIconSolid,
  MegaphoneIcon as MegaphoneIconSolid,
} from '@heroicons/react/24/solid'
import styles from './BottomNav.module.css'

const NAV_ITEMS = [
  { label: '홈', path: '/', icon: HomeIcon, activeIcon: HomeIconSolid },
  { label: '프로그램', path: '/programs', icon: RectangleGroupIcon, activeIcon: RectangleGroupIconSolid },
  { label: '참가신청', path: '/apply', icon: PencilSquareIcon, activeIcon: PencilSquareIconSolid },
  { label: '오시는길', path: '/location', icon: MapPinIcon, activeIcon: MapPinIconSolid },
  { label: '공지', path: '/notice', icon: MegaphoneIcon, activeIcon: MegaphoneIconSolid },
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
