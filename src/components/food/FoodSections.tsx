import { useEffect, useMemo, useState } from 'react'
import { MinusIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { fetchFoodBooths, getAssetUrl } from '@/lib/festival'
import { supabase } from '@/lib/supabase'
import {
  calcWaitingInfo,
  fetchAllBoothWaitingCounts,
  fetchBoothWaitingCount,
  getBoothBadge,
} from '@/lib/waiting'
import { useCart } from '@/store/cartStore'
import { useToast } from '@/components/ui/Toast'
import type { FoodBoothWithMenus, FoodCategory } from '@/types/festival_extras'
import type { Festival } from '@/types/database'
import styles from './FoodSections.module.css'

interface Props {
  festival: Festival
}

type CategoryFilter = 'all' | FoodCategory

const CATEGORY_TABS: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'korean', label: '한식' },
  { key: 'chinese', label: '중식' },
  { key: 'japanese', label: '일식' },
  { key: 'fusion', label: '퓨전' },
]

const CATEGORY_LABEL: Record<FoodCategory, string> = {
  korean: '한식',
  chinese: '중식',
  japanese: '일식',
  fusion: '퓨전',
}

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
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all')
  const [selectedBooth, setSelectedBooth] = useState<FoodBoothWithMenus | null>(null)
  const [waitingCounts, setWaitingCounts] = useState<Map<string, number>>(
    () => new Map(),
  )

  useEffect(() => {
    let cancelled = false
    fetchFoodBooths(festival.id).then((data) => {
      if (!cancelled) setBooths(shuffle(data))
    })
    return () => {
      cancelled = true
    }
  }, [festival.id])

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
          <h2 className={styles.sectionTitle}>참여 매장</h2>
          <div className={styles.tabs} role="tablist" aria-label="매장 카테고리">
            {CATEGORY_TABS.map((t) => {
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
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      className={styles.boothItem}
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
                          {b.category && (
                            <span className={styles.boothCategory}>
                              {CATEGORY_LABEL[b.category]}
                            </span>
                          )}
                          <h3 className={styles.boothName}>{b.name}</h3>
                          {badge && (
                            <span
                              className={`${styles.waitingBadge} ${
                                styles[`waiting_${badge.level}`]
                              }`}
                            >
                              {badge.label}
                            </span>
                          )}
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
  waitingCount,
  onClose,
}: {
  booth: FoodBoothWithMenus
  waitingCount: number
  onClose: () => void
}) {
  const thumb = getAssetUrl(booth.thumbnail_url)
  const waitingInfo = calcWaitingInfo(waitingCount, booth.avg_prep_minutes)

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
          <XMarkIcon className={styles.modalCloseIcon} />
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
              {booth.category && (
                <span className={styles.boothCategory}>
                  {CATEGORY_LABEL[booth.category]}
                </span>
              )}
              {booth.booth_no && (
                <span className={styles.modalBoothNo}>#{booth.booth_no}</span>
              )}
            </div>
            <h3 className={styles.modalName}>{booth.name}</h3>
            {booth.description && (
              <p className={styles.modalDesc}>{booth.description}</p>
            )}
          </div>
        </div>

        <div className={styles.modalDivider} />

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
                    {waitingInfo.count}건
                  </span>
                </div>
                <div className={styles.waitingStatusRow}>
                  <span className={styles.waitingStatusLabel}>예상 시간</span>
                  <span className={styles.waitingStatusValue}>
                    {waitingInfo.label}
                  </span>
                </div>
              </div>
              <p className={styles.waitingStatusDisclaimer}>
                * 실제 시간은 다를 수 있어요
              </p>
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
  const orderable = !soldOut && menu.price != null && menu.price > 0

  const handleAdd = () => {
    if (!orderable || menu.price == null) return
    addItem({
      menuId: menu.id,
      boothId: booth.id,
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
      {menuImg && (
        <div className={styles.menuItemThumb}>
          <img src={menuImg} alt={menu.name} />
          {soldOut && (
            <div className={styles.soldOutOverlay} aria-hidden="true">
              품절
            </div>
          )}
        </div>
      )}
      <div className={styles.menuItemContent}>
        <span className={styles.menuName}>
          {menu.is_signature && !soldOut && (
            <span className={styles.signatureMark}>대표</span>
          )}
          {soldOut && <span className={styles.soldOutBadge}>품절</span>}
          {menu.name}
        </span>
        {menu.description && <p className={styles.menuDesc}>{menu.description}</p>}

        <div className={styles.menuActions}>
          <span className={styles.menuPrice}>
            {menu.price != null ? `${menu.price.toLocaleString()}원` : '시가'}
          </span>
          {orderable && (
            <>
              <div className={styles.stepper}>
                <button
                  type="button"
                  className={styles.stepBtn}
                  onClick={() => setPendingQty((q) => Math.max(1, q - 1))}
                  aria-label="수량 줄이기"
                  disabled={pendingQty <= 1}
                >
                  <MinusIcon className={styles.stepIcon} />
                </button>
                <span className={styles.stepValue}>{pendingQty}</span>
                <button
                  type="button"
                  className={styles.stepBtn}
                  onClick={() => setPendingQty((q) => q + 1)}
                  aria-label="수량 늘리기"
                >
                  <PlusIcon className={styles.stepIcon} />
                </button>
              </div>
              <button type="button" className={styles.addBtn} onClick={handleAdd}>
                담기
              </button>
            </>
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
