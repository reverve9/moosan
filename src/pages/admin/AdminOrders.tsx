import { RotateCw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Pagination, { DEFAULT_PAGE_SIZE } from '@/components/admin/Pagination'
import {
  boothOrderRefundAmount,
  fetchPaymentDetail,
  fetchPaymentsList,
  isBoothOrderRefundable,
  refundBoothOrder,
  type BoothOrderRow,
  type PaymentDetail,
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

/**
 * 부스 단위 행의 상태 표시.
 *  - 결제가 취소되었으면 → '취소됨'
 *  - 해당 부스 주문만 취소(매장 거절)되었으면 → '매장거절' (badge 색은 cancelled)
 *  - 그 외 결제 완료 → '결제완료'
 */
function rowStatusKey(r: BoothOrderRow): 'paid' | 'cancelled' | 'pending' {
  if (r.payment.status === 'cancelled') return 'cancelled'
  if (r.order.status === 'cancelled') return 'cancelled'
  if (r.payment.status === 'paid') return 'paid'
  return 'pending'
}

function rowStatusLabel(r: BoothOrderRow): string {
  if (r.payment.status === 'cancelled') return '취소됨'
  if (r.order.status === 'cancelled') return '매장거절'
  return STATUS_LABEL[r.payment.status as keyof typeof STATUS_LABEL] ?? r.payment.status
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
  const [rows, setRows] = useState<BoothOrderRow[]>([])
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
      { key: 'order_number', label: '주문번호' },
      { key: 'booth', label: '매장명' },
      { key: 'takeout', label: '포장' },
      { key: 'created_at', label: '결제시각' },
      { key: 'phone', label: '연락처' },
      { key: 'menu', label: '메뉴' },
      { key: 'subtotal', label: '매장 금액' },
      { key: 'sibling', label: '동시결제 매장수' },
      { key: 'status', label: '상태' },
      { key: 'toss_order_id', label: '결제번호' },
    ]
    const data = visibleRows.map((r) => ({
      order_number: r.order.order_number,
      booth: `${r.order.booth_no}번 · ${r.order.booth_name}`,
      takeout: r.order.is_takeout ? '포장' : '매장',
      created_at: fmtDateKst(r.payment.created_at),
      phone: formatPhoneDisplay(r.payment.phone),
      menu: formatMenuSummary(r.menuLines),
      subtotal: r.order.subtotal,
      sibling: r.siblingCount,
      status: rowStatusLabel(r),
      toss_order_id: r.payment.toss_order_id ?? '',
    }))
    await exportToExcel(data, cols, '주문_결제_관리')
  }

  // 매장 검색 — 실시간 client-side 필터 (서버 재호출 X)
  const visibleRows = useMemo(() => {
    const q = boothQuery.trim().toLowerCase()
    if (q.length === 0) return rows
    return rows.filter((r) => r.order.booth_name.toLowerCase().includes(q))
  }, [rows, boothQuery])

  // 필터/검색 변경 시 첫 페이지로
  useEffect(() => {
    setPage(1)
  }, [filters, boothQuery])

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pageRows = visibleRows.slice(pageStart, pageStart + PAGE_SIZE)

  // 정산 기준:
  //  - 매출(grossAmount): 살아있는 부스 주문(order.subtotal) 합계. 부스 거절/결제 취소된 주문은 제외.
  //    쿠폰 할인은 운영자 부담이라 매장 정산은 원래 금액(subtotal) 기준이 맞음.
  //  - 쿠폰 할인 / 환불 금액: payment 단위 값이라 결제 ID 기준으로 중복 합산 방지.
  //  - 결제/취소 카운트: 부스 단위 행으로 셈 (한 결제에 여러 부스면 각각 카운트).
  const totals = useMemo(() => {
    const seenPayments = new Set<string>()
    let grossAmount = 0
    let discountAmount = 0
    let refundedAmount = 0
    let paidCount = 0
    let cancelledCount = 0
    for (const r of visibleRows) {
      const isLive = r.payment.status === 'paid' && r.order.status !== 'cancelled'
      if (isLive) {
        grossAmount += r.order.subtotal
        paidCount += 1
      } else {
        cancelledCount += 1
      }
      if (!seenPayments.has(r.payment.id)) {
        seenPayments.add(r.payment.id)
        if (r.payment.status === 'paid') {
          discountAmount += r.payment.discount_amount
          refundedAmount += r.payment.refunded_amount ?? 0
        }
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
                const isPaymentCancelled = r.payment.status === 'cancelled'
                const isOrderCancelled = r.order.status === 'cancelled'
                const isCancelled = isPaymentCancelled || isOrderCancelled
                const hasCoupon = r.payment.discount_amount > 0
                const groupedHint = r.siblingCount > 1
                // 최근 = 큰 번호. visibleRows 전체 길이 기준 역순 index.
                const displayNo = visibleRows.length - (pageStart + idx)
                return (
                  <tr
                    key={r.order.id}
                    className={`${styles.row} ${isCancelled ? styles.rowCancelled : ''}`}
                    onClick={() => setSelectedId(r.payment.id)}
                  >
                    <td className={`${styles.alignCenter} ${styles.mono}`}>{displayNo}</td>
                    <td>
                      <div className={styles.boothCell}>
                        <span className={styles.boothCellMain}>
                          {r.order.booth_no}번 · {r.order.booth_name}
                          {r.order.is_takeout && (
                            <span className={styles.takeoutTag}>포장</span>
                          )}
                        </span>
                        {groupedHint && (
                          <span
                            className={styles.boothCellExtra}
                            title={`동일 결제로 ${r.siblingCount}개 매장 동시 주문`}
                          >
                            동시결제 {r.siblingCount}건
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={styles.mono}>{formatDateTime(r.payment.created_at)}</td>
                    <td className={styles.mono}>{r.order.order_number}</td>
                    <td>{formatPhoneDisplay(r.payment.phone)}</td>
                    <td>
                      <span className={styles.menuCell}>{formatMenuSummary(r.menuLines)}</span>
                    </td>
                    <td className={`${styles.alignRight} ${styles.mono}`}>
                      {hasCoupon && (
                        <span
                          className={styles.couponBadge}
                          title={`결제 단위 쿠폰 할인 -${r.payment.discount_amount.toLocaleString()}원 (해당 결제에 한해 적용)`}
                        >
                          쿠폰
                        </span>
                      )}
                      {r.order.subtotal.toLocaleString()}원
                    </td>
                    <td>
                      <span
                        className={`${styles.badge} ${styles[`badge_${rowStatusKey(r)}`]}`}
                      >
                        {rowStatusLabel(r)}
                      </span>
                      {!isPaymentCancelled && isOrderCancelled && (
                        <span
                          className={styles.partialBadge}
                          title="해당 매장이 주문을 거절하여 부분 환불됨"
                        >
                          매장거절
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
  const [refunding, setRefunding] = useState(false)

  const reload = useCallback(async () => {
    const data = await fetchPaymentDetail(paymentId)
    setDetail(data)
    return data
  }, [paymentId])

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

  const remaining = detail
    ? Math.max(0, detail.payment.total_amount - (detail.payment.refunded_amount ?? 0))
    : 0

  // 부스 단위 환불 가능한 주문 목록 (모달 안에서 일괄 / 개별 모두 사용)
  const refundableOrders = useMemo(() => {
    if (!detail) return []
    return detail.orders
      .filter(({ order }) => isBoothOrderRefundable(detail, order.id))
      .map(({ order }) => ({
        id: order.id,
        booth_no: order.booth_no,
        booth_name: order.booth_name,
        amount: boothOrderRefundAmount(detail, order.id),
      }))
  }, [detail])

  const handleRefundBooth = async (orderId: string, boothLabel: string, amount: number) => {
    if (!detail) return
    if (reason.trim().length === 0) {
      setError('환불 사유를 입력해주세요')
      return
    }
    const ok = window.confirm(
      `${boothLabel} ${amount.toLocaleString()}원을 환불하시겠습니까?`,
    )
    if (!ok) return
    setRefunding(true)
    setError(null)
    try {
      const result = await refundBoothOrder(orderId, reason.trim())
      // 결제가 완전히 취소된 경우(=마지막 환불 가능한 부스였음) 모달 닫기.
      // 그 외엔 모달 유지하고 detail 재조회 → 다음 부스를 이어서 처리 가능.
      if (result.paymentFullyCancelled) {
        onCancelled()
      } else {
        await reload()
        onCancelled()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '환불 실패')
    } finally {
      setRefunding(false)
    }
  }

  const handleBulkRefund = async () => {
    if (!detail || refundableOrders.length < 2) return
    if (reason.trim().length === 0) {
      setError('환불 사유를 입력해주세요')
      return
    }
    const totalAmount = refundableOrders.reduce((acc, r) => acc + r.amount, 0)
    const ok = window.confirm(
      `환불 가능한 ${refundableOrders.length}개 매장에 총 ${totalAmount.toLocaleString()}원을 환불하시겠습니까?`,
    )
    if (!ok) return
    setRefunding(true)
    setError(null)
    try {
      // 직렬 처리 — Toss는 같은 paymentKey 에 대한 동시 cancel 을 보장하지 않음 + DB
      // refunded_amount 누적이 race 가 될 수 있음. 안전하게 한 건씩.
      for (const r of refundableOrders) {
        await refundBoothOrder(r.id, reason.trim())
      }
      onCancelled()
    } catch (e) {
      setError(e instanceof Error ? e.message : '환불 실패')
      // 일부 성공 가능 — 최신 상태로 갱신
      try {
        await reload()
      } catch {
        // ignore
      }
    } finally {
      setRefunding(false)
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

            {detail.payment.status === 'paid' && refundableOrders.length > 0 && (
              <section className={styles.refundSection}>
                <h3 className={styles.sectionTitle}>매장별 환불</h3>
                <p className={styles.refundHint}>
                  환불 사유는 각 매장 거절 사유와 함께 손님에게 전달됩니다. 조리 완료된 주문은
                  환불할 수 없습니다.
                </p>
                <textarea
                  className={styles.reasonInput}
                  placeholder="환불 사유를 입력해주세요 (손님에게도 전달됨)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                />
                {error && <div className={styles.inlineError}>{error}</div>}
                {refundableOrders.length >= 2 && (
                  <button
                    type="button"
                    className={styles.bulkRefundBtn}
                    onClick={handleBulkRefund}
                    disabled={refunding || reason.trim().length === 0}
                    title="아래 환불 가능한 모든 매장을 한 번에 환불합니다"
                  >
                    {refunding
                      ? '처리 중...'
                      : `남은 ${refundableOrders.length}개 매장 일괄 환불 (${refundableOrders
                          .reduce((acc, r) => acc + r.amount, 0)
                          .toLocaleString()}원)`}
                  </button>
                )}
              </section>
            )}

            <section className={styles.boothSection}>
              <h3 className={styles.sectionTitle}>부스별 주문 ({detail.orders.length}건)</h3>
              <ul className={styles.boothList}>
                {detail.orders.map(({ order, items }) => {
                  const eligible = isBoothOrderRefundable(detail, order.id)
                  const refundAmt = eligible ? boothOrderRefundAmount(detail, order.id) : 0
                  return (
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
                      {detail.payment.status === 'paid' && (
                        <div className={styles.boothRefundRow}>
                          {eligible ? (
                            <button
                              type="button"
                              className={styles.boothRefundBtn}
                              onClick={() =>
                                void handleRefundBooth(
                                  order.id,
                                  `${order.booth_no}번 · ${order.booth_name}`,
                                  refundAmt,
                                )
                              }
                              disabled={refunding || reason.trim().length === 0}
                            >
                              {refundAmt.toLocaleString()}원 환불
                            </button>
                          ) : (
                            <span className={styles.boothRefundBlocked}>
                              {order.status === 'cancelled'
                                ? '이미 환불됨'
                                : order.ready_at !== null
                                  ? '조리완료 - 환불 불가'
                                  : '확인됨 - 환불 불가'}
                            </span>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>

            {detail.payment.status === 'paid' && refundableOrders.length === 0 && remaining > 0 && (
              <section className={styles.refundSection}>
                <p className={styles.refundBlocked}>
                  환불 가능한 매장이 없습니다. 모든 매장이 확인/조리 완료/이미 환불된 상태입니다.
                </p>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
