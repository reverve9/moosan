import { RotateCw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  SURVEY_ITEMS,
  SURVEY_LABELS,
  SURVEY_OPERATIONS_ITEMS,
  calcSurveyStats,
  fetchSurveys,
  type CountBucket,
  type LikertSection,
  type LikertSubItem,
  type SurveyStats,
} from '@/lib/survey'
import { exportToExcel, fmtDateKst } from '@/lib/excel'
import { ExportButton } from '@/components/admin/ExcelButtons'
import type { Coupon, Survey } from '@/types/database'
import { fetchSurveyCouponByPhone } from '@/lib/coupons'
import { formatPhoneDisplay } from '@/lib/phone'
import Pagination, { DEFAULT_PAGE_SIZE } from '@/components/admin/Pagination'
import styles from './StatsSurveyTab.module.css'

function fmtPct(n: number | null | undefined, suffix = '%'): string {
  if (n === null || n === undefined) return '—'
  return `${n.toFixed(1)}${suffix}`
}

function fmtCount(n: number): string {
  return n.toLocaleString() + '명'
}

function formatDateTime(iso: string): string {
  // AdminOrders 와 동일: mm/dd hh:mm (KST)
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

export default function StatsSurveyTab() {
  const [rows, setRows] = useState<Survey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSurvey, setSelectedSurvey] = useState<Survey | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = DEFAULT_PAGE_SIZE

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchSurveys()
      setRows(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const stats: SurveyStats = useMemo(() => calcSurveyStats(rows), [rows])

  const handleExport = async () => {
    const cols = [
      { key: 'created_at', label: '제출일시' },
      { key: 'name', label: '이름' },
      { key: 'gender', label: '성별' },
      { key: 'age', label: '연령' },
      { key: 'region', label: '거주지역' },
      { key: 'phone', label: '전화' },
      { key: 'q1', label: '종교' },
      { key: 'q2', label: '1년전종교' },
      { key: 'q3', label: '개인영향' },
      { key: 'q3_1', label: '사회영향' },
      { key: 'q4', label: '과거참여' },
      { key: 'q5', label: '결정자' },
      { key: 'q6', label: '정보출처' },
      { key: 'q7', label: '기대부분' },
      { key: 'q11', label: '종합만족도' },
      { key: 'q11_1', label: '불만족이유' },
      { key: 'q11_2', label: '만족이유' },
      { key: 'q12', label: '소요시간' },
      { key: 'q13', label: '일정적절' },
      { key: 'q14', label: '교통접근' },
      { key: 'q15', label: '주차편의' },
      { key: 'q16', label: '동선안내' },
      { key: 'q20', label: '개선의견' },
    ]
    const data = rows.map((r) => {
      const a = (r.answers ?? {}) as Record<string, unknown>
      return {
        created_at: fmtDateKst(r.created_at),
        name: r.name,
        gender: SURVEY_LABELS.gender[r.gender] ?? r.gender,
        age: r.age,
        region: SURVEY_LABELS.region[r.region] ?? r.region,
        phone: formatPhoneDisplay(r.phone),
        q1: SURVEY_LABELS.religion[a.q1 as string] ?? a.q1 ?? '',
        q2: SURVEY_LABELS.religion[a.q2 as string] ?? a.q2 ?? '',
        q3: SURVEY_LABELS.influence[a.q3 as string] ?? a.q3 ?? '',
        q3_1: SURVEY_LABELS.influence[a.q3_1 as string] ?? a.q3_1 ?? '',
        q4: SURVEY_LABELS.yesNo[a.q4 as string] ?? a.q4 ?? '',
        q5: SURVEY_LABELS.decisionMaker[a.q5 as string] ?? a.q5 ?? '',
        q6: Array.isArray(a.q6) ? (a.q6 as string[]).map((v) => SURVEY_LABELS.infoSource[v] ?? v).join(', ') : '',
        q7: SURVEY_LABELS.expectation[a.q7 as string] ?? a.q7 ?? '',
        q11: a.q11 ?? '',
        q11_1: a.q11_1 ?? '',
        q11_2: a.q11_2 ?? '',
        q12: a.q12 ?? '',
        q13: a.q13 ?? '',
        q14: a.q14 ?? '',
        q15: a.q15 ?? '',
        q16: a.q16 ?? '',
        q20: a.q20 ?? '',
      }
    })
    await exportToExcel(data, cols, '만족도조사')
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pageRows = rows.slice(pageStart, pageStart + PAGE_SIZE)

  return (
    <div className={styles.tab}>
      {/* 헤더 — 날짜 필터 없이 누적 집계. 새로고침만 */}
      <div className={styles.headerBar}>
        <div className={styles.headerLabel}>
          누적 응답 집계 · 총 <strong>{stats.total.toLocaleString()}</strong>명
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

      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading && rows.length === 0 ? (
        <div className={styles.placeholder}>통계 계산 중…</div>
      ) : stats.total === 0 ? (
        <div className={styles.placeholder}>조회된 응답이 없습니다.</div>
      ) : (
        <>
          {/* 1. 요약 KPI */}
          <KpiSection stats={stats} />

          {/* 2. 응답자 정보 (성별/연령/지역 + Q1~Q2 종교) */}
          <DemographicsSection stats={stats} />

          {/* 3. 종교 영향력 (Q3, Q3-1) */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>3. 종교 영향력</h2>
            <div className={styles.demoGrid}>
              <BucketTable
                title="문3. 개인 삶에 미치는 영향"
                buckets={stats.religionInfluencePersonal}
              />
              <BucketTable
                title="문3-1. 한국 사회에 미치는 영향"
                buckets={stats.religionInfluenceSociety}
              />
            </div>
          </section>

          {/* 4. 참여 동기 (Q4, Q5, Q7) */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>4~7. 참여 동기</h2>
            <div className={styles.demoGrid}>
              <BucketTable
                title="문4. 과거 참여 경험"
                buckets={stats.pastParticipation}
              />
              <BucketTable
                title="문5. 참여 결정자"
                buckets={stats.decisionMaker}
              />
              <BucketTable
                title="문7. 기대한 부분"
                buckets={stats.expectation}
                scrollable
              />
            </div>
          </section>

          {/* 5. 문6 정보 출처 (복수선택) */}
          <SingleBucketSection
            title="6. 정보 출처 (복수선택)"
            buckets={stats.infoSources}
          />

          {/* 4. 문8~10 리커트 (이미지/내용/주관기관) */}
          <LikertGridSection
            title="8~10. 행사 평가 (100점 환산)"
            sections={stats.sections.filter((s) =>
              ['q8', 'q9', 'q10'].includes(s.key),
            )}
          />

          {/* 5. 문11 종합 만족도 + 주관식 */}
          <Q11Section stats={stats} />

          {/* 6. 문12~16 행사 운영 */}
          <OperationsSection stats={stats} />

          {/* 7. 문17~18 의향/성과 */}
          <LikertGridSection
            title="17~18. 의향 및 성과 (100점 환산)"
            sections={stats.sections.filter((s) =>
              ['q17', 'q18'].includes(s.key),
            )}
          />

          {/* 8-9. 문19 희망 프로그램 (복수선택) + 문20 개선 의견 (2열) */}
          <div className={styles.dualSectionGrid}>
            <SingleBucketSection
              title="19. 향후 희망 프로그램 (복수선택)"
              buckets={stats.futurePrograms}
            />
            <SingleCommentSection
              title="20. 개선 의견"
              items={stats.openComments.q20}
              total={stats.openComments.q20.length}
            />
          </div>

          {/* 10. 원본 응답 테이블 */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>원본 응답 목록</h2>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={rows.length}
              onChange={setPage}
              unit="명"
              actions={<ExportButton onClick={handleExport} disabled={rows.length === 0} />}
            />
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.alignCenter}>#</th>
                    <th>제출일시</th>
                    <th>이름</th>
                    <th>성별</th>
                    <th className={styles.alignCenter}>연령</th>
                    <th>거주지역</th>
                    <th>종교</th>
                    <th className={styles.alignCenter}>종합만족</th>
                    <th>전화</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, idx) => {
                    const displayNo = rows.length - (pageStart + idx)
                    const answers = (r.answers ?? {}) as Record<string, unknown>
                    const q1 = typeof answers.q1 === 'string' ? answers.q1 : ''
                    const q11 =
                      typeof answers.q11 === 'number'
                        ? answers.q11
                        : Number(answers.q11) || null
                    return (
                      <tr
                        key={r.id}
                        className={styles.row}
                        onClick={() => setSelectedSurvey(r)}
                      >
                        <td className={`${styles.alignCenter} ${styles.mono}`}>
                          {displayNo}
                        </td>
                        <td className={styles.mono}>
                          {formatDateTime(r.created_at)}
                        </td>
                        <td>{r.name}</td>
                        <td>{SURVEY_LABELS.gender[r.gender] ?? r.gender}</td>
                        <td className={`${styles.alignCenter} ${styles.mono}`}>
                          {r.age}
                        </td>
                        <td>{SURVEY_LABELS.region[r.region] ?? r.region}</td>
                        <td>{SURVEY_LABELS.religion[q1] ?? '—'}</td>
                        <td className={`${styles.alignCenter} ${styles.mono}`}>
                          {q11 ?? '—'}
                        </td>
                        <td className={styles.mono}>{formatPhoneDisplay(r.phone)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {selectedSurvey && (
        <SurveyDetailModal
          survey={selectedSurvey}
          onClose={() => setSelectedSurvey(null)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// KPI (총 응답 · 전반만족 · 종합만족 · 평균연령 · 최다지역)
// ─────────────────────────────────────────────────────────────────

function KpiSection({ stats }: { stats: SurveyStats }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>핵심 지표</h2>
      <div className={styles.kpiGrid}>
        <Kpi label="총 응답 수" value={fmtCount(stats.total)} emphasis />
        <Kpi
          label="평균 연령"
          value={stats.avgAge !== null ? `${stats.avgAge.toFixed(1)}세` : '—'}
        />
        <Kpi
          label="최다 거주지역"
          value={
            stats.topRegion
              ? `${stats.topRegion.label} (${stats.topRegion.ratio.toFixed(1)}%)`
              : '—'
          }
        />
        <Kpi label="전반 만족도" value={fmtPct(stats.overallSatisfactionTopBox)} />
        <Kpi
          label="종합 만족도"
          value={fmtPct(stats.overallSatisfactionAvg100, '점')}
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

// ─────────────────────────────────────────────────────────────────
// 응답자 정보 (Demographics)
// ─────────────────────────────────────────────────────────────────

function DemographicsSection({ stats }: { stats: SurveyStats }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>응답자 정보</h2>
      <div className={styles.demoGrid}>
        <BucketTable title="성별" buckets={stats.gender} />
        <BucketTable title="연령" buckets={stats.ageBuckets} />
        <BucketTable title="거주지역" buckets={stats.regions} scrollable />
        <BucketTable title="종교 (문1)" buckets={stats.religion} />
        <BucketTable
          title="종교 시점 (문1-1)"
          buckets={stats.religionSince}
          scrollable
        />
        <BucketTable
          title="종교활동 빈도 (문1-2)"
          buckets={stats.religionFrequency}
          scrollable
        />
        <BucketTable
          title="1년 전 종교 (문2)"
          buckets={stats.pastReligion}
        />
      </div>
    </section>
  )
}

function BucketTable({
  title,
  buckets,
  scrollable,
}: {
  title: string
  buckets: CountBucket[]
  scrollable?: boolean
}) {
  return (
    <div className={styles.bucketCard}>
      <h3 className={styles.bucketTitle}>{title}</h3>
      <div className={scrollable ? styles.bucketListScroll : styles.bucketList}>
        {buckets.map((b) => (
          <div
            key={b.key}
            className={`${styles.bucketRow} ${b.count === 0 ? styles.bucketRowDim : ''}`}
          >
            <span className={styles.bucketLabel}>{b.label}</span>
            <div className={styles.bucketBar}>
              <div
                className={styles.bucketBarFill}
                style={{ width: `${Math.min(b.ratio, 100)}%` }}
              />
            </div>
            <span className={styles.bucketRatio}>{b.ratio.toFixed(1)}%</span>
            <span className={styles.bucketCount}>({b.count})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// 리커트 카드 그리드 (재사용) — 섹션 서브셋 받아서 렌더
// ─────────────────────────────────────────────────────────────────

function LikertGridSection({
  title,
  sections,
}: {
  title: string
  sections: LikertSection[]
}) {
  if (sections.length === 0) return null
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.perfGrid}>
        {sections.map((section) => (
          <LikertCard key={section.key} section={section} />
        ))}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// 단일 버킷 섹션 (Q6, Q19 등 복수선택 단독)
// ─────────────────────────────────────────────────────────────────

function SingleBucketSection({
  title,
  buckets,
}: {
  title: string
  buckets: CountBucket[]
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <BucketTable title="" buckets={buckets} />
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// 문11 종합 만족도 + 주관식 이유
// ─────────────────────────────────────────────────────────────────

function Q11Section({ stats }: { stats: SurveyStats }) {
  const MAX = 10
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>11. 종합 만족도</h2>
      <div className={styles.kpiGridDual}>
        <Kpi
          label="전반 만족도 (5~7점 비율)"
          value={fmtPct(stats.overallSatisfactionTopBox)}
        />
        <Kpi
          label="종합 만족도 (100점 환산)"
          value={fmtPct(stats.overallSatisfactionAvg100, '점')}
          emphasis
        />
      </div>
      <div className={styles.openGridDual}>
        <OpenBlock
          title="11-2. 만족 이유"
          items={stats.openComments.q11_2.slice(0, MAX)}
          total={stats.openComments.q11_2.length}
        />
        <OpenBlock
          title="11-1. 불만족 이유"
          items={stats.openComments.q11_1.slice(0, MAX)}
          total={stats.openComments.q11_1.length}
        />
      </div>
    </section>
  )
}

function LikertCard({ section }: { section: LikertSection }) {
  return (
    <div className={styles.perfCard}>
      <div className={styles.perfCardHeader}>
        <h3 className={styles.perfCardTitle}>{section.label}</h3>
        <span className={styles.perfCardScore}>
          {section.sectionAvg100 !== null
            ? `${section.sectionAvg100.toFixed(1)}점`
            : '—'}
        </span>
      </div>
      <div className={styles.perfItems}>
        {section.items.map((item) => (
          <SubItemRow key={item.key} item={item} />
        ))}
      </div>
    </div>
  )
}

function SubItemRow({ item }: { item: LikertSubItem }) {
  const pct = item.avg100 ?? 0
  return (
    <div className={styles.subItemRow}>
      <span className={styles.subItemLabel}>{item.label}</span>
      <div className={styles.subItemBar}>
        <div
          className={styles.subItemBarFill}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={styles.subItemScore}>
        {item.avg100 !== null ? item.avg100.toFixed(1) : '—'}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// 운영 (Q12~Q16 5점)
// ─────────────────────────────────────────────────────────────────

function OperationsSection({ stats }: { stats: SurveyStats }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>
        행사 운영 평가 (문12~16, 100점 환산)
      </h2>
      <div className={styles.perfCard}>
        <div className={styles.perfItems}>
          {stats.operations.map((item) => (
            <SubItemRow key={item.key} item={item} />
          ))}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// 단일 주관식 섹션 (Q20 등)
// ─────────────────────────────────────────────────────────────────

function SingleCommentSection({
  title,
  items,
  total,
}: {
  title: string
  items: string[]
  total: number
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>
        {title} <span className={styles.sectionTitleCount}>({total}건)</span>
      </h2>
      {items.length === 0 ? (
        <div className={styles.openEmpty}>응답 없음</div>
      ) : (
        <ul className={styles.openList}>
          {items.map((text, idx) => (
            <li key={idx} className={styles.openItem}>
              {text}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function OpenBlock({
  title,
  items,
  total,
}: {
  title: string
  items: string[]
  total: number
}) {
  return (
    <div className={styles.openBlock}>
      <h3 className={styles.openTitle}>
        {title} <span className={styles.openCount}>({total}건)</span>
      </h3>
      {items.length === 0 ? (
        <div className={styles.openEmpty}>응답 없음</div>
      ) : (
        <ul className={styles.openList}>
          {items.map((text, idx) => (
            <li key={idx} className={styles.openItem}>
              {text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// 상세 모달
// ─────────────────────────────────────────────────────────────────

interface SurveyDetailModalProps {
  survey: Survey
  onClose: () => void
}

function SurveyDetailModal({ survey, onClose }: SurveyDetailModalProps) {
  const navigate = useNavigate()
  const [surveyCoupon, setSurveyCoupon] = useState<Coupon | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // 이 응답자에게 발급된 설문 쿠폰 조회 (phone 기반)
  useEffect(() => {
    let cancelled = false
    fetchSurveyCouponByPhone(survey.phone)
      .then((c) => {
        if (!cancelled) setSurveyCoupon(c)
      })
      .catch(() => {
        if (!cancelled) setSurveyCoupon(null)
      })
  }, [survey.phone])

  const couponStatus = useMemo(() => {
    if (!surveyCoupon) return null
    if (surveyCoupon.status === 'used') {
      return { label: '사용완료', tone: 'used' as const }
    }
    if (new Date(surveyCoupon.expires_at).getTime() < Date.now()) {
      return { label: '만료', tone: 'expired' as const }
    }
    return { label: '미사용', tone: 'active' as const }
  }, [surveyCoupon])

  const a = (survey.answers ?? {}) as Record<string, unknown>

  const strAnswer = (key: string, map?: Record<string, string>) => {
    const v = a[key]
    if (typeof v !== 'string' || !v) return '—'
    return map?.[v] ?? v
  }

  const multiAnswer = (key: string, map: Record<string, string>) => {
    const v = a[key]
    if (!Array.isArray(v) || v.length === 0) return '—'
    return v
      .map((item) => (typeof item === 'string' ? map[item] ?? item : ''))
      .filter(Boolean)
      .join(', ')
  }

  const numAnswer = (key: string) => {
    const v = a[key]
    if (v === null || v === undefined || v === '') return '—'
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? String(n) : '—'
  }

  const likertGroup = (
    key: string,
    items: { key: string; label?: string; left?: string; right?: string }[],
  ) => {
    const group = (a[key] as Record<string, unknown> | undefined) ?? {}
    return items.map((item) => {
      const raw = group[item.key]
      const n = typeof raw === 'number' ? raw : Number(raw)
      const display = Number.isFinite(n) ? String(n) : '—'
      const label =
        item.label ??
        (item.left && item.right ? `${item.left} ↔ ${item.right}` : item.key)
      return { label, value: display }
    })
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>설문 응답 상세</h2>
            <p className={styles.modalSub}>
              {survey.name} · {formatDateTime(survey.created_at)}
            </p>
          </div>
          <div className={styles.modalHeaderRight}>
            {surveyCoupon && couponStatus && (
              <button
                type="button"
                className={`${styles.couponBadge} ${styles[`couponBadge_${couponStatus.tone}`]}`}
                onClick={() => navigate('/coupons')}
                title="쿠폰 관리로 이동"
              >
                🎟 {surveyCoupon.discount_amount.toLocaleString()}원 · {couponStatus.label}
              </button>
            )}
            <button
              type="button"
              className={styles.modalClose}
              onClick={onClose}
              aria-label="닫기"
            >
              <X />
            </button>
          </div>
        </div>

        <div className={styles.modalBody}>
          {/* 기본 정보 */}
          <DetailSection title="응답자 정보">
            <DetailRow label="성별" value={SURVEY_LABELS.gender[survey.gender] ?? survey.gender} />
            <DetailRow label="연령" value={`${survey.age}세`} />
            <DetailRow
              label="거주지역"
              value={SURVEY_LABELS.region[survey.region] ?? survey.region}
            />
            <DetailRow label="전화" value={formatPhoneDisplay(survey.phone)} />
            <DetailRow
              label="개인정보 동의"
              value={survey.privacy_consented ? '동의' : '미동의'}
            />
          </DetailSection>

          {/* Q1 */}
          <DetailSection title="1. 종교">
            <DetailRow label="문1. 종교" value={strAnswer('q1', SURVEY_LABELS.religion)} />
            <DetailRow
              label="문1-1. 언제부터"
              value={strAnswer('q1_1', SURVEY_LABELS.religionSince)}
            />
            <DetailRow
              label="문1-2. 참여 빈도"
              value={strAnswer('q1_2', SURVEY_LABELS.religionFrequency)}
            />
          </DetailSection>

          {/* Q2, Q3 */}
          <DetailSection title="2~3. 종교 영향">
            <DetailRow
              label="문2. 종교가 생활에 영향"
              value={strAnswer('q2', SURVEY_LABELS.influence)}
            />
            <DetailRow
              label="문3. 문화행사 관심에 영향"
              value={strAnswer('q3', SURVEY_LABELS.influence)}
            />
            {typeof a.q3_1 === 'string' && a.q3_1 && (
              <DetailRow label="문3-1. 기타" value={a.q3_1} />
            )}
          </DetailSection>

          {/* Q4~Q7 */}
          <DetailSection title="4~7. 참여 경험">
            <DetailRow
              label="문4. 행사 참여 경험"
              value={strAnswer('q4', SURVEY_LABELS.yesNo)}
            />
            <DetailRow
              label="문5. 참여 결정자"
              value={strAnswer('q5', SURVEY_LABELS.decisionMaker)}
            />
            <DetailRow
              label="문6. 정보 출처"
              value={multiAnswer('q6', SURVEY_LABELS.infoSource)}
            />
            <DetailRow
              label="문7. 기대한 부분"
              value={strAnswer('q7', SURVEY_LABELS.expectation)}
            />
          </DetailSection>

          {/* Q8 */}
          <DetailSection title="8. 행사 이미지 (7점 척도)">
            {likertGroup('q8', SURVEY_ITEMS.q8).map((item) => (
              <DetailRow key={item.label} label={item.label} value={item.value} />
            ))}
          </DetailSection>

          {/* Q9 */}
          <DetailSection title="9. 내용 및 품질 (7점 척도)">
            {likertGroup('q9', SURVEY_ITEMS.q9).map((item) => (
              <DetailRow key={item.label} label={item.label} value={item.value} />
            ))}
          </DetailSection>

          {/* Q10 */}
          <DetailSection title="10. 주관기관 (7점 척도)">
            {likertGroup('q10', SURVEY_ITEMS.q10).map((item) => (
              <DetailRow key={item.label} label={item.label} value={item.value} />
            ))}
          </DetailSection>

          {/* Q11 */}
          <DetailSection title="11. 종합 만족도 (7점 척도)">
            <DetailRow label="문11. 종합 만족도" value={numAnswer('q11')} />
            {typeof a.q11_1 === 'string' && a.q11_1 && (
              <DetailRow label="문11-1. 불만족 이유" value={a.q11_1} multiline />
            )}
            {typeof a.q11_2 === 'string' && a.q11_2 && (
              <DetailRow label="문11-2. 만족 이유" value={a.q11_2} multiline />
            )}
          </DetailSection>

          {/* Q12~Q16 */}
          <DetailSection title="12~16. 행사 운영 (5점 척도)">
            {SURVEY_OPERATIONS_ITEMS.map((item) => {
              const v = a[item.key]
              const label = item.label
              const mapped =
                typeof v === 'string' ? item.optionLabels[v] ?? v : v != null ? String(v) : '—'
              return <DetailRow key={item.key} label={label} value={mapped} />
            })}
          </DetailSection>

          {/* Q17 */}
          <DetailSection title="17. 참여/추천 의향 (7점 척도)">
            {likertGroup('q17', SURVEY_ITEMS.q17).map((item) => (
              <DetailRow key={item.label} label={item.label} value={item.value} />
            ))}
          </DetailSection>

          {/* Q18 */}
          <DetailSection title="18. 행사 성과 (7점 척도)">
            {likertGroup('q18', SURVEY_ITEMS.q18).map((item) => (
              <DetailRow key={item.label} label={item.label} value={item.value} />
            ))}
          </DetailSection>

          {/* Q19 */}
          <DetailSection title="19. 향후 희망 프로그램">
            <DetailRow
              label="문19"
              value={multiAnswer('q19', SURVEY_LABELS.futureProgram)}
            />
          </DetailSection>

          {/* Q20 */}
          <DetailSection title="20. 개선 의견">
            <DetailRow
              label="문20"
              value={typeof a.q20 === 'string' && a.q20 ? a.q20 : '—'}
              multiline
            />
          </DetailSection>
        </div>
      </div>
    </div>
  )
}

function DetailSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className={styles.detailSection}>
      <h3 className={styles.detailTitle}>{title}</h3>
      <dl className={styles.detailList}>{children}</dl>
    </div>
  )
}

function DetailRow({
  label,
  value,
  multiline,
}: {
  label: string
  value: string
  multiline?: boolean
}) {
  return (
    <div className={`${styles.detailRow} ${multiline ? styles.detailRowMulti : ''}`}>
      <dt className={styles.detailLabel}>{label}</dt>
      <dd className={styles.detailValue}>{value}</dd>
    </div>
  )
}
