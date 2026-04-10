import { RotateCw, TriangleAlert, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { confirmBoothOrder } from '@/lib/boothOrders'
import { formatPhoneDisplay } from '@/lib/phone'
import {
  ALERT_SECONDS,
  WARN_SECONDS,
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

export default function AdminMonitor() {
  const {
    summaries,
    confirmedOrders,
    now,
    alertCount,
    warnCount,
    totalPending,
    overdueCount,
    loading,
    error: ctxError,
    refreshing,
    refetch,
  } = useAdminAlert()
  const [localError, setLocalError] = useState<string | null>(null)
  const [selectedBoothId, setSelectedBoothId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const error = localError ?? ctxError

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

  // 조리시간 초과 부스 ID Set
  const overdueBoothIds = useMemo(() => {
    const ids = new Set<string>()
    for (const o of confirmedOrders) {
      const confirmedMs = new Date(o.confirmed_at).getTime()
      const deadline = confirmedMs + (o.estimated_minutes + 1) * 60 * 1000
      if (now > deadline) ids.add(o.booth_id)
    }
    return ids
  }, [confirmedOrders, now])

  const selectedBooth = useMemo(
    () => summaries.find((s) => s.boothId === selectedBoothId) ?? null,
    [summaries, selectedBoothId],
  )

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>실시간 모니터</h1>
          <p className={styles.sub}>
            1분 초과 주황, 2분 초과 빨강 + 경보 — 부스에서 처리되지 않은 주문입니다.
          </p>
        </div>
        <div className={styles.headerRight}>
          <div className={`${styles.statBox} ${alertCount > 0 ? styles.statBoxAlert2 : ''}`}>
            <div className={styles.statValue}>{alertCount}</div>
            <div className={styles.statLabel}>2분 초과</div>
          </div>
          <div className={`${styles.statBox} ${warnCount > 0 ? styles.statBoxAlert : ''}`}>
            <div className={styles.statValue}>{warnCount}</div>
            <div className={styles.statLabel}>1분 초과</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{totalPending}</div>
            <div className={styles.statLabel}>총 미확인</div>
          </div>
          <div className={`${styles.statBox} ${overdueCount > 0 ? styles.statBoxOverdue : ''}`}>
            <div className={styles.statValue}>{overdueCount}</div>
            <div className={styles.statLabel}>조리 초과</div>
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

      {alertCount > 0 && (
        <div className={styles.alertBanner}>
          <TriangleAlert className={styles.alertBannerIcon} />
          <div className={styles.alertBannerText}>
            <strong>2분 이상 지연된 주문 {alertCount}건</strong>
            <span> — 부스에서 처리되지 않았습니다. 해당 매장에 즉시 확인하세요.</span>
          </div>
        </div>
      )}

      {overdueCount > 0 && (
        <div className={styles.overdueBanner}>
          <TriangleAlert className={styles.overdueBannerIcon} />
          <div className={styles.overdueBannerText}>
            <strong>조리시간 초과 {overdueCount}건</strong>
            <span> — 예상 시간이 지났습니다. 해당 매장에 확인하세요.</span>
          </div>
        </div>
      )}

      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading ? (
        <div className={styles.placeholder}>모니터 데이터를 불러오는 중...</div>
      ) : (
        <div className={styles.boothGrid}>
          {summaries.map((s) => {
            const elapsed = s.oldestPaidAt ? elapsedSeconds(s.oldestPaidAt, now) : 0
            let levelClass = ''
            if (s.count > 0) {
              if (elapsed >= ALERT_SECONDS) {
                // 2분 초과 — alert 스타일 위에 alert2 덮어쓰기 (더 강한 pulse)
                levelClass = `${styles.level_alert} ${styles.level_alert2}`
              } else if (elapsed >= WARN_SECONDS) {
                levelClass = styles.level_alert
              } else {
                levelClass = styles.level_pending
              }
            } else {
              levelClass = styles.level_idle
            }
            return (
              <button
                key={s.boothId}
                type="button"
                className={`${styles.boothCard} ${levelClass}`}
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
                {overdueBoothIds.has(s.boothId) && (
                  <div className={styles.overdueBadge}>⏰ 조리시간 초과</div>
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
                const isAlert2 = elapsed >= ALERT_SECONDS
                const isAlert = elapsed >= WARN_SECONDS
                const menuSummary = order.items
                  .map((it) => `${it.menu_name} × ${it.quantity}`)
                  .join(', ')
                return (
                  <li
                    key={order.id}
                    className={`${styles.modalItem} ${
                      isAlert2
                        ? styles.modalItemAlert2
                        : isAlert
                        ? styles.modalItemAlert
                        : ''
                    }`}
                  >
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
