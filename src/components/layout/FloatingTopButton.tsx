import { ArrowUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import styles from './FloatingTopButton.module.css'

// Header.tsx 의 SCROLL_THRESHOLD 와 동기화 — 헤더가 솔리드로 전환될 때 같이 등장
const SCROLL_THRESHOLD = 40

export default function FloatingTopButton() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > SCROLL_THRESHOLD)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        onClick={handleClick}
        className={`${styles.button} ${visible ? styles.visible : ''}`}
        aria-label="맨 위로"
        aria-hidden={!visible}
        tabIndex={visible ? 0 : -1}
      >
        <ArrowUp className={styles.icon} />
      </button>
    </div>
  )
}
