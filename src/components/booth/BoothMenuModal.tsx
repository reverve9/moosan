import { useCallback, useEffect, useState } from 'react'
import { PhotoIcon, XMarkIcon } from '@heroicons/react/24/solid'
import { fetchBoothMenus, setMenuSoldOut } from '@/lib/boothMenus'
import type { FoodMenu } from '@/types/database'
import styles from './BoothMenuModal.module.css'

interface BoothMenuModalProps {
  boothId: string
  onClose: () => void
}

export default function BoothMenuModal({ boothId, onClose }: BoothMenuModalProps) {
  const [menus, setMenus] = useState<FoodMenu[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyMenuId, setBusyMenuId] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    try {
      const data = await fetchBoothMenus(boothId)
      setMenus(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '메뉴를 불러오지 못했습니다.')
    }
  }, [boothId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    refetch().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [refetch])

  // ESC 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleToggle = useCallback(
    async (menu: FoodMenu) => {
      if (busyMenuId) return
      setBusyMenuId(menu.id)
      const next = !menu.is_sold_out
      // optimistic
      setMenus((prev) =>
        prev.map((m) => (m.id === menu.id ? { ...m, is_sold_out: next } : m)),
      )
      try {
        await setMenuSoldOut(menu.id, next)
      } catch (e) {
        // rollback
        setMenus((prev) =>
          prev.map((m) => (m.id === menu.id ? { ...m, is_sold_out: !next } : m)),
        )
        setError(e instanceof Error ? e.message : '품절 상태 변경 실패')
      } finally {
        setBusyMenuId(null)
      }
    },
    [busyMenuId],
  )

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={styles.modal} role="dialog" aria-modal="true">
        <header className={styles.header}>
          <h2 className={styles.title}>메뉴 관리</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="닫기"
          >
            <XMarkIcon className={styles.closeIcon} />
          </button>
        </header>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.body}>
          {loading ? (
            <div className={styles.empty}>메뉴를 불러오는 중...</div>
          ) : menus.length === 0 ? (
            <div className={styles.empty}>등록된 메뉴가 없습니다.</div>
          ) : (
            <div className={styles.menuList}>
              {menus.map((menu) => {
                const soldOut = menu.is_sold_out
                const busy = busyMenuId === menu.id
                return (
                  <article
                    key={menu.id}
                    className={`${styles.menuCard} ${soldOut ? styles.menuCardSoldOut : ''}`}
                  >
                    <div className={styles.thumb}>
                      {menu.image_url ? (
                        <img src={menu.image_url} alt={menu.name} />
                      ) : (
                        <div className={styles.thumbPlaceholder}>
                          <PhotoIcon />
                        </div>
                      )}
                      {soldOut && <div className={styles.soldOutBadge}>품절</div>}
                    </div>
                    <div className={styles.info}>
                      <div className={styles.nameRow}>
                        <span className={styles.name}>{menu.name}</span>
                      </div>
                      <div className={styles.price}>
                        {menu.price !== null
                          ? `${menu.price.toLocaleString()}원`
                          : '가격 미정'}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`${styles.toggle} ${soldOut ? styles.toggleOn : ''}`}
                      onClick={() => handleToggle(menu)}
                      disabled={busy}
                      aria-pressed={soldOut}
                      aria-label={`${menu.name} 품절 토글`}
                    >
                      <span className={styles.toggleKnob} />
                      <span className={styles.toggleLabel}>
                        {soldOut ? '품절' : '판매중'}
                      </span>
                    </button>
                  </article>
                )
              })}
            </div>
          )}
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.footerBtn} onClick={onClose}>
            닫기
          </button>
        </footer>
      </div>
    </div>
  )
}
