import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchTodayHelpDeskHistory,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHOD_SHORT,
  type HelpDeskHistoryItem,
} from '@/lib/helpDesk'
import styles from './AdminHelpDesk.module.css'

interface HelpDeskHistoryTabProps {
  adminId: string
}

function formatHm(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function methodBadgeClass(method: string): string {
  if (method === 'cash') return styles.methodCash
  if (method === 'external_card') return styles.methodExternal
  if (method === 'voucher_only') return styles.methodVoucher
  return styles.methodPg
}

export default function HelpDeskHistoryTab({ adminId }: HelpDeskHistoryTabProps) {
  const [history, setHistory] = useState<HelpDeskHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchTodayHelpDeskHistory(adminId)
      setHistory(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [adminId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  // method 별 합계 (paid 만 집계, cancelled 는 전액 환불 케이스라 제외)
  const summary = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>()
    for (const h of history) {
      if (h.payment.status !== 'paid') continue
      const key = h.payment.payment_method
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
    for (const v of summary.values()) {
      count += v.count
      total += v.total
    }
    return { count, total }
  }, [summary])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className={styles.historyHeader}>
        <div className={styles.historyStat}>
          <span className={styles.historyStatLabel}>오늘 처리 합계</span>
          <span className={styles.historyStatValue}>
            {grandTotal.count}건 · {grandTotal.total.toLocaleString()}원
          </span>
          <span className={styles.historyStatSub}>본인 처리분 ({adminId})</span>
        </div>
        {Array.from(summary.entries()).map(([method, v]) => (
          <div key={method} className={styles.historyStat}>
            <span className={styles.historyStatLabel}>
              {PAYMENT_METHOD_LABEL[method as keyof typeof PAYMENT_METHOD_LABEL]}
            </span>
            <span className={styles.historyStatValue}>
              {v.count}건 · {v.total.toLocaleString()}원
            </span>
          </div>
        ))}
        <button
          type="button"
          className={styles.cashSecondaryBtn}
          style={{ width: 'auto', alignSelf: 'center' }}
          onClick={refetch}
          disabled={loading}
        >
          새로고침
        </button>
      </div>

      {error && <div className={styles.cartError}>{error}</div>}

      {loading ? (
        <div className={styles.menuEmpty}>불러오는 중…</div>
      ) : history.length === 0 ? (
        <div className={styles.menuEmpty}>아직 처리한 결제가 없습니다</div>
      ) : (
        <div className={styles.historyList}>
          {history.map((h) => {
            const isCancelled = h.payment.status === 'cancelled'
            const summary = h.items
              .map((it) => `${it.menu_name}×${it.quantity}`)
              .join(', ')
            return (
              <div
                key={h.payment.id}
                className={`${styles.historyCard} ${isCancelled ? styles.historyCancelled : ''}`}
              >
                <div className={styles.historyTopRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={styles.historyTime}>
                      {formatHm(h.payment.created_at)}
                    </span>
                    <span
                      className={`${styles.historyMethodBadge} ${methodBadgeClass(h.payment.payment_method)}`}
                    >
                      {PAYMENT_METHOD_SHORT[h.payment.payment_method]}
                    </span>
                    {isCancelled && (
                      <span className={styles.historyCancelledBadge}>취소됨</span>
                    )}
                  </div>
                  <span className={styles.historyAmount}>
                    {h.payment.total_amount.toLocaleString()}원
                  </span>
                </div>
                <div className={styles.historySummary}>{summary}</div>
                <div className={styles.historyMeta}>
                  {h.orders.length}개 매장
                  {h.payment.external_receipt_no && (
                    <> · 영수증 {h.payment.external_receipt_no}</>
                  )}
                  {h.payment.refunded_amount > 0 && !isCancelled && (
                    <> · 부분환불 {h.payment.refunded_amount.toLocaleString()}원</>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
