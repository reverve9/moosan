import { RotateCw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { confirmBoothOrder } from '@/lib/boothOrders'
import { formatPhoneDisplay } from '@/lib/phone'
import {
  elapsedSeconds,
  useAdminAlert,
} from '@/components/admin/AdminAlertContext'
import styles from './AdminMonitor.module.css'

// 테스트 단계 한정: 어드민 모니터에서도 "확인" 가능. 운영 배포 시 자동으로 숨김.
const ALLOW_ADMIN_CONFIRM = import.meta.env.DEV

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

type OperatingState = 'open' | 'paused' | 'closed'

function operatingState(s: { isOpen: boolean; isPaused: boolean }): OperatingState {
  if (!s.isOpen) return 'closed'
  if (s.isPaused) return 'paused'
  return 'open'
}

const OPERATING_LABEL: Record<OperatingState, string> = {
  open: '영업중',
  paused: '일시중지',
  closed: '마감',
}

/**
 * 어드민 실시간 매장 모니터.
 *
 * 매장별 운영 상태 (영업중/일시중지/마감) + 단계별 진행 건수 (미확인/조리중/조리완료)
 * + 누적 (픽업완료/매출/취소) + 대기시간 indicator. 카드 클릭 시 미확인 주문 상세
 * 모달.
 *
 * 헤더는 운영 상태 카운트 + 진행중 합계 + 매출/픽업. 1분/2분 초과 알람은 사이드바
 * 배지로만 노출하고 본 페이지에선 표시 생략 (사용자 피드백: 시간 초과 강조 무의미).
 */
export default function AdminMonitor() {
  const {
    summaries,
    boothStatuses,
    now,
    loading,
    error: ctxError,
    refreshing,
    refetch,
  } = useAdminAlert()
  const [localError, setLocalError] = useState<string | null>(null)
  const [selectedBoothId, setSelectedBoothId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const error = localError ?? ctxError

  useEffect(() => {
    if (!selectedBoothId) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedBoothId(null)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectedBoothId])

  const handleRefresh = useCallback(async () => {
    setLocalError(null)
    await refetch()
  }, [refetch])

  const handleAdminConfirm = useCallback(
    async (orderId: string) => {
      if (!ALLOW_ADMIN_CONFIRM) return
      setConfirmingId(orderId)
      try {
        await confirmBoothOrder(orderId)
        await refetch()
      } catch (e) {
        setLocalError(e instanceof Error ? e.message : '확인 처리 실패')
      } finally {
        setConfirmingId(null)
      }
    },
    [refetch],
  )

  // 헤더 통계 — 영업 상태별 매장 수 + 진행중 총합 + 매출/픽업
  const headerStats = useMemo(() => {
    let open = 0
    let paused = 0
    let closed = 0
    let inProgress = 0
    let pickedUp = 0
    let gross = 0
    for (const s of boothStatuses) {
      const st = operatingState(s)
      if (st === 'open') open += 1
      else if (st === 'paused') paused += 1
      else closed += 1
      inProgress += s.unconfirmedCount + s.confirmedCount + s.readyCount
      pickedUp += s.pickedUpCount
      gross += s.grossAmount
    }
    return { open, paused, closed, inProgress, pickedUp, gross }
  }, [boothStatuses])

  const selectedBooth = useMemo(
    () => summaries.find((s) => s.boothId === selectedBoothId) ?? null,
    [summaries, selectedBoothId],
  )

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>실시간 매장 모니터</h1>
          <p className={styles.sub}>매장별 운영 상태 + 단계별 진행 + 오늘 누적</p>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{headerStats.open}</div>
            <div className={styles.statLabel}>영업중</div>
          </div>
          <div className={`${styles.statBox} ${headerStats.paused > 0 ? styles.statBoxPaused : ''}`}>
            <div className={styles.statValue}>{headerStats.paused}</div>
            <div className={styles.statLabel}>일시중지</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{headerStats.closed}</div>
            <div className={styles.statLabel}>마감</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{headerStats.inProgress}</div>
            <div className={styles.statLabel}>진행중</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{headerStats.pickedUp}</div>
            <div className={styles.statLabel}>오늘 픽업</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statValue}>
              {headerStats.gross.toLocaleString()}
            </div>
            <div className={styles.statLabel}>오늘 매출(원)</div>
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
          {boothStatuses.map((s) => {
            const state = operatingState(s)
            const hasInProgress =
              s.unconfirmedCount + s.confirmedCount + s.readyCount > 0
            const oldestUnconfirmedSec = s.oldestUnconfirmedAt
              ? elapsedSeconds(s.oldestUnconfirmedAt, now)
              : 0
            const oldestReadySec = s.oldestReadyAt
              ? elapsedSeconds(s.oldestReadyAt, now)
              : 0
            return (
              <button
                key={s.boothId}
                type="button"
                className={`${styles.boothCard} ${styles[`state_${state}`]} ${
                  hasInProgress ? styles.boothCardActive : ''
                }`}
                onClick={() => s.unconfirmedCount > 0 && setSelectedBoothId(s.boothId)}
                disabled={s.unconfirmedCount === 0}
                title={
                  s.unconfirmedCount === 0
                    ? '미확인 주문 없음 (클릭 비활성)'
                    : '클릭 → 미확인 주문 상세'
                }
              >
                <div className={styles.boothHead}>
                  <div className={styles.boothNameWrap}>
                    {s.boothNo && <span className={styles.boothNo}>{s.boothNo}</span>}
                    <span className={styles.boothName}>{s.boothName}</span>
                  </div>
                  <span
                    className={`${styles.opBadge} ${styles[`opBadge_${state}`]}`}
                  >
                    {OPERATING_LABEL[state]}
                  </span>
                </div>

                <div className={styles.stageGrid}>
                  <div
                    className={`${styles.stageCell} ${
                      s.unconfirmedCount > 0 ? styles.stageCellUnconfirmedActive : ''
                    }`}
                  >
                    <div className={styles.stageValue}>{s.unconfirmedCount}</div>
                    <div className={styles.stageLabel}>미확인</div>
                  </div>
                  <div
                    className={`${styles.stageCell} ${
                      s.confirmedCount > 0 ? styles.stageCellConfirmedActive : ''
                    }`}
                  >
                    <div className={styles.stageValue}>{s.confirmedCount}</div>
                    <div className={styles.stageLabel}>조리중</div>
                  </div>
                  <div
                    className={`${styles.stageCell} ${
                      s.readyCount > 0 ? styles.stageCellReadyActive : ''
                    }`}
                  >
                    <div className={styles.stageValue}>{s.readyCount}</div>
                    <div className={styles.stageLabel}>조리완료</div>
                  </div>
                </div>

                <div className={styles.metricsRow}>
                  <span className={styles.metric}>
                    픽업 <strong>{s.pickedUpCount}</strong>
                  </span>
                  <span className={styles.metric}>
                    매출 <strong>{s.grossAmount.toLocaleString()}</strong>원
                  </span>
                  {s.cancelledCount > 0 && (
                    <span className={`${styles.metric} ${styles.metricCancelled}`}>
                      취소 <strong>{s.cancelledCount}</strong>
                    </span>
                  )}
                </div>

                {(s.oldestUnconfirmedAt || s.oldestReadyAt) && (
                  <div className={styles.waitRow}>
                    {s.oldestUnconfirmedAt && (
                      <span className={styles.waitLine}>
                        미확인 가장 오래 · {formatElapsed(oldestUnconfirmedSec)}
                      </span>
                    )}
                    {s.oldestReadyAt && (
                      <span className={styles.waitLine}>
                        조리완료 미픽업 · {formatElapsed(oldestReadySec)}
                      </span>
                    )}
                  </div>
                )}
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
                const menuSummary = order.items
                  .map((it) => `${it.menu_name} × ${it.quantity}`)
                  .join(', ')
                return (
                  <li key={order.id} className={styles.modalItem}>
                    <div className={styles.modalItemLeft}>
                      <div className={styles.modalItemTime}>{formatHm(order.paid_at)}</div>
                      <div className={styles.modalItemOrderNo}>{order.order_number}</div>
                    </div>
                    <div className={styles.modalItemBody}>
                      <div className={styles.modalItemMenu}>{menuSummary}</div>
                      <div className={styles.modalItemPhone}>{formatPhoneDisplay(order.phone)}</div>
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
