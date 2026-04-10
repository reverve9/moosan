import { CircleCheck, Clock, Flame, Search, Minus, Plus, ShoppingBag, Trash2, CircleX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PageTitle from '@/components/layout/PageTitle'
import Input from '@/components/ui/Input'
import { useCart, type CartItem } from '@/store/cartStore'
import { getAssetUrl } from '@/lib/festival'
import { fetchPaymentsByPhoneToday, type PaymentWithOrders } from '@/lib/orders'
import { supabase } from '@/lib/supabase'
import { formatPhone, isValidPhone, loadLastPhone, normalizePhone } from '@/lib/phone'
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
type UIStatus = 'paid' | 'confirmed' | 'completed' | 'cancelled'

function computeOrderUiStatus(order: PaymentWithOrders['orders'][number]['order']): UIStatus {
  if (order.status === 'cancelled') return 'cancelled'
  if (order.ready_at) return 'completed'
  if (order.confirmed_at) return 'confirmed'
  return 'paid'
}

const STATUS_LABEL: Record<UIStatus, string> = {
  paid: '확인 대기중',
  confirmed: '조리 중',
  completed: '조리 완료',
  cancelled: '취소됨',
}

function StatusIcon({ status }: { status: UIStatus }) {
  if (status === 'completed') return <CircleCheck />
  if (status === 'confirmed') return <Flame />
  if (status === 'cancelled') return <CircleX />
  return <Clock />
}

interface OrderListEntry {
  paymentId: string
  order: PaymentWithOrders['orders'][number]['order']
  items: PaymentWithOrders['orders'][number]['items']
}

function flattenToOrderEntries(payments: PaymentWithOrders[]): OrderListEntry[] {
  const entries: OrderListEntry[] = []
  for (const { payment, orders } of payments) {
    for (const { order, items } of orders) {
      entries.push({ paymentId: payment.id, order, items })
    }
  }
  entries.sort((a, b) => b.order.created_at.localeCompare(a.order.created_at))
  return entries
}

function summarizeItems(items: OrderListEntry['items']): string {
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
  const [payments, setPayments] = useState<PaymentWithOrders[] | null>(null)
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [ordersError, setOrdersError] = useState<string | null>(null)

  const phoneValid = isValidPhone(phoneInput)
  const phoneError = touched && !phoneValid ? '올바른 휴대폰 번호를 입력해주세요' : undefined

  const refetchOrders = useCallback(async () => {
    if (!submittedPhone) return
    try {
      const data = await fetchPaymentsByPhoneToday(normalizePhone(submittedPhone))
      setPayments(data)
      setOrdersError(null)
    } catch (err) {
      setOrdersError(err instanceof Error ? err.message : '주문 조회 실패')
      setPayments(null)
    }
  }, [submittedPhone])

  // submittedPhone 이 정해지면 (mount 시 localStorage 또는 사용자 submit) fetch
  useEffect(() => {
    if (!submittedPhone) {
      setPayments(null)
      setOrdersError(null)
      return
    }
    let cancelled = false
    setLoadingOrders(true)
    setOrdersError(null)
    fetchPaymentsByPhoneToday(normalizePhone(submittedPhone))
      .then((data) => {
        if (!cancelled) setPayments(data)
      })
      .catch((err) => {
        if (cancelled) return
        setOrdersError(err instanceof Error ? err.message : '주문 조회 실패')
        setPayments(null)
      })
      .finally(() => {
        if (!cancelled) setLoadingOrders(false)
      })
    return () => {
      cancelled = true
    }
  }, [submittedPhone])

  // Realtime: orders 변경 시 자동 refetch
  useEffect(() => {
    if (!submittedPhone) return
    const channel = supabase
      .channel('cart-orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => { void refetchOrders() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments' },
        () => { void refetchOrders() },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [submittedPhone, refetchOrders])

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
                              <Trash2 className={styles.removeIcon} />
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
                                <Minus className={styles.stepIcon} />
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
                                <Plus className={styles.stepIcon} />
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
          <ShoppingBag className={styles.emptyCartIcon} />
          <p className={styles.emptyCartText}>장바구니가 비어있어요</p>
          <Link to="/program/food" className={styles.emptyCartCta}>
            메뉴 보러가기
          </Link>
        </div>
      )}

      {/* ─────────────────── 하단: 주문 내역 섹션 (장바구니 비어있을 때만 노출) ─────────────────── */}
      {!hasCart && (
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
            <Search className={styles.lookupBtnIcon} />
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
            <CircleX className={styles.errorIcon} />
            <p className={styles.muted}>{ordersError}</p>
          </div>
        )}

        {!loadingOrders && !ordersError && payments !== null && payments.length === 0 && (
          <div className={styles.center}>
            <p className={styles.muted}>오늘 주문 내역이 없어요</p>
          </div>
        )}

        {!loadingOrders && !ordersError && payments !== null && payments.length > 0 && (
          <ul className={styles.orderList}>
            {flattenToOrderEntries(payments).map((entry) => {
              const { order, items } = entry
              const uiStatus = computeOrderUiStatus(order)
              const orderTime = new Date(order.created_at).toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit',
              })
              return (
                <li key={order.id}>
                  <Link to={`/order/${entry.paymentId}`} className={styles.orderCard}>
                    <div className={`${styles.orderIcon} ${styles[`status_${uiStatus}`]}`}>
                      <StatusIcon status={uiStatus} />
                    </div>
                    <div className={styles.orderBody}>
                      <div className={styles.orderHead}>
                        <span className={styles.orderNumber}>
                          {order.booth_name ?? ''} · {order.order_number}
                        </span>
                        <span className={styles.orderTime}>{orderTime}</span>
                      </div>
                      <p className={styles.orderSummary}>{summarizeItems(items)}</p>
                      <div className={styles.orderFoot}>
                        <span
                          className={`${styles.statusBadge} ${styles[`status_${uiStatus}`]}`}
                        >
                          {STATUS_LABEL[uiStatus]}
                        </span>
                        <span className={styles.orderAmount}>
                          {order.subtotal.toLocaleString()}원
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
      )}

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
