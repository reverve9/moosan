import { RotateCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  calcBoothStats,
  calcCustomerStats,
  calcKpi,
  calcMenuStats,
  calcPaymentBehaviorStats,
  calcTimeStats,
  fetchStatsData,
  type StatsFilters,
  type StatsRawData,
} from '@/lib/adminStats'
import { todayKstString } from '@/lib/orders'
import {
  fetchCouponStats,
  fetchDiscountStatsBySource,
  fetchVoucherStats,
  DISCOUNT_SOURCE_LABEL,
  VOUCHER_SOURCE_LABEL,
  type CouponStats,
  type DiscountStatsBySource,
  type VoucherStats,
} from '@/lib/coupons'
import { exportToExcel, fmtDateKst } from '@/lib/excel'
import { ExportButton } from '@/components/admin/ExcelButtons'
import styles from './StatsRevenueTab.module.css'

function fmtWon(n: number): string {
  return `${n.toLocaleString()}원`
}

function fmtPct(ratio: number): string {
  return `${Math.round(ratio * 1000) / 10}%`
}

export default function StatsRevenueTab() {
  // 기본값: 오늘 하루. 축제 전체 보고 싶으면 사용자가 수동 설정.
  const [filters, setFilters] = useState<StatsFilters>(() => ({
    dateFrom: todayKstString(),
    dateTo: todayKstString(),
  }))
  const [raw, setRaw] = useState<StatsRawData | null>(null)
  const [couponStats, setCouponStats] = useState<CouponStats | null>(null)
  const [voucherStats, setVoucherStats] = useState<VoucherStats | null>(null)
  const [discountSourceStats, setDiscountSourceStats] = useState<DiscountStatsBySource | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const [data, cStats, vStats, dSrcStats] = await Promise.all([
        fetchStatsData(filters),
        fetchCouponStats({ dateFrom: filters.dateFrom, dateTo: filters.dateTo }),
        fetchVoucherStats({ dateFrom: filters.dateFrom, dateTo: filters.dateTo }),
        fetchDiscountStatsBySource({ dateFrom: filters.dateFrom, dateTo: filters.dateTo }),
      ])
      setRaw(data)
      setCouponStats(cStats)
      setVoucherStats(vStats)
      setDiscountSourceStats(dSrcStats)
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
    if (!raw) return
    const cols = [
      { key: 'created_at', label: '결제일시' },
      { key: 'toss_order_id', label: '결제번호' },
      { key: 'phone', label: '연락처' },
      { key: 'booth_name', label: '매장명' },
      { key: 'menu_name', label: '메뉴' },
      { key: 'quantity', label: '수량' },
      { key: 'unit_price', label: '단가' },
      { key: 'subtotal', label: '소계' },
      { key: 'payment_status', label: '결제상태' },
      { key: 'order_status', label: '주문상태' },
    ]
    const paymentMap = new Map(raw.payments.map((p) => [p.id, p]))
    const orderMap = new Map(raw.orders.map((o) => [o.id, o]))
    const data = raw.orderItems.map((item) => {
      const order = orderMap.get(item.order_id)
      const payment = order ? paymentMap.get(order.payment_id) : null
      return {
        created_at: payment ? fmtDateKst(payment.created_at) : '',
        toss_order_id: payment?.toss_order_id ?? '',
        phone: payment?.phone ?? '',
        booth_name: order?.booth_name ?? '',
        menu_name: item.menu_name,
        quantity: item.quantity,
        unit_price: item.menu_price,
        subtotal: item.subtotal,
        payment_status: payment?.status ?? '',
        order_status: order?.status ?? '',
      }
    })
    await exportToExcel(data, cols, '매출_관리')
  }

  const kpi = useMemo(() => (raw ? calcKpi(raw) : null), [raw])
  const time = useMemo(() => (raw ? calcTimeStats(raw) : null), [raw])
  const booth = useMemo(() => (raw ? calcBoothStats(raw) : null), [raw])
  const menu = useMemo(() => (raw ? calcMenuStats(raw) : null), [raw])
  const customer = useMemo(() => (raw ? calcCustomerStats(raw) : null), [raw])
  const behavior = useMemo(
    () => (raw ? calcPaymentBehaviorStats(raw) : null),
    [raw],
  )

  return (
    <div className={styles.tab}>
      {/* 기간 필터 */}
      <div className={styles.filterBar}>
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
        <div className={styles.btnGroup}>
          <ExportButton onClick={handleExport} disabled={!raw || raw.orderItems.length === 0} />
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
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading && !raw ? (
        <div className={styles.placeholder}>통계 계산 중…</div>
      ) : !raw ? null : (
        <>
          {/* 1. KPI */}
          {kpi && <KpiSection kpi={kpi} />}

          {/* 2. 시간 분석 */}
          {time && <TimeSection time={time} />}

          {/* 3 + 4. 부스 성과 | 메뉴 분석 (2열) */}
          <div className={styles.dualCol}>
            {booth && <BoothSection booth={booth} />}
            {menu && <MenuSection menu={menu} />}
          </div>

          {/* 5 + 6. 고객 분석 | 결제 행동 (2열) */}
          <div className={styles.dualCol}>
            {customer && <CustomerSection customer={customer} />}
            {behavior && <BehaviorSection behavior={behavior} />}
          </div>

          {/* 7. 할인 쿠폰 */}
          {couponStats && discountSourceStats && (
            <DiscountCouponSection stats={couponStats} bySource={discountSourceStats} />
          )}

          {/* 8. 식권 운영 현황 */}
          {voucherStats && <VoucherSection stats={voucherStats} />}
        </>
      )}
    </div>
  )
}

// ─── 1. KPI 섹션 ─────────────────────────────────

function KpiSection({
  kpi,
}: {
  kpi: ReturnType<typeof calcKpi>
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>핵심 KPI</h2>
      <div className={styles.kpiGrid}>
        <Kpi label="총 매출" value={fmtWon(kpi.totalRevenue)} emphasis />
        <Kpi label="결제 건수" value={`${kpi.paidCount.toLocaleString()}건`} />
        <Kpi label="주문 건수 (부스)" value={`${kpi.totalBoothOrders.toLocaleString()}건`} />
        <Kpi label="평균 객단가" value={fmtWon(kpi.avgTicket)} />
        <Kpi
          label="결제당 부스 수"
          value={`${kpi.avgBoothsPerPayment.toFixed(2)}개`}
        />
      </div>
    </section>
  )
}

function Kpi({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className={`${styles.kpiCard} ${emphasis ? styles.kpiCardEmphasis : ''}`}>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={styles.kpiValue}>{value}</div>
    </div>
  )
}

// ─── 2. 시간 섹션 ────────────────────────────────

// 축제 운영 시간대 고정 (KST). 이 범위 밖 데이터(테스트/이탈)는 통계에서 제외.
const OPERATING_START = 10 // 오전 10시
const OPERATING_END = 18 // 마지막 슬롯 = 18:00-19:00 → 19시(오후 7시) 종료

interface HourPoint {
  hour: number
  revenue: number
  count: number
}

function HourLineChart({
  hours,
  maxRevenue,
}: {
  hours: HourPoint[]
  maxRevenue: number
}) {
  // SVG 내부 좌표계 — 실제 렌더 사이즈는 CSS width/height 가 결정.
  // 라벨은 SVG 밖 HTML div 로 빼서 고정 픽셀 크기로 표시.
  const VB_W = 900
  const VB_H = 200
  const padL = 24
  const padR = 20
  const padT = 12
  const padB = 12
  const chartW = VB_W - padL - padR
  const chartH = VB_H - padT - padB

  const getX = (i: number) =>
    hours.length === 1
      ? padL + chartW / 2
      : padL + (i / (hours.length - 1)) * chartW
  const getY = (rev: number) => padT + chartH - (rev / maxRevenue) * chartH

  const points = hours.map((h, i) => ({
    x: getX(i),
    y: getY(h.revenue),
    ...h,
  }))

  const linePath =
    points.length === 1
      ? `M ${points[0].x} ${points[0].y}`
      : points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  const areaPath =
    points.length >= 2
      ? `${linePath} L ${points[points.length - 1].x} ${padT + chartH} L ${points[0].x} ${padT + chartH} Z`
      : ''

  const yBase = padT + chartH

  return (
    <div className={styles.chartWrap}>
      <svg
        className={styles.lineChart}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
      >
        {/* 가로 그리드 4칸 */}
        {[0, 0.25, 0.5, 0.75].map((frac) => {
          const y = padT + frac * chartH
          return (
            <line
              key={frac}
              x1={padL}
              x2={VB_W - padR}
              y1={y}
              y2={y}
              className={styles.gridLine}
              vectorEffect="non-scaling-stroke"
            />
          )
        })}
        {/* x축 baseline */}
        <line
          x1={padL}
          x2={VB_W - padR}
          y1={yBase}
          y2={yBase}
          className={styles.axisLine}
          vectorEffect="non-scaling-stroke"
        />
        {/* 영역 */}
        {areaPath && <path d={areaPath} className={styles.lineArea} />}
        {/* 라인 */}
        <path
          d={linePath}
          className={styles.lineStroke}
          vectorEffect="non-scaling-stroke"
        />
        {/* 포인트 */}
        {points.map((p) => (
          <circle
            key={p.hour}
            cx={p.x}
            cy={p.y}
            r={5}
            className={styles.linePoint}
            vectorEffect="non-scaling-stroke"
          >
            <title>
              {p.hour}시 — {fmtWon(p.revenue)} ({p.count}건)
            </title>
          </circle>
        ))}
      </svg>
      {/* x축 라벨 — HTML div 로 고정 크기 */}
      <div className={styles.chartAxis}>
        {points.map((p) => (
          <span
            key={`l-${p.hour}`}
            className={styles.chartAxisLabel}
            style={{ left: `${(p.x / VB_W) * 100}%` }}
          >
            {p.hour}시
          </span>
        ))}
      </div>
    </div>
  )
}

function TimeSection({ time }: { time: ReturnType<typeof calcTimeStats> }) {
  // 운영 시간대 (10~18시) 만 잘라 표시. 그 외 시간은 전부 무시.
  const visibleHours = time.hourly.slice(OPERATING_START, OPERATING_END + 1)
  const maxRevenue = Math.max(1, ...visibleHours.map((h) => h.revenue))
  // Top 시간대도 운영 시간대 내에서만 재계산
  const topHoursInRange = [...visibleHours]
    .filter((h) => h.count > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3)
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>시간 분석</h2>
      {topHoursInRange.length > 0 && (
        <div className={styles.topHoursRow}>
          {topHoursInRange.map((h, i) => (
            <div key={h.hour} className={styles.topHourBox}>
              <span className={styles.topHourRank}>#{i + 1}</span>
              <span className={styles.topHourLabel}>
                {String(h.hour).padStart(2, '0')}:00–{String((h.hour + 1) % 24).padStart(2, '0')}:00
              </span>
              <span className={styles.topHourValue}>{fmtWon(h.revenue)}</span>
              <span className={styles.topHourSub}>{h.count}건</span>
            </div>
          ))}
        </div>
      )}
      <h3 className={styles.subTitle}>시간대별 매출</h3>
      {visibleHours.every((h) => h.count === 0) ? (
        <div className={styles.empty}>데이터 없음</div>
      ) : (
        <HourLineChart hours={visibleHours} maxRevenue={maxRevenue} />
      )}

      {time.daily.length > 1 && (
        <>
          <h3 className={styles.subTitle}>일자별 매출</h3>
          <div className={styles.dailyList}>
            {time.daily.map((d) => {
              const dayMax = Math.max(1, ...time.daily.map((x) => x.revenue))
              const pct = (d.revenue / dayMax) * 100
              return (
                <div key={d.date} className={styles.dailyRow}>
                  <span className={styles.dailyDate}>{d.date}</span>
                  <div className={styles.dailyBarWrap}>
                    <div className={styles.dailyBarFill} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={styles.dailyValue}>
                    {fmtWon(d.revenue)} <span className={styles.dim}>· {d.count}건</span>
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}

// ─── 3. 부스 성과 ────────────────────────────────

function BoothSection({ booth }: { booth: ReturnType<typeof calcBoothStats> }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>부스 성과</h2>
      {booth.topRevenue && (
        <div className={styles.highlightRow}>
          <span className={styles.highlightTag}>최고 매출</span>
          <span className={styles.highlightMain}>{booth.topRevenue.boothName}</span>
          <span className={styles.highlightValue}>{fmtWon(booth.topRevenue.revenue)}</span>
        </div>
      )}
      {booth.topOrderCount &&
        booth.topOrderCount.boothId !== booth.topRevenue?.boothId && (
          <div className={styles.highlightRow}>
            <span className={styles.highlightTag}>최다 주문</span>
            <span className={styles.highlightMain}>{booth.topOrderCount.boothName}</span>
            <span className={styles.highlightValue}>{booth.topOrderCount.orderCount}건</span>
          </div>
        )}
      <h3 className={styles.subTitle}>부스별 매출 랭킹</h3>
      <div className={styles.boothRankTable}>
        <div className={`${styles.boothRankRow} ${styles.boothRankHead}`}>
          <span>#</span>
          <span>매장명</span>
          <span className={styles.alignRight}>매출</span>
          <span className={styles.alignRight}>건수</span>
          <span className={styles.alignRight}>객단가</span>
        </div>
        {booth.ranking.length === 0 ? (
          <div className={styles.empty}>데이터 없음</div>
        ) : (
          booth.ranking.map((r, i) => (
            <div key={`${r.boothId}-${r.boothName}`} className={styles.boothRankRow}>
              <span className={styles.boothRankIdx}>{i + 1}</span>
              <span className={styles.boothRankName}>
                <strong>{r.boothName}</strong>
                <small className={styles.dim}>{r.boothNo}</small>
              </span>
              <span className={`${styles.boothRankNum} ${styles.alignRight}`}>
                {fmtWon(r.revenue)}
              </span>
              <span className={`${styles.boothRankNum} ${styles.alignRight}`}>
                {r.orderCount}건
              </span>
              <span className={`${styles.boothRankNum} ${styles.alignRight}`}>
                {fmtWon(r.avgTicket)}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

// ─── 4. 메뉴 분석 ────────────────────────────────

function MenuSection({ menu }: { menu: ReturnType<typeof calcMenuStats> }) {
  // 매출 기여 기준 정렬 (숨은 비싼 메뉴도 포함). 수량은 보조 정보로 병기.
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>메뉴 분석</h2>
      <h3 className={styles.subTitle}>메뉴 Top 10 (매출 기준)</h3>
      {menu.byRevenue.length === 0 ? (
        <div className={styles.empty}>데이터 없음</div>
      ) : (
        <ol className={styles.menuList}>
          {menu.byRevenue.map((m, i) => (
            <li key={`${m.boothName}-${m.menuName}`} className={styles.menuRowWide}>
              <span className={styles.menuRank}>{i + 1}</span>
              <div className={styles.menuInfo}>
                <strong>{m.menuName}</strong>
                <small className={styles.dim}>{m.boothName}</small>
              </div>
              <span className={styles.menuQty}>× {m.quantity}</span>
              <span className={styles.menuValue}>{fmtWon(m.revenue)}</span>
            </li>
          ))}
        </ol>
      )}

      {menu.perBoothBest.length > 0 && (
        <>
          <h3 className={styles.subTitle}>부스별 인기 메뉴</h3>
          <div className={styles.boothBestGrid}>
            {menu.perBoothBest.map((r) => (
              <div key={r.boothName} className={styles.boothBestCard}>
                <div className={styles.boothBestName}>{r.boothName}</div>
                <div className={styles.boothBestMenu}>{r.menuName}</div>
                <div className={styles.boothBestQty}>× {r.quantity}</div>
              </div>
            ))}
          </div>
        </>
      )}

    </section>
  )
}

// ─── 5. 고객 분석 ────────────────────────────────

function CustomerSection({
  customer,
}: {
  customer: ReturnType<typeof calcCustomerStats>
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>고객 분석</h2>
      <div className={styles.kpiGridDense}>
        <Kpi
          label="고유 구매 고객"
          value={`${customer.totalUniquePhones.toLocaleString()}명`}
        />
        <Kpi label="재구매자 수" value={`${customer.revisitCount.toLocaleString()}명`} />
        <Kpi label="재구매율" value={fmtPct(customer.revisitRate)} emphasis />
      </div>

      <h3 className={styles.subTitle}>구매 횟수 분포</h3>
      <div className={styles.freqList}>
        {customer.distribution.map((d) => {
          const total = customer.distribution.reduce((sum, x) => sum + x.customers, 0)
          const pct = total > 0 ? (d.customers / total) * 100 : 0
          return (
            <div key={d.label} className={styles.freqRow}>
              <span className={styles.freqLabel}>{d.label}</span>
              <div className={styles.freqBarWrap}>
                <div className={styles.freqBarFill} style={{ width: `${pct}%` }} />
              </div>
              <span className={styles.freqValue}>
                <span className={styles.freqValueCount}>{d.customers}명</span>
                <span className={styles.freqValuePct}>{Math.round(pct)}%</span>
              </span>
            </div>
          )
        })}
      </div>

      {customer.topRepeaters.length > 0 && (
        <>
          <h3 className={styles.subTitle}>최다 재구매 Top 5</h3>
          <div className={styles.rankTable}>
            <div className={`${styles.rankRow} ${styles.rankHead}`}>
              <span className={styles.rankIdx}>#</span>
              <span className={styles.rankName}>연락처</span>
              <span className={styles.rankBar} />
              <span className={styles.rankCol}>구매</span>
              <span className={styles.rankCol}>총 결제</span>
              <span className={styles.rankCol} />
            </div>
            {customer.topRepeaters.map((r, i) => (
              <div key={r.phoneMasked + i} className={styles.rankRow}>
                <span className={styles.rankIdx}>{i + 1}</span>
                <span className={styles.rankName}>
                  <strong>{r.phoneMasked}</strong>
                </span>
                <span className={styles.rankBar} />
                <span className={styles.rankCol}>{r.visits}회</span>
                <span className={styles.rankCol}>{fmtWon(r.totalAmount)}</span>
                <span className={styles.rankCol} />
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

// ─── 6. 결제 행동 ────────────────────────────────

// ─── 7. 할인 쿠폰 섹션 (source별 분리) ───────────

function DiscountCouponSection({
  stats,
  bySource,
}: {
  stats: CouponStats
  bySource: DiscountStatsBySource
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>할인 쿠폰</h2>
      <div className={styles.kpiGrid}>
        <Kpi label="발급" value={`${stats.issuedCount.toLocaleString()}건`} />
        <Kpi label="사용 완료" value={`${stats.usedCount.toLocaleString()}건`} />
        <Kpi label="사용률" value={fmtPct(stats.usageRate)} emphasis />
        <Kpi label="사용가능" value={`${stats.activeCount.toLocaleString()}건`} />
        <Kpi label="총 할인액" value={fmtWon(stats.totalDiscount)} />
      </div>
      <div className={styles.subTitle}>발급 사유별</div>
      <table className={styles.simpleTable}>
        <thead>
          <tr>
            <th>구분</th>
            <th className={styles.right}>발급</th>
            <th className={styles.right}>사용</th>
            <th className={styles.right}>할인합계</th>
          </tr>
        </thead>
        <tbody>
          {bySource.bySource.map((s) => (
            <tr key={s.source}>
              <td>{DISCOUNT_SOURCE_LABEL[s.source]}</td>
              <td className={styles.right}>{s.issuedCount.toLocaleString()}건</td>
              <td className={styles.right}>{s.usedCount.toLocaleString()}건</td>
              <td className={styles.right}>{fmtWon(s.totalDiscount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

// ─── 8. 식권 운영 현황 섹션 ───────────────────────

function VoucherSection({ stats }: { stats: VoucherStats }) {
  const avgUsed =
    stats.totalUsedCount > 0
      ? Math.round(stats.organizerCost / stats.totalUsedCount)
      : 0
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>식권 운영 현황</h2>
      <div className={styles.kpiGrid}>
        <Kpi
          label="총 발급"
          value={`${stats.totalIssuedCount.toLocaleString()}장 / ${fmtWon(stats.totalIssuedFaceValue)}`}
        />
        <Kpi
          label="사용"
          value={`${stats.totalUsedCount.toLocaleString()}장 (${fmtPct(stats.usageRate)})`}
          emphasis
        />
        <Kpi
          label="미사용"
          value={`${stats.unusedCount.toLocaleString()}장 / ${fmtWon(stats.unusedFaceValue)}`}
        />
        <Kpi label="운영자 식권 부담" value={fmtWon(stats.organizerCost)} />
        <Kpi label="잔액 소멸" value={fmtWon(stats.burned)} />
        <Kpi label="식권당 평균 사용액" value={fmtWon(avgUsed)} />
      </div>
      <div className={styles.subTitle}>대상별 분리</div>
      <table className={styles.simpleTable}>
        <thead>
          <tr>
            <th>대상</th>
            <th className={styles.right}>발급</th>
            <th className={styles.right}>발급 액면</th>
            <th className={styles.right}>사용</th>
            <th className={styles.right}>사용 액면</th>
          </tr>
        </thead>
        <tbody>
          {stats.bySource.map((s) => (
            <tr key={s.source}>
              <td>{VOUCHER_SOURCE_LABEL[s.source]}</td>
              <td className={styles.right}>{s.issuedCount.toLocaleString()}장</td>
              <td className={styles.right}>{fmtWon(s.issuedTotal)}</td>
              <td className={styles.right}>{s.usedCount.toLocaleString()}장</td>
              <td className={styles.right}>{fmtWon(s.usedFaceValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function BehaviorSection({
  behavior,
}: {
  behavior: ReturnType<typeof calcPaymentBehaviorStats>
}) {
  const maxTicket = Math.max(1, ...behavior.ticketSizeBuckets.map((b) => b.count))
  const totalTicket = behavior.ticketSizeBuckets.reduce((sum, b) => sum + b.count, 0)
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>객단가 분포</h2>
      <div className={`${styles.distList} ${styles.distListEmphasis}`}>
        {/* 상단 퍼센티지 요약 */}
        <div className={styles.distSummary}>
          {behavior.ticketSizeBuckets.map((b) => {
            const pct = totalTicket > 0 ? Math.round((b.count / totalTicket) * 100) : 0
            return (
              <div key={b.label} className={styles.distSummaryItem}>
                <span className={styles.distSummaryPct}>{pct}%</span>
                <span className={styles.distSummaryLabel}>{b.label}</span>
              </div>
            )
          })}
        </div>
        {/* 막대 그래프 */}
        {behavior.ticketSizeBuckets.map((b) => {
          const barPct = (b.count / maxTicket) * 100
          return (
            <div key={b.label} className={styles.distRow}>
              <span className={styles.distLabel}>{b.label}</span>
              <div className={styles.distBarWrap}>
                <div className={styles.distBarFill} style={{ width: `${barPct}%` }} />
              </div>
              <span className={styles.distValue}>{b.count}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
