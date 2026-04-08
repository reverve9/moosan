import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MinusIcon, PlusIcon, TrashIcon, ShoppingBagIcon } from '@heroicons/react/24/outline'
import PageTitle from '@/components/layout/PageTitle'
import { useCart, type CartItem } from '@/store/cartStore'
import { getAssetUrl } from '@/lib/festival'
import styles from './CartPage.module.css'

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

export default function CartPage() {
  const navigate = useNavigate()
  const { items, totalAmount, totalCount, updateQuantity, removeItem, clear } = useCart()

  const groups = useMemo(() => groupByBooth(items), [items])

  if (items.length === 0) {
    return (
      <section className={styles.page}>
        <PageTitle title="장바구니" />
        <div className={styles.empty}>
          <ShoppingBagIcon className={styles.emptyIcon} />
          <p className={styles.emptyText}>장바구니가 비어있어요</p>
          <Link to="/program/food" className={styles.emptyCta}>
            메뉴 보러가기
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.page}>
      <PageTitle title="장바구니" />

      <div className={styles.container}>
        <div className={styles.summary}>
          <span className={styles.summaryCount}>총 {totalCount}개</span>
          <button type="button" className={styles.clearBtn} onClick={clear}>
            전체 비우기
          </button>
        </div>

        <ul className={styles.boothList}>
          {groups.map((group) => (
            <li key={group.boothId} className={styles.boothGroup}>
              <div className={styles.boothHeader}>
                <h3 className={styles.boothName}>{group.boothName}</h3>
                <span className={styles.boothSubtotal}>
                  {group.subtotal.toLocaleString()}원
                </span>
              </div>
              <ul className={styles.itemList}>
                {group.items.map((item) => {
                  const img = getAssetUrl(item.imageUrl ?? null)
                  return (
                    <li key={item.menuId} className={styles.item}>
                      <div className={styles.itemThumb}>
                        {img ? (
                          <img src={img} alt={item.menuName} />
                        ) : (
                          <div className={styles.itemThumbPlaceholder} aria-hidden="true" />
                        )}
                      </div>
                      <div className={styles.itemInfo}>
                        <div className={styles.itemHead}>
                          <span className={styles.itemName}>{item.menuName}</span>
                          <button
                            type="button"
                            className={styles.removeBtn}
                            onClick={() => removeItem(item.menuId)}
                            aria-label={`${item.menuName} 삭제`}
                          >
                            <TrashIcon className={styles.removeIcon} />
                          </button>
                        </div>
                        <div className={styles.itemBottom}>
                          <div className={styles.stepper}>
                            <button
                              type="button"
                              className={styles.stepBtn}
                              onClick={() =>
                                updateQuantity(item.menuId, item.quantity - 1)
                              }
                              aria-label="수량 줄이기"
                            >
                              <MinusIcon className={styles.stepIcon} />
                            </button>
                            <span className={styles.stepValue}>{item.quantity}</span>
                            <button
                              type="button"
                              className={styles.stepBtn}
                              onClick={() =>
                                updateQuantity(item.menuId, item.quantity + 1)
                              }
                              aria-label="수량 늘리기"
                            >
                              <PlusIcon className={styles.stepIcon} />
                            </button>
                          </div>
                          <span className={styles.itemPrice}>
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

      {/* Sticky 결제 바 */}
      <div className={styles.checkoutBar}>
        <div className={styles.checkoutInner}>
          <div className={styles.checkoutTotal}>
            <span className={styles.totalLabel}>총 결제금액</span>
            <span className={styles.totalAmount}>
              {totalAmount.toLocaleString()}원
            </span>
          </div>
          <button
            type="button"
            className={styles.checkoutBtn}
            onClick={() => navigate('/checkout')}
          >
            주문하기
          </button>
        </div>
      </div>
    </section>
  )
}
