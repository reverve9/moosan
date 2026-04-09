import { RotateCw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchMonitorSummary,
  type MonitorBoothSummary,
  subscribeMonitor,
} from '@/lib/boothMonitor'
import { confirmBoothOrder } from '@/lib/boothOrders'
import { formatPhone } from '@/lib/phone'
import styles from './AdminMonitor.module.css'

const ALERT_SECONDS = 60
const TICK_MS = 1_000
// 테스트 단계 한정: 어드민 모니터에서도 "확인" 가능. 운영 배포 시 자동으로 숨김.
const ALLOW_ADMIN_CONFIRM = import.meta.env.DEV

function elapsedSeconds(iso: string, nowMs: number): number {
  const t = new Date(iso).getTime()
  return Math.max(0, Math.floor((nowMs - t) / 1000))
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}초`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}분 ${s.toString().padStart(2, '0')}초`
}

function formatHm(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

export default function AdminMonitor() {
  const [summaries, setSummaries] = useState<MonitorBoothSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [selectedBoothId, setSelectedBoothId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    try {
      const data = await fetchMonitorSummary()
      setSummaries(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터 조회 실패')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    refetch().finally(() => {
      if (!cancelled) setLoading(false)
    })
    const unsub = subscribeMonitor(() => {
      void refetch()
    }, 'admin-monitor-page')
    return () => {
      cancelled = true
      unsub()
    }
  }, [refetch])

  // 1초 tick (카운트업용)
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  // ESC 로 모달 닫기
  useEffect(() => {
    if (!selectedBoothId) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedBoothId(null)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectedBoothId])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }, [refetch])

  const handleAdminConfirm = useCallback(
    async (orderId: string) => {
      if (!ALLOW_ADMIN_CONFIRM) return
      setConfirmingId(orderId)
      try {
        await confirmBoothOrder(orderId)
        await refetch()
      } catch (e) {
        setError(e instanceof Error ? e.message : '확인 처리 실패')
      } finally {
        setConfirmingId(null)
      }
    },
    [refetch],
  )

  const totalPending = useMemo(
    () => summaries.reduce((sum, s) => sum + s.count, 0),
    [summaries],
  )

  // 1분 초과 주문 개수 (부스 수가 아니라 order 단위 — 총 미확인과 단위 일치)
  const alertCount = useMemo(
    () =>
      summaries.reduce(
        (sum, s) =>
          sum +
          s.orders.filter((o) => elapsedSeconds(o.paid_at, now) >= ALERT_SECONDS)
            .length,
        0,
      ),
    [summaries, now],
  )

  const selectedBooth = useMemo(
    () => summaries.find((s) => s.boothId === selectedBoothId) ?? null,
    [summaries, selectedBoothId],
  )

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>실시간 모니터</h1>
          <p className={styles.sub}>1분 초과 미확인 주문은 빨간색으로 표시됩니다.</p>
        </div>
        <div className={styles.headerRight}>
          <div className={`${styles.statBox} ${alertCount > 0 ? styles.statBoxAlert : ''}`}>
            <div className={styles.statValue}>{alertCount}</div>
            <div className={styles.statLabel}>1분 초과</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{totalPending}</div>
            <div className={styles.statLabel}>총 미확인</div>
          </div>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RotateCw
              className={`${styles.refreshIcon} ${refreshing ? styles.refreshIconSpin : ''}`}
            />
            <span>새로고침</span>
          </button>
        </div>
      </header>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading ? (
        <div className={styles.placeholder}>모니터 데이터를 불러오는 중...</div>
      ) : (
        <div className={styles.boothGrid}>
          {summaries.map((s) => {
            const elapsed = s.oldestPaidAt ? elapsedSeconds(s.oldestPaidAt, now) : 0
            let level: 'idle' | 'pending' | 'alert' = 'idle'
            if (s.count > 0) {
              level = elapsed >= ALERT_SECONDS ? 'alert' : 'pending'
            }
            return (
              <button
                key={s.boothId}
                type="button"
                className={`${styles.boothCard} ${styles[`level_${level}`]}`}
                onClick={() => s.count > 0 && setSelectedBoothId(s.boothId)}
                disabled={s.count === 0}
              >
                {s.boothNo && <div className={styles.boothNo}>{s.boothNo}번</div>}
                <div className={styles.boothName}>{s.boothName}</div>
                <div className={styles.countRow}>
                  <span className={styles.countValue}>{s.count}</span>
                  <span className={styles.countUnit}>건</span>
                </div>
                <div className={styles.elapsedRow}>
                  {s.oldestPaidAt ? formatElapsed(elapsed) : '—'}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {selectedBooth && (
        <div className={styles.modalOverlay} onClick={() => setSelectedBoothId(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalTitle}>{selectedBooth.boothName}</h2>
                <p className={styles.modalSub}>미확인 주문 {selectedBooth.count}건</p>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setSelectedBoothId(null)}
                aria-label="닫기"
              >
                <X />
              </button>
            </header>
            <ul className={styles.modalList}>
              {selectedBooth.orders.map((order) => {
                const elapsed = elapsedSeconds(order.paid_at, now)
                const isAlert = elapsed >= ALERT_SECONDS
                const menuSummary = order.items
                  .map((it) => `${it.menu_name} × ${it.quantity}`)
                  .join(', ')
                return (
                  <li
                    key={order.id}
                    className={`${styles.modalItem} ${isAlert ? styles.modalItemAlert : ''}`}
                  >
                    <div className={styles.modalItemLeft}>
                      <div className={styles.modalItemTime}>{formatHm(order.paid_at)}</div>
                      <div className={styles.modalItemOrderNo}>{order.order_number}</div>
                    </div>
                    <div className={styles.modalItemBody}>
                      <div className={styles.modalItemMenu}>{menuSummary}</div>
                      <div className={styles.modalItemPhone}>{formatPhone(order.phone)}</div>
                    </div>
                    <div className={styles.modalItemElapsed}>{formatElapsed(elapsed)}</div>
                    {ALLOW_ADMIN_CONFIRM && (
                      <button
                        type="button"
                        className={styles.modalItemConfirmBtn}
                        onClick={() => handleAdminConfirm(order.id)}
                        disabled={confirmingId === order.id}
                      >
                        {confirmingId === order.id ? '처리 중…' : '확인 (dev)'}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
