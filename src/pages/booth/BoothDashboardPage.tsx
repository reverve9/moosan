import { LogOut, Ban } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  type BoothSession,
  clearBoothSession,
  loadBoothSession,
} from '@/lib/boothAuth'
import {
  type BoothOrderCardData,
  type BoothOrderCardStatus,
  cancelBoothOrder,
  confirmBoothOrder,
  fetchTodayBoothOrders,
  getBoothOrderCardStatus,
  markBoothOrderReady,
  subscribeBoothOrders,
} from '@/lib/boothOrders'
import BoothMenuModal from '@/components/booth/BoothMenuModal'
import BoothCancelOrderModal from '@/components/booth/BoothCancelOrderModal'
import ConnectionBanner from '@/components/ui/ConnectionBanner'
import { formatPhoneDisplay } from '@/lib/phone'
import { playSound } from '@/lib/audioCue'
import { useToast } from '@/components/ui/Toast'
import { useRealtimeHealth } from '@/hooks/useRealtimeHealth'
import { useWakeLock } from '@/hooks/useWakeLock'
import styles from './BoothDashboardPage.module.css'

type CardStatus = BoothOrderCardStatus

interface BoothOrderCard {
  orderId: string
  orderNumber: string
  phone: string
  orderPaidAt: string  // 결제 승인 완료 시각 (elapsed/정렬/표시 기준)
  items: BoothOrderCardData['items']
  totalAmount: number
  status: CardStatus
  estimatedMinutes: number | null
  confirmedAt: string | null
}

const HIGHLIGHT_MS = 5_000
const ALERT_SECONDS = 60
const ALARM_INTERVAL_MS = 60_000
const COMPLETED_LIMIT = 20

/** navigator.vibrate 안전 호출 — 미지원/비모바일 브라우저는 no-op */
function vibrateSafe(pattern: number[]): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern)
    }
  } catch {
    /* 무시 */
  }
}

function buildCards(data: BoothOrderCardData[]): BoothOrderCard[] {
  return data.map(({ order, items }) => ({
    orderId: order.id,
    orderNumber: order.order_number,
    phone: order.phone,
    orderPaidAt: order.paid_at ?? order.created_at,
    items,
    totalAmount: order.subtotal,
    status: getBoothOrderCardStatus(order),
    estimatedMinutes: order.estimated_minutes,
    confirmedAt: order.confirmed_at,
  }))
}

function formatDateHm(iso: string): string {
  const d = new Date(iso)
  const kst = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const mm = String(kst.getMonth() + 1).padStart(2, '0')
  const dd = String(kst.getDate()).padStart(2, '0')
  const hh = String(kst.getHours()).padStart(2, '0')
  const mi = String(kst.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
}

function formatCountdown(remainSec: number): { text: string; overdue: boolean } {
  if (remainSec <= 0) {
    const over = Math.abs(remainSec)
    const m = Math.floor(over / 60)
    const s = over % 60
    return { text: `+${m}:${s.toString().padStart(2, '0')}`, overdue: true }
  }
  const m = Math.floor(remainSec / 60)
  const s = remainSec % 60
  return { text: `${m}:${s.toString().padStart(2, '0')}`, overdue: false }
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
      navigate('/login', { replace: true })
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
  const { showToast } = useToast()
  const { status: realtimeStatus } = useRealtimeHealth()
  const connected = realtimeStatus === 'healthy'

  // 탭 활성인 동안 화면 절전 방지 (미지원 브라우저는 no-op)
  useWakeLock(true)

  const [data, setData] = useState<BoothOrderCardData[]>([])
  const dataRef = useRef<BoothOrderCardData[]>([])
  useEffect(() => {
    dataRef.current = data
  }, [data])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [highlightOrderIds, setHighlightOrderIds] = useState<Set<string>>(new Set())
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [menuModalOpen, setMenuModalOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<BoothOrderCard | null>(null)

  const cancelledRef = useRef(false)

  const refetch = useCallback(async () => {
    try {
      const next = await fetchTodayBoothOrders(boothId)
      if (cancelledRef.current) return
      setData(next)
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
      onOrderPaid: (orderId) => {
        void playSound(3)
        vibrateSafe([300, 100, 300, 100, 300])
        setHighlightOrderIds((prev) => {
          const set = new Set(prev)
          set.add(orderId)
          return set
        })
        window.setTimeout(() => {
          if (cancelledRef.current) return
          setHighlightOrderIds((prev) => {
            const set = new Set(prev)
            set.delete(orderId)
            return set
          })
        }, HIGHLIGHT_MS)
      },
      onOrderCancelled: (orderId) => {
        const found = dataRef.current.find((d) => d.order.id === orderId)
        const label = found ? `[${found.order.order_number}] ` : ''
        showToast(`${label}주문이 취소되었습니다`, { type: 'error', duration: 5000 })
      },
      onChange: () => {
        void refetch()
      },
    })

    return () => {
      cancelledRef.current = true
      unsubscribe()
    }
  }, [boothId, refetch, showToast])

  // 1초 tick — 경과 시간 카운트업
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  // 미확인 주문 1분 간격 반복 알람
  useEffect(() => {
    const id = window.setInterval(() => {
      const hasUnconfirmed = data.some(
        (d) => d.order.status === 'paid' && !d.order.confirmed_at && !d.order.cancelled_at,
      )
      if (hasUnconfirmed) {
        void playSound(3)
        vibrateSafe([300, 100, 300, 100, 300])
      }
    }, ALARM_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [data])

  // 조리시간 초과 알람 — estimated_minutes + 2분 초과 시 1회
  const overdueAlertedIds = useRef<Set<string>>(new Set())
  useEffect(() => {
    const nowMs = Date.now()
    for (const d of data) {
      if (
        d.order.confirmed_at &&
        !d.order.ready_at &&
        d.order.estimated_minutes &&
        !overdueAlertedIds.current.has(d.order.id)
      ) {
        const confirmedMs = new Date(d.order.confirmed_at).getTime()
        const deadline = confirmedMs + (d.order.estimated_minutes + 2) * 60 * 1000
        if (nowMs > deadline) {
          overdueAlertedIds.current.add(d.order.id)
          void playSound(3, 'overdue')
          vibrateSafe([300, 100, 300, 100, 300])
        }
      }
    }
  }, [data, now])

  const cards = useMemo(() => buildCards(data), [data])

  // 좌측: 대기 + 진행중 (= !completed). highlight 카드 먼저, 그 다음 오래된 순.
  const waitingCards = useMemo(() => {
    const list = cards.filter((c) => c.status !== 'completed')
    list.sort((a, b) => {
      const aHi = highlightOrderIds.has(a.orderId) ? 0 : 1
      const bHi = highlightOrderIds.has(b.orderId) ? 0 : 1
      if (aHi !== bHi) return aHi - bHi
      return a.orderPaidAt.localeCompare(b.orderPaidAt)
    })
    return list
  }, [cards, highlightOrderIds])

  // 우측 상단: 완료 — 최근 20건
  const completedCards = useMemo(() => {
    return cards
      .filter((c) => c.status === 'completed')
      .sort((a, b) => b.orderPaidAt.localeCompare(a.orderPaidAt))
      .slice(0, COMPLETED_LIMIT)
  }, [cards])

  // 우측 하단: 오늘 매출 (ready_at 있는 order 만)
  const sales = useMemo(() => {
    const ready = data.filter((d) => d.order.ready_at)
    const total = ready.reduce((sum, d) => sum + d.order.subtotal, 0)
    return { count: ready.length, total }
  }, [data])

  const handleConfirmWithTime = useCallback(
    async (card: BoothOrderCard, minutes: number) => {
      if (busyOrderId) return
      setBusyOrderId(card.orderId)
      try {
        await confirmBoothOrder(card.orderId, minutes)
        await refetch()
      } catch (e) {
        setError(e instanceof Error ? e.message : '확인 처리 실패')
      } finally {
        setBusyOrderId(null)
      }
    },
    [busyOrderId, refetch],
  )

  const handleReady = useCallback(
    async (card: BoothOrderCard) => {
      if (busyOrderId) return
      setBusyOrderId(card.orderId)
      try {
        await markBoothOrderReady(card.orderId)
        await refetch()
      } catch (e) {
        setError(e instanceof Error ? e.message : '준비완료 처리 실패')
      } finally {
        setBusyOrderId(null)
      }
    },
    [busyOrderId, refetch],
  )

  const handleCancelConfirm = useCallback(
    async (reason: string) => {
      if (!cancelTarget || busyOrderId) return
      setBusyOrderId(cancelTarget.orderId)
      try {
        await cancelBoothOrder(cancelTarget.orderId, reason)
        showToast(`[${cancelTarget.orderNumber}] 거절 + 환불 처리됐어요`, {
          type: 'success',
          duration: 4000,
        })
        setCancelTarget(null)
        await refetch()
      } catch (e) {
        const msg = e instanceof Error ? e.message : '주문 거절 실패'
        setError(msg)
        showToast(msg, { type: 'error', duration: 5000 })
      } finally {
        setBusyOrderId(null)
      }
    },
    [cancelTarget, busyOrderId, refetch, showToast],
  )

  return (
    <div className={styles.container}>
      <ConnectionBanner />
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
            <Ban className={styles.headerBtnIcon} />
            <span>매장 관리</span>
          </button>
          <button
            type="button"
            className={styles.headerBtn}
            onClick={onLogout}
          >
            <LogOut className={styles.headerBtnIcon} />
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
                  Math.floor((now - new Date(card.orderPaidAt).getTime()) / 1000),
                )
                // 초과 alert 는 미확인 (waiting) 상태일 때만 의미 있음.
                // 확인 후에는 elapsed 가 1분 넘어도 빨강/펄스 풀어줌.
                const overAlert = card.status === 'waiting' && elapsedSec >= ALERT_SECONDS
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
                      <div className={styles.cardHeaderMain}>
                        <span className={styles.cardOrderNo}>{card.orderNumber}</span>
                        <span
                          className={`${styles.cardElapsed} ${
                            overAlert ? styles.cardElapsedAlert : ''
                          } ${
                            card.status === 'inProgress' && card.confirmedAt && card.estimatedMinutes
                              ? (() => {
                                  const confirmedMs = new Date(card.confirmedAt).getTime()
                                  const remainSec = Math.floor((confirmedMs + card.estimatedMinutes * 60 * 1000 - now) / 1000)
                                  return remainSec <= 0 ? styles.cardElapsedAlert : ''
                                })()
                              : ''
                          }`}
                        >
                          {card.status === 'inProgress' && card.confirmedAt && card.estimatedMinutes
                            ? (() => {
                                const confirmedMs = new Date(card.confirmedAt).getTime()
                                const remainSec = Math.floor((confirmedMs + card.estimatedMinutes * 60 * 1000 - now) / 1000)
                                const cd = formatCountdown(remainSec)
                                return cd.text
                              })()
                            : formatElapsed(elapsedSec)
                          }
                        </span>
                      </div>
                      <div className={styles.cardPhone}>{formatPhoneDisplay(card.phone)}</div>
                    </div>
                    <ul className={styles.itemList}>
                      {Array.from({ length: Math.max(2, card.items.length) }).map((_, i) => {
                        const it = card.items[i]
                        if (!it) {
                          return <li key={`empty-${i}`} className={styles.itemRowEmpty} aria-hidden />
                        }
                        return (
                          <li key={it.id} className={styles.itemRow}>
                            <span className={styles.itemName}>{it.menu_name}</span>
                            <span className={styles.itemQty}>× {it.quantity}</span>
                          </li>
                        )
                      })}
                    </ul>
                    <div className={styles.cardFooter}>
                      <div className={styles.cardTotal}>
                        {card.totalAmount.toLocaleString()}원
                      </div>
                      <div className={styles.cardActions}>
                        <button
                          type="button"
                          className={`${styles.actionBtn} ${styles.actionReject}`}
                          onClick={() => setCancelTarget(card)}
                          disabled={busy}
                          aria-label="주문 거절"
                        >
                          {busy ? '...' : '거절'}
                        </button>
                        <button
                          type="button"
                          className={`${styles.actionBtn} ${styles.actionReady}`}
                          onClick={() => handleReady(card)}
                          disabled={busy}
                        >
                          {busy ? '처리 중...' : '조리완료'}
                        </button>
                      </div>
                      {card.status === 'waiting' && (
                        <div className={styles.timeOverlay}>
                          <button
                            type="button"
                            className={`${styles.actionBtn} ${styles.actionReject}`}
                            onClick={() => setCancelTarget(card)}
                            disabled={busy}
                          >
                            {busy ? '...' : '거절'}
                          </button>
                          <div className={styles.timeGrid}>
                            {[5, 10, 15, 20, 30].map((m) => (
                              <button
                                key={m}
                                type="button"
                                className={styles.timeGridBtn}
                                onClick={() => handleConfirmWithTime(card, m)}
                                disabled={busy}
                              >
                                {busy ? '·' : m}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
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
                          {formatDateHm(card.orderPaidAt)}
                        </span>
                      </div>
                      <div className={styles.completedSummary}>{summary}</div>
                      <div className={styles.completedMeta}>
                        <span className={styles.completedAmount}>{card.totalAmount.toLocaleString()}원</span>
                        <span>{formatPhoneDisplay(card.phone)}</span>
                      </div>
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

      {cancelTarget && (
        <BoothCancelOrderModal
          orderNumber={cancelTarget.orderNumber}
          refundAmount={cancelTarget.totalAmount}
          busy={busyOrderId === cancelTarget.orderId}
          onConfirm={handleCancelConfirm}
          onClose={() => {
            if (busyOrderId === cancelTarget.orderId) return
            setCancelTarget(null)
          }}
        />
      )}
    </div>
  )
}
