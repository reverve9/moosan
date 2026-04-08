import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeftIcon,
  Bars3Icon,
  ClipboardDocumentListIcon,
  MegaphoneIcon,
  MapPinIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline'
import { isSubPage } from '@/lib/routing'
import { useCart } from '@/store/cartStore'
import styles from './Header.module.css'

const MENU_ITEMS = [
  { label: '공지사항', path: '/notice', icon: MegaphoneIcon },
  { label: '참가신청', path: '/apply', icon: PencilSquareIcon },
  { label: '오시는 길', path: '/location', icon: MapPinIcon },
]

const SCROLL_THRESHOLD = 40

export default function Header() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const menuRef = useRef<HTMLDivElement>(null)
  const { totalCount } = useCart()

  const isHome = location.pathname === '/'
  const subPage = isSubPage(location.pathname)

  useEffect(() => {
    if (!isHome) {
      setScrolled(false)
      return
    }
    const handleScroll = () => {
      setScrolled(window.scrollY > SCROLL_THRESHOLD)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [isHome])

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

  const transparent = isHome && !scrolled
  const headerClass = `${styles.header} ${transparent ? styles.transparent : ''}`

  return (
    <header className={headerClass}>
      <div className={styles.inner}>
        {subPage && (
          <button
            type="button"
            onClick={() => navigate(-1)}
            className={styles.backButton}
            aria-label="이전 페이지"
          >
            <ArrowLeftIcon className={styles.backIcon} />
          </button>
        )}
        <Link to="/" className={styles.logo} aria-label="설악무산문화축전 홈">
          <img
            src="/images/header_logo.png"
            alt="설악무산문화축전"
            className={styles.logoImage}
          />
        </Link>
        <div className={styles.actions}>
          <button
            type="button"
            onClick={() => navigate('/cart')}
            className={styles.cartButton}
            aria-label={
              totalCount > 0
                ? `내 주문 (장바구니 ${totalCount}개 담김)`
                : '내 주문'
            }
          >
            <ClipboardDocumentListIcon className={styles.cartIcon} />
            {totalCount > 0 && (
              <span className={styles.cartBadge} aria-hidden="true">
                {totalCount > 99 ? '99+' : totalCount}
              </span>
            )}
          </button>
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
      </div>
    </header>
  )
}
