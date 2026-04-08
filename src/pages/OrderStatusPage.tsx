import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircleIcon, ClockIcon, FireIcon, ShoppingBagIcon } from '@heroicons/react/24/outline'
import PageTitle from '@/components/layout/PageTitle'
import { fetchOrderWithItems, type OrderWithItems } from '@/lib/orders'
import { supabase } from '@/lib/supabase'
import type { Order, OrderItem } from '@/types/database'
import styles from './OrderStatusPage.module.css'

type UIStatus = 'pending' | 'paid' | 'confirmed' | 'completed' | 'cancelled'

interface BoothGroup {
  boothId: string | null
  boothName: string
  items: OrderItem[]
  status: 'waiting' | 'preparing' | 'ready'
}

function computeOrderStatus(order: Order, items: OrderItem[]): UIStatus {
  if (order.status === 'cancelled') return 'cancelled'
  if (order.status === 'pending') return 'pending'
  if (items.length === 0) return order.status as UIStatus
  if (items.every((i) => i.is_ready)) return 'completed'
  if (items.every((i) => i.confirmed_at !== null)) return 'confirmed'
  return 'paid'
}

function computeBoothStatus(items: OrderItem[]): BoothGroup['status'] {
  if (items.every((i) => i.is_ready)) return 'ready'
  if (items.every((i) => i.confirmed_at !== null)) return 'preparing'
  return 'waiting'
}

function groupByBooth(items: OrderItem[]): BoothGroup[] {
  const map = new Map<string, BoothGroup>()
  for (const item of items) {
    const key = item.booth_id ?? item.booth_name
    const existing = map.get(key)
    if (existing) {
      existing.items.push(item)
    } else {
      map.set(key, {
        boothId: item.booth_id,
        boothName: item.booth_name,
        items: [item],
        status: 'waiting',
      })
    }
  }
  for (const group of map.values()) {
    group.status = computeBoothStatus(group.items)
  }
  return Array.from(map.values())
}

const STATUS_LABEL: Record<UIStatus, { title: string; sub: string }> = {
  pending: { title: '결제 대기중', sub: '결제가 진행 중입니다' },
  paid: { title: '결제 완료', sub: '매장에서 주문을 확인하는 중이에요' },
  confirmed: { title: '준비 중', sub: '매장에서 음식을 준비하고 있어요' },
  completed: { title: '준비 완료', sub: '매장에서 음식을 픽업해주세요' },
  cancelled: { title: '취소됨', sub: '주문이 취소되었습니다' },
}

const BOOTH_STATUS_LABEL: Record<BoothGroup['status'], string> = {
  waiting: '확인 대기중',
  preparing: '준비중',
  ready: '준비 완료',
}

export default function OrderStatusPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<OrderWithItems | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 초기 fetch + Realtime subscribe
  useEffect(() => {
    if (!id) return
    let cancelled = false

    const load = async () => {
      try {
        const result = await fetchOrderWithItems(id)
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

    // Realtime: order_items 변경 시 + orders 변경 시 다시 fetch
    const channel = supabase
      .channel(`order-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_items',
          filter: `order_id=eq.${id}`,
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
          table: 'orders',
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

  const groups = useMemo(() => (data ? groupByBooth(data.items) : []), [data])
  const uiStatus = useMemo(
    () => (data ? computeOrderStatus(data.order, data.items) : 'pending'),
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

  const { order } = data
  const statusInfo = STATUS_LABEL[uiStatus]
  const orderTime = new Date(order.created_at).toLocaleString('ko-KR', {
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

        {/* ─── 주문 정보 ─── */}
        <div className={styles.metaBox}>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>주문번호</span>
            <span className={styles.metaValue}>{order.order_number}</span>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>주문시각</span>
            <span className={styles.metaValue}>{orderTime}</span>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>결제금액</span>
            <span className={styles.metaValueStrong}>
              {order.total_amount.toLocaleString()}원
            </span>
          </div>
        </div>

        {/* ─── 부스별 진행 상황 ─── */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>매장별 진행 상황</h3>
          <ul className={styles.boothList}>
            {groups.map((group) => (
              <li
                key={group.boothId ?? group.boothName}
                className={`${styles.boothGroup} ${styles[`booth_${group.status}`]}`}
              >
                <div className={styles.boothHeader}>
                  <span className={styles.boothName}>{group.boothName}</span>
                  <span className={styles.boothStatusBadge}>
                    {BOOTH_STATUS_LABEL[group.status]}
                  </span>
                </div>
                <ul className={styles.itemList}>
                  {group.items.map((item) => (
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
            ))}
          </ul>
        </div>

        {uiStatus === 'completed' && (
          <div className={styles.pickupNotice}>
            🎉 모든 음식이 준비됐어요! 매장에서 픽업해주세요
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
