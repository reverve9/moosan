import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline'
import {
  cancelPayment,
  fetchPaymentDetail,
  fetchPaymentsList,
  isRefundable,
  type PaymentDetail,
  type PaymentRowWithSummary,
  type PaymentsListFilters,
} from '@/lib/adminPayments'
import { formatPhone } from '@/lib/phone'
import styles from './AdminOrders.module.css'

function todayKstString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

const STATUS_LABEL: Record<'pending' | 'paid' | 'cancelled', string> = {
  pending: '결제대기',
  paid: '결제완료',
  cancelled: '취소됨',
}

const ORDER_STATUS_LABEL: Record<
  'paid' | 'confirmed' | 'completed' | 'cancelled' | 'pending',
  string
> = {
  pending: '대기',
  paid: '미확인',
  confirmed: '조리중',
  completed: '완료',
  cancelled: '취소',
}

export default function AdminOrders() {
  const [filters, setFilters] = useState<PaymentsListFilters>(() => ({
    status: 'all',
    dateFrom: todayKstString(),
    dateTo: todayKstString(),
    phone: '',
  }))
  const [rows, setRows] = useState<PaymentRowWithSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchPaymentsList(filters)
      setRows(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const totals = useMemo(() => {
    let paidAmount = 0
    let paidCount = 0
    let cancelledCount = 0
    for (const r of rows) {
      if (r.payment.status === 'paid') {
        paidAmount += r.payment.total_amount
        paidCount += 1
      } else if (r.payment.status === 'cancelled') {
        cancelledCount += 1
      }
    }
    return { paidAmount, paidCount, cancelledCount }
  }, [rows])

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>주문/결제 관리</h1>
          <p className={styles.sub}>결제 단위 주문 조회 · 환불 처리</p>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{totals.paidCount}</div>
            <div className={styles.statLabel}>결제</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{totals.paidAmount.toLocaleString()}</div>
            <div className={styles.statLabel}>매출(원)</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{totals.cancelledCount}</div>
            <div className={styles.statLabel}>취소</div>
          </div>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => void refetch()}
            disabled={loading}
          >
            <ArrowPathIcon
              className={`${styles.refreshIcon} ${loading ? styles.refreshIconSpin : ''}`}
            />
            <span>새로고침</span>
          </button>
        </div>
      </header>

      <div className={styles.filterBar}>
        <label className={styles.filterItem}>
          <span className={styles.filterLabel}>상태</span>
          <select
            value={filters.status ?? 'all'}
            onChange={(e) =>
              setFilters((f) => ({ ...f, status: e.target.value as PaymentsListFilters['status'] }))
            }
            className={styles.select}
          >
            <option value="all">전체</option>
            <option value="paid">결제완료</option>
            <option value="cancelled">취소됨</option>
            <option value="pending">결제대기</option>
          </select>
        </label>
        <label className={styles.filterItem}>
          <span className={styles.filterLabel}>시작일</span>
          <input
            type="date"
            value={filters.dateFrom ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            className={styles.input}
          />
        </label>
        <label className={styles.filterItem}>
          <span className={styles.filterLabel}>종료일</span>
          <input
            type="date"
            value={filters.dateTo ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
            className={styles.input}
          />
        </label>
        <label className={styles.filterItem}>
          <span className={styles.filterLabel}>전화번호</span>
          <input
            type="text"
            value={filters.phone ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, phone: e.target.value }))}
            placeholder="뒤 4자리 등"
            className={styles.input}
          />
        </label>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>결제시각</th>
              <th>주문번호(Toss)</th>
              <th>전화</th>
              <th>부스</th>
              <th>상태</th>
              <th className={styles.alignRight}>금액</th>
              <th className={styles.alignCenter}>진행</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className={styles.tablePlaceholder}>
                  불러오는 중...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.tablePlaceholder}>
                  조회된 결제가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const isCancelled = r.payment.status === 'cancelled'
                return (
                  <tr
                    key={r.payment.id}
                    className={`${styles.row} ${isCancelled ? styles.rowCancelled : ''}`}
                    onClick={() => setSelectedId(r.payment.id)}
                  >
                    <td className={styles.mono}>{formatDateTime(r.payment.created_at)}</td>
                    <td className={styles.mono}>{r.payment.toss_order_id}</td>
                    <td>{formatPhone(r.payment.phone)}</td>
                    <td>{r.boothCount}건</td>
                    <td>
                      <span className={`${styles.badge} ${styles[`badge_${r.payment.status}`]}`}>
                        {STATUS_LABEL[r.payment.status]}
                      </span>
                    </td>
                    <td className={`${styles.alignRight} ${styles.mono}`}>
                      {r.payment.total_amount.toLocaleString()}원
                    </td>
                    <td className={styles.alignCenter}>
                      {summaryText(r.orderStatusSummary)}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <DetailModal
          paymentId={selectedId}
          onClose={() => setSelectedId(null)}
          onCancelled={() => {
            setSelectedId(null)
            void refetch()
          }}
        />
      )}
    </div>
  )
}

function summaryText(summary: PaymentRowWithSummary['orderStatusSummary']): string {
  const parts: string[] = []
  if (summary.paid > 0) parts.push(`미확인 ${summary.paid}`)
  if (summary.confirmed > 0) parts.push(`조리 ${summary.confirmed}`)
  if (summary.completed > 0) parts.push(`완료 ${summary.completed}`)
  if (summary.cancelled > 0) parts.push(`취소 ${summary.cancelled}`)
  return parts.join(' · ') || '—'
}

interface DetailModalProps {
  paymentId: string
  onClose: () => void
  onCancelled: () => void
}

function DetailModal({ paymentId, onClose, onCancelled }: DetailModalProps) {
  const [detail, setDetail] = useState<PaymentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchPaymentDetail(paymentId)
      .then((data) => {
        if (!cancelled) setDetail(data)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '상세 조회 실패')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [paymentId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const refundable = detail ? isRefundable(detail) : false

  const handleCancel = async () => {
    if (!detail || !refundable) return
    if (reason.trim().length === 0) {
      setError('환불 사유를 입력해주세요')
      return
    }
    const ok = window.confirm(
      `정말 ${detail.payment.total_amount.toLocaleString()}원을 전액 환불하시겠습니까?`,
    )
    if (!ok) return
    setCancelling(true)
    setError(null)
    try {
      await cancelPayment(paymentId, reason.trim())
      onCancelled()
    } catch (e) {
      setError(e instanceof Error ? e.message : '환불 실패')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>주문 상세</h2>
            {detail && (
              <p className={styles.modalSub}>{detail.payment.toss_order_id}</p>
            )}
          </div>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="닫기"
          >
            <XMarkIcon />
          </button>
        </header>

        {loading ? (
          <div className={styles.modalBody}>불러오는 중...</div>
        ) : !detail ? (
          <div className={styles.modalBody}>{error ?? '데이터 없음'}</div>
        ) : (
          <div className={styles.modalBody}>
            <section className={styles.detailMeta}>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>결제시각</span>
                <span className={styles.metaValue}>
                  {formatDateTime(detail.payment.created_at)}
                </span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>전화번호</span>
                <span className={styles.metaValue}>{formatPhone(detail.payment.phone)}</span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>결제상태</span>
                <span className={styles.metaValue}>
                  <span
                    className={`${styles.badge} ${styles[`badge_${detail.payment.status}`]}`}
                  >
                    {STATUS_LABEL[detail.payment.status]}
                  </span>
                </span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>결제금액</span>
                <span className={styles.metaValueStrong}>
                  {detail.payment.total_amount.toLocaleString()}원
                </span>
              </div>
              {detail.payment.payment_key && (
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>paymentKey</span>
                  <span className={`${styles.metaValue} ${styles.mono}`}>
                    {detail.payment.payment_key}
                  </span>
                </div>
              )}
              {detail.payment.status === 'cancelled' && detail.payment.cancelled_at && (
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>취소시각</span>
                  <span className={styles.metaValue}>
                    {formatDateTime(detail.payment.cancelled_at)}
                  </span>
                </div>
              )}
              {detail.payment.status === 'cancelled' &&
                typeof (detail.payment.meta as { cancel_reason?: string })?.cancel_reason ===
                  'string' && (
                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>취소사유</span>
                    <span className={styles.metaValue}>
                      {(detail.payment.meta as { cancel_reason: string }).cancel_reason}
                    </span>
                  </div>
                )}
            </section>

            <section className={styles.boothSection}>
              <h3 className={styles.sectionTitle}>부스별 주문 ({detail.orders.length}건)</h3>
              <ul className={styles.boothList}>
                {detail.orders.map(({ order, items }) => (
                  <li key={order.id} className={styles.boothBox}>
                    <div className={styles.boothHead}>
                      <div className={styles.boothHeadLeft}>
                        <span className={styles.boothName}>
                          {order.booth_no}번 · {order.booth_name}
                        </span>
                        <span className={styles.boothOrderNo}>{order.order_number}</span>
                      </div>
                      <span
                        className={`${styles.badge} ${styles[`badge_order_${order.status}`]}`}
                      >
                        {ORDER_STATUS_LABEL[order.status]}
                      </span>
                    </div>
                    <ul className={styles.itemList}>
                      {items.map((it) => (
                        <li key={it.id} className={styles.itemRow}>
                          <span>
                            {it.menu_name} × {it.quantity}
                          </span>
                          <span className={styles.mono}>
                            {it.subtotal.toLocaleString()}원
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>

            {detail.payment.status === 'paid' && (
              <section className={styles.refundSection}>
                <h3 className={styles.sectionTitle}>환불 처리</h3>
                {refundable ? (
                  <>
                    <p className={styles.refundHint}>
                      전액환불됩니다. 매장에서 확인/조리 시작된 주문이 있으면 거부됩니다.
                    </p>
                    <textarea
                      className={styles.reasonInput}
                      placeholder="환불 사유를 입력해주세요 (손님에게도 전달됨)"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={3}
                    />
                    {error && <div className={styles.inlineError}>{error}</div>}
                    <button
                      type="button"
                      className={styles.cancelBtn}
                      onClick={handleCancel}
                      disabled={cancelling || reason.trim().length === 0}
                    >
                      {cancelling ? '처리 중...' : '전액 환불'}
                    </button>
                  </>
                ) : (
                  <p className={styles.refundBlocked}>
                    매장에서 확인/조리 시작된 주문이 포함되어 있어 환불할 수 없습니다.
                  </p>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
