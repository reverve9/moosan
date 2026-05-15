import { useCallback, useEffect, useMemo, useState } from 'react'
import { RotateCw } from 'lucide-react'
import {
  cancelHelpdeskPayment,
  fetchTodayHelpDeskHistory,
  PAYMENT_METHOD_LABEL,
  type HelpDeskHistoryItem,
} from '@/lib/helpDesk'
import { ADMIN_ACCOUNTS } from '@/lib/adminAuth'
import { useToast } from '@/components/ui/Toast'
import type { PaymentMethod } from '@/types/database'
import styles from './AdminHelpDesk.module.css'

interface HelpDeskHistoryTabProps {
  /** 현재 로그인한 도우미 id — 본인 처리분 강조용. 필터링엔 사용 안 함. */
  adminId: string
}

const COLUMN_METHODS: PaymentMethod[] = ['external_card', 'cash', 'voucher_only']

/** assisted_by → displayName lookup. 미등록 id 는 raw id 그대로 노출. */
const ASSISTANT_LABEL = new Map<string, string>(
  ADMIN_ACCOUNTS.map((a) => [a.id, a.displayName]),
)

function formatHm(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/**
 * 헬프데스크 금일 결제 내역 — 모든 도우미 처리분 통합 노출.
 *
 * 운영 의도:
 *  - 메인계정(super) 은 전체 합계를 한 화면에서 봐야 정산 가능.
 *  - 도우미간 인계 — admin01 이 처리한 결제를 admin02 가 취소할 수 있어야 함.
 *  - 본인 처리분은 시각적으로 강조 (테두리/배경) — 헷갈림 방지.
 *
 * 취소 (서버 /api/payments/cancel):
 *  - 부스 확인 전 (paid, confirmed_at=NULL) 결제만 가능. 그 이후는 super 가 AdminOrders 에서 부분 환불.
 *  - 결제수단은 모두 외부(현금/직영카드/식권) 라 PG 호출 없이 DB only.
 */
export default function HelpDeskHistoryTab({ adminId }: HelpDeskHistoryTabProps) {
  const { showToast } = useToast()
  const [history, setHistory] = useState<HelpDeskHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchTodayHelpDeskHistory()
      setHistory(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  // method 별 합계 (paid 만 집계, cancelled 는 전액 환불 케이스라 제외)
  const summary = useMemo(() => {
    const map = new Map<PaymentMethod, { count: number; total: number }>()
    for (const m of COLUMN_METHODS) map.set(m, { count: 0, total: 0 })
    for (const h of history) {
      if (h.payment.status !== 'paid') continue
      const key = h.payment.payment_method as PaymentMethod
      const cur = map.get(key) ?? { count: 0, total: 0 }
      cur.count += 1
      cur.total += h.payment.total_amount
      map.set(key, cur)
    }
    return map
  }, [history])

  const grandTotal = useMemo(() => {
    let count = 0
    let total = 0
    for (const m of COLUMN_METHODS) {
      const v = summary.get(m)
      if (!v) continue
      count += v.count
      total += v.total
    }
    return { count, total }
  }, [summary])

  const itemsByMethod = useMemo(() => {
    const map = new Map<PaymentMethod, HelpDeskHistoryItem[]>()
    for (const m of COLUMN_METHODS) map.set(m, [])
    for (const h of history) {
      const key = h.payment.payment_method as PaymentMethod
      const list = map.get(key)
      if (list) list.push(h)
    }
    return map
  }, [history])

  const handleCancel = useCallback(
    async (paymentId: string) => {
      if (cancellingId) return
      const reason = window.prompt('취소 사유를 입력하세요.', '운영 취소')
      if (reason === null) return
      const trimmed = reason.trim()
      if (!trimmed) {
        showToast('취소 사유는 필수입니다', { type: 'error' })
        return
      }
      setCancellingId(paymentId)
      try {
        await cancelHelpdeskPayment(paymentId, trimmed)
        showToast('결제를 취소했습니다', { type: 'success' })
        await refetch()
      } catch (e) {
        showToast(e instanceof Error ? e.message : '취소 실패', { type: 'error' })
      } finally {
        setCancellingId(null)
      }
    },
    [cancellingId, refetch, showToast],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className={styles.historyDashboard}>
        <div className={`${styles.historyStat} ${styles.historyStatTotal}`}>
          <span className={styles.historyStatLabel}>전체 합계</span>
          <span className={styles.historyStatValue}>
            {grandTotal.total.toLocaleString()}원
          </span>
          <span className={styles.historyStatSub}>{grandTotal.count}건 · 도우미 통합</span>
        </div>
        {COLUMN_METHODS.map((method) => {
          const v = summary.get(method) ?? { count: 0, total: 0 }
          return (
            <div key={method} className={styles.historyStat}>
              <span className={styles.historyStatLabel}>
                {PAYMENT_METHOD_LABEL[method]}
              </span>
              <span className={styles.historyStatValue}>
                {v.total.toLocaleString()}원
              </span>
              <span className={styles.historyStatSub}>{v.count}건</span>
            </div>
          )
        })}
        <div className={styles.historyRefreshWrap}>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => void refetch()}
            disabled={loading}
          >
            <RotateCw
              className={`${styles.refreshIcon} ${loading ? styles.refreshIconSpin : ''}`}
            />
            새로고침
          </button>
        </div>
      </div>

      {error && <div className={styles.cartError}>{error}</div>}

      {loading && history.length === 0 ? (
        <div className={styles.menuEmpty}>불러오는 중…</div>
      ) : (
        <div className={styles.historyColumns}>
          {COLUMN_METHODS.map((method) => {
            const items = itemsByMethod.get(method) ?? []
            const v = summary.get(method) ?? { count: 0, total: 0 }
            return (
              <section key={method} className={styles.historyColumn}>
                <div className={styles.historyColumnHeader}>
                  <span className={styles.historyColumnTitle}>
                    {PAYMENT_METHOD_LABEL[method]}
                  </span>
                  <span className={styles.historyColumnSummary}>
                    {v.count}건 · {v.total.toLocaleString()}원
                  </span>
                </div>
                {items.length === 0 ? (
                  <div className={styles.historyColumnEmpty}>내역 없음</div>
                ) : (
                  items.map((h) => {
                    const isCancelled = h.payment.status === 'cancelled'
                    const processedBy = h.payment.assisted_by ?? ''
                    const processorLabel =
                      ASSISTANT_LABEL.get(processedBy) ?? processedBy ?? '-'
                    const isMine = processedBy === adminId
                    const summaryLine = h.items
                      .map((it) => `${it.menu_name}×${it.quantity}`)
                      .join(', ')
                    const cancelDisabled =
                      isCancelled ||
                      cancellingId === h.payment.id ||
                      h.payment.status !== 'paid'
                    return (
                      <div
                        key={h.payment.id}
                        className={`${styles.historyCard} ${
                          isCancelled ? styles.historyCancelled : ''
                        } ${isMine ? styles.historyCardMine : ''}`}
                      >
                        <div className={styles.historyTopRow}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className={styles.historyTime}>
                              {formatHm(h.payment.created_at)}
                            </span>
                            <span className={styles.historyProcessor}>
                              {processorLabel}
                              {isMine && ' (나)'}
                            </span>
                            {isCancelled && (
                              <span className={styles.historyCancelledBadge}>취소됨</span>
                            )}
                          </div>
                          <span className={styles.historyAmount}>
                            {h.payment.total_amount.toLocaleString()}원
                          </span>
                        </div>
                        <div className={styles.historySummary}>{summaryLine}</div>
                        <div className={styles.historyBottomRow}>
                          <div className={styles.historyMeta}>
                            {h.orders.length}개 매장
                            {h.payment.external_receipt_no && (
                              <> · 영수증 {h.payment.external_receipt_no}</>
                            )}
                            {h.payment.refunded_amount > 0 && !isCancelled && (
                              <> · 부분환불 {h.payment.refunded_amount.toLocaleString()}원</>
                            )}
                          </div>
                          {!isCancelled && h.payment.status === 'paid' && (
                            <button
                              type="button"
                              className={styles.historyCancelBtn}
                              onClick={() => void handleCancel(h.payment.id)}
                              disabled={cancelDisabled}
                            >
                              {cancellingId === h.payment.id ? '취소 중…' : '결제 취소'}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
