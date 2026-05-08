import { useCallback, useEffect, useMemo, useState } from 'react'
import { RotateCw } from 'lucide-react'
import {
  fetchTodayHelpDeskHistory,
  PAYMENT_METHOD_LABEL,
  type HelpDeskHistoryItem,
} from '@/lib/helpDesk'
import type { PaymentMethod } from '@/types/database'
import styles from './AdminHelpDesk.module.css'

interface HelpDeskHistoryTabProps {
  adminId: string
}

const COLUMN_METHODS: PaymentMethod[] = ['external_card', 'cash', 'voucher_only']

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className={styles.historyDashboard}>
        <div className={`${styles.historyStat} ${styles.historyStatTotal}`}>
          <span className={styles.historyStatLabel}>합계</span>
          <span className={styles.historyStatValue}>
            {grandTotal.total.toLocaleString()}원
          </span>
          <span className={styles.historyStatSub}>
            {grandTotal.count}건 · {adminId}
          </span>
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
                    const summary = h.items
                      .map((it) => `${it.menu_name}×${it.quantity}`)
                      .join(', ')
                    return (
                      <div
                        key={h.payment.id}
                        className={`${styles.historyCard} ${isCancelled ? styles.historyCancelled : ''}`}
                      >
                        <div className={styles.historyTopRow}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className={styles.historyTime}>
                              {formatHm(h.payment.created_at)}
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
