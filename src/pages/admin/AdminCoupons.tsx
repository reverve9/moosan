import { RotateCw, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createCouponManually,
  createMealVouchersBulk,
  fetchCouponsList,
  type CouponRow,
  type CouponsListFilters,
  type DiscountSource,
  type VoucherSource,
} from '@/lib/coupons'
import { exportToExcel, fmtDateKst } from '@/lib/excel'
import { formatPhone, normalizePhone } from '@/lib/phone'
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
      note: r.memo ?? r.note ?? '',
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
                    <td className={styles.noteCell}>{r.memo ?? r.note ?? '—'}</td>
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

const MEAL_VOUCHER_DEFAULT_EXPIRES_DATE = '2026-05-17'

function defaultDiscountExpiryDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

type CouponKind = 'discount' | 'meal_voucher'
type IssueMode = 'single' | 'csv'

const DISCOUNT_SOURCE_LABEL: Record<DiscountSource, string> = {
  manual_compensation: '민원 보상',
  manual_external: '외부업체 의뢰',
}

const VOUCHER_SOURCE_LABEL: Record<VoucherSource, string> = {
  voucher_participant: '참가자',
  voucher_staff: '스태프',
  voucher_vip: 'VIP',
  voucher_other: '기타',
}

interface CsvRow {
  phone: string
  quantity: number
  amount: number
  memo: string
}

interface CsvParseResult {
  rows: CsvRow[]
  errors: { line: number; raw: Record<string, string>; reason: string }[]
}

/**
 * CSV 파일 → object 배열. 헤더 1행 + 데이터.
 * BOM 제거, CRLF/LF 양쪽 지원, 단순 comma split (quoted field 미지원 — 쉼표가
 * memo 안에 들어가는 케이스는 사용자에게 권장하지 않음).
 * 빈 줄은 skip. xlsx 의 sheet_to_json 이 빈 셀 포함 행을 skip 해버리는
 * 동작이 있어서 자체 구현으로 교체.
 */
async function readCsvFile(file: File): Promise<Record<string, string>[]> {
  let text = await file.text()
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1) // BOM 제거
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return []
  const headers = lines[0].split(',').map((h) => h.trim())
  return lines.slice(1).map((line) => {
    const cols = line.split(',')
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      obj[h] = (cols[i] ?? '').trim()
    })
    return obj
  })
}

function parseCsvRows(raw: Record<string, string>[]): CsvParseResult {
  const rows: CsvRow[] = []
  const errors: CsvParseResult['errors'] = []
  raw.forEach((r, idx) => {
    const line = idx + 2 // header = line 1
    const phoneRaw = String(r.phone ?? '').trim()
    const phone = normalizePhone(phoneRaw)
    if (phone.length !== 11) {
      errors.push({ line, raw: r, reason: '전화번호 형식 오류' })
      return
    }
    const quantityRaw = String(r.quantity ?? '').trim()
    const quantity = quantityRaw === '' ? 1 : Number(quantityRaw)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      errors.push({ line, raw: r, reason: 'quantity 1~50 범위 오류' })
      return
    }
    const amountRaw = String(r.amount ?? '').trim()
    const amount = Number(amountRaw)
    if (amountRaw === '' || !Number.isInteger(amount) || amount <= 0) {
      errors.push({ line, raw: r, reason: 'amount 값 없음/오류' })
      return
    }
    rows.push({ phone, quantity, amount, memo: String(r.memo ?? '').trim() })
  })
  return { rows, errors }
}

interface IssueResultEntry {
  phone: string
  amount: number
  quantity: number
  codes: string[]
  memo?: string
}

interface IssueModalProps {
  onClose: () => void
  onIssued: () => void
}

function IssueModal({ onClose, onIssued }: IssueModalProps) {
  const [kind, setKind] = useState<CouponKind>('discount')
  const [mode, setMode] = useState<IssueMode>('single')

  // 공통
  const [expiresDate, setExpiresDate] = useState<string>(() =>
    defaultDiscountExpiryDate(),
  )
  const [memo, setMemo] = useState('')

  // 할인쿠폰 전용
  const [discountAmount, setDiscountAmount] = useState(2000)
  const [minOrderAmount, setMinOrderAmount] = useState(10000)
  const [discountSource, setDiscountSource] =
    useState<DiscountSource>('manual_compensation')

  // 식권 전용
  const [voucherAmount, setVoucherAmount] = useState(8000)
  const [voucherSource, setVoucherSource] =
    useState<VoucherSource>('voucher_participant')

  // 직접 입력
  const [phoneInput, setPhoneInput] = useState('')
  const [quantity, setQuantity] = useState(1)

  // CSV
  const [csvRows, setCsvRows] = useState<CsvRow[]>([])
  const [csvErrors, setCsvErrors] = useState<CsvParseResult['errors']>([])
  const [csvFileName, setCsvFileName] = useState<string>('')

  // 결과/상태
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<IssueResultEntry[] | null>(null)

  // 종류 전환 시 default 만료일 조정
  useEffect(() => {
    if (kind === 'meal_voucher') {
      setExpiresDate(MEAL_VOUCHER_DEFAULT_EXPIRES_DATE)
      // 식권은 직접입력에서 N장 허용. CSV 모드는 그대로.
    } else {
      setExpiresDate(defaultDiscountExpiryDate())
      setMode('single') // 할인쿠폰은 CSV 미지원
      setQuantity(1) // 할인쿠폰은 1장 고정
    }
  }, [kind])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const expiresAtIso = useMemo(
    () => new Date(`${expiresDate}T23:59:59+09:00`).toISOString(),
    [expiresDate],
  )

  const handleCsvFile = async (file: File) => {
    setError(null)
    try {
      const raw = await readCsvFile(file)
      const parsed = parseCsvRows(raw)
      setCsvFileName(file.name)
      setCsvRows(parsed.rows)
      setCsvErrors(parsed.errors)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CSV 파싱 실패')
    }
  }

  const handleSubmit = async () => {
    if (submitting) return
    setError(null)

    // 만료일 검증
    if (new Date(expiresAtIso).getTime() <= Date.now()) {
      setError('만료일은 오늘 이후로 지정해주세요')
      return
    }

    // ─── 할인쿠폰 (직접 입력만) ───
    if (kind === 'discount') {
      if (discountAmount <= 0) {
        setError('할인 금액을 입력해주세요')
        return
      }
      if (minOrderAmount < 0) {
        setError('최소 주문 금액이 잘못되었습니다')
        return
      }
      const phoneNorm = phoneInput ? normalizePhone(phoneInput) : ''
      if (phoneInput && phoneNorm.length !== 11) {
        setError('전화번호 형식이 올바르지 않습니다')
        return
      }
      setSubmitting(true)
      try {
        const coupon = await createCouponManually({
          discountAmount,
          minOrderAmount,
          expiresAt: expiresAtIso,
          source: discountSource,
          memo: memo.trim() || undefined,
          note: memo.trim() || undefined,
          issuedPhone: phoneNorm || undefined,
        })
        setResults([
          {
            phone: phoneNorm,
            amount: discountAmount,
            quantity: 1,
            codes: [coupon.code],
            memo: memo.trim() || undefined,
          },
        ])
      } catch (e) {
        setError(e instanceof Error ? e.message : '발급 실패')
      } finally {
        setSubmitting(false)
      }
      return
    }

    // ─── 식권 ───
    if (voucherAmount <= 0) {
      setError('식권 액면가를 입력해주세요')
      return
    }

    // 직접 입력 (단일 phone × N장)
    if (mode === 'single') {
      const phoneNorm = normalizePhone(phoneInput)
      if (phoneNorm.length !== 11) {
        setError('전화번호 형식이 올바르지 않습니다')
        return
      }
      if (quantity < 1 || quantity > 50) {
        setError('발급 매수는 1~50 사이여야 합니다')
        return
      }
      setSubmitting(true)
      try {
        const out = await createMealVouchersBulk({
          phone: phoneNorm,
          amount: voucherAmount,
          quantity,
          source: voucherSource,
          expiresAt: expiresAtIso,
          memo: memo.trim() || undefined,
        })
        setResults([
          {
            phone: phoneNorm,
            amount: voucherAmount,
            quantity: out.count,
            codes: out.codes,
            memo: memo.trim() || undefined,
          },
        ])
      } catch (e) {
        setError(e instanceof Error ? e.message : '식권 발급 실패')
      } finally {
        setSubmitting(false)
      }
      return
    }

    // CSV 일괄 업로드
    if (csvRows.length === 0) {
      setError('CSV 업로드 후 유효 행이 없습니다')
      return
    }
    setSubmitting(true)
    const batchId = `csv_${new Date().toISOString()}_${crypto.randomUUID()}`
    const out: IssueResultEntry[] = []
    const failures: string[] = []
    try {
      for (const row of csvRows) {
        try {
          const r = await createMealVouchersBulk({
            phone: row.phone,
            amount: row.amount,
            quantity: row.quantity,
            source: voucherSource,
            expiresAt: expiresAtIso,
            batchId,
            memo: row.memo || memo.trim() || undefined,
          })
          out.push({
            phone: row.phone,
            amount: row.amount,
            quantity: r.count,
            codes: r.codes,
            memo: row.memo || undefined,
          })
        } catch (e) {
          failures.push(
            `${row.phone}: ${e instanceof Error ? e.message : 'unknown'}`,
          )
        }
      }
      setResults(out)
      if (failures.length > 0) {
        setError(`일부 발급 실패 (${failures.length}건): ${failures.slice(0, 3).join(' / ')}`)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleExportResult = async () => {
    if (!results) return
    const cols = [
      { key: 'code', label: '쿠폰코드' },
      { key: 'phone', label: '전화번호' },
      { key: 'amount', label: '액면가/할인액' },
      { key: 'memo', label: '메모' },
    ]
    const flat = results.flatMap((r) =>
      r.codes.map((code) => ({
        code,
        phone: r.phone,
        amount: r.amount,
        memo: r.memo ?? '',
      })),
    )
    await exportToExcel(flat, cols, '발급결과')
  }

  const handleExportErrors = async () => {
    if (csvErrors.length === 0) return
    const cols = [
      { key: 'line', label: '행' },
      { key: 'phone', label: 'phone' },
      { key: 'quantity', label: 'quantity' },
      { key: 'amount', label: 'amount' },
      { key: 'memo', label: 'memo' },
      { key: 'reason', label: '오류' },
    ]
    const data = csvErrors.map((e) => ({
      line: e.line,
      phone: e.raw.phone ?? '',
      quantity: e.raw.quantity ?? '',
      amount: e.raw.amount ?? '',
      memo: e.raw.memo ?? '',
      reason: e.reason,
    }))
    await exportToExcel(data, cols, 'CSV_오류')
  }

  // ─── 발급 결과 화면 ────────────────────────────────────────
  if (results) {
    const totalCount = results.reduce((s, r) => s + r.quantity, 0)
    return (
      <div className={styles.modalOverlay} onClick={onClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <header className={styles.modalHeader}>
            <h2 className={styles.modalTitle}>발급 완료</h2>
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
            <div className={styles.resultSummary}>
              총 <strong>{results.length}</strong>건 / 발급 매수{' '}
              <strong>{totalCount}</strong>장
            </div>
            {results.length === 1 && results[0].codes.length === 1 ? (
              <div className={styles.issuedResult}>
                <p className={styles.issuedHint}>아래 코드를 손님께 전달해주세요:</p>
                <div className={styles.issuedCode}>{results[0].codes[0]}</div>
                <div className={styles.issuedActions}>
                  <button
                    type="button"
                    className={styles.issuedCopyBtn}
                    onClick={() => {
                      void navigator.clipboard?.writeText(results[0].codes[0])
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
                <div className={styles.resultListWrap}>
                  <table className={styles.resultTable}>
                    <thead>
                      <tr>
                        <th>전화번호</th>
                        <th className={styles.alignRight}>장수</th>
                        <th className={styles.alignRight}>액면가</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.slice(0, 50).map((r, i) => (
                        <tr key={i}>
                          <td className={styles.mono}>{r.phone}</td>
                          <td className={`${styles.alignRight} ${styles.mono}`}>
                            {r.quantity}
                          </td>
                          <td className={`${styles.alignRight} ${styles.mono}`}>
                            {r.amount.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {results.length > 50 && (
                    <p className={styles.issuedHint}>
                      ※ 50건까지만 미리보기. 전체는 다운로드 파일 참조.
                    </p>
                  )}
                </div>
                <div className={styles.issuedActions}>
                  <button
                    type="button"
                    className={styles.issuedCopyBtn}
                    onClick={() => void handleExportResult()}
                  >
                    결과 다운로드
                  </button>
                  <button
                    type="button"
                    className={styles.issuedDoneBtn}
                    onClick={onIssued}
                  >
                    완료
                  </button>
                </div>
              </>
            )}
            {error && <div className={styles.inlineError}>{error}</div>}
          </div>
        </div>
      </div>
    )
  }

  // ─── 발급 폼 ──────────────────────────────────────────────
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={`${styles.modal} ${styles.modalWide}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>쿠폰 수동 발급</h2>
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
          {/* 종류 선택 */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>종류</span>
            <div className={styles.radioGroup}>
              <label className={styles.radioItem}>
                <input
                  type="radio"
                  checked={kind === 'discount'}
                  onChange={() => setKind('discount')}
                />
                <span>할인 쿠폰</span>
              </label>
              <label className={styles.radioItem}>
                <input
                  type="radio"
                  checked={kind === 'meal_voucher'}
                  onChange={() => setKind('meal_voucher')}
                />
                <span>식권</span>
              </label>
            </div>
          </div>

          {/* 식권 — 발급 방식 */}
          {kind === 'meal_voucher' && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>발급 방식</span>
              <div className={styles.radioGroup}>
                <label className={styles.radioItem}>
                  <input
                    type="radio"
                    checked={mode === 'single'}
                    onChange={() => setMode('single')}
                  />
                  <span>전화번호 직접 입력</span>
                </label>
                <label className={styles.radioItem}>
                  <input
                    type="radio"
                    checked={mode === 'csv'}
                    onChange={() => setMode('csv')}
                  />
                  <span>CSV 일괄 업로드</span>
                </label>
              </div>
            </div>
          )}

          {/* 할인 쿠폰 폼 */}
          {kind === 'discount' && (
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
              <div className={styles.field}>
                <span className={styles.fieldLabel}>발급 사유</span>
                <div className={styles.radioGroup}>
                  {(Object.keys(DISCOUNT_SOURCE_LABEL) as DiscountSource[]).map(
                    (src) => (
                      <label key={src} className={styles.radioItem}>
                        <input
                          type="radio"
                          checked={discountSource === src}
                          onChange={() => setDiscountSource(src)}
                        />
                        <span>{DISCOUNT_SOURCE_LABEL[src]}</span>
                      </label>
                    ),
                  )}
                </div>
              </div>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>전화번호 (선택)</span>
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(formatPhone(e.target.value))}
                  placeholder="010-0000-0000"
                  className={styles.fieldInput}
                />
              </label>
            </>
          )}

          {/* 식권 — 공통 */}
          {kind === 'meal_voucher' && (
            <>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>액면가 (원)</span>
                <input
                  type="number"
                  min={1}
                  step={100}
                  value={voucherAmount}
                  onChange={(e) => setVoucherAmount(Number(e.target.value))}
                  className={styles.fieldInput}
                />
              </label>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>대상</span>
                <div className={styles.radioGroup}>
                  {(Object.keys(VOUCHER_SOURCE_LABEL) as VoucherSource[]).map(
                    (src) => (
                      <label key={src} className={styles.radioItem}>
                        <input
                          type="radio"
                          checked={voucherSource === src}
                          onChange={() => setVoucherSource(src)}
                        />
                        <span>{VOUCHER_SOURCE_LABEL[src]}</span>
                      </label>
                    ),
                  )}
                </div>
              </div>
            </>
          )}

          {/* 식권 — 직접 입력 */}
          {kind === 'meal_voucher' && mode === 'single' && (
            <>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>전화번호</span>
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(formatPhone(e.target.value))}
                  placeholder="010-0000-0000"
                  className={styles.fieldInput}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>발급 매수 (1~50)</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className={styles.fieldInput}
                />
              </label>
            </>
          )}

          {/* 식권 — CSV */}
          {kind === 'meal_voucher' && mode === 'csv' && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>
                CSV 파일 (헤더: phone, quantity, amount, memo)
              </span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleCsvFile(f)
                }}
                className={styles.fieldInput}
              />
              {csvFileName && (
                <p className={styles.csvSummary}>
                  {csvFileName} — 유효 {csvRows.length}건
                  {csvErrors.length > 0 && (
                    <>
                      {' / '}
                      <span className={styles.csvErrCount}>
                        오류 {csvErrors.length}건
                      </span>
                      {' '}
                      <button
                        type="button"
                        className={styles.csvErrBtn}
                        onClick={() => void handleExportErrors()}
                      >
                        오류 목록 다운로드
                      </button>
                    </>
                  )}
                </p>
              )}
            </div>
          )}

          {/* 만료일 */}
          <label className={styles.field}>
            <span className={styles.fieldLabel}>만료일 (KST 23:59 까지)</span>
            <input
              type="date"
              value={expiresDate}
              onChange={(e) => setExpiresDate(e.target.value)}
              className={styles.fieldInput}
            />
          </label>

          {/* 메모 */}
          <label className={styles.field}>
            <span className={styles.fieldLabel}>메모 (선택)</span>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder={
                kind === 'meal_voucher'
                  ? '예: 세종초 사생대회 인솔교사'
                  : '예: 파트너 행사 증정'
              }
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
        </div>
      </div>
    </div>
  )
}
