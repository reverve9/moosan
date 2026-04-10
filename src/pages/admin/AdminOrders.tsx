import { RotateCw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Pagination, { DEFAULT_PAGE_SIZE } from '@/components/admin/Pagination'
import {
  cancelPayment,
  fetchPaymentDetail,
  fetchPaymentsList,
  isRefundable,
  remainingRefundable,
  type PaymentDetail,
  type PaymentRowWithSummary,
  type PaymentsListFilters,
} from '@/lib/adminPayments'
import { formatPhoneDisplay } from '@/lib/phone'
import { exportToExcel, fmtDateKst } from '@/lib/excel'
import { ExportButton } from '@/components/admin/ExcelButtons'
import { todayKstString } from '@/lib/orders'
import styles from './AdminOrders.module.css'

function formatDateTime(iso: string): string {
  // mm/dd hh:mm (KST)
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`
}

function formatMenuSummary(
  lines: { name: string; quantity: number }[],
): string {
  if (lines.length === 0) return '—'
  const head = `${lines[0].name} × ${lines[0].quantity}`
  if (lines.length === 1) return head
  return `${head} 외 ${lines.length - 1}`
}

const STATUS_LABEL: Record<'pending' | 'paid' | 'cancelled', string> = {
  pending: '결제대기',
  paid: '결제완료',
  cancelled: '취소됨',
}

// 상세 모달의 부스별 진행상태 뱃지 (여긴 운영 상태 확인에 쓸모 있어서 유지)
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
  const [boothQuery, setBoothQuery] = useState('')
  const [rows, setRows] = useState<PaymentRowWithSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = DEFAULT_PAGE_SIZE

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

  const handleExport = async () => {
    const cols = [
      { key: 'order_numbers', label: '주문번호' },
      { key: 'booths', label: '매장명' },
      { key: 'created_at', label: '결제시각' },
      { key: 'phone', label: '연락처' },
      { key: 'menu', label: '메뉴' },
      { key: 'total_amount', label: '결제금액' },
      { key: 'discount', label: '할인' },
      { key: 'status', label: '상태' },
      { key: 'toss_order_id', label: '결제번호' },
    ]
    const data = visibleRows.map((r) => ({
      order_numbers: r.boothOrderNumbers.join(' / '),
      booths: r.boothNames.join(' / '),
      created_at: fmtDateKst(r.payment.created_at),
      phone: formatPhoneDisplay(r.payment.phone),
      menu: formatMenuSummary(r.menuLines),
      total_amount: r.payment.total_amount,
      discount: r.payment.discount_amount > 0 ? r.payment.discount_amount : '',
      status: STATUS_LABEL[r.payment.status as keyof typeof STATUS_LABEL] ?? r.payment.status,
      toss_order_id: r.payment.toss_order_id ?? '',
    }))
    await exportToExcel(data, cols, '주문_결제_관리')
  }

  // 매장 검색 — 실시간 client-side 필터 (서버 재호출 X)
  const visibleRows = useMemo(() => {
    const q = boothQuery.trim().toLowerCase()
    if (q.length === 0) return rows
    return rows.filter((r) => r.boothNames.some((n) => n.toLowerCase().includes(q)))
  }, [rows, boothQuery])

  // 필터/검색 변경 시 첫 페이지로
  useEffect(() => {
    setPage(1)
  }, [filters, boothQuery])

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pageRows = visibleRows.slice(pageStart, pageStart + PAGE_SIZE)

  // 정산 기준 매출 = 손님 실지불(total_amount) + 쿠폰 할인(discount_amount) - 환불금액
  // 쿠폰 할인은 운영자 부담, 매장 정산 시엔 원래 금액 기준으로 지급해야 함.
  // 부분환불(부스 거절)이 있으면 refunded_amount 만큼 매출에서 차감.
  const totals = useMemo(() => {
    let grossAmount = 0
    let discountAmount = 0
    let refundedAmount = 0
    let paidCount = 0
    let cancelledCount = 0
    for (const r of visibleRows) {
      if (r.payment.status === 'paid') {
        grossAmount +=
          r.payment.total_amount + r.payment.discount_amount - (r.payment.refunded_amount ?? 0)
        discountAmount += r.payment.discount_amount
        refundedAmount += r.payment.refunded_amount ?? 0
        paidCount += 1
      } else if (r.payment.status === 'cancelled') {
        cancelledCount += 1
      }
    }
    return { grossAmount, discountAmount, refundedAmount, paidCount, cancelledCount }
  }, [visibleRows])

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
            <div className={styles.statValue}>{totals.grossAmount.toLocaleString()}</div>
            <div className={styles.statLabel}>전체 매출(원)</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statValue}>
              -{totals.discountAmount.toLocaleString()}
            </div>
            <div className={styles.statLabel}>쿠폰 할인(원)</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statValue}>
              -{totals.refundedAmount.toLocaleString()}
            </div>
            <div className={styles.statLabel}>환불(원)</div>
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
            <RotateCw
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
        <label className={`${styles.filterItem} ${styles.filterItemGrow}`}>
          <span className={styles.filterLabel}>매장 검색</span>
          <input
            type="text"
            value={boothQuery}
            onChange={(e) => setBoothQuery(e.target.value)}
            placeholder="매장명을 입력하면 즉시 필터링됩니다"
            className={styles.input}
          />
        </label>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={visibleRows.length}
        onChange={setPage}
        actions={<ExportButton onClick={handleExport} disabled={visibleRows.length === 0} />}
      />

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.alignCenter}>#</th>
              <th>부스명</th>
              <th>결제시각</th>
              <th>주문번호</th>
              <th>연락처</th>
              <th>메뉴</th>
              <th className={styles.alignRight}>금액</th>
              <th>상태</th>
              <th>결제번호</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className={styles.tablePlaceholder}>
                  불러오는 중...
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={9} className={styles.tablePlaceholder}>
                  {rows.length === 0
                    ? '조회된 결제가 없습니다.'
                    : '검색어와 일치하는 매장이 없습니다.'}
                </td>
              </tr>
            ) : (
              pageRows.map((r, idx) => {
                const isCancelled = r.payment.status === 'cancelled'
                const isPartial =
                  r.payment.status === 'paid' && (r.payment.refunded_amount ?? 0) > 0
                const firstBoothName = r.boothNames[0] ?? '—'
                const firstOrderNo = r.boothOrderNumbers[0] ?? '—'
                const extraCount = Math.max(0, r.boothCount - 1)
                // 최근 = 큰 번호. visibleRows 전체 길이 기준 역순 index.
                const displayNo = visibleRows.length - (pageStart + idx)
                return (
                  <tr
                    key={r.payment.id}
                    className={`${styles.row} ${isCancelled ? styles.rowCancelled : ''}`}
                    onClick={() => setSelectedId(r.payment.id)}
                  >
                    <td className={`${styles.alignCenter} ${styles.mono}`}>{displayNo}</td>
                    <td>
                      <div className={styles.boothCell}>
                        <span className={styles.boothCellMain}>{firstBoothName}</span>
                        {extraCount > 0 && (
                          <span className={styles.boothCellExtra}>외 {extraCount}건</span>
                        )}
                      </div>
                    </td>
                    <td className={styles.mono}>{formatDateTime(r.payment.created_at)}</td>
                    <td className={styles.mono}>{firstOrderNo}</td>
                    <td>{formatPhoneDisplay(r.payment.phone)}</td>
                    <td>
                      <span className={styles.menuCell}>{formatMenuSummary(r.menuLines)}</span>
                    </td>
                    <td className={`${styles.alignRight} ${styles.mono}`}>
                      {r.payment.discount_amount > 0 && (
                        <span
                          className={styles.couponBadge}
                          title={`쿠폰 할인 -${r.payment.discount_amount.toLocaleString()}원 · 실지불 ${r.payment.total_amount.toLocaleString()}원`}
                        >
                          쿠폰
                        </span>
                      )}
                      {(
                        r.payment.total_amount + r.payment.discount_amount
                      ).toLocaleString()}
                      원
                    </td>
                    <td>
                      <span className={`${styles.badge} ${styles[`badge_${r.payment.status}`]}`}>
                        {STATUS_LABEL[r.payment.status]}
                      </span>
                      {isPartial && (
                        <span
                          className={styles.partialBadge}
                          title={`-${r.payment.refunded_amount.toLocaleString()}원 부분 환불됨`}
                        >
                          부분취소
                        </span>
                      )}
                    </td>
                    <td className={`${styles.mono} ${styles.dim}`}>{r.payment.toss_order_id}</td>
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
  const remaining = detail ? remainingRefundable(detail) : 0

  const handleCancel = async () => {
    if (!detail || !refundable) return
    if (reason.trim().length === 0) {
      setError('환불 사유를 입력해주세요')
      return
    }
    const ok = window.confirm(
      `남은 잔액 ${remaining.toLocaleString()}원을 환불하시겠습니까?`,
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
            <X />
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
                <span className={styles.metaValue}>{formatPhoneDisplay(detail.payment.phone)}</span>
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
              {detail.payment.discount_amount > 0 && (
                <>
                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>원래 금액</span>
                    <span className={styles.metaValue}>
                      {(
                        detail.payment.total_amount + detail.payment.discount_amount
                      ).toLocaleString()}
                      원
                    </span>
                  </div>
                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>쿠폰 할인</span>
                    <span className={`${styles.metaValue} ${styles.discountText}`}>
                      -{detail.payment.discount_amount.toLocaleString()}원
                    </span>
                  </div>
                </>
              )}
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>
                  {detail.payment.discount_amount > 0 ? '최종 결제금액' : '결제금액'}
                </span>
                <span className={styles.metaValueStrong}>
                  {detail.payment.total_amount.toLocaleString()}원
                </span>
              </div>
              {detail.payment.refunded_amount > 0 && (
                <>
                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>환불 금액</span>
                    <span className={`${styles.metaValueStrong} ${styles.discountText}`}>
                      -{detail.payment.refunded_amount.toLocaleString()}원
                    </span>
                  </div>
                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>잔액</span>
                    <span className={styles.metaValueStrong}>
                      {remaining.toLocaleString()}원
                    </span>
                  </div>
                </>
              )}
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
                    {order.status === 'cancelled' && order.cancel_reason && (
                      <div className={styles.boothCancelLine}>
                        <span className={styles.boothCancelLabel}>
                          {order.cancelled_by === 'booth' ? '부스 거절' : '어드민 환불'}
                        </span>
                        <span className={styles.boothCancelText}>{order.cancel_reason}</span>
                      </div>
                    )}
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
                      남은 잔액 <strong>{remaining.toLocaleString()}원</strong> 이 환불됩니다.
                      매장에서 확인/조리 시작된 주문이 포함되어 있으면 거부됩니다.
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
                      {cancelling ? '처리 중...' : `잔액 ${remaining.toLocaleString()}원 환불`}
                    </button>
                  </>
                ) : (
                  <p className={styles.refundBlocked}>
                    남은 잔액이 없거나, 매장에서 확인/조리 시작된 주문이 포함되어 있어 환불할 수
                    없습니다.
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
