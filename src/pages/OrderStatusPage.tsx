import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircleIcon, ClockIcon, FireIcon, ShoppingBagIcon } from '@heroicons/react/24/outline'
import PageTitle from '@/components/layout/PageTitle'
import { fetchPaymentWithOrders, type PaymentWithOrders } from '@/lib/orders'
import { supabase } from '@/lib/supabase'
import type { Order } from '@/types/database'
import styles from './OrderStatusPage.module.css'

type UIStatus = 'pending' | 'paid' | 'confirmed' | 'completed' | 'cancelled'

function computePaymentStatus(data: PaymentWithOrders): UIStatus {
  const { payment, orders } = data
  if (payment.status === 'cancelled') return 'cancelled'
  if (payment.status === 'pending') return 'pending'
  if (orders.length === 0) return 'paid'
  if (orders.every((o) => o.order.ready_at)) return 'completed'
  if (orders.every((o) => o.order.confirmed_at)) return 'confirmed'
  return 'paid'
}

function computeBoothStatus(order: Order): 'waiting' | 'preparing' | 'ready' {
  if (order.ready_at) return 'ready'
  if (order.confirmed_at) return 'preparing'
  return 'waiting'
}

const STATUS_LABEL: Record<UIStatus, { title: string; sub: string }> = {
  pending: { title: '결제 대기중', sub: '결제가 진행 중입니다' },
  paid: { title: '결제 완료', sub: '매장에서 주문을 확인하는 중이에요' },
  confirmed: { title: '조리 중', sub: '매장에서 음식을 조리하고 있어요' },
  completed: { title: '조리 완료', sub: '매장에서 음식을 픽업해주세요' },
  cancelled: { title: '취소됨', sub: '주문이 취소되었습니다' },
}

const BOOTH_STATUS_LABEL: Record<'waiting' | 'preparing' | 'ready', string> = {
  waiting: '확인 대기중',
  preparing: '조리 중',
  ready: '조리 완료',
}

export default function OrderStatusPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<PaymentWithOrders | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
          <ShoppingBagIcon className={styles.errorIcon} />
          <p className={styles.muted}>{error ?? '주문을 찾을 수 없어요'}</p>
          <Link to="/program/food" className={styles.cta}>
            메뉴 보러가기
          </Link>
        </div>
      </section>
    )
  }

  const { payment, orders } = data
  const statusInfo = STATUS_LABEL[uiStatus]
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
        {/* ─── 상태 카드 ─── */}
        <div className={`${styles.statusCard} ${styles[`status_${uiStatus}`]}`}>
          <div className={styles.statusIcon}>
            {uiStatus === 'completed' ? (
              <CheckCircleIcon />
            ) : uiStatus === 'confirmed' ? (
              <FireIcon />
            ) : (
              <ClockIcon />
            )}
          </div>
          <div className={styles.statusText}>
            <div className={styles.statusTitle}>{statusInfo.title}</div>
            <div className={styles.statusSub}>{statusInfo.sub}</div>
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
        </div>

        {/* ─── 매장별 진행 상황 ─── */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>매장별 진행 상황</h3>
          <ul className={styles.boothList}>
            {orders.map(({ order, items }) => {
              const boothStatus = computeBoothStatus(order)
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
                      {BOOTH_STATUS_LABEL[boothStatus]}
                    </span>
                  </div>
                  <ul className={styles.itemList}>
                    {items.map((item) => (
                      <li key={item.id} className={styles.item}>
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
          <Link to="/program/food" className={styles.actionPrimary}>
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
