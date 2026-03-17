import { Link } from 'react-router-dom'
import styles from './Header.module.css'

const NAV_ITEMS = [
  { label: '축제소개', href: '/#about' },
  { label: '프로그램', href: '/#programs' },
  { label: '참가신청', href: '/#apply' },
  { label: '오시는 길', href: '/#location' },
  { label: '공지사항', href: '/#notice' },
]

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link to="/" className={styles.logo}>
          설악무산문화축전
        </Link>
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <a key={item.href} href={item.href} className={styles.navLink}>
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  )
}
