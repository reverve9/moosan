import { RotateCw, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createCouponManually,
  fetchCouponsList,
  type CouponRow,
  type CouponsListFilters,
} from '@/lib/coupons'
import { exportToExcel, fmtDateKst } from '@/lib/excel'
import { ExportButton } from '@/components/admin/ExcelButtons'
import Pagination, { DEFAULT_PAGE_SIZE } from '@/components/admin/Pagination'
import styles from './AdminCoupons.module.css'

// AdminOrders 와 동일 포맷: mm/dd hh:mm (KST)
function formatDateTime(iso: string): string {
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

const STATUS_LABEL: Record<'active' | 'used' | 'expired', string> = {
  active: '사용가능',
  used: '사용완료',
  expired: '만료',
}

const SOURCE_LABEL: Record<'manual' | 'survey', string> = {
  manual: '수동',
  survey: '설문',
}

export default function AdminCoupons() {
  const [filters, setFilters] = useState<CouponsListFilters>({
    status: 'all',
    source: 'all',
    codeQuery: '',
  })
  const [rows, setRows] = useState<CouponRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [issueModalOpen, setIssueModalOpen] = useState(false)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = DEFAULT_PAGE_SIZE

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchCouponsList(filters)
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

  // 필터 변경 시 첫 페이지로
  useEffect(() => {
    setPage(1)
  }, [filters])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pageRows = rows.slice(pageStart, pageStart + PAGE_SIZE)

  const handleExport = async () => {
    const cols = [
      { key: 'code', label: '쿠폰코드' },
      { key: 'discount_amount', label: '할인금액' },
      { key: 'status', label: '상태' },
      { key: 'source', label: '발급구분' },
      { key: 'phone', label: '전화번호' },
      { key: 'created_at', label: '발급일' },
      { key: 'expires_at', label: '만료일' },
      { key: 'used_at', label: '사용일' },
      { key: 'note', label: '메모' },
    ]
    const data = rows.map((r) => ({
      code: r.code,
      discount_amount: r.discount_amount,
      status: STATUS_LABEL[r.effectiveStatus],
      source: SOURCE_LABEL[r.issued_source as 'manual' | 'survey'] ?? r.issued_source,
      phone: r.phone ?? '',
      created_at: fmtDateKst(r.created_at),
      expires_at: fmtDateKst(r.expires_at),
      used_at: fmtDateKst(r.used_at),
      note: r.note ?? '',
    }))
    await exportToExcel(data, cols, '쿠폰_관리')
  }

  const totals = useMemo(() => {
    let active = 0
    let used = 0
    let expired = 0
    for (const r of rows) {
      if (r.effectiveStatus === 'active') active += 1
      else if (r.effectiveStatus === 'used') used += 1
      else expired += 1
    }
    return { active, used, expired }
  }, [rows])

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>쿠폰 관리</h1>
          <p className={styles.sub}>발급/사용 현황 · 수동 발급</p>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{totals.active}</div>
            <div className={styles.statLabel}>사용가능</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{totals.used}</div>
            <div className={styles.statLabel}>사용완료</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{totals.expired}</div>
            <div className={styles.statLabel}>만료</div>
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
          <button
            type="button"
            className={styles.issueBtn}
            onClick={() => setIssueModalOpen(true)}
          >
            <Plus className={styles.refreshIcon} />
            <span>수동 발급</span>
          </button>
        </div>
      </header>

      <div className={styles.filterBar}>
        <label className={styles.filterItem}>
          <span className={styles.filterLabel}>상태</span>
          <select
            value={filters.status ?? 'all'}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                status: e.target.value as CouponsListFilters['status'],
              }))
            }
            className={styles.select}
          >
            <option value="all">전체</option>
            <option value="active">사용가능</option>
            <option value="used">사용완료</option>
            <option value="expired">만료</option>
          </select>
        </label>
        <label className={styles.filterItem}>
          <span className={styles.filterLabel}>발급 수단</span>
          <select
            value={filters.source ?? 'all'}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                source: e.target.value as CouponsListFilters['source'],
              }))
            }
            className={styles.select}
          >
            <option value="all">전체</option>
            <option value="manual">수동</option>
            <option value="survey">설문</option>
          </select>
        </label>
        <label className={`${styles.filterItem} ${styles.filterItemGrow}`}>
          <span className={styles.filterLabel}>쿠폰 코드 검색</span>
          <input
            type="text"
            value={filters.codeQuery ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, codeQuery: e.target.value }))}
            placeholder="MS-..."
            className={styles.input}
          />
        </label>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={rows.length}
        onChange={setPage}
        actions={<ExportButton onClick={handleExport} disabled={rows.length === 0} />}
      />

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.alignCenter}>#</th>
              <th>쿠폰 코드</th>
              <th>발급일</th>
              <th>만료일</th>
              <th>사용일</th>
              <th className={styles.alignRight}>금액</th>
              <th>상태</th>
              <th>발급</th>
              <th>메모</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className={styles.tablePlaceholder}>
                  불러오는 중...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={9} className={styles.tablePlaceholder}>
                  조회된 쿠폰이 없습니다.
                </td>
              </tr>
            ) : (
              pageRows.map((r, idx) => {
                // 최근 = 큰 번호. 전체 rows 기준 역순.
                const displayNo = rows.length - (pageStart + idx)
                return (
                  <tr
                    key={r.id}
                    className={`${styles.row} ${
                      r.effectiveStatus !== 'active' ? styles.rowDim : ''
                    }`}
                  >
                    <td className={`${styles.alignCenter} ${styles.mono}`}>
                      {displayNo}
                    </td>
                    <td className={`${styles.mono} ${styles.codeCell}`}>{r.code}</td>
                    <td className={styles.mono}>{formatDateTime(r.created_at)}</td>
                    <td className={styles.mono}>{formatDateTime(r.expires_at)}</td>
                    <td className={styles.mono}>
                      {r.used_at ? formatDateTime(r.used_at) : '—'}
                    </td>
                    <td className={`${styles.alignRight} ${styles.mono}`}>
                      {r.discount_amount.toLocaleString()}원
                    </td>
                    <td>
                      <span
                        className={`${styles.badge} ${styles[`badge_${r.effectiveStatus}`]}`}
                      >
                        {STATUS_LABEL[r.effectiveStatus]}
                      </span>
                    </td>
                    <td>{SOURCE_LABEL[r.issued_source]}</td>
                    <td className={styles.noteCell}>{r.note ?? '—'}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {issueModalOpen && (
        <IssueModal
          onClose={() => setIssueModalOpen(false)}
          onIssued={() => {
            setIssueModalOpen(false)
            void refetch()
          }}
        />
      )}
    </div>
  )
}

// ─── 수동 발급 모달 ──────────────────────────────────────────

function defaultExpiryDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

interface IssueModalProps {
  onClose: () => void
  onIssued: () => void
}

function IssueModal({ onClose, onIssued }: IssueModalProps) {
  const [discountAmount, setDiscountAmount] = useState(2000)
  const [minOrderAmount, setMinOrderAmount] = useState(10000)
  const [expiresDate, setExpiresDate] = useState(() => defaultExpiryDate())
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [issuedCode, setIssuedCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSubmit = async () => {
    if (submitting) return
    if (discountAmount <= 0) {
      setError('할인 금액을 입력해주세요')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      // 만료일 — KST 해당 날짜의 23:59:59 까지 사용 가능
      const expiresAt = new Date(`${expiresDate}T23:59:59+09:00`).toISOString()
      const coupon = await createCouponManually({
        discountAmount,
        minOrderAmount,
        expiresAt,
        note: note.trim() || undefined,
      })
      setIssuedCode(coupon.code)
    } catch (e) {
      setError(e instanceof Error ? e.message : '발급 실패')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            {issuedCode ? '쿠폰 발급 완료' : '쿠폰 수동 발급'}
          </h2>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="닫기"
          >
            <X />
          </button>
        </header>
        <div className={styles.modalBody}>
          {issuedCode ? (
            <div className={styles.issuedResult}>
              <p className={styles.issuedHint}>아래 코드를 손님께 전달해주세요:</p>
              <div className={styles.issuedCode}>{issuedCode}</div>
              <div className={styles.issuedActions}>
                <button
                  type="button"
                  className={styles.issuedCopyBtn}
                  onClick={() => {
                    void navigator.clipboard?.writeText(issuedCode)
                  }}
                >
                  코드 복사
                </button>
                <button
                  type="button"
                  className={styles.issuedDoneBtn}
                  onClick={onIssued}
                >
                  완료
                </button>
              </div>
            </div>
          ) : (
            <>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>할인 금액 (원)</span>
                <input
                  type="number"
                  min={1}
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(Number(e.target.value))}
                  className={styles.fieldInput}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>최소 주문 금액 (원)</span>
                <input
                  type="number"
                  min={0}
                  value={minOrderAmount}
                  onChange={(e) => setMinOrderAmount(Number(e.target.value))}
                  className={styles.fieldInput}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>만료일 (KST 23:59 까지)</span>
                <input
                  type="date"
                  value={expiresDate}
                  onChange={(e) => setExpiresDate(e.target.value)}
                  className={styles.fieldInput}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>메모 (선택)</span>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="예: 파트너 행사 증정"
                  className={styles.fieldInput}
                />
              </label>
              {error && <div className={styles.inlineError}>{error}</div>}
              <button
                type="button"
                className={styles.submitBtn}
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? '발급 중…' : '발급하기'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
