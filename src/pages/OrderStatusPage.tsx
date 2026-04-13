import { CircleCheck, Clock, Flame, ShoppingBag } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import PageTitle from '@/components/layout/PageTitle'
import { fetchPaymentWithOrders, type PaymentWithOrders } from '@/lib/orders'
import { supabase } from '@/lib/supabase'
import type { Order } from '@/types/database'
import styles from './OrderStatusPage.module.css'

type UIStatus = 'pending' | 'paid' | 'confirmed' | 'completed' | 'cancelled' | 'partial'

function computePaymentStatus(data: PaymentWithOrders): UIStatus {
  const { payment, orders } = data
  if (payment.status === 'cancelled') return 'cancelled'
  if (payment.status === 'pending') return 'pending'
  if (orders.length === 0) return 'paid'
  // 부스 일부만 cancelled 인 경우 = 부분 취소
  const liveOrders = orders.filter((o) => o.order.status !== 'cancelled')
  const hasCancelled = orders.some((o) => o.order.status === 'cancelled')
  if (liveOrders.length === 0) return 'cancelled'
  if (hasCancelled) {
    // 일부 취소 + 살아 있는 주문들의 진행 상태
    if (liveOrders.every((o) => o.order.ready_at)) return 'partial'
    return 'partial'
  }
  if (orders.every((o) => o.order.ready_at)) return 'completed'
  if (orders.every((o) => o.order.confirmed_at)) return 'confirmed'
  return 'paid'
}

type BoothStatus = 'waiting' | 'preparing' | 'ready' | 'cancelled'

function computeBoothStatus(order: Order): BoothStatus {
  if (order.status === 'cancelled') return 'cancelled'
  if (order.ready_at) return 'ready'
  if (order.confirmed_at) return 'preparing'
  return 'waiting'
}

function getStatusLabel(
  status: UIStatus,
  orders: { order: Order }[],
): { title: string; sub: string } {
  const base: Record<UIStatus, { title: string; sub: string }> = {
    pending: { title: '결제 대기중', sub: '결제가 진행 중입니다' },
    paid: { title: '결제 완료', sub: '매장에서 주문을 확인하는 중이에요' },
    confirmed: { title: '조리 중', sub: '매장에서 음식을 조리하고 있어요' },
    completed: { title: '조리 완료', sub: '매장에서 음식을 픽업해주세요' },
    cancelled: { title: '취소됨', sub: '주문이 취소되었습니다' },
    partial: { title: '일부 취소', sub: '일부 매장이 주문을 거절해 환불 처리됐어요' },
  }
  if (status === 'confirmed') {
    const confirmedOrders = orders.filter(
      (o) => o.order.confirmed_at && !o.order.ready_at && o.order.estimated_minutes,
    )
    if (confirmedOrders.length > 0) {
      const maxMin = Math.max(...confirmedOrders.map((o) => o.order.estimated_minutes!))
      return { title: '조리 중', sub: `약 ${maxMin}분 후 준비됩니다` }
    }
  }
  return base[status]
}

function boothStatusLabel(status: BoothStatus, order: Order): string {
  if (status === 'preparing' && order.estimated_minutes) {
    return `매장 확인완료 · 약 ${order.estimated_minutes}분 후 준비됩니다`
  }
  const labels: Record<BoothStatus, string> = {
    waiting: '확인 대기중',
    preparing: '조리 중',
    ready: '조리 완료',
    cancelled: '취소됨',
  }
  return labels[status]
}

const DISMISSED_KEY = 'order_dismissed_booths'

function loadDismissed(paymentId: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(`${DISMISSED_KEY}_${paymentId}`)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function saveDismissed(paymentId: string, set: Set<string>): void {
  try {
    sessionStorage.setItem(`${DISMISSED_KEY}_${paymentId}`, JSON.stringify([...set]))
  } catch { /* ignore */ }
}

export default function OrderStatusPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [data, setData] = useState<PaymentWithOrders | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dismissedBooths, setDismissedBooths] = useState<Set<string>>(() => loadDismissed(id ?? ''))

  // 결제 직후 진입 시 뒤로가기(토스 페이지) 방지
  useEffect(() => {
    if (searchParams.get('from') !== 'checkout') return
    window.history.pushState(null, '', window.location.href)
    const handlePop = () => {
      navigate('/program/food', { replace: true })
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [searchParams, navigate])

  useEffect(() => {
    if (!id) return
    let cancelled = false

    const load = async () => {
      try {
        const result = await fetchPaymentWithOrders(id)
        if (cancelled) return
        if (!result) {
          setError('주문을 찾을 수 없어요')
        } else {
          setData(result)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '주문 조회 실패')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    // Realtime: 이 payment 에 묶인 orders UPDATE + payments 자체 UPDATE 구독
    const channel = supabase
      .channel(`order-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `payment_id=eq.${id}`,
        },
        () => {
          void load()
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
          filter: `id=eq.${id}`,
        },
        () => {
          void load()
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [id])

  const uiStatus = useMemo<UIStatus>(
    () => (data ? computePaymentStatus(data) : 'pending'),
    [data],
  )

  const readyBooths = useMemo(() => {
    if (!data) return []
    const seen = new Set<string>()
    const result: { boothId: string; boothName: string }[] = []
    for (const { order } of data.orders) {
      const bid = order.booth_id
      if (!bid) continue
      if (order.ready_at && order.status !== 'cancelled' && !dismissedBooths.has(bid) && !seen.has(bid)) {
        seen.add(bid)
        result.push({ boothId: bid, boothName: order.booth_name ?? '' })
      }
    }
    return result
  }, [data, dismissedBooths])

  if (loading) {
    return (
      <section className={styles.page}>
        <PageTitle title="주문 상태" />
        <div className={styles.center}>
          <div className={styles.spinner} aria-hidden="true" />
          <p className={styles.muted}>주문 정보를 불러오는 중…</p>
        </div>
      </section>
    )
  }

  if (error || !data) {
    return (
      <section className={styles.page}>
        <PageTitle title="주문 상태" />
        <div className={styles.center}>
          <ShoppingBag className={styles.errorIcon} />
          <p className={styles.muted}>{error ?? '주문을 찾을 수 없어요'}</p>
          <Link to="/program/food" className={styles.cta}>
            메뉴 보러가기
          </Link>
        </div>
      </section>
    )
  }

  const { payment, orders } = data
  const statusInfo = getStatusLabel(uiStatus, orders)
  const cancelReason =
    uiStatus === 'cancelled' &&
    payment.meta &&
    typeof payment.meta === 'object' &&
    !Array.isArray(payment.meta) &&
    typeof (payment.meta as { cancel_reason?: unknown }).cancel_reason === 'string'
      ? ((payment.meta as { cancel_reason: string }).cancel_reason as string)
      : null
  const orderTime = new Date(payment.created_at).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <section className={styles.page}>
      <PageTitle title="주문 상태" />

      <div className={styles.container}>
        {/* ─── 준비완료 스트립 ─── */}
        {readyBooths.map((booth) => (
          <div key={booth.boothId} className={styles.readyStrip}>
            <span className={styles.readyStripText}>
              🍽 {booth.boothName} 준비완료 · 픽업해주세요
            </span>
            <button
              type="button"
              className={styles.readyStripBtn}
              onClick={() => {
                setDismissedBooths((prev) => {
                  const next = new Set([...prev, booth.boothId])
                  saveDismissed(id ?? '', next)
                  return next
                })
              }}
              aria-label="확인"
            >
              ✓
            </button>
          </div>
        ))}

        {/* ─── 상태 카드 ─── */}
        <div className={`${styles.statusCard} ${styles[`status_${uiStatus}`]}`}>
          <div className={styles.statusIcon}>
            {uiStatus === 'completed' ? (
              <CircleCheck />
            ) : uiStatus === 'confirmed' ? (
              <Flame />
            ) : (
              <Clock />
            )}
          </div>
          <div className={styles.statusText}>
            <div className={styles.statusTitle}>{statusInfo.title}</div>
            <div className={styles.statusSub}>{statusInfo.sub}</div>
            {cancelReason && (
              <div className={styles.cancelReason}>사유: {cancelReason}</div>
            )}
          </div>
        </div>

        {/* ─── 결제 정보 ─── */}
        <div className={styles.metaBox}>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>주문시각</span>
            <span className={styles.metaValue}>{orderTime}</span>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>결제금액</span>
            <span className={styles.metaValueStrong}>
              {payment.total_amount.toLocaleString()}원
            </span>
          </div>
          {payment.refunded_amount > 0 && (
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>환불금액</span>
              <span className={`${styles.metaValueStrong} ${styles.refundText}`}>
                -{payment.refunded_amount.toLocaleString()}원
              </span>
            </div>
          )}
        </div>

        {/* ─── 매장별 진행 상황 ─── */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>매장별 진행 상황</h3>
          <ul className={styles.boothList}>
            {orders.map(({ order, items }) => {
              const boothStatus = computeBoothStatus(order)
              const isCancelled = boothStatus === 'cancelled'
              return (
                <li
                  key={order.id}
                  className={`${styles.boothGroup} ${styles[`booth_${boothStatus}`]}`}
                >
                  <div className={styles.boothHeader}>
                    <span className={styles.boothName}>
                      {order.booth_name}
                      <span className={styles.orderNo}> · {order.order_number}</span>
                    </span>
                    <span className={styles.boothStatusBadge}>
                      {boothStatusLabel(boothStatus, order)}
                    </span>
                  </div>
                  {isCancelled && order.cancel_reason && (
                    <div className={styles.boothCancelBox}>
                      <div className={styles.boothCancelLabel}>거절 사유</div>
                      <div className={styles.boothCancelReason}>{order.cancel_reason}</div>
                      <div className={styles.boothCancelRefund}>
                        {order.subtotal.toLocaleString()}원 환불 처리됐어요
                      </div>
                    </div>
                  )}
                  <ul className={styles.itemList}>
                    {items.map((item) => (
                      <li
                        key={item.id}
                        className={`${styles.item} ${isCancelled ? styles.itemCancelled : ''}`}
                      >
                        <span className={styles.itemName}>
                          {item.menu_name}
                          <span className={styles.itemQty}> × {item.quantity}</span>
                        </span>
                        <span className={styles.itemPrice}>
                          {item.subtotal.toLocaleString()}원
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ul>
        </div>

        {uiStatus === 'completed' && (
          <div className={styles.pickupNotice}>
            🎉 모든 음식이 조리 완료됐어요! 매장에서 픽업해주세요
          </div>
        )}

        {/* ─── 하단 액션 ─── */}
        <div className={styles.actions}>
          <Link to="/program/food#booths" className={styles.actionPrimary}>
            메뉴 더 담기
          </Link>
          <Link to="/cart" className={styles.actionSecondary}>
            내 주문 보기
          </Link>
        </div>
      </div>
    </section>
  )
}
