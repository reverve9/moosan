import { useEffect, useMemo, useState } from 'react'
import { MinusIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { fetchFoodBooths, getAssetUrl } from '@/lib/festival'
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

  useEffect(() => {
    let cancelled = false
    fetchFoodBooths(festival.id).then((data) => {
      if (!cancelled) setBooths(shuffle(data))
    })
    return () => {
      cancelled = true
    }
  }, [festival.id])

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
          onClose={() => setSelectedBooth(null)}
        />
      )}
    </>
  )
}

// ──────────────── Modal ────────────────
function BoothModal({
  booth,
  onClose,
}: {
  booth: FoodBoothWithMenus
  onClose: () => void
}) {
  const thumb = getAssetUrl(booth.thumbnail_url)

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
  const orderable = menu.price != null && menu.price > 0

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
    <li className={styles.menuItem}>
      {menuImg && (
        <div className={styles.menuItemThumb}>
          <img src={menuImg} alt={menu.name} />
        </div>
      )}
      <div className={styles.menuItemContent}>
        <div className={styles.menuHead}>
          <span className={styles.menuName}>
            {menu.is_signature && <span className={styles.signatureMark}>대표</span>}
            {menu.name}
          </span>
          <span className={styles.menuPrice}>
            {menu.price != null ? `${menu.price.toLocaleString()}원` : '시가'}
          </span>
        </div>
        {menu.description && <p className={styles.menuDesc}>{menu.description}</p>}

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
          </div>
        )}

        {inCart && (
          <p className={styles.inCartBadge}>
            장바구니에 {inCart.quantity}개 담겨있어요
          </p>
        )}
      </div>
    </li>
  )
}
