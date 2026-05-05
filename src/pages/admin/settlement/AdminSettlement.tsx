import { RotateCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExportButton } from '@/components/admin/ExcelButtons'
import { exportToExcelMultiSheet } from '@/lib/excel'
import {
  aggregateByBooth,
  aggregateByDay,
  calcTotals,
  checkIntegrity,
  fetchSettlementRawData,
  fmtMoney,
  TOSS_FEE_RATE,
  type SettlementRawData,
  type SettlementRow,
} from '@/lib/settlement'
import dashStyles from '../AdminDashboard.module.css'
import styles from './AdminSettlement.module.css'

type TabKey = 'overall' | 'byBooth'
type Mode = 'daily' | 'total'

/** 운영기간 default — v4 핸드오프 §2-1: 5/15~5/17 본행사 + 테스트.
 *  너무 좁히면 테스트 데이터가 빠져서 사용자가 직접 수정 가능하도록 input 으로 노출.
 *  기본값은 본행사 시작 ~ 종료. */
const DEFAULT_DATE_FROM = '2026-05-15'
const DEFAULT_DATE_TO = '2026-05-17'

function todayKstString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export default function AdminSettlement() {
  const [tab, setTab] = useState<TabKey>('overall')
  const [mode, setMode] = useState<Mode>('total')
  const [dateFrom, setDateFrom] = useState<string>(DEFAULT_DATE_FROM)
  const [dateTo, setDateTo] = useState<string>(DEFAULT_DATE_TO)
  /** 일별 모드일 때 선택된 단일 날짜 */
  const [singleDate, setSingleDate] = useState<string>(todayKstString())

  const [raw, setRaw] = useState<SettlementRawData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      // 일별 모드면 단일 날짜만, 종합이면 전 기간
      const filters =
        mode === 'daily'
          ? { dateFrom: singleDate, dateTo: singleDate }
          : { dateFrom, dateTo }
      const data = await fetchSettlementRawData(filters)
      setRaw(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '정산 데이터 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [mode, singleDate, dateFrom, dateTo])

  useEffect(() => {
    void refetch()
  }, [refetch])

  // 행 + 합계 계산 (current view)
  const overallRows = useMemo(() => (raw ? aggregateByDay(raw) : []), [raw])
  const boothRows = useMemo(() => (raw ? aggregateByBooth(raw) : []), [raw])

  const overallTotals = useMemo(() => calcTotals(overallRows), [overallRows])
  const boothTotals = useMemo(() => calcTotals(boothRows), [boothRows])

  const integrity = useMemo(
    () => checkIntegrity(tab === 'overall' ? overallTotals : boothTotals),
    [tab, overallTotals, boothTotals],
  )

  const currentRows = tab === 'overall' ? overallRows : boothRows
  const currentTotals = tab === 'overall' ? overallTotals : boothTotals

  /** 4 시트 묶음 export — 항상 모든 view 포함 */
  const handleExport = async () => {
    if (!raw) return
    const totalRaw =
      mode === 'total'
        ? raw
        : await fetchSettlementRawData({ dateFrom, dateTo })

    const dailyRows = aggregateByDay(totalRaw)
    const boothTotalRows = aggregateByBooth(totalRaw)

    // 매장별 일별 — 날짜별로 부스 집계
    const boothDailyRowsAll: Record<string, unknown>[] = []
    const dateSet = new Set(dailyRows.map((r) => r.groupKey))
    for (const d of [...dateSet].sort()) {
      const dayRaw = await fetchSettlementRawData({ dateFrom: d, dateTo: d })
      const dayBooth = aggregateByBooth(dayRaw)
      for (const b of dayBooth) {
        boothDailyRowsAll.push(toBoothDailyExportRow(b, d))
      }
    }

    await exportToExcelMultiSheet(
      [
        {
          name: '전체 일별',
          rows: [...dailyRows, calcTotals(dailyRows, '합계')].map(toOverallExportRow),
          columns: OVERALL_EXPORT_COLS,
        },
        {
          name: '전체 종합',
          rows: [toOverallExportRow(calcTotals(dailyRows, '전 기간 합계'))],
          columns: OVERALL_EXPORT_COLS,
        },
        {
          name: '매장별 종합',
          rows: [...boothTotalRows, calcTotals(boothTotalRows, '합계')].map(toBoothExportRow),
          columns: BOOTH_EXPORT_COLS,
        },
        {
          name: '매장별 일별',
          rows: boothDailyRowsAll,
          columns: BOOTH_DAILY_EXPORT_COLS,
        },
      ],
      `정산_${dateFrom}_${dateTo}`,
    )
  }

  return (
    <div className={dashStyles.page}>
      <header className={dashStyles.pageHeader}>
        <h1 className={dashStyles.title}>정산 관리</h1>
        <p className={dashStyles.sub}>
          매장 송금 · Toss 수수료(매장 부담 {(TOSS_FEE_RATE * 100).toFixed(2)}%) · 운영자 정산
        </p>
      </header>

      <div className={styles.tab}>
        {/* ── 탭 ── */}
        <div className={styles.tabRow} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'overall'}
            className={`${styles.tabBtn} ${tab === 'overall' ? styles.tabBtnActive : ''}`}
            onClick={() => setTab('overall')}
          >
            전체 정산
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'byBooth'}
            className={`${styles.tabBtn} ${tab === 'byBooth' ? styles.tabBtnActive : ''}`}
            onClick={() => setTab('byBooth')}
          >
            매장별 정산
          </button>
        </div>

        {/* ── 필터 ── */}
        <div className={styles.filterBar}>
          <div className={styles.modeGroup} role="radiogroup" aria-label="조회 모드">
            <label className={styles.modeItem}>
              <input
                type="radio"
                checked={mode === 'daily'}
                onChange={() => setMode('daily')}
              />
              일별
            </label>
            <label className={styles.modeItem}>
              <input
                type="radio"
                checked={mode === 'total'}
                onChange={() => setMode('total')}
              />
              종합
            </label>
          </div>

          {mode === 'daily' ? (
            <label className={styles.filterItem}>
              <span className={styles.filterLabel}>날짜</span>
              <input
                type="date"
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
                className={styles.input}
              />
            </label>
          ) : (
            <>
              <label className={styles.filterItem}>
                <span className={styles.filterLabel}>시작일</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className={styles.input}
                />
              </label>
              <label className={styles.filterItem}>
                <span className={styles.filterLabel}>종료일</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className={styles.input}
                />
              </label>
            </>
          )}

          <div className={styles.btnGroup}>
            <ExportButton
              onClick={() => void handleExport()}
              disabled={!raw || currentRows.length === 0}
              label="엑셀 다운로드"
            />
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

        {error && <div className={styles.errorBanner}>{error}</div>}

        {loading && !raw ? (
          <div className={styles.placeholder}>정산 계산 중…</div>
        ) : currentRows.length === 0 ? (
          <div className={styles.placeholder}>해당 기간에 정산 가능한 결제가 없습니다</div>
        ) : (
          <>
            <SummarySection totals={currentTotals} />
            <IntegritySection integrity={integrity} />
            {tab === 'overall' ? (
              <SettlementTable rows={currentRows} totals={currentTotals} kind="overall" />
            ) : (
              <SettlementTable rows={currentRows} totals={currentTotals} kind="byBooth" />
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── 요약 KPI ────────────────────────────────────────

function SummarySection({ totals }: { totals: SettlementRow }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>요약</h2>
      <div className={styles.kpiGrid}>
        <Kpi label="매장 매출" value={fmtMoney(totals.menuSales)} />
        <Kpi label="매장 송금 합계" value={fmtMoney(totals.boothPayout)} emphasis />
        <Kpi label="Toss 수수료(매장)" value={fmtMoney(totals.tossFee)} />
        <Kpi label="운영자 PG 입금" value={fmtMoney(totals.organizerPgIn)} />
        <Kpi label="운영자 부담(쿠폰+식권)" value={fmtMoney(totals.couponDiscount + totals.voucherUsed)} />
        <Kpi label="운영자 순지출" value={fmtMoney(totals.organizerLoss)} emphasis />
      </div>
    </section>
  )
}

function Kpi({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`${styles.kpiCard} ${emphasis ? styles.kpiCardEmphasis : ''}`}>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={styles.kpiValue}>{value}</div>
    </div>
  )
}

// ─── 정합성 검증 ─────────────────────────────────────

function IntegritySection({ integrity }: { integrity: ReturnType<typeof checkIntegrity> }) {
  return (
    <section className={`${styles.section} ${integrity.ok ? styles.integOk : styles.integErr}`}>
      <h2 className={styles.sectionTitle}>
        정산 정합성 검증 {integrity.ok ? '✅' : '❌'}
      </h2>
      <ul className={styles.integList}>
        <li>
          <span>매장 송금</span>
          <span>{fmtMoney(integrity.lhs)}</span>
        </li>
        <li>
          <span>운영자 PG 입금 + 운영자 순지출</span>
          <span>{fmtMoney(integrity.rhs)}</span>
        </li>
        <li>
          <span>차액</span>
          <span>{fmtMoney(integrity.diff)}</span>
        </li>
      </ul>
      {!integrity.ok && (
        <div className={styles.integWarn}>
          ❌ 매장 송금 ≠ PG입금 + 운영자 순지출 — 데이터 정합성 점검 필요
        </div>
      )}
    </section>
  )
}

// ─── 정산표 ──────────────────────────────────────────

function SettlementTable({
  rows,
  totals,
  kind,
}: {
  rows: SettlementRow[]
  totals: SettlementRow
  kind: 'overall' | 'byBooth'
}) {
  const cols = kind === 'overall' ? OVERALL_COLS : BOOTH_COLS
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>
        {kind === 'overall' ? '일별 정산표' : '매장별 정산표'}
      </h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={c.right ? styles.thRight : ''}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.groupKey}>
                {cols.map((c) => (
                  <td key={c.key} className={c.right ? styles.tdRight : ''}>
                    {c.render ? c.render(r) : (r[c.key as keyof SettlementRow] as string)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              {cols.map((c) => (
                <td key={c.key} className={c.right ? styles.tdRight : ''}>
                  {c.render ? c.render(totals) : (totals[c.key as keyof SettlementRow] as string)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

// ─── 컬럼 정의 ───────────────────────────────────────

interface ColDef {
  key: string
  label: string
  right?: boolean
  render?: (r: SettlementRow) => string | number
}

const OVERALL_COLS: ColDef[] = [
  { key: 'label', label: '날짜', render: (r) => r.label },
  { key: 'paymentCount', label: '결제건수', right: true, render: (r) => r.paymentCount.toLocaleString() },
  { key: 'menuSales', label: '매장 매출', right: true, render: (r) => fmtMoney(r.menuSales) },
  { key: 'voucherUsed', label: '식권 사용', right: true, render: (r) => fmtMoney(r.voucherUsed) },
  { key: 'couponDiscount', label: '쿠폰 차감', right: true, render: (r) => fmtMoney(r.couponDiscount) },
  { key: 'pgAmount', label: 'PG 거래액', right: true, render: (r) => fmtMoney(r.pgAmount) },
  { key: 'tossFee', label: 'Toss 수수료', right: true, render: (r) => fmtMoney(r.tossFee) },
  { key: 'boothPayout', label: '매장 송금', right: true, render: (r) => fmtMoney(r.boothPayout) },
  { key: 'organizerPgIn', label: '운영자 PG입금', right: true, render: (r) => fmtMoney(r.organizerPgIn) },
  { key: 'organizerLoss', label: '운영자 순지출', right: true, render: (r) => fmtMoney(r.organizerLoss) },
]

const BOOTH_COLS: ColDef[] = [
  { key: 'label', label: '매장명', render: (r) => r.label },
  { key: 'orderCount', label: '주문건수', right: true, render: (r) => r.orderCount.toLocaleString() },
  { key: 'menuSales', label: '매장 매출', right: true, render: (r) => fmtMoney(r.menuSales) },
  { key: 'voucherUsed', label: '식권 사용', right: true, render: (r) => fmtMoney(r.voucherUsed) },
  { key: 'couponDiscount', label: '쿠폰 차감', right: true, render: (r) => fmtMoney(r.couponDiscount) },
  { key: 'pgAmount', label: 'PG 거래액', right: true, render: (r) => fmtMoney(r.pgAmount) },
  { key: 'tossFee', label: 'Toss 수수료', right: true, render: (r) => fmtMoney(r.tossFee) },
  { key: 'boothPayout', label: '매장 송금액', right: true, render: (r) => fmtMoney(r.boothPayout) },
]

// ─── Excel export 컬럼 정의 ──────────────────────────

const OVERALL_EXPORT_COLS = [
  { key: 'date', label: '날짜' },
  { key: 'paymentCount', label: '결제건수' },
  { key: 'menuSales', label: '매장 매출' },
  { key: 'voucherUsed', label: '식권 사용' },
  { key: 'voucherBurned', label: '식권 소멸' },
  { key: 'couponDiscount', label: '쿠폰 차감' },
  { key: 'pgAmount', label: 'PG 거래액' },
  { key: 'tossFee', label: 'Toss 수수료' },
  { key: 'boothPayout', label: '매장 송금' },
  { key: 'organizerPgIn', label: '운영자 PG입금' },
  { key: 'organizerLoss', label: '운영자 순지출' },
]

const BOOTH_EXPORT_COLS = [
  { key: 'boothName', label: '매장명' },
  { key: 'orderCount', label: '주문건수' },
  { key: 'menuSales', label: '매장 매출' },
  { key: 'voucherUsed', label: '식권 사용' },
  { key: 'couponDiscount', label: '쿠폰 차감' },
  { key: 'pgAmount', label: 'PG 거래액' },
  { key: 'tossFee', label: 'Toss 수수료' },
  { key: 'boothPayout', label: '매장 송금액' },
]

const BOOTH_DAILY_EXPORT_COLS = [
  { key: 'date', label: '날짜' },
  { key: 'boothName', label: '매장명' },
  { key: 'orderCount', label: '주문건수' },
  { key: 'menuSales', label: '매장 매출' },
  { key: 'voucherUsed', label: '식권 사용' },
  { key: 'couponDiscount', label: '쿠폰 차감' },
  { key: 'pgAmount', label: 'PG 거래액' },
  { key: 'tossFee', label: 'Toss 수수료' },
  { key: 'boothPayout', label: '매장 송금액' },
]

function toOverallExportRow(r: SettlementRow): Record<string, unknown> {
  return {
    date: r.label,
    paymentCount: r.paymentCount,
    menuSales: r.menuSales,
    voucherUsed: r.voucherUsed,
    voucherBurned: r.voucherBurned,
    couponDiscount: r.couponDiscount,
    pgAmount: r.pgAmount,
    tossFee: r.tossFee,
    boothPayout: r.boothPayout,
    organizerPgIn: r.organizerPgIn,
    organizerLoss: r.organizerLoss,
  }
}

function toBoothExportRow(r: SettlementRow): Record<string, unknown> {
  return {
    boothName: r.label,
    orderCount: r.orderCount,
    menuSales: r.menuSales,
    voucherUsed: r.voucherUsed,
    couponDiscount: r.couponDiscount,
    pgAmount: r.pgAmount,
    tossFee: r.tossFee,
    boothPayout: r.boothPayout,
  }
}

function toBoothDailyExportRow(r: SettlementRow, date: string): Record<string, unknown> {
  return {
    date,
    boothName: r.label,
    orderCount: r.orderCount,
    menuSales: r.menuSales,
    voucherUsed: r.voucherUsed,
    couponDiscount: r.couponDiscount,
    pgAmount: r.pgAmount,
    tossFee: r.tossFee,
    boothPayout: r.boothPayout,
  }
}

