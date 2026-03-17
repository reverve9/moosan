import { useLocation } from 'react-router-dom'
import {
  HomeIcon,
  RectangleGroupIcon,
  PencilSquareIcon,
  MapPinIcon,
  MegaphoneIcon,
} from '@heroicons/react/24/outline'
import styles from './BottomNav.module.css'

const NAV_ITEMS = [
  { label: '홈', href: '/#hero', icon: HomeIcon },
  { label: '프로그램', href: '/#programs', icon: RectangleGroupIcon },
  { label: '참가신청', href: '/#apply', icon: PencilSquareIcon },
  { label: '오시는길', href: '/#location', icon: MapPinIcon },
  { label: '공지', href: '/#notice', icon: MegaphoneIcon },
]

export default function BottomNav() {
  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <div className={styles.wrapper}>
      <nav className={styles.nav}>
        <div className={styles.inner}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = isHome && location.hash === item.href.replace('/', '')

            return (
              <a
                key={item.href}
                href={item.href}
                className={`${styles.item} ${isActive ? styles.active : ''}`}
              >
                <Icon className={styles.icon} strokeWidth={isActive ? 2.5 : 1.5} />
                <span className={styles.label}>{item.label}</span>
              </a>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
