import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CheckCircleIcon,
  ClockIcon,
  FireIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  PlusIcon,
  ShoppingBagIcon,
  TrashIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import PageTitle from '@/components/layout/PageTitle'
import Input from '@/components/ui/Input'
import { useCart, type CartItem } from '@/store/cartStore'
import { getAssetUrl } from '@/lib/festival'
import { fetchOrdersByPhoneToday, type OrderWithItems } from '@/lib/orders'
import { formatPhone, isValidPhone, loadLastPhone } from '@/lib/phone'
import type { Order, OrderItem } from '@/types/database'
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

/* ──────────────── Order status helpers ──────────────── */
type UIStatus = 'pending' | 'paid' | 'confirmed' | 'completed' | 'cancelled'

function computeOrderStatus(order: Order, items: OrderItem[]): UIStatus {
  if (order.status === 'cancelled') return 'cancelled'
  if (order.status === 'pending') return 'pending'
  if (items.length === 0) return order.status as UIStatus
  if (items.every((i) => i.is_ready)) return 'completed'
  if (items.every((i) => i.confirmed_at !== null)) return 'confirmed'
  return 'paid'
}

const STATUS_LABEL: Record<UIStatus, string> = {
  pending: '결제 대기중',
  paid: '확인 대기중',
  confirmed: '준비중',
  completed: '준비 완료',
  cancelled: '취소됨',
}

function StatusIcon({ status }: { status: UIStatus }) {
  if (status === 'completed') return <CheckCircleIcon />
  if (status === 'confirmed') return <FireIcon />
  if (status === 'cancelled') return <XCircleIcon />
  return <ClockIcon />
}

function summarizeItems(items: OrderItem[]): string {
  if (items.length === 0) return '주문 내역 없음'
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0)
  const first = items[0].menu_name
  if (items.length === 1) return `${first} × ${items[0].quantity}`
  return `${first} 외 ${items.length - 1}건 · 총 ${totalQty}개`
}

export default function CartPage() {
  const navigate = useNavigate()
  const { items, totalAmount, totalCount, updateQuantity, removeItem, clear } = useCart()

  const groups = useMemo(() => groupByBooth(items), [items])
  const hasCart = items.length > 0

  /* ──────────────── 주문 내역 섹션 state ──────────────── */
  const [phoneInput, setPhoneInput] = useState<string>(() => loadLastPhone() ?? '')
  const [submittedPhone, setSubmittedPhone] = useState<string | null>(() => loadLastPhone())
  const [touched, setTouched] = useState(false)
  const [orders, setOrders] = useState<OrderWithItems[] | null>(null)
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [ordersError, setOrdersError] = useState<string | null>(null)

  const phoneValid = isValidPhone(phoneInput)
  const phoneError = touched && !phoneValid ? '올바른 휴대폰 번호를 입력해주세요' : undefined

  // submittedPhone 이 정해지면 (mount 시 localStorage 또는 사용자 submit) fetch
  useEffect(() => {
    if (!submittedPhone) {
      setOrders(null)
      setOrdersError(null)
      return
    }
    let cancelled = false
    setLoadingOrders(true)
    setOrdersError(null)
    fetchOrdersByPhoneToday(submittedPhone)
      .then((data) => {
        if (!cancelled) setOrders(data)
      })
      .catch((err) => {
        if (cancelled) return
        setOrdersError(err instanceof Error ? err.message : '주문 조회 실패')
        setOrders(null)
      })
      .finally(() => {
        if (!cancelled) setLoadingOrders(false)
      })
    return () => {
      cancelled = true
    }
  }, [submittedPhone])

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneInput(formatPhone(e.target.value))
  }

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!phoneValid) return
    setSubmittedPhone(phoneInput)
  }

  return (
    <section className={`${styles.page} ${hasCart ? styles.pageWithBar : ''}`}>
      <PageTitle title="내 주문" />

      {/* ─────────────────── 상단: 장바구니 섹션 ─────────────────── */}
      {hasCart && (
        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <h3 className={styles.sectionTitle}>장바구니</h3>
            <div className={styles.sectionMeta}>
              <span className={styles.summaryCount}>총 {totalCount}개</span>
              <button type="button" className={styles.clearBtn} onClick={clear}>
                전체 비우기
              </button>
            </div>
          </div>

          <ul className={styles.boothList}>
            {groups.map((group) => (
              <li key={group.boothId} className={styles.boothGroup}>
                <div className={styles.boothHeader}>
                  <h4 className={styles.boothName}>{group.boothName}</h4>
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
      )}

      {/* ─────────────────── 장바구니 비어있음 hint (cart 없을 때만) ─────────────────── */}
      {!hasCart && (
        <div className={styles.emptyCartHint}>
          <ShoppingBagIcon className={styles.emptyCartIcon} />
          <p className={styles.emptyCartText}>장바구니가 비어있어요</p>
          <Link to="/program/food" className={styles.emptyCartCta}>
            메뉴 보러가기
          </Link>
        </div>
      )}

      {/* ─────────────────── 하단: 주문 내역 섹션 ─────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>오늘 주문 내역</h3>
        </div>

        <form onSubmit={handlePhoneSubmit} className={styles.lookupForm}>
          <Input
            label="휴대폰 번호"
            type="tel"
            inputMode="numeric"
            placeholder="010-0000-0000"
            value={phoneInput}
            onChange={handlePhoneChange}
            onBlur={() => setTouched(true)}
            error={phoneError}
            hint="주문 시 입력했던 번호로 오늘 주문 내역을 조회합니다"
            required
            autoComplete="tel"
          />
          <button
            type="submit"
            className={styles.lookupBtn}
            disabled={!phoneValid || loadingOrders}
          >
            <MagnifyingGlassIcon className={styles.lookupBtnIcon} />
            {loadingOrders ? '조회 중…' : '조회하기'}
          </button>
        </form>

        {/* 결과 영역 */}
        {loadingOrders && (
          <div className={styles.center}>
            <div className={styles.spinner} aria-hidden="true" />
            <p className={styles.muted}>주문 정보를 불러오는 중…</p>
          </div>
        )}

        {!loadingOrders && ordersError && (
          <div className={styles.center}>
            <XCircleIcon className={styles.errorIcon} />
            <p className={styles.muted}>{ordersError}</p>
          </div>
        )}

        {!loadingOrders && !ordersError && orders !== null && orders.length === 0 && (
          <div className={styles.center}>
            <p className={styles.muted}>오늘 주문 내역이 없어요</p>
          </div>
        )}

        {!loadingOrders && !ordersError && orders !== null && orders.length > 0 && (
          <ul className={styles.orderList}>
            {orders.map(({ order, items: orderItems }) => {
              const uiStatus = computeOrderStatus(order, orderItems)
              const orderTime = new Date(order.created_at).toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit',
              })
              return (
                <li key={order.id}>
                  <Link to={`/order/${order.id}`} className={styles.orderCard}>
                    <div className={`${styles.orderIcon} ${styles[`status_${uiStatus}`]}`}>
                      <StatusIcon status={uiStatus} />
                    </div>
                    <div className={styles.orderBody}>
                      <div className={styles.orderHead}>
                        <span className={styles.orderNumber}>{order.order_number}</span>
                        <span className={styles.orderTime}>{orderTime}</span>
                      </div>
                      <p className={styles.orderSummary}>{summarizeItems(orderItems)}</p>
                      <div className={styles.orderFoot}>
                        <span
                          className={`${styles.statusBadge} ${styles[`status_${uiStatus}`]}`}
                        >
                          {STATUS_LABEL[uiStatus]}
                        </span>
                        <span className={styles.orderAmount}>
                          {order.total_amount.toLocaleString()}원
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* ─────────────────── Sticky 결제 바 (cart 있을 때만) ─────────────────── */}
      {hasCart && (
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
      )}
    </section>
  )
}
