import { useLocation } from 'react-router-dom'
import styles from './BottomNav.module.css'

const NAV_ITEMS = [
  { label: '홈', href: '/#hero', icon: '🏠' },
  { label: '프로그램', href: '/#programs', icon: '📋' },
  { label: '참가신청', href: '/#apply', icon: '✏️' },
  { label: '오시는길', href: '/#location', icon: '📍' },
  { label: '공지', href: '/#notice', icon: '📢' },
]

export default function BottomNav() {
  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <div className={styles.wrapper}>
      <nav className={styles.nav}>
        <div className={styles.inner}>
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`${styles.item} ${isHome && location.hash === item.href.replace('/', '') ? styles.active : ''}`}
            >
              <span className={styles.icon}>{item.icon}</span>
              <span className={styles.label}>{item.label}</span>
            </a>
          ))}
        </div>
      </nav>
    </div>
  )
}
