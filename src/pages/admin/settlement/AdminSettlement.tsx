import { FileSpreadsheet, RotateCw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExportButton } from '@/components/admin/ExcelButtons'
import { exportToExcelMultiSheet, fmtDateKst } from '@/lib/excel'
import {
  aggregateByBooth,
  aggregateByDay,
  calcTotals,
  checkIntegrity,
  fetchBoothSettlementDetail,
  fetchSettlementRawData,
  fmtMoney,
  TOSS_FEE_RATE,
  type BoothSettlementDetailRow,
  type SettlementRawData,
  type SettlementRow,
} from '@/lib/settlement'
import dashStyles from '../AdminDashboard.module.css'
import styles from './AdminSettlement.module.css'

type TabKey = 'overall' | 'byBooth'
type Mode = 'daily' | 'total'

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
  // 기본 범위는 오늘 — 운영중에도 dev 테스트에도 합리적. 사용자가 직접 조정 가능.
  const [dateFrom, setDateFrom] = useState<string>(() => todayKstString())
  const [dateTo, setDateTo] = useState<string>(() => todayKstString())
  /** 일별 모드일 때 선택된 단일 날짜 */
  const [singleDate, setSingleDate] = useState<string>(todayKstString())

  const [raw, setRaw] = useState<SettlementRawData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 매장별 정산서 모달 상태 — 'picker' 단계와 'preview' 단계.
  const [boothModal, setBoothModal] = useState<
    | { stage: 'picker' }
    | { stage: 'preview'; booth: SettlementRow }
    | null
  >(null)

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

  /** 4 시트 묶음 export — 항상 모든 view 포함.
   *  daily mode 는 화면에 보이는 단일 일자 기준, total mode 는 dateFrom~dateTo 기준 */
  const handleExport = async () => {
    if (!raw) return
    const effectiveFrom = mode === 'daily' ? singleDate : dateFrom
    const effectiveTo = mode === 'daily' ? singleDate : dateTo

    // raw 는 이미 현재 mode 에 맞는 범위로 fetch 되어 있어 그대로 사용
    const dailyRows = aggregateByDay(raw)
    const boothTotalRows = aggregateByBooth(raw)

    // 매장별 일별 — 날짜별로 부스 집계 (daily mode 면 1일치만 반복)
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
      `정산_${effectiveFrom}_${effectiveTo}`,
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
            <button
              type="button"
              className={styles.boothSettlementBtn}
              onClick={() => setBoothModal({ stage: 'picker' })}
              disabled={!raw || boothRows.length === 0}
              title="매장 선택 후 정산서 미리보기 + 엑셀 다운로드"
            >
              <FileSpreadsheet size={16} />
              매장별 정산서
            </button>
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

      {boothModal?.stage === 'picker' && (
        <BoothPickerModal
          booths={boothRows}
          onClose={() => setBoothModal(null)}
          onPick={(booth) => setBoothModal({ stage: 'preview', booth })}
        />
      )}
      {boothModal?.stage === 'preview' && (
        <BoothPreviewModal
          booth={boothModal.booth}
          dateRange={
            mode === 'daily'
              ? { from: singleDate, to: singleDate }
              : { from: dateFrom, to: dateTo }
          }
          onBack={() => setBoothModal({ stage: 'picker' })}
          onClose={() => setBoothModal(null)}
        />
      )}
    </div>
  )
}

// ─── 매장 선택 모달 ──────────────────────────────────

function BoothPickerModal({
  booths,
  onClose,
  onPick,
}: {
  booths: SettlementRow[]
  onClose: () => void
  onPick: (booth: SettlementRow) => void
}) {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>매장 선택</h2>
            <p className={styles.modalSub}>{booths.length}개 매장 — 정산서를 보낼 매장을 클릭하세요</p>
          </div>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </header>
        <div className={styles.modalBody}>
          <div className={styles.boothPickerGrid}>
            {booths.map((b) => (
              <button
                key={b.groupKey}
                type="button"
                className={styles.boothPickerCard}
                onClick={() => onPick(b)}
              >
                <span className={styles.boothPickerName}>{b.label}</span>
                <span className={styles.boothPickerSub}>
                  {b.orderCount.toLocaleString()}건 · 매출 {fmtMoney(b.menuSales)}
                </span>
                <span className={styles.boothPickerPayout}>
                  송금 {fmtMoney(b.boothPayout)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 정산서 미리보기 모달 ──────────────────────────────────

function BoothPreviewModal({
  booth,
  dateRange,
  onBack,
  onClose,
}: {
  booth: SettlementRow
  dateRange: { from: string; to: string }
  onBack: () => void
  onClose: () => void
}) {
  const [details, setDetails] = useState<BoothSettlementDetailRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchBoothSettlementDetail(booth.groupKey, {
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
    })
      .then((data) => {
        if (!cancelled) setDetails(data)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '명세 조회 실패')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [booth.groupKey, dateRange.from, dateRange.to])

  const handleDownload = async () => {
    await exportBoothSettlement(booth, details, dateRange.from, dateRange.to)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>{booth.label} — 정산서</h2>
            <p className={styles.modalSub}>
              {dateRange.from === dateRange.to
                ? dateRange.from
                : `${dateRange.from} ~ ${dateRange.to}`}
            </p>
          </div>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </header>
        <div className={styles.modalBody}>
          <div className={styles.previewSummary}>
            <PreviewKpi label="주문 건수" value={booth.orderCount.toLocaleString()} />
            <PreviewKpi label="매장 매출" value={fmtMoney(booth.menuSales)} />
            <PreviewKpi label="쿠폰 사용" value={fmtMoney(booth.voucherUsed)} />
            <PreviewKpi label="쿠폰 할인" value={fmtMoney(booth.couponDiscount)} />
            <PreviewKpi label="Toss 수수료" value={fmtMoney(booth.tossFee)} />
            <PreviewKpi label="송금액" value={fmtMoney(booth.boothPayout)} emphasis />
          </div>

          <h3 className={styles.previewSectionTitle}>주문 명세 ({details.length}건)</h3>
          {loading ? (
            <div className={styles.previewLoader}>불러오는 중…</div>
          ) : error ? (
            <div className={styles.errorBanner}>{error}</div>
          ) : details.length === 0 ? (
            <div className={styles.previewLoader}>명세가 없습니다</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>주문번호</th>
                    <th>결제시각</th>
                    <th>메뉴</th>
                    <th className={styles.thRight}>매장 금액</th>
                    <th className={styles.thRight}>쿠폰 사용</th>
                    <th className={styles.thRight}>쿠폰 할인 분배</th>
                    <th className={styles.thRight}>송금액</th>
                  </tr>
                </thead>
                <tbody>
                  {details.map((d) => (
                    <tr key={d.orderId}>
                      <td>{d.orderNumber}</td>
                      <td>{fmtDateKst(d.paidAt)}</td>
                      <td>
                        {d.menuSummary}
                        {d.isTakeout && ' (포장)'}
                      </td>
                      <td className={styles.tdRight}>{fmtMoney(d.subtotal)}</td>
                      <td className={styles.tdRight}>{fmtMoney(d.voucherConsumed)}</td>
                      <td className={styles.tdRight}>{fmtMoney(d.couponShare)}</td>
                      <td className={styles.tdRight}>{fmtMoney(d.payout)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <footer className={styles.modalFooter}>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={onBack}
            style={{ background: '#6B7280' }}
          >
            ← 매장 다시 선택
          </button>
          <button
            type="button"
            className={styles.downloadBtn}
            onClick={() => void handleDownload()}
            disabled={loading || details.length === 0}
          >
            <FileSpreadsheet size={16} />
            엑셀 다운로드
          </button>
        </footer>
      </div>
    </div>
  )
}

function PreviewKpi({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className={`${styles.previewKpi} ${emphasis ? styles.previewKpiEmphasis : ''}`}>
      <div className={styles.previewKpiLabel}>{label}</div>
      <div className={styles.previewKpiValue}>{value}</div>
    </div>
  )
}

// ─── 단일 부스 정산서 엑셀 export ──────────────────────────

async function exportBoothSettlement(
  booth: SettlementRow,
  details: BoothSettlementDetailRow[],
  dateFrom: string,
  dateTo: string,
): Promise<void> {
  const period = dateFrom === dateTo ? dateFrom : `${dateFrom} ~ ${dateTo}`
  const summaryRows = [
    { k: '매장명', v: booth.label },
    { k: '기간', v: period },
    { k: '주문 건수', v: booth.orderCount },
    { k: '매장 매출 (정가 합)', v: booth.menuSales },
    { k: '쿠폰 사용', v: booth.voucherUsed },
    { k: '쿠폰 소멸', v: booth.voucherBurned },
    { k: '쿠폰 할인 (부스 분배)', v: booth.couponDiscount },
    { k: 'PG 거래액 (부스 분배)', v: booth.pgAmount },
    { k: 'Toss 수수료 (3.74%)', v: booth.tossFee },
    { k: '매장 송금액', v: booth.boothPayout },
  ]
  const detailRows = details.map((d) => ({
    orderNumber: d.orderNumber,
    paidAt: fmtDateKst(d.paidAt),
    isTakeout: d.isTakeout ? '포장' : '매장',
    menuSummary: d.menuSummary,
    subtotal: d.subtotal,
    voucherConsumed: d.voucherConsumed,
    voucherBurned: d.voucherBurned,
    couponShare: d.couponShare,
    pgShare: d.pgShare,
    payout: d.payout,
  }))

  await exportToExcelMultiSheet(
    [
      {
        name: '정산 요약',
        rows: summaryRows,
        columns: [
          { key: 'k', label: '항목' },
          { key: 'v', label: '값' },
        ],
      },
      {
        name: '주문 명세',
        rows: detailRows,
        columns: [
          { key: 'orderNumber', label: '주문번호' },
          { key: 'paidAt', label: '결제시각' },
          { key: 'isTakeout', label: '포장' },
          { key: 'menuSummary', label: '메뉴' },
          { key: 'subtotal', label: '매장 금액' },
          { key: 'voucherConsumed', label: '쿠폰 사용' },
          { key: 'voucherBurned', label: '쿠폰 소멸' },
          { key: 'couponShare', label: '쿠폰 할인 분배' },
          { key: 'pgShare', label: 'PG 분배' },
          { key: 'payout', label: '송금액' },
        ],
      },
    ],
    `정산서_${booth.label}_${period.replace(/\s/g, '')}`,
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
        <Kpi label="운영자 부담(쿠폰)" value={fmtMoney(totals.couponDiscount + totals.voucherUsed)} />
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
  { key: 'voucherUsed', label: '쿠폰 사용', right: true, render: (r) => fmtMoney(r.voucherUsed) },
  { key: 'couponDiscount', label: '쿠폰 할인', right: true, render: (r) => fmtMoney(r.couponDiscount) },
  { key: 'pgPaidAmount', label: 'PG 결제액', right: true, render: (r) => fmtMoney(r.pgPaidAmount) },
  { key: 'helpDeskPaidAmount', label: '헬프데스크 결제액', right: true, render: (r) => fmtMoney(r.helpDeskPaidAmount) },
  { key: 'tossFee', label: 'Toss 수수료', right: true, render: (r) => fmtMoney(r.tossFee) },
  { key: 'boothPayout', label: '매장 송금', right: true, render: (r) => fmtMoney(r.boothPayout) },
  { key: 'organizerPgIn', label: '운영자 PG입금', right: true, render: (r) => fmtMoney(r.organizerPgIn) },
  { key: 'organizerLoss', label: '운영자 순지출', right: true, render: (r) => fmtMoney(r.organizerLoss) },
]

const BOOTH_COLS: ColDef[] = [
  { key: 'label', label: '매장명', render: (r) => r.label },
  { key: 'orderCount', label: '주문건수', right: true, render: (r) => r.orderCount.toLocaleString() },
  { key: 'menuSales', label: '매장 매출', right: true, render: (r) => fmtMoney(r.menuSales) },
  { key: 'voucherUsed', label: '쿠폰 사용', right: true, render: (r) => fmtMoney(r.voucherUsed) },
  { key: 'couponDiscount', label: '쿠폰 할인', right: true, render: (r) => fmtMoney(r.couponDiscount) },
  { key: 'pgPaidAmount', label: 'PG 결제액', right: true, render: (r) => fmtMoney(r.pgPaidAmount) },
  { key: 'helpDeskPaidAmount', label: '헬프데스크 결제액', right: true, render: (r) => fmtMoney(r.helpDeskPaidAmount) },
  { key: 'tossFee', label: 'Toss 수수료', right: true, render: (r) => fmtMoney(r.tossFee) },
  { key: 'boothPayout', label: '매장 송금액', right: true, render: (r) => fmtMoney(r.boothPayout) },
]

// ─── Excel export 컬럼 정의 ──────────────────────────

const OVERALL_EXPORT_COLS = [
  { key: 'date', label: '날짜' },
  { key: 'paymentCount', label: '결제건수' },
  { key: 'menuSales', label: '매장 매출' },
  { key: 'voucherUsed', label: '쿠폰 사용' },
  { key: 'voucherBurned', label: '쿠폰 소멸' },
  { key: 'couponDiscount', label: '쿠폰 할인' },
  { key: 'pgPaidAmount', label: 'PG 결제액' },
  { key: 'helpDeskPaidAmount', label: '헬프데스크 결제액' },
  { key: 'tossFee', label: 'Toss 수수료' },
  { key: 'boothPayout', label: '매장 송금' },
  { key: 'organizerPgIn', label: '운영자 PG입금' },
  { key: 'organizerLoss', label: '운영자 순지출' },
]

const BOOTH_EXPORT_COLS = [
  { key: 'boothName', label: '매장명' },
  { key: 'orderCount', label: '주문건수' },
  { key: 'menuSales', label: '매장 매출' },
  { key: 'voucherUsed', label: '쿠폰 사용' },
  { key: 'couponDiscount', label: '쿠폰 할인' },
  { key: 'pgPaidAmount', label: 'PG 결제액' },
  { key: 'helpDeskPaidAmount', label: '헬프데스크 결제액' },
  { key: 'tossFee', label: 'Toss 수수료' },
  { key: 'boothPayout', label: '매장 송금액' },
]

const BOOTH_DAILY_EXPORT_COLS = [
  { key: 'date', label: '날짜' },
  { key: 'boothName', label: '매장명' },
  { key: 'orderCount', label: '주문건수' },
  { key: 'menuSales', label: '매장 매출' },
  { key: 'voucherUsed', label: '쿠폰 사용' },
  { key: 'couponDiscount', label: '쿠폰 할인' },
  { key: 'pgPaidAmount', label: 'PG 결제액' },
  { key: 'helpDeskPaidAmount', label: '헬프데스크 결제액' },
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
    pgPaidAmount: r.pgPaidAmount,
    helpDeskPaidAmount: r.helpDeskPaidAmount,
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
    pgPaidAmount: r.pgPaidAmount,
    helpDeskPaidAmount: r.helpDeskPaidAmount,
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
    pgPaidAmount: r.pgPaidAmount,
    helpDeskPaidAmount: r.helpDeskPaidAmount,
    tossFee: r.tossFee,
    boothPayout: r.boothPayout,
  }
}

