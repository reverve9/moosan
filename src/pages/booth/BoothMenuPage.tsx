import { useCallback, useEffect, useState } from 'react'
import { PhotoIcon, StarIcon } from '@heroicons/react/24/solid'
import { useBoothSession } from '@/components/booth/BoothLayout'
import { fetchBoothMenus, setMenuSoldOut } from '@/lib/boothMenus'
import type { FoodMenu } from '@/types/database'
import styles from './BoothMenuPage.module.css'

export default function BoothMenuPage() {
  const session = useBoothSession()
  const boothId = session.boothId

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
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <h1 className={styles.pageTitle}>품절 관리</h1>
          <p className={styles.pageSub}>품절 토글 시 즉시 손님 메뉴에 반영됩니다.</p>
        </div>
      </header>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading ? (
        <div className={styles.empty}>메뉴를 불러오는 중...</div>
      ) : menus.length === 0 ? (
        <div className={styles.empty}>등록된 메뉴가 없습니다.</div>
      ) : (
        <div className={styles.menuGrid}>
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
                    {menu.is_signature && (
                      <StarIcon className={styles.signatureIcon} aria-label="시그니처" />
                    )}
                    <span className={styles.name}>{menu.name}</span>
                  </div>
                  <div className={styles.price}>
                    {menu.price !== null ? `${menu.price.toLocaleString()}원` : '가격 미정'}
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
                  <span className={styles.toggleLabel}>{soldOut ? '품절' : '판매중'}</span>
                </button>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
