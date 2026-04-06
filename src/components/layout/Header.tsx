import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bars3Icon,
  MegaphoneIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline'
import styles from './Header.module.css'

const MENU_ITEMS = [
  { label: '공지사항', path: '/notice', icon: MegaphoneIcon },
  { label: '오시는 길', path: '/location', icon: MapPinIcon },
]

export default function Header() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleSelect = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link to="/" className={styles.logo}>
          설악무산문화축전
        </Link>
        <div className={styles.menu} ref={menuRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={styles.menuButton}
            aria-label="메뉴"
            aria-expanded={open}
          >
            <Bars3Icon className={styles.menuIcon} />
          </button>
          {open && (
            <div className={styles.dropdown} role="menu">
              {MENU_ITEMS.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => handleSelect(item.path)}
                    className={styles.dropdownItem}
                    role="menuitem"
                  >
                    <Icon className={styles.dropdownIcon} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
