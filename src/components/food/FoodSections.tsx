import { Minus, Plus, X, Image as ImageIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { fetchFoodBooths, getAssetUrl } from '@/lib/festival'
import { supabase } from '@/lib/supabase'
import {
  fetchAllBoothWaitingCounts,
  fetchBoothWaitingCount,
  getBoothBadge,
} from '@/lib/waiting'
import {
  fetchFoodCategories,
  getCategoryColorIndex,
  type FoodCategoryRow,
} from '@/lib/foodCategories'
import { useCart } from '@/store/cartStore'
import { useToast } from '@/components/ui/Toast'
import type { FoodBoothWithMenus } from '@/types/festival_extras'
import type { Festival } from '@/types/database'
import styles from './FoodSections.module.css'

interface Props {
  festival: Festival
}

type CategoryFilter = 'all' | string

/** Fisher-Yates shuffle (immutable) — 페이지 mount 마다 새 순서로 노출 편향 방지 */
function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export default function FoodSections({ festival }: Props) {
  const [booths, setBooths] = useState<FoodBoothWithMenus[]>([])
  const [categories, setCategories] = useState<FoodCategoryRow[]>([])
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all')
  const [selectedBooth, setSelectedBooth] = useState<FoodBoothWithMenus | null>(null)
  const [waitingCounts, setWaitingCounts] = useState<Map<string, number>>(
    () => new Map(),
  )
  const { hash } = useLocation()
  const scrolledRef = useRef('')
  const [searchParams, setSearchParams] = useSearchParams()
  const qrBoothHandledRef = useRef(false)

  useEffect(() => {
    if (hash !== '#booths') {
      scrolledRef.current = ''
      return
    }
    if (booths.length > 0 && scrolledRef.current !== hash) {
      scrolledRef.current = hash
      setTimeout(() => {
        const el = document.getElementById('booths')
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [hash, booths])

  /* ─── QR 진입: ?booth={id} → 모달 자동 오픈 + 부스 섹션 스크롤 ─── */
  useEffect(() => {
    if (qrBoothHandledRef.current) return
    const boothParam = searchParams.get('booth')
    if (!boothParam || booths.length === 0) return

    const target = booths.find((b) => b.id === boothParam)
    qrBoothHandledRef.current = true

    // 쿼리는 1회 소비 후 제거 (새로고침/뒤로가기 시 재오픈 방지)
    const next = new URLSearchParams(searchParams)
    next.delete('booth')
    setSearchParams(next, { replace: true })

    if (!target) return
    setSelectedBooth(target)
    setTimeout(() => {
      const el = document.getElementById('booths')
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }, [booths, searchParams, setSearchParams])

  const categoryLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories) map.set(c.slug, c.label)
    return map
  }, [categories])

  useEffect(() => {
    let cancelled = false
    fetchFoodBooths(festival.id).then((data) => {
      if (!cancelled) setBooths(shuffle(data))
    })
    fetchFoodCategories()
      .then((rows) => {
        if (!cancelled) setCategories(rows.filter((r) => r.is_active))
      })
      .catch(() => {
        /* 카테고리 fetch 실패 시 탭은 '전체' 만 노출 */
      })
    return () => {
      cancelled = true
    }
  }, [festival.id])

  /* ─── food_booths 상태 (is_open/is_paused) Realtime 반영 ─── */
  useEffect(() => {
    const channel = supabase
      .channel('food-booths-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'food_booths',
          filter: `festival_id=eq.${festival.id}`,
        },
        (payload) => {
          const updated = payload.new as
            | { id?: string; is_open?: boolean; is_paused?: boolean; is_active?: boolean }
            | null
          if (!updated?.id) return
          setBooths((prev) =>
            prev.map((b) =>
              b.id === updated.id
                ? {
                    ...b,
                    is_open: updated.is_open ?? b.is_open,
                    is_paused: updated.is_paused ?? b.is_paused,
                    is_active: updated.is_active ?? b.is_active,
                  }
                : b,
            ),
          )
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [festival.id])

  /* ─── food_menus 품절 토글 Realtime 반영 ─── */
  // 부스 대시보드에서 메뉴 품절을 토글하면 FoodSections 가 들고 있는 booths
  // 안의 menus 배열에서 해당 메뉴의 is_sold_out / is_active 를 즉시 업데이트.
  // food_menus 는 booth_id 컬럼만 있고 festival_id 는 없어서 publication 전체
  // 구독 후 클라이언트 측에서 booth_id 매칭으로 필터링.
  useEffect(() => {
    const channel = supabase
      .channel('food-menus-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'food_menus',
        },
        (payload) => {
          const updated = payload.new as
            | {
                id?: string
                booth_id?: string
                is_sold_out?: boolean
                is_active?: boolean
                price?: number | null
              }
            | null
          if (!updated?.id || !updated.booth_id) return
          setBooths((prev) =>
            prev.map((b) => {
              if (b.id !== updated.booth_id) return b
              return {
                ...b,
                menus: b.menus.map((m) =>
                  m.id === updated.id
                    ? {
                        ...m,
                        is_sold_out: updated.is_sold_out ?? m.is_sold_out,
                        is_active: updated.is_active ?? m.is_active,
                        price: updated.price !== undefined ? updated.price : m.price,
                      }
                    : m,
                ),
              }
            }),
          )
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  /* ─── 매장별 대기 건수 — mount 시 일괄 fetch + Realtime 구독 ─── */
  useEffect(() => {
    let cancelled = false

    const refetchAll = () => {
      fetchAllBoothWaitingCounts().then((map) => {
        if (!cancelled) setWaitingCounts(map)
      })
    }

    refetchAll()

    // 채널 두 개로 분리 — supabase-js 가 같은 채널 안에 postgres_changes 를
    // 여러 개 chain 하면 첫 번째만 활성화되는 케이스가 있어 안전한 패턴.
    const itemsChannel = supabase
      .channel('booth-waiting-items')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_items',
        },
        (payload) => {
          const newRow = payload.new as { booth_id?: string } | null
          const oldRow = payload.old as { booth_id?: string } | null
          const boothId = newRow?.booth_id ?? oldRow?.booth_id

          // DELETE 이벤트는 REPLICA IDENTITY DEFAULT 환경에선 payload.old 가
          // PK (id) 만 갖고 booth_id 가 없음 → 어느 booth 의 카운트가 줄었는지
          // 알 수 없으니 안전하게 전체 refetch (25행 비용 무시 가능).
          if (!boothId) {
            refetchAll()
            return
          }

          fetchBoothWaitingCount(boothId).then((count) => {
            if (cancelled) return
            setWaitingCounts((prev) => {
              const next = new Map(prev)
              next.set(boothId, count)
              return next
            })
          })
        },
      )
      .subscribe()

    // orders 상태 변경 (pending → paid) 은 order_items 자체를 안 건드리므로
    // 별도 채널로 구독해서 전체 뷰 refetch. 25행 비용은 무시 가능.
    // REPLICA IDENTITY DEFAULT 환경에선 payload.old 가 PK 만 갖고 status 는
    // undefined 이라 신구 비교로 skip 하지 않고, oldStatus 가 known 인 경우만 skip.
    const ordersChannel = supabase
      .channel('booth-waiting-orders')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          const newStatus = (payload.new as { status?: string } | null)?.status
          const oldStatus = (payload.old as { status?: string } | null)?.status
          if (newStatus && oldStatus && newStatus === oldStatus) return
          refetchAll()
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(itemsChannel)
      void supabase.removeChannel(ordersChannel)
    }
  }, [])

  // ESC 로 모달 닫기 + body 스크롤 락
  useEffect(() => {
    if (!selectedBooth) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedBooth(null)
    }
    document.addEventListener('keydown', handleKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = prevOverflow
    }
  }, [selectedBooth])

  const filteredBooths = useMemo(() => {
    if (activeCategory === 'all') return booths
    return booths.filter((b) => b.category === activeCategory)
  }, [booths, activeCategory])

  // layout_image_url 은 05_musan_food.sql 에서 추가된 신규 컬럼
  const layoutPath = (festival as Festival & { layout_image_url?: string | null })
    .layout_image_url
  const layoutUrl = getAssetUrl(layoutPath ?? null)

  return (
    <>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>부스 위치도</h2>
        <div className={styles.layoutWrap}>
          {layoutUrl ? (
            <img
              src={layoutUrl}
              alt="음식문화페스티벌 부스 위치도"
              className={styles.layoutImage}
            />
          ) : (
            <div className={styles.layoutPlaceholder} aria-hidden="true">
              부스 위치도가 곧 공개됩니다
            </div>
          )}
        </div>
      </section>

      {booths.length > 0 && (
        <section className={styles.section}>
          <h2 id="booths" className={styles.sectionTitle}>참여 매장</h2>
          <div className={styles.tabs} role="tablist" aria-label="매장 카테고리">
            {[{ key: 'all' as CategoryFilter, label: '전체' }, ...categories.map((c) => ({ key: c.slug, label: c.label }))].map((t) => {
              const active = activeCategory === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`${styles.tab} ${active ? styles.tabActive : ''}`}
                  onClick={() => setActiveCategory(t.key)}
                >
                  {t.label}
                </button>
              )
            })}
          </div>

          {filteredBooths.length === 0 ? (
            <p className={styles.emptyBooths}>해당 카테고리에 매장이 없습니다</p>
          ) : (
            <ul className={styles.boothList}>
              {filteredBooths.map((b) => {
                const thumb = getAssetUrl(b.thumbnail_url)
                const waitingCount = waitingCounts.get(b.id)
                const badge =
                  waitingCount !== undefined ? getBoothBadge(waitingCount) : null
                const isClosed = !b.is_open
                const isPaused = b.is_open && b.is_paused
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      className={`${styles.boothItem} ${
                        isClosed ? styles.boothItemClosed : ''
                      } ${isPaused ? styles.boothItemPaused : ''}`}
                      onClick={() => setSelectedBooth(b)}
                    >
                      <div className={styles.boothThumb}>
                        {thumb ? (
                          <img src={thumb} alt={b.name} />
                        ) : (
                          <div className={styles.boothThumbPlaceholder} aria-hidden="true" />
                        )}
                      </div>
                      <div className={styles.boothInfo}>
                        <div className={styles.boothNameRow}>
                          {b.category && categoryLabel.get(b.category) && (
                            <span
                              className={`${styles.boothCategory} ${
                                styles[`catColor${getCategoryColorIndex(b.category, categories)}`]
                              }`}
                            >
                              {categoryLabel.get(b.category)}
                            </span>
                          )}
                          <h3 className={styles.boothName}>{b.name}</h3>
                          {isClosed ? (
                            <span className={`${styles.statusBadge} ${styles.statusBadgeClosed}`}>
                              영업 종료
                            </span>
                          ) : isPaused ? (
                            <span className={`${styles.statusBadge} ${styles.statusBadgePaused}`}>
                              준비 중
                            </span>
                          ) : badge ? (
                            <span
                              className={`${styles.waitingBadge} ${
                                styles[`waiting_${badge.level}`]
                              }`}
                            >
                              {badge.label}
                            </span>
                          ) : null}
                        </div>
                        {b.description && (
                          <p className={styles.boothDesc}>{b.description}</p>
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {selectedBooth && (
        <BoothModal
          booth={selectedBooth}
          categoryLabel={
            selectedBooth.category ? categoryLabel.get(selectedBooth.category) ?? null : null
          }
          categoryColorClass={
            selectedBooth.category
              ? styles[`catColor${getCategoryColorIndex(selectedBooth.category, categories)}`]
              : ''
          }
          waitingCount={waitingCounts.get(selectedBooth.id) ?? 0}
          onClose={() => setSelectedBooth(null)}
        />
      )}
    </>
  )
}

// ──────────────── Modal ────────────────
function BoothModal({
  booth,
  categoryLabel,
  categoryColorClass,
  waitingCount,
  onClose,
}: {
  booth: FoodBoothWithMenus
  categoryLabel: string | null
  categoryColorClass: string
  waitingCount: number
  onClose: () => void
}) {
  const thumb = getAssetUrl(booth.thumbnail_url)
  const badge = getBoothBadge(waitingCount)

  return (
    <div
      className={styles.modalBackdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${booth.name} 상세`}
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={styles.modalClose}
          onClick={onClose}
          aria-label="닫기"
        >
          <X className={styles.modalCloseIcon} />
        </button>

        <div className={styles.modalHeader}>
          <div className={styles.modalThumb}>
            {thumb ? (
              <img src={thumb} alt={booth.name} />
            ) : (
              <div className={styles.modalThumbPlaceholder} aria-hidden="true" />
            )}
          </div>
          <div className={styles.modalHeadText}>
            <div className={styles.modalNameRow}>
              {categoryLabel && (
                <span className={`${styles.boothCategory} ${categoryColorClass}`}>
                  {categoryLabel}
                </span>
              )}
              {booth.booth_no && (
                <span className={styles.modalBoothNo}>{booth.booth_no}</span>
              )}
            </div>
            <h3 className={styles.modalName}>{booth.name}</h3>
            {booth.description && (
              <p className={styles.modalDesc}>{booth.description}</p>
            )}
          </div>
        </div>

        <div className={styles.modalDivider} />

        {/* ─── 영업 상태 안내 ─── */}
        {!booth.is_open ? (
          <div className={`${styles.statusNotice} ${styles.statusNoticeClosed}`}>
            오늘 영업이 종료되었습니다.
          </div>
        ) : booth.is_paused ? (
          <div className={`${styles.statusNotice} ${styles.statusNoticePaused}`}>
            지금은 준비 중이라 잠시 주문을 받지 않아요.
          </div>
        ) : null}

        {/* ─── 현재 대기 현황 ─── */}
        <div className={styles.waitingStatus}>
          {waitingCount === 0 ? (
            <p className={styles.waitingFreeMsg}>
              지금은 여유로워요. 바로 주문하세요!
            </p>
          ) : (
            <>
              <h4 className={styles.waitingStatusTitle}>현재 대기 현황</h4>
              <div className={styles.waitingStatusGrid}>
                <div className={styles.waitingStatusRow}>
                  <span className={styles.waitingStatusLabel}>대기 주문</span>
                  <span className={styles.waitingStatusValue}>
                    {badge.label}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className={styles.modalBody}>
          <h4 className={styles.modalSection}>메뉴</h4>
          {booth.menus.length === 0 ? (
            <p className={styles.emptyMenu}>메뉴 정보가 곧 업데이트됩니다</p>
          ) : (
            <ul className={styles.menuList}>
              {booth.menus.map((m) => (
                <MenuItemRow key={m.id} booth={booth} menu={m} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ──────────────── MenuItemRow ────────────────
type MenuItem = FoodBoothWithMenus['menus'][number]

function MenuItemRow({
  booth,
  menu,
}: {
  booth: FoodBoothWithMenus
  menu: MenuItem
}) {
  const { items, addItem } = useCart()
  const { showToast } = useToast()
  const [pendingQty, setPendingQty] = useState(1)

  const menuImg = getAssetUrl(menu.image_url)
  const inCart = items.find((i) => i.menuId === menu.id)
  const soldOut = menu.is_sold_out
  const boothUnavailable = !booth.is_open || booth.is_paused
  const orderable = !soldOut && !boothUnavailable && menu.price != null && menu.price > 0

  const handleAdd = () => {
    if (!orderable || menu.price == null) return
    addItem({
      menuId: menu.id,
      boothId: booth.id,
      boothNo: booth.booth_no ?? '',
      boothName: booth.name,
      menuName: menu.name,
      price: menu.price,
      quantity: pendingQty,
      imageUrl: menu.image_url ?? undefined,
    })
    showToast(`장바구니에 ${pendingQty}개 담았어요`)
    setPendingQty(1)
  }

  return (
    <li className={`${styles.menuItem} ${soldOut ? styles.menuItemSoldOut : ''}`}>
      <div className={styles.menuItemThumb}>
        {menuImg ? (
          <img src={menuImg} alt={menu.name} />
        ) : (
          <div className={styles.menuItemThumbPlaceholder} aria-hidden="true">
            <ImageIcon />
          </div>
        )}
        {soldOut && (
          <div className={styles.soldOutOverlay} aria-hidden="true">
            품절
          </div>
        )}
      </div>
      <div className={styles.menuItemContent}>
        <div className={styles.menuLeft}>
          <span className={styles.menuName}>
            {soldOut && <span className={styles.soldOutBadge}>품절</span>}
            {menu.name}
          </span>
          {menu.description && <p className={styles.menuDesc}>{menu.description}</p>}
        </div>
        <div className={styles.menuRight}>
          <span className={styles.menuPrice}>
            {menu.price != null ? `${menu.price.toLocaleString()}원` : '시가'}
          </span>
          {orderable && (
            <div className={styles.menuActions}>
              <div className={styles.stepper}>
                <button
                  type="button"
                  className={styles.stepBtn}
                  onClick={() => setPendingQty((q) => Math.max(1, q - 1))}
                  aria-label="수량 줄이기"
                  disabled={pendingQty <= 1}
                >
                  <Minus className={styles.stepIcon} />
                </button>
                <span className={styles.stepValue}>{pendingQty}</span>
                <button
                  type="button"
                  className={styles.stepBtn}
                  onClick={() => setPendingQty((q) => q + 1)}
                  aria-label="수량 늘리기"
                >
                  <Plus className={styles.stepIcon} />
                </button>
              </div>
              <button type="button" className={styles.addBtn} onClick={handleAdd}>
                담기
              </button>
            </div>
          )}
        </div>

        {inCart && !soldOut && (
          <p className={styles.inCartBadge}>
            장바구니에 {inCart.quantity}개 담겨있어요
          </p>
        )}
      </div>
    </li>
  )
}
