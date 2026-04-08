import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'
import { useBoothSession } from '@/components/booth/BoothLayout'
import {
  type BoothOrderItem,
  confirmBoothOrderItems,
  fetchTodayBoothOrderItems,
  markBoothOrderItemsReady,
  subscribeBoothOrders,
} from '@/lib/boothOrders'
import { formatPhone } from '@/lib/phone'
import styles from './BoothOrdersPage.module.css'

type CardStatus = 'waiting' | 'inProgress' | 'completed'

interface BoothOrderCard {
  orderId: string
  orderNumber: string
  phone: string
  orderCreatedAt: string
  items: BoothOrderItem[]
  totalAmount: number
  status: CardStatus
}

type TabKey = 'inProgress' | 'completed'

const HIGHLIGHT_MS = 5_000

function buildCards(items: BoothOrderItem[]): BoothOrderCard[] {
  const grouped = new Map<string, BoothOrderItem[]>()
  for (const item of items) {
    const list = grouped.get(item.order_id) ?? []
    list.push(item)
    grouped.set(item.order_id, list)
  }

  const cards: BoothOrderCard[] = []
  for (const [orderId, list] of grouped) {
    const first = list[0]
    let status: CardStatus = 'completed'
    if (list.some((it) => !it.confirmed_at)) status = 'waiting'
    else if (list.some((it) => !it.is_ready)) status = 'inProgress'

    cards.push({
      orderId,
      orderNumber: first.order_number,
      phone: first.phone,
      orderCreatedAt: first.order_created_at,
      items: list,
      totalAmount: list.reduce((sum, it) => sum + it.subtotal, 0),
      status,
    })
  }
  return cards
}

function formatHm(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

export default function BoothOrdersPage() {
  const session = useBoothSession()
  const boothId = session.boothId

  const [items, setItems] = useState<BoothOrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<TabKey>('inProgress')
  const [highlightOrderIds, setHighlightOrderIds] = useState<Set<string>>(new Set())
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)

  // refetch 가 빈번해서 ref 로 안정 참조 유지
  const cancelledRef = useRef(false)

  const refetch = useCallback(async () => {
    try {
      const data = await fetchTodayBoothOrderItems(boothId)
      if (cancelledRef.current) return
      setItems(data)
      setError(null)
    } catch (e) {
      if (cancelledRef.current) return
      setError(e instanceof Error ? e.message : '주문을 불러오지 못했습니다.')
    }
  }, [boothId])

  useEffect(() => {
    cancelledRef.current = false
    setLoading(true)
    refetch().finally(() => {
      if (!cancelledRef.current) setLoading(false)
    })

    const unsubscribe = subscribeBoothOrders(boothId, {
      onItemInsert: (itemId) => {
        // 새로 INSERT 된 item 의 order_id 는 refetch 후 알 수 있어서
        // refetch 성공 후 그 item 의 order_id 를 highlight 처리
        fetchTodayBoothOrderItems(boothId).then((next) => {
          if (cancelledRef.current) return
          const found = next.find((it) => it.id === itemId)
          if (found) {
            setHighlightOrderIds((prev) => {
              const set = new Set(prev)
              set.add(found.order_id)
              return set
            })
            window.setTimeout(() => {
              if (cancelledRef.current) return
              setHighlightOrderIds((prev) => {
                const set = new Set(prev)
                set.delete(found.order_id)
                return set
              })
            }, HIGHLIGHT_MS)
          }
          setItems(next)
        })
      },
      onChange: () => {
        void refetch()
      },
    })

    return () => {
      cancelledRef.current = true
      unsubscribe()
    }
  }, [boothId, refetch])

  const cards = useMemo(() => buildCards(items), [items])

  const inProgressCards = useMemo(
    () =>
      cards
        .filter((c) => c.status !== 'completed')
        .sort((a, b) => a.orderCreatedAt.localeCompare(b.orderCreatedAt)),
    [cards],
  )

  const completedCards = useMemo(
    () =>
      cards
        .filter((c) => c.status === 'completed')
        .sort((a, b) => b.orderCreatedAt.localeCompare(a.orderCreatedAt)),
    [cards],
  )

  const waitingCount = inProgressCards.filter((c) => c.status === 'waiting').length

  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }, [refetch])

  const handleConfirm = useCallback(
    async (card: BoothOrderCard) => {
      if (busyOrderId) return
      setBusyOrderId(card.orderId)
      try {
        await confirmBoothOrderItems(card.orderId, boothId)
        await refetch()
      } catch (e) {
        setError(e instanceof Error ? e.message : '확인 처리 실패')
      } finally {
        setBusyOrderId(null)
      }
    },
    [boothId, busyOrderId, refetch],
  )

  const handleReady = useCallback(
    async (card: BoothOrderCard) => {
      if (busyOrderId) return
      setBusyOrderId(card.orderId)
      try {
        await markBoothOrderItemsReady(card.orderId, boothId)
        await refetch()
      } catch (e) {
        setError(e instanceof Error ? e.message : '준비완료 처리 실패')
      } finally {
        setBusyOrderId(null)
      }
    },
    [boothId, busyOrderId, refetch],
  )

  const visibleCards = tab === 'inProgress' ? inProgressCards : completedCards

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <h1 className={styles.pageTitle}>주문 현황</h1>
          <p className={styles.pageSub}>오늘 들어온 본 매장 주문</p>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.statusChip}>
            <ClockIcon className={styles.chipIcon} />
            <span>대기 {waitingCount}건</span>
          </div>
          <div className={styles.statusChip}>
            <CheckCircleIcon className={styles.chipIcon} />
            <span>준비완료 {completedCards.length}건</span>
          </div>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={handleManualRefresh}
            disabled={refreshing}
            aria-label="새로고침"
          >
            <ArrowPathIcon className={`${styles.refreshIcon} ${refreshing ? styles.refreshIconSpin : ''}`} />
            <span>새로고침</span>
          </button>
        </div>
      </header>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'inProgress' ? styles.tabActive : ''}`}
          onClick={() => setTab('inProgress')}
        >
          진행 중
          <span className={styles.tabBadge}>{inProgressCards.length}</span>
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'completed' ? styles.tabActive : ''}`}
          onClick={() => setTab('completed')}
        >
          준비완료
          <span className={styles.tabBadge}>{completedCards.length}</span>
        </button>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading ? (
        <div className={styles.empty}>주문을 불러오는 중...</div>
      ) : visibleCards.length === 0 ? (
        <div className={styles.empty}>
          {tab === 'inProgress'
            ? '진행 중인 주문이 없습니다.'
            : '오늘 준비완료된 주문이 없습니다.'}
        </div>
      ) : (
        <div className={styles.cardGrid}>
          {visibleCards.map((card) => {
            const highlighted = highlightOrderIds.has(card.orderId)
            const busy = busyOrderId === card.orderId
            return (
              <article
                key={card.orderId}
                className={`${styles.card} ${styles[`card_${card.status}`]} ${
                  highlighted ? styles.cardHighlight : ''
                }`}
              >
                <div className={styles.cardHeader}>
                  <div className={styles.cardTime}>{formatHm(card.orderCreatedAt)}</div>
                  <div className={styles.cardOrderNo}>{card.orderNumber}</div>
                </div>
                <div className={styles.cardPhone}>{formatPhone(card.phone)}</div>
                <ul className={styles.itemList}>
                  {card.items.map((it) => (
                    <li key={it.id} className={styles.itemRow}>
                      <span className={styles.itemName}>{it.menu_name}</span>
                      <span className={styles.itemQty}>× {it.quantity}</span>
                      <span className={styles.itemSubtotal}>{it.subtotal.toLocaleString()}원</span>
                    </li>
                  ))}
                </ul>
                <div className={styles.cardFooter}>
                  <div className={styles.cardTotal}>
                    합계 <strong>{card.totalAmount.toLocaleString()}원</strong>
                  </div>
                  {card.status === 'waiting' && (
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${styles.actionConfirm}`}
                      onClick={() => handleConfirm(card)}
                      disabled={busy}
                    >
                      {busy ? '처리 중...' : '주문 확인'}
                    </button>
                  )}
                  {card.status === 'inProgress' && (
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${styles.actionReady}`}
                      onClick={() => handleReady(card)}
                      disabled={busy}
                    >
                      {busy ? '처리 중...' : '준비완료'}
                    </button>
                  )}
                  {card.status === 'completed' && (
                    <span className={styles.completedTag}>완료됨</span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
