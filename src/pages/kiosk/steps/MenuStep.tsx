import { Image as ImageIcon, Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchFoodBooths, getAssetUrl } from '@/lib/festival'
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
import { useCart, type CartItem } from '@/store/cartStore'
import { useToast } from '@/components/ui/Toast'
import type { FoodBoothWithMenus } from '@/types/festival_extras'
import foodStyles from '@/components/food/FoodSections.module.css'
import styles from './MenuStep.module.css'

interface Props {
  onGoToPhone: () => void
}

type CategoryFilter = 'all' | string

/** Fisher-Yates shuffle (immutable) — 페이지 mount 마다 새 순서로 노출 편향 방지. */
function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

interface BoothGroup {
  boothId: string
  boothName: string
  items: CartItem[]
  subtotal: number
}

function groupByBooth(items: CartItem[]): BoothGroup[] {
  const map = new Map<string, BoothGroup>()
  for (const item of items) {
    const existing = map.get(item.boothId)
    if (existing) {
      existing.items.push(item)
      existing.subtotal += item.price * item.quantity
    } else {
      map.set(item.boothId, {
        boothId: item.boothId,
        boothName: item.boothName,
        items: [item],
        subtotal: item.price * item.quantity,
      })
    }
  }
  return Array.from(map.values())
}

/**
 * 키오스크 menu step (신규).
 *
 * 사용자앱 부스 페이지(`FoodSections`) 의 카테고리 탭 + 부스 카드 + BoothModal
 * UX 를 그대로 복제. 키오스크 전용 추가:
 *   - 상단 sticky 카트 바 (요약 + "결제 요청" 버튼)
 *   - 카트 모달 (사용자앱 CartPage 와 동일한 편집 UX)
 *
 * 제거:
 *   - 부스 위치도 / "참여 매장" 헤딩 / 미리보기 배너
 *   - `is_ordering_open` 분기 (키오스크는 직원 운영 → 항상 주문 가능)
 *   - QR `?booth=` 자동 진입 (외부 URL 진입 의도 없음)
 */
export default function MenuStep({ onGoToPhone }: Props) {
  const [booths, setBooths] = useState<FoodBoothWithMenus[]>([])
  const [categories, setCategories] = useState<FoodCategoryRow[]>([])
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all')
  const [selectedBooth, setSelectedBooth] = useState<FoodBoothWithMenus | null>(null)
  const [waitingCounts, setWaitingCounts] = useState<Map<string, number>>(
    () => new Map(),
  )
  const [cartOpen, setCartOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const { items, totalAmount, totalCount } = useCart()

  // festival_id → 부스 + 메뉴 fetch
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: festival } = await supabase
        .from('festivals')
        .select('id')
        .eq('slug', 'food')
        .single()
      if (!festival || cancelled) {
        setLoading(false)
        return
      }
      const data = await fetchFoodBooths(festival.id)
      if (cancelled) return
      setBooths(shuffle(data))

      const cats = await fetchFoodCategories().catch(() => [] as FoodCategoryRow[])
      if (!cancelled) setCategories(cats.filter((c) => c.is_active))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const categoryLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories) map.set(c.slug, c.label)
    return map
  }, [categories])

  /* ─── food_booths Realtime (is_open/is_paused) ─── */
  useEffect(() => {
    const channel = supabase
      .channel('kiosk-food-booths-status')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'food_booths' },
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
  }, [])

  /* ─── food_menus Realtime (품절 토글) ─── */
  useEffect(() => {
    const channel = supabase
      .channel('kiosk-food-menus-status')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'food_menus' },
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

  /* ─── 매장별 대기 건수 ─── */
  useEffect(() => {
    let cancelled = false
    const refetchAll = () => {
      fetchAllBoothWaitingCounts().then((map) => {
        if (!cancelled) setWaitingCounts(map)
      })
    }
    refetchAll()

    const itemsChannel = supabase
      .channel('kiosk-booth-waiting-items')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items' },
        (payload) => {
          const newRow = payload.new as { booth_id?: string } | null
          const oldRow = payload.old as { booth_id?: string } | null
          const boothId = newRow?.booth_id ?? oldRow?.booth_id
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

    const ordersChannel = supabase
      .channel('kiosk-booth-waiting-orders')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
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
    if (!selectedBooth && !cartOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (cartOpen) setCartOpen(false)
      else if (selectedBooth) setSelectedBooth(null)
    }
    document.addEventListener('keydown', handleKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = prevOverflow
    }
  }, [selectedBooth, cartOpen])

  const filteredBooths = useMemo(() => {
    if (activeCategory === 'all') return booths
    return booths.filter((b) => b.category === activeCategory)
  }, [booths, activeCategory])

  if (loading) {
    return <div className={styles.loading}>메뉴 불러오는 중…</div>
  }

  return (
    <div className={styles.page}>
      {/* ─── 상단 sticky 카트 바 ─── */}
      <div className={styles.stickyCartBar}>
        <button
          type="button"
          className={styles.cartSummary}
          onClick={() => setCartOpen(true)}
          disabled={items.length === 0}
          aria-label="장바구니 열기"
        >
          <ShoppingCart strokeWidth={1.4} size={24} aria-hidden />
          <span className={styles.cartCount}>
            {items.length === 0 ? '장바구니 비어있음' : `${totalCount}개`}
          </span>
          {items.length > 0 && (
            <span className={styles.cartAmount}>
              {totalAmount.toLocaleString()}원
            </span>
          )}
        </button>
        <button
          type="button"
          className={styles.payButton}
          onClick={onGoToPhone}
          disabled={items.length === 0}
        >
          결제 요청
        </button>
      </div>

      {/* ─── 본문: 카테고리 탭 + 부스 그리드 ─── */}
      <div className={styles.body}>
        {booths.length === 0 ? (
          <div className={styles.empty}>등록된 매장이 없습니다.</div>
        ) : (
          <>
            <div className={foodStyles.tabs} role="tablist" aria-label="매장 카테고리">
              {[
                { key: 'all' as CategoryFilter, label: '전체' },
                ...categories.map((c) => ({ key: c.slug, label: c.label })),
              ].map((t) => {
                const active = activeCategory === t.key
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`${foodStyles.tab} ${active ? foodStyles.tabActive : ''}`}
                    onClick={() => setActiveCategory(t.key)}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>

            {filteredBooths.length === 0 ? (
              <p className={foodStyles.emptyBooths}>해당 카테고리에 매장이 없습니다</p>
            ) : (
              <ul className={foodStyles.boothList}>
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
                        className={`${foodStyles.boothItem} ${
                          isClosed ? foodStyles.boothItemClosed : ''
                        } ${isPaused ? foodStyles.boothItemPaused : ''}`}
                        onClick={() => setSelectedBooth(b)}
                      >
                        <div className={foodStyles.boothThumb}>
                          {thumb ? (
                            <img src={thumb} alt={b.name} />
                          ) : (
                            <div
                              className={foodStyles.boothThumbPlaceholder}
                              aria-hidden="true"
                            />
                          )}
                        </div>
                        <div className={foodStyles.boothInfo}>
                          <div className={foodStyles.boothNameRow}>
                            {b.category && categoryLabel.get(b.category) && (
                              <span
                                className={`${foodStyles.boothCategory} ${
                                  foodStyles[
                                    `catColor${getCategoryColorIndex(b.category, categories)}`
                                  ]
                                }`}
                              >
                                {categoryLabel.get(b.category)}
                              </span>
                            )}
                            <h3 className={foodStyles.boothName}>{b.name}</h3>
                            {isClosed ? (
                              <span
                                className={`${foodStyles.statusBadge} ${foodStyles.statusBadgeClosed}`}
                              >
                                영업 종료
                              </span>
                            ) : isPaused ? (
                              <span
                                className={`${foodStyles.statusBadge} ${foodStyles.statusBadgePaused}`}
                              >
                                준비 중
                              </span>
                            ) : badge ? (
                              <span
                                className={`${foodStyles.waitingBadge} ${
                                  foodStyles[`waiting_${badge.level}`]
                                }`}
                              >
                                {badge.label}
                              </span>
                            ) : null}
                          </div>
                          {b.description && (
                            <p className={foodStyles.boothDesc}>{b.description}</p>
                          )}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </div>

      {selectedBooth && (
        <BoothModal
          booth={selectedBooth}
          categoryLabel={
            selectedBooth.category
              ? categoryLabel.get(selectedBooth.category) ?? null
              : null
          }
          categoryColorClass={
            selectedBooth.category
              ? foodStyles[
                  `catColor${getCategoryColorIndex(selectedBooth.category, categories)}`
                ]
              : ''
          }
          waitingCount={waitingCounts.get(selectedBooth.id) ?? 0}
          onClose={() => setSelectedBooth(null)}
        />
      )}

      {cartOpen && <CartModal onClose={() => setCartOpen(false)} onPay={onGoToPhone} />}
    </div>
  )
}

// ──────────────── Booth modal ────────────────
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
      className={foodStyles.modalBackdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${booth.name} 상세`}
    >
      <div className={foodStyles.modal} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={foodStyles.modalClose}
          onClick={onClose}
          aria-label="닫기"
        >
          <X className={foodStyles.modalCloseIcon} />
        </button>

        <div className={foodStyles.modalHeader}>
          <div className={foodStyles.modalThumb}>
            {thumb ? (
              <img src={thumb} alt={booth.name} />
            ) : (
              <div className={foodStyles.modalThumbPlaceholder} aria-hidden="true" />
            )}
          </div>
          <div className={foodStyles.modalHeadText}>
            <div className={foodStyles.modalNameRow}>
              {categoryLabel && (
                <span className={`${foodStyles.boothCategory} ${categoryColorClass}`}>
                  {categoryLabel}
                </span>
              )}
              {booth.booth_no && (
                <span className={foodStyles.modalBoothNo}>{booth.booth_no}</span>
              )}
            </div>
            <h3 className={foodStyles.modalName}>{booth.name}</h3>
            {booth.description && (
              <p className={foodStyles.modalDesc}>{booth.description}</p>
            )}
          </div>
        </div>

        <div className={foodStyles.modalDivider} />

        {!booth.is_open ? (
          <div className={`${foodStyles.statusNotice} ${foodStyles.statusNoticeClosed}`}>
            오늘 영업이 종료되었습니다.
          </div>
        ) : booth.is_paused ? (
          <div className={`${foodStyles.statusNotice} ${foodStyles.statusNoticePaused}`}>
            지금은 준비 중이라 잠시 주문을 받지 않아요.
          </div>
        ) : null}

        <div className={foodStyles.waitingStatus}>
          {waitingCount === 0 ? (
            <p className={foodStyles.waitingFreeMsg}>
              지금은 여유로워요. 바로 주문하세요!
            </p>
          ) : (
            <>
              <h4 className={foodStyles.waitingStatusTitle}>현재 대기 현황</h4>
              <div className={foodStyles.waitingStatusGrid}>
                <div className={foodStyles.waitingStatusRow}>
                  <span className={foodStyles.waitingStatusLabel}>대기 주문</span>
                  <span className={foodStyles.waitingStatusValue}>{badge.label}</span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className={foodStyles.modalBody}>
          <h4 className={foodStyles.modalSection}>메뉴</h4>
          {booth.menus.length === 0 ? (
            <p className={foodStyles.emptyMenu}>메뉴 정보가 곧 업데이트됩니다</p>
          ) : (
            <ul className={foodStyles.menuList}>
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

// ──────────────── Menu row ────────────────
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
      acceptsTakeout: menu.accepts_takeout ?? true,
      isTakeout: false,
      isAlcohol: menu.is_alcohol ?? false,
    })
    showToast(`장바구니에 ${pendingQty}개 담았어요`)
    setPendingQty(1)
  }

  return (
    <li className={`${foodStyles.menuItem} ${soldOut ? foodStyles.menuItemSoldOut : ''}`}>
      <div className={foodStyles.menuItemThumb}>
        {menuImg ? (
          <img src={menuImg} alt={menu.name} />
        ) : (
          <div className={foodStyles.menuItemThumbPlaceholder} aria-hidden="true">
            <ImageIcon />
          </div>
        )}
        {soldOut && (
          <div className={foodStyles.soldOutOverlay} aria-hidden="true">
            품절
          </div>
        )}
      </div>
      <div className={foodStyles.menuItemContent}>
        <div className={foodStyles.menuLeft}>
          <span className={foodStyles.menuName}>
            {soldOut && <span className={foodStyles.soldOutBadge}>품절</span>}
            {menu.name}
          </span>
          {menu.tags && menu.tags.length > 0 && (
            <div className={foodStyles.menuTags}>
              {menu.tags.map((t) => (
                <span key={t} className={foodStyles.menuTagBadge}>
                  {t}
                </span>
              ))}
            </div>
          )}
          {menu.description && <p className={foodStyles.menuDesc}>{menu.description}</p>}
        </div>
        <div className={foodStyles.menuRight}>
          <span className={foodStyles.menuPrice}>
            {menu.price != null ? `${menu.price.toLocaleString()}원` : '시가'}
          </span>
          {orderable && (
            <div className={foodStyles.menuActions}>
              <div className={foodStyles.stepper}>
                <button
                  type="button"
                  className={foodStyles.stepBtn}
                  onClick={() => setPendingQty((q) => Math.max(1, q - 1))}
                  aria-label="수량 줄이기"
                  disabled={pendingQty <= 1}
                >
                  <Minus className={foodStyles.stepIcon} />
                </button>
                <span className={foodStyles.stepValue}>{pendingQty}</span>
                <button
                  type="button"
                  className={foodStyles.stepBtn}
                  onClick={() => setPendingQty((q) => q + 1)}
                  aria-label="수량 늘리기"
                >
                  <Plus className={foodStyles.stepIcon} />
                </button>
              </div>
              <button type="button" className={foodStyles.addBtn} onClick={handleAdd}>
                담기
              </button>
            </div>
          )}
        </div>

        {inCart && !soldOut && (
          <p className={foodStyles.inCartBadge}>
            장바구니에 {inCart.quantity}개 담겨있어요
          </p>
        )}
      </div>
    </li>
  )
}

// ──────────────── Cart modal ────────────────
function CartModal({ onClose, onPay }: { onClose: () => void; onPay: () => void }) {
  const { items, totalAmount, totalCount, updateQuantity, removeItem, setItemTakeout, clear } =
    useCart()
  const groups = useMemo(() => groupByBooth(items), [items])

  const handlePay = () => {
    onClose()
    onPay()
  }

  return (
    <div
      className={styles.cartBackdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="장바구니"
    >
      <div className={styles.cartModal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.cartHeader}>
          <h2 className={styles.cartTitle}>장바구니 · {totalCount}개</h2>
          <button
            type="button"
            className={styles.cartClose}
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={28} strokeWidth={1.4} />
          </button>
        </header>

        {items.length === 0 ? (
          <div className={styles.cartEmpty}>장바구니가 비어있어요</div>
        ) : (
          <div className={styles.cartBody}>
            <div className={styles.cartActionsRow}>
              <button type="button" className={styles.cartClearBtn} onClick={clear}>
                전체 비우기
              </button>
            </div>
            <ul className={styles.cartBoothList}>
              {groups.map((group) => (
                <li key={group.boothId} className={styles.cartBoothGroup}>
                  <div className={styles.cartBoothHeader}>
                    <h3 className={styles.cartBoothName}>{group.boothName}</h3>
                    <span className={styles.cartBoothSubtotal}>
                      {group.subtotal.toLocaleString()}원
                    </span>
                  </div>
                  <ul className={styles.cartItemList}>
                    {group.items.map((item) => {
                      const img = getAssetUrl(item.imageUrl ?? null)
                      const takeoutLocked = item.acceptsTakeout === false
                      return (
                        <li key={item.menuId} className={styles.cartItem}>
                          <div className={styles.cartItemThumb}>
                            {img ? (
                              <img src={img} alt={item.menuName} />
                            ) : (
                              <div
                                className={styles.cartItemThumbPlaceholder}
                                aria-hidden="true"
                              />
                            )}
                          </div>
                          <div className={styles.cartItemInfo}>
                            <div className={styles.cartItemHead}>
                              <span className={styles.cartItemName}>
                                {item.menuName}
                                {takeoutLocked && (
                                  <span className={styles.cartItemNoTakeout}>
                                    포장 불가
                                  </span>
                                )}
                              </span>
                              <button
                                type="button"
                                className={styles.cartItemRemove}
                                onClick={() => removeItem(item.menuId)}
                                aria-label={`${item.menuName} 삭제`}
                              >
                                <Trash2 size={22} strokeWidth={1.4} />
                              </button>
                            </div>
                            <div className={styles.cartTakeoutRow}>
                              <button
                                type="button"
                                className={`${styles.cartTakeoutBtn} ${!item.isTakeout ? styles.cartTakeoutBtnActive : ''}`}
                                onClick={() => setItemTakeout(item.menuId, false)}
                                aria-pressed={!item.isTakeout}
                              >
                                매장
                              </button>
                              <button
                                type="button"
                                className={`${styles.cartTakeoutBtn} ${item.isTakeout ? styles.cartTakeoutBtnActive : ''}`}
                                onClick={() => {
                                  if (!takeoutLocked) setItemTakeout(item.menuId, true)
                                }}
                                disabled={takeoutLocked}
                                aria-pressed={item.isTakeout}
                                title={takeoutLocked ? '포장 불가 메뉴' : undefined}
                              >
                                포장
                              </button>
                            </div>
                            <div className={styles.cartItemBottom}>
                              <div className={styles.cartStepper}>
                                <button
                                  type="button"
                                  className={styles.cartStepBtn}
                                  onClick={() =>
                                    updateQuantity(item.menuId, item.quantity - 1)
                                  }
                                  aria-label="수량 줄이기"
                                >
                                  <Minus size={20} strokeWidth={1.4} />
                                </button>
                                <span className={styles.cartStepValue}>
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  className={styles.cartStepBtn}
                                  onClick={() =>
                                    updateQuantity(item.menuId, item.quantity + 1)
                                  }
                                  aria-label="수량 늘리기"
                                >
                                  <Plus size={20} strokeWidth={1.4} />
                                </button>
                              </div>
                              <span className={styles.cartItemPrice}>
                                {(item.price * item.quantity).toLocaleString()}원
                              </span>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )}

        <footer className={styles.cartFooter}>
          <div className={styles.cartTotal}>
            <span className={styles.cartTotalLabel}>합계</span>
            <span className={styles.cartTotalAmount}>
              {totalAmount.toLocaleString()}원
            </span>
          </div>
          <button
            type="button"
            className={styles.cartPayBtn}
            onClick={handlePay}
            disabled={items.length === 0}
          >
            결제 요청
          </button>
        </footer>
      </div>
    </div>
  )
}
