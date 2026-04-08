import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRightOnRectangleIcon,
  NoSymbolIcon,
} from '@heroicons/react/24/outline'
import {
  type BoothSession,
  clearBoothSession,
  loadBoothSession,
} from '@/lib/boothAuth'
import {
  type BoothOrderItem,
  confirmBoothOrderItems,
  fetchTodayBoothOrderItems,
  markBoothOrderItemsReady,
  subscribeBoothOrders,
} from '@/lib/boothOrders'
import BoothMenuModal from '@/components/booth/BoothMenuModal'
import styles from './BoothDashboardPage.module.css'

type CardStatus = 'waiting' | 'inProgress' | 'completed'

interface BoothOrderCard {
  orderId: string
  orderNumber: string
  orderCreatedAt: string
  items: BoothOrderItem[]
  totalAmount: number
  status: CardStatus
}

const HIGHLIGHT_MS = 5_000
const ALERT_SECONDS = 60
const COMPLETED_LIMIT = 20

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

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}초 전`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m < 60) return `${m}분 ${s.toString().padStart(2, '0')}초 전`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return `${h}시간 ${rm}분 전`
}

export default function BoothDashboardPage() {
  const navigate = useNavigate()
  const [session, setSession] = useState<BoothSession | null>(loadBoothSession)

  // 미인증 리다이렉트
  useEffect(() => {
    if (!session) {
      navigate('/booth/login', { replace: true })
    }
  }, [session, navigate])

  // 가로 모드 고정
  useEffect(() => {
    const orientation = (
      screen as Screen & {
        orientation?: ScreenOrientation & { lock?: (o: string) => Promise<void> }
      }
    ).orientation
    orientation?.lock?.('landscape').catch(() => {
      /* iOS / 데스크탑은 미지원 — 무시 */
    })
    return () => {
      orientation?.unlock?.()
    }
  }, [])

  if (!session) return null
  return <DashboardInner session={session} onLogout={() => {
    clearBoothSession()
    setSession(null)
  }} />
}

interface DashboardInnerProps {
  session: BoothSession
  onLogout: () => void
}

function DashboardInner({ session, onLogout }: DashboardInnerProps) {
  const boothId = session.boothId

  const [items, setItems] = useState<BoothOrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [highlightOrderIds, setHighlightOrderIds] = useState<Set<string>>(new Set())
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [menuModalOpen, setMenuModalOpen] = useState(false)

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
      onConnectionChange: (c) => {
        if (cancelledRef.current) return
        setConnected(c)
      },
    })

    return () => {
      cancelledRef.current = true
      unsubscribe()
    }
  }, [boothId, refetch])

  // 1초 tick — 경과 시간 카운트업
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const cards = useMemo(() => buildCards(items), [items])

  // 좌측: 대기 + 진행중 (= !completed). highlight 카드 먼저, 그 다음 오래된 순.
  const waitingCards = useMemo(() => {
    const list = cards.filter((c) => c.status !== 'completed')
    list.sort((a, b) => {
      const aHi = highlightOrderIds.has(a.orderId) ? 0 : 1
      const bHi = highlightOrderIds.has(b.orderId) ? 0 : 1
      if (aHi !== bHi) return aHi - bHi
      return a.orderCreatedAt.localeCompare(b.orderCreatedAt)
    })
    return list
  }, [cards, highlightOrderIds])

  // 우측 상단: 완료 — 최근 20건
  const completedCards = useMemo(() => {
    return cards
      .filter((c) => c.status === 'completed')
      .sort((a, b) => b.orderCreatedAt.localeCompare(a.orderCreatedAt))
      .slice(0, COMPLETED_LIMIT)
  }, [cards])

  // 우측 하단: 오늘 매출 (is_ready=true 만)
  const sales = useMemo(() => {
    const readyItems = items.filter((it) => it.is_ready)
    const orderIds = new Set(readyItems.map((it) => it.order_id))
    const total = readyItems.reduce((sum, it) => sum + it.subtotal, 0)
    return { count: orderIds.size, total }
  }, [items])

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

  return (
    <div className={styles.container}>
      {/* ── 헤더 ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.boothName}>{session.boothName}</span>
          {session.boothNo && (
            <span className={styles.boothNo}>{session.boothNo}번 매장</span>
          )}
        </div>
        <div className={styles.headerCenter}>
          <span
            className={`${styles.connDot} ${
              connected ? styles.connDotOn : styles.connDotOff
            }`}
            aria-hidden
          />
          <span className={styles.connText}>
            {connected ? '연결됨' : '연결 끊김'}
          </span>
        </div>
        <div className={styles.headerRight}>
          <button
            type="button"
            className={styles.headerBtn}
            onClick={() => setMenuModalOpen(true)}
          >
            <NoSymbolIcon className={styles.headerBtnIcon} />
            <span>품절 관리</span>
          </button>
          <button
            type="button"
            className={styles.headerBtn}
            onClick={onLogout}
          >
            <ArrowRightOnRectangleIcon className={styles.headerBtnIcon} />
            <span>로그아웃</span>
          </button>
        </div>
      </header>

      {/* ── 콘텐츠 (1fr / 360px) ── */}
      <div className={styles.content}>
        {/* ── 좌측: 대기 주문 ── */}
        <section className={styles.waitingPanel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>
              대기 주문 <span className={styles.panelCount}>({waitingCards.length}건)</span>
            </h2>
          </div>

          {error && <div className={styles.errorBanner}>{error}</div>}

          {loading ? (
            <div className={styles.empty}>주문을 불러오는 중...</div>
          ) : waitingCards.length === 0 ? (
            <div className={styles.empty}>대기 중인 주문이 없습니다.</div>
          ) : (
            <div className={styles.cardList}>
              {waitingCards.map((card) => {
                const elapsedSec = Math.max(
                  0,
                  Math.floor((now - new Date(card.orderCreatedAt).getTime()) / 1000),
                )
                const overAlert = elapsedSec >= ALERT_SECONDS
                const highlighted = highlightOrderIds.has(card.orderId)
                const busy = busyOrderId === card.orderId
                return (
                  <article
                    key={card.orderId}
                    className={`${styles.card} ${styles[`card_${card.status}`]} ${
                      overAlert ? styles.cardAlert : ''
                    } ${highlighted ? styles.cardHighlight : ''}`}
                  >
                    <div className={styles.cardHeader}>
                      <div className={styles.cardOrderNo}>{card.orderNumber}</div>
                      <div
                        className={`${styles.cardElapsed} ${
                          overAlert ? styles.cardElapsedAlert : ''
                        }`}
                      >
                        · {formatElapsed(elapsedSec)}
                      </div>
                    </div>
                    <ul className={styles.itemList}>
                      {card.items.map((it) => (
                        <li key={it.id} className={styles.itemRow}>
                          <span className={styles.itemName}>{it.menu_name}</span>
                          <span className={styles.itemQty}>× {it.quantity}</span>
                        </li>
                      ))}
                    </ul>
                    <div className={styles.cardFooter}>
                      <div className={styles.cardTotal}>
                        {card.totalAmount.toLocaleString()}원
                      </div>
                      <div className={styles.cardActions}>
                        {card.status === 'waiting' && (
                          <button
                            type="button"
                            className={`${styles.actionBtn} ${styles.actionConfirm}`}
                            onClick={() => handleConfirm(card)}
                            disabled={busy}
                          >
                            {busy ? '처리 중...' : '확인'}
                          </button>
                        )}
                        <button
                          type="button"
                          className={`${styles.actionBtn} ${styles.actionReady}`}
                          onClick={() => handleReady(card)}
                          disabled={busy}
                        >
                          {busy ? '처리 중...' : '준비완료'}
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        {/* ── 우측 패널 ── */}
        <aside className={styles.rightPanel}>
          {/* 완료 리스트 */}
          <section className={styles.completedPanel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>
                완료 <span className={styles.panelCount}>({completedCards.length}건)</span>
              </h2>
            </div>
            {completedCards.length === 0 ? (
              <div className={styles.emptySmall}>완료된 주문이 없습니다.</div>
            ) : (
              <div className={styles.completedList}>
                {completedCards.map((card) => {
                  const summary = card.items
                    .map((it) => `${it.menu_name}×${it.quantity}`)
                    .join(', ')
                  return (
                    <div key={card.orderId} className={styles.completedCard}>
                      <div className={styles.completedRow}>
                        <span className={styles.completedNo}>{card.orderNumber}</span>
                        <span className={styles.completedTime}>
                          {formatHm(card.orderCreatedAt)}
                        </span>
                      </div>
                      <div className={styles.completedSummary}>{summary}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* 오늘 매출 */}
          <section className={styles.salesPanel}>
            <div className={styles.salesLabel}>오늘 매출</div>
            <div className={styles.salesRow}>
              <span className={styles.salesCount}>{sales.count}건</span>
              <span className={styles.salesAmount}>{sales.total.toLocaleString()}원</span>
            </div>
          </section>
        </aside>
      </div>

      {menuModalOpen && (
        <BoothMenuModal
          boothId={boothId}
          onClose={() => setMenuModalOpen(false)}
        />
      )}
    </div>
  )
}
