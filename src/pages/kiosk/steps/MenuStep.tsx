import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus, Trash2, ArrowRight, Beer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchFoodBooths, getAssetUrl } from '@/lib/festival'
import { useCart } from '@/store/cartStore'
import type { FoodBoothWithMenus, FoodMenu } from '@/types/festival_extras'
import styles from './MenuStep.module.css'

interface Props {
  onGoToPhone: () => void
}

/**
 * 키오스크 menu step.
 *
 * 3컬럼 가로 레이아웃:
 *   좌(부스) · 중(메뉴 그리드) · 우(장바구니 + "결제 요청")
 *
 * 데이터 소스
 *   - festivals.slug='food' → festival_id
 *   - fetchFoodBooths(festival_id) → 활성 부스 + 메뉴
 *   - 부스 필터: is_open && !is_paused
 *
 * Realtime 구독은 일단 미적용 (운영 1대, 직원이 옆에 있으니 부스 품절/일시중지는
 * 직원이 강제 리셋으로 처리). 필요해지면 #15 와 함께 hook 추가.
 */
export default function MenuStep({ onGoToPhone }: Props) {
  const [booths, setBooths] = useState<FoodBoothWithMenus[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBoothId, setSelectedBoothId] = useState<string | null>(null)

  const { items, addItem, removeItem, updateQuantity, totalAmount, totalCount } = useCart()

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
      const open = data.filter((b) => b.is_open && !b.is_paused)
      setBooths(open)
      if (open.length > 0) setSelectedBoothId(open[0].id)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedBooth = useMemo(
    () => booths.find((b) => b.id === selectedBoothId) ?? null,
    [booths, selectedBoothId],
  )

  const visibleMenus = useMemo(() => {
    if (!selectedBooth) return [] as FoodMenu[]
    return selectedBooth.menus.filter((m) => m.is_active && (m.price ?? 0) > 0)
  }, [selectedBooth])

  const handleAdd = (booth: FoodBoothWithMenus, menu: FoodMenu) => {
    if (menu.is_sold_out) return
    addItem({
      menuId: menu.id,
      boothId: booth.id,
      boothNo: booth.booth_no ?? '',
      boothName: booth.name,
      menuName: menu.name,
      price: menu.price ?? 0,
      quantity: 1,
      imageUrl: menu.image_url ?? undefined,
      acceptsTakeout: menu.accepts_takeout ?? true,
      isTakeout: false,
      isAlcohol: menu.is_alcohol ?? false,
    })
  }

  const itemQty = (menuId: string) =>
    items.find((i) => i.menuId === menuId)?.quantity ?? 0

  if (loading) {
    return <div className={styles.loading}>메뉴 불러오는 중…</div>
  }

  if (booths.length === 0) {
    return (
      <div className={styles.loading}>
        현재 주문 가능한 매장이 없습니다. 잠시 후 다시 시도해주세요.
      </div>
    )
  }

  return (
    <div className={styles.layout}>
      {/* ─── 좌측: 부스 리스트 ─── */}
      <aside className={styles.boothPane} aria-label="매장 목록">
        <h2 className={styles.paneTitle}>매장</h2>
        <ul className={styles.boothList}>
          {booths.map((b) => {
            const active = selectedBoothId === b.id
            return (
              <li key={b.id}>
                <button
                  type="button"
                  className={`${styles.boothItem} ${active ? styles.boothItemActive : ''}`}
                  onClick={() => setSelectedBoothId(b.id)}
                >
                  <span className={styles.boothNo}>{b.booth_no}</span>
                  <span className={styles.boothName}>{b.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      {/* ─── 중앙: 메뉴 그리드 ─── */}
      <section className={styles.menuPane} aria-label="메뉴">
        <header className={styles.menuHeader}>
          <h2 className={styles.menuTitle}>
            {selectedBooth ? `${selectedBooth.booth_no}번 · ${selectedBooth.name}` : '매장 선택'}
          </h2>
          {selectedBooth?.description && (
            <p className={styles.menuDesc}>{selectedBooth.description}</p>
          )}
        </header>
        {visibleMenus.length === 0 ? (
          <div className={styles.emptyMenus}>등록된 메뉴가 없습니다.</div>
        ) : (
          <ul className={styles.menuGrid}>
            {visibleMenus.map((m) => {
              const img = getAssetUrl(m.image_url ?? undefined)
              const qty = itemQty(m.id)
              const soldOut = !!m.is_sold_out
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`${styles.menuCard} ${soldOut ? styles.menuCardSoldOut : ''}`}
                    onClick={() => selectedBooth && handleAdd(selectedBooth, m)}
                    disabled={soldOut}
                  >
                    <div className={styles.menuImageWrap}>
                      {img ? (
                        <img src={img} alt={m.name} className={styles.menuImage} />
                      ) : (
                        <div className={styles.menuImagePlaceholder} aria-hidden />
                      )}
                      {m.is_alcohol && (
                        <span className={styles.alcoholBadge} aria-label="주류">
                          <Beer strokeWidth={1.2} size={18} aria-hidden />
                          주류
                        </span>
                      )}
                      {soldOut && <span className={styles.soldOutBadge}>품절</span>}
                      {qty > 0 && <span className={styles.qtyBadge}>{qty}</span>}
                    </div>
                    <div className={styles.menuInfo}>
                      <div className={styles.menuName}>{m.name}</div>
                      <div className={styles.menuPrice}>
                        {(m.price ?? 0).toLocaleString()}원
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ─── 우측: 장바구니 ─── */}
      <aside className={styles.cartPane} aria-label="장바구니">
        <h2 className={styles.paneTitle}>주문 내역 ({totalCount})</h2>
        {items.length === 0 ? (
          <div className={styles.cartEmpty}>
            메뉴를 선택하면 여기에 담깁니다.
          </div>
        ) : (
          <ul className={styles.cartList}>
            {items.map((it) => (
              <li key={it.menuId} className={styles.cartItem}>
                <div className={styles.cartItemInfo}>
                  <div className={styles.cartItemBooth}>{it.boothName}</div>
                  <div className={styles.cartItemName}>{it.menuName}</div>
                  <div className={styles.cartItemPrice}>
                    {(it.price * it.quantity).toLocaleString()}원
                  </div>
                </div>
                <div className={styles.cartItemActions}>
                  <button
                    type="button"
                    className={styles.qtyButton}
                    onClick={() => updateQuantity(it.menuId, it.quantity - 1)}
                    aria-label="수량 감소"
                  >
                    <Minus strokeWidth={1.2} size={22} aria-hidden />
                  </button>
                  <span className={styles.qtyValue}>{it.quantity}</span>
                  <button
                    type="button"
                    className={styles.qtyButton}
                    onClick={() => updateQuantity(it.menuId, it.quantity + 1)}
                    aria-label="수량 증가"
                  >
                    <Plus strokeWidth={1.2} size={22} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => removeItem(it.menuId)}
                    aria-label="삭제"
                  >
                    <Trash2 strokeWidth={1.2} size={22} aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.cartFooter}>
          <div className={styles.totalRow}>
            <span>합계</span>
            <span className={styles.totalAmount}>{totalAmount.toLocaleString()}원</span>
          </div>
          <button
            type="button"
            className={styles.payButton}
            disabled={items.length === 0}
            onClick={onGoToPhone}
          >
            <span>결제 요청</span>
            <ArrowRight strokeWidth={1.2} size={28} aria-hidden />
          </button>
        </div>
      </aside>
    </div>
  )
}
