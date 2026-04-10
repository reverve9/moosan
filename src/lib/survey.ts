import { supabase } from './supabase'
import {
  DuplicateSurveyCouponError,
  hasSurveyCouponByPhone,
  issueSurveyCoupon,
} from './coupons'
import type { Coupon, Json, Survey } from '@/types/database'
import {
  GENDER_OPTIONS,
  REGION_OPTIONS,
  RELIGION_OPTIONS,
  RELIGION_SINCE_OPTIONS,
  RELIGION_FREQUENCY_OPTIONS,
  INFLUENCE_OPTIONS,
  YES_NO_OPTIONS,
  DECISION_MAKER_OPTIONS,
  INFO_SOURCE_OPTIONS,
  EXPECTATION_OPTIONS,
  IMAGE_ITEMS,
  Q9_ITEMS,
  Q10_ITEMS,
  Q17_ITEMS,
  Q18_ITEMS,
  APPROPRIATE_5_OPTIONS,
  CONVENIENT_5_OPTIONS,
  FUTURE_PROGRAM_OPTIONS,
} from '@/pages/sections/survey/questions'

/**
 * 어드민 통계용 필터.
 * 기본적으로 날짜 범위만 제공 (KST 기준 YYYY-MM-DD).
 */
export interface SurveyFilters {
  dateFrom?: string
  dateTo?: string
  festivalId?: string | null
}

/**
 * 어드민용 — surveys 전체 조회.
 * 날짜 범위는 KST 기준으로 해석.
 */
export async function fetchSurveys(filters: SurveyFilters = {}): Promise<Survey[]> {
  let query = supabase
    .from('surveys')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters.dateFrom) {
    const fromIso = new Date(`${filters.dateFrom}T00:00:00+09:00`).toISOString()
    query = query.gte('created_at', fromIso)
  }
  if (filters.dateTo) {
    const toIso = new Date(`${filters.dateTo}T23:59:59.999+09:00`).toISOString()
    query = query.lte('created_at', toIso)
  }
  if (filters.festivalId !== undefined) {
    if (filters.festivalId === null) query = query.is('festival_id', null)
    else query = query.eq('festival_id', filters.festivalId)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Survey[]
}

// ─────────────────────────────────────────────────────────────────
// 라벨 lookup (설문 폼 questions.ts 를 단일 진실원으로)
// ─────────────────────────────────────────────────────────────────

function toMap(opts: { value: string; label: string }[]): Record<string, string> {
  return Object.fromEntries(opts.map((o) => [o.value, o.label]))
}

const GENDER_LABELS = toMap(GENDER_OPTIONS)
const REGION_LABELS = toMap(REGION_OPTIONS)
const RELIGION_LABELS = toMap(RELIGION_OPTIONS)
const RELIGION_SINCE_LABELS = toMap(RELIGION_SINCE_OPTIONS)
const RELIGION_FREQ_LABELS = toMap(RELIGION_FREQUENCY_OPTIONS)
const INFLUENCE_LABELS = toMap(INFLUENCE_OPTIONS)
const YES_NO_LABELS = toMap(YES_NO_OPTIONS)
const DECISION_MAKER_LABELS = toMap(DECISION_MAKER_OPTIONS)
const INFO_SOURCE_LABELS = toMap(INFO_SOURCE_OPTIONS)
const EXPECTATION_LABELS = toMap(EXPECTATION_OPTIONS)
const FUTURE_PROGRAM_LABELS = toMap(FUTURE_PROGRAM_OPTIONS)
const APPROPRIATE_5_LABELS = toMap(APPROPRIATE_5_OPTIONS)
const CONVENIENT_5_LABELS = toMap(CONVENIENT_5_OPTIONS)

/** 라벨 lookup — 어드민 UI (상세모달 등) 에서 공용으로 사용 */
export const SURVEY_LABELS = {
  gender: GENDER_LABELS,
  region: REGION_LABELS,
  religion: RELIGION_LABELS,
  religionSince: RELIGION_SINCE_LABELS,
  religionFrequency: RELIGION_FREQ_LABELS,
  influence: INFLUENCE_LABELS,
  yesNo: YES_NO_LABELS,
  decisionMaker: DECISION_MAKER_LABELS,
  infoSource: INFO_SOURCE_LABELS,
  expectation: EXPECTATION_LABELS,
  futureProgram: FUTURE_PROGRAM_LABELS,
  appropriate5: APPROPRIATE_5_LABELS,
  convenient5: CONVENIENT_5_LABELS,
} as const

/** 설문 폼 하위 문항 라벨 (questions.ts 그대로 재export — 상세모달용) */
export const SURVEY_ITEMS = {
  q8: IMAGE_ITEMS,
  q9: Q9_ITEMS,
  q10: Q10_ITEMS,
  q17: Q17_ITEMS,
  q18: Q18_ITEMS,
} as const

// ─────────────────────────────────────────────────────────────────
// 통계 계산 헬퍼
// ─────────────────────────────────────────────────────────────────

/** answers JSON 내부에서 숫자로 해석 가능한 라이커트 값만 뽑기 */
function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * max 점 척도를 100점 만점으로 환산한 평균.
 * 작년 공식: avg / max * 100 (1점=14.3, 4점=57.1, 7점=100)
 */
function to100Avg(values: (number | null)[], max: number): number | null {
  const nums = values.filter((v): v is number => v !== null)
  if (nums.length === 0) return null
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length
  return Math.round((avg / max) * 1000) / 10
}

/** 7점 척도 응답 중 5,6,7 점 비율 (%) — 작년 "전반적 만족도" 동일 공식 */
function topBoxRatio7(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null)
  if (nums.length === 0) return null
  const top = nums.filter((v) => v >= 5).length
  return Math.round((top / nums.length) * 1000) / 10
}

export interface CountBucket {
  key: string
  label: string
  count: number
  ratio: number
}

export interface LikertSubItem {
  key: string
  label: string
  avg100: number | null
  distribution: number[] // index = (value-1), value = count
  max: number
}

export interface LikertSection {
  key: string
  label: string
  sectionAvg100: number | null
  items: LikertSubItem[]
}

export interface SurveyStats {
  total: number
  // 응답자 정보
  avgAge: number | null
  topRegion: { key: string; label: string; count: number; ratio: number } | null
  gender: CountBucket[]
  ageBuckets: CountBucket[]
  regions: CountBucket[]
  religion: CountBucket[]
  religionSince: CountBucket[]
  religionFrequency: CountBucket[]
  pastReligion: CountBucket[] // Q2
  religionInfluencePersonal: CountBucket[] // Q3
  religionInfluenceSociety: CountBucket[] // Q3-1
  pastParticipation: CountBucket[] // Q4
  decisionMaker: CountBucket[] // Q5
  expectation: CountBucket[] // Q7
  // 행사성과 평가
  overallSatisfactionAvg100: number | null // Q11 100점환산 평균
  overallSatisfactionTopBox: number | null // Q11 5,6,7 비율
  sections: LikertSection[]
  // 운영 (Q12~Q16 5점)
  operations: LikertSubItem[]
  // 복수선택 집계
  infoSources: CountBucket[] // Q6
  futurePrograms: CountBucket[] // Q19
  // 주관식 샘플
  openComments: {
    q11_1: string[] // 불만족 이유
    q11_2: string[] // 만족 이유
    q20: string[] // 개선 의견
  }
}

const Q12_16_ITEMS: { key: string; label: string; optionLabels: Record<string, string> }[] = [
  {
    key: 'q12',
    label: '12. 행사의 전체 소요 시간은 적절했습니까?',
    optionLabels: APPROPRIATE_5_LABELS,
  },
  {
    key: 'q13',
    label: '13. 행사 일정(요일/시간대)은 참석하기에 적절했습니까?',
    optionLabels: APPROPRIATE_5_LABELS,
  },
  {
    key: 'q14',
    label: '14. 행사장까지의 교통 접근성은 어땠습니까?',
    optionLabels: CONVENIENT_5_LABELS,
  },
  {
    key: 'q15',
    label: '15. 주차 시설은 이용하기 편리했습니까?',
    optionLabels: CONVENIENT_5_LABELS,
  },
  {
    key: 'q16',
    label: '16. 행사장 내 이동 동선 및 안내 표지판은 적절했습니까?',
    optionLabels: APPROPRIATE_5_LABELS,
  },
]

export const SURVEY_OPERATIONS_ITEMS = Q12_16_ITEMS

function countBuckets(
  values: string[],
  labels: Record<string, string>,
): CountBucket[] {
  const total = values.length
  const counts = new Map<string, number>()
  for (const v of values) {
    if (!v) continue
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  const rows: CountBucket[] = []
  // labels 의 순서를 유지 (정의된 것만 포함)
  for (const [key, label] of Object.entries(labels)) {
    const count = counts.get(key) ?? 0
    rows.push({
      key,
      label,
      count,
      ratio: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    })
  }
  return rows
}

function ageBucket(age: number): string {
  if (age < 30) return 'under_30'
  if (age < 40) return '30s'
  if (age < 50) return '40s'
  if (age < 60) return '50s'
  return '60_plus'
}

const AGE_LABELS: Record<string, string> = {
  under_30: '20대 이하',
  '30s': '30대',
  '40s': '40대',
  '50s': '50대',
  '60_plus': '60대 이상',
}

function likertSection(
  key: string,
  label: string,
  items: { key: string; label?: string; left?: string; right?: string }[],
  extract: (row: Survey) => Record<string, number | null> | null | undefined,
  rows: Survey[],
  max: number,
): LikertSection {
  const subItems: LikertSubItem[] = items.map((it) => {
    const values: (number | null)[] = []
    const dist = Array.from({ length: max }, () => 0)
    for (const row of rows) {
      const group = extract(row)
      if (!group) continue
      const v = toNumber(group[it.key])
      values.push(v)
      if (v !== null && v >= 1 && v <= max) dist[v - 1] += 1
    }
    // Q8 은 left/right 양극단 라벨 → 한 줄로 합쳐서 표시
    const displayLabel =
      it.label ??
      (it.left && it.right ? `${it.left} ↔ ${it.right}` : it.key)
    return {
      key: it.key,
      label: displayLabel,
      avg100: to100Avg(values, max),
      distribution: dist,
      max,
    }
  })
  // 섹션 평균 = 모든 하위 문항 평균들의 평균
  const valid = subItems
    .map((it) => it.avg100)
    .filter((v): v is number => v !== null)
  const sectionAvg100 =
    valid.length > 0
      ? Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10
      : null
  return { key, label, sectionAvg100, items: subItems }
}

/** 전체 통계 계산 — raw rows → SurveyStats */
export function calcSurveyStats(rows: Survey[]): SurveyStats {
  const total = rows.length

  // 평균 연령
  const avgAge =
    total > 0 ? Math.round((rows.reduce((a, r) => a + r.age, 0) / total) * 10) / 10 : null

  // 응답자 정보
  const gender = countBuckets(
    rows.map((r) => r.gender),
    GENDER_LABELS,
  )
  const ageBuckets = countBuckets(
    rows.map((r) => ageBucket(r.age)),
    AGE_LABELS,
  )
  const regions = countBuckets(
    rows.map((r) => r.region),
    REGION_LABELS,
  )

  // 최다 지역 — 카운트 기준 최고
  let topRegion: SurveyStats['topRegion'] = null
  for (const r of regions) {
    if (!topRegion || r.count > topRegion.count) {
      topRegion = r.count > 0 ? { key: r.key, label: r.label, count: r.count, ratio: r.ratio } : topRegion
    }
  }

  // answers 에서 종교/정보출처/희망프로그램 추출
  const religionVals: string[] = []
  const religionSinceVals: string[] = []
  const religionFreqVals: string[] = []
  const pastReligionVals: string[] = []
  const q3Vals: string[] = []
  const q3_1Vals: string[] = []
  const pastParticipationVals: string[] = []
  const decisionMakerVals: string[] = []
  const expectationVals: string[] = []
  const infoSourceVals: string[] = []
  const futureVals: string[] = []

  const q11Values: (number | null)[] = [] // 종합 만족도 (7점)
  const q11_1Samples: string[] = []
  const q11_2Samples: string[] = []
  const q20Samples: string[] = []

  for (const row of rows) {
    const a = (row.answers ?? {}) as Record<string, unknown>
    if (typeof a.q1 === 'string') religionVals.push(a.q1)
    if (typeof a.q1_1 === 'string') religionSinceVals.push(a.q1_1)
    if (typeof a.q1_2 === 'string') religionFreqVals.push(a.q1_2)
    if (typeof a.q2 === 'string') pastReligionVals.push(a.q2)
    if (typeof a.q3 === 'string') q3Vals.push(a.q3)
    if (typeof a.q3_1 === 'string') q3_1Vals.push(a.q3_1)
    if (typeof a.q4 === 'string') pastParticipationVals.push(a.q4)
    if (typeof a.q5 === 'string') decisionMakerVals.push(a.q5)
    if (typeof a.q7 === 'string') expectationVals.push(a.q7)
    if (Array.isArray(a.q6)) {
      for (const s of a.q6) if (typeof s === 'string') infoSourceVals.push(s)
    }
    if (Array.isArray(a.q19)) {
      for (const s of a.q19) if (typeof s === 'string') futureVals.push(s)
    }
    q11Values.push(toNumber(a.q11))
    if (typeof a.q11_1 === 'string' && a.q11_1.trim()) q11_1Samples.push(a.q11_1)
    if (typeof a.q11_2 === 'string' && a.q11_2.trim()) q11_2Samples.push(a.q11_2)
    if (typeof a.q20 === 'string' && a.q20.trim()) q20Samples.push(a.q20)
  }

  const religion = countBuckets(religionVals, RELIGION_LABELS)
  const religionSince = countBuckets(religionSinceVals, RELIGION_SINCE_LABELS)
  const religionFrequency = countBuckets(religionFreqVals, RELIGION_FREQ_LABELS)

  // 종합 만족도
  const overallSatisfactionAvg100 = to100Avg(q11Values, 7)
  const overallSatisfactionTopBox = topBoxRatio7(q11Values)

  // 섹션별 (라이커트) — 폼의 하위 문항 라벨을 그대로 사용
  const sections: LikertSection[] = [
    likertSection(
      'q8',
      '행사 이미지 (문8)',
      IMAGE_ITEMS,
      (row) => (row.answers as Record<string, unknown>)?.q8 as Record<string, number | null>,
      rows,
      7,
    ),
    likertSection(
      'q9',
      '내용 및 품질 (문9)',
      Q9_ITEMS,
      (row) => (row.answers as Record<string, unknown>)?.q9 as Record<string, number | null>,
      rows,
      7,
    ),
    likertSection(
      'q10',
      '주관기관 (문10)',
      Q10_ITEMS,
      (row) => (row.answers as Record<string, unknown>)?.q10 as Record<string, number | null>,
      rows,
      7,
    ),
    likertSection(
      'q17',
      '참여/추천 의향 (문17)',
      Q17_ITEMS,
      (row) => (row.answers as Record<string, unknown>)?.q17 as Record<string, number | null>,
      rows,
      7,
    ),
    likertSection(
      'q18',
      '행사 성과 (문18)',
      Q18_ITEMS,
      (row) => (row.answers as Record<string, unknown>)?.q18 as Record<string, number | null>,
      rows,
      7,
    ),
  ]

  // 운영 (Q12~Q16 5점) — flat 구조
  const operations: LikertSubItem[] = Q12_16_ITEMS.map((it) => {
    const values: (number | null)[] = []
    const dist = Array.from({ length: 5 }, () => 0)
    for (const row of rows) {
      const v = toNumber((row.answers as Record<string, unknown>)?.[it.key])
      values.push(v)
      if (v !== null && v >= 1 && v <= 5) dist[v - 1] += 1
    }
    return {
      key: it.key,
      label: it.label,
      avg100: to100Avg(values, 5),
      distribution: dist,
      max: 5,
    }
  })

  return {
    total,
    avgAge,
    topRegion,
    gender,
    ageBuckets,
    regions,
    religion,
    religionSince,
    religionFrequency,
    pastReligion: countBuckets(pastReligionVals, RELIGION_LABELS),
    religionInfluencePersonal: countBuckets(q3Vals, INFLUENCE_LABELS),
    religionInfluenceSociety: countBuckets(q3_1Vals, INFLUENCE_LABELS),
    pastParticipation: countBuckets(pastParticipationVals, YES_NO_LABELS),
    decisionMaker: countBuckets(decisionMakerVals, DECISION_MAKER_LABELS),
    expectation: countBuckets(expectationVals, EXPECTATION_LABELS),
    overallSatisfactionAvg100,
    overallSatisfactionTopBox,
    sections,
    operations,
    infoSources: countBuckets(infoSourceVals, INFO_SOURCE_LABELS),
    futurePrograms: countBuckets(futureVals, FUTURE_PROGRAM_LABELS),
    openComments: {
      q11_1: q11_1Samples,
      q11_2: q11_2Samples,
      q20: q20Samples,
    },
  }
}

// ─────────────────────────────────────────────────────────────────
// localStorage 기반 디바이스 중복 방지
// ─────────────────────────────────────────────────────────────────

const SURVEY_DONE_KEY = 'survey_done'

export function hasSurveyDoneLocally(): boolean {
  try {
    return localStorage.getItem(SURVEY_DONE_KEY) === 'true'
  } catch {
    return false
  }
}

export function markSurveyDoneLocally(): void {
  try {
    localStorage.setItem(SURVEY_DONE_KEY, 'true')
  } catch {
    /* 시크릿 모드 등 localStorage 불가 — 무시 */
  }
}

/** 오늘 날짜 KST YYYY-MM-DD */

/**
 * 만족도 조사 제출 — 같은 phone + festival_id 조합은 DB unique 제약으로 차단.
 * 중복 제출 시 에러 메시지 한국어로 변환해서 throw.
 */

export interface SubmitSurveyInput {
  festivalId: string | null
  gender: 'male' | 'female'
  age: number
  region: string
  name: string
  phone: string
  privacyConsented: boolean
  answers: Record<string, unknown>
}

export interface SubmitSurveyResult {
  survey: Survey
  coupon: Coupon
}

/**
 * 설문 제출 + 자동 쿠폰 발급 (원자성 없음, 2단계).
 *
 *  1. 기존 설문 쿠폰 존재 여부 선체크 → 있으면 DuplicateSurveyCouponError
 *     (설문 insert 자체를 차단. 데이터 오염 방지)
 *  2. surveys insert (기존 phone+festival unique 제약은 유지)
 *  3. 쿠폰 insert. 만약 (1) 과 (3) 사이 레이스로 unique 위반 나면
 *     설문은 이미 저장된 상태라 어드민에서 수동 재발급 필요 (로그만 throw)
 */
export async function submitSurvey(
  input: SubmitSurveyInput,
): Promise<SubmitSurveyResult> {
  // 1) 중복 쿠폰 사전 체크
  if (await hasSurveyCouponByPhone(input.phone)) {
    throw new DuplicateSurveyCouponError()
  }

  // 2) 설문 insert
  const { data, error } = await supabase
    .from('surveys')
    .insert({
      festival_id: input.festivalId,
      gender: input.gender,
      age: input.age,
      region: input.region,
      name: input.name,
      phone: input.phone,
      privacy_consented: input.privacyConsented,
      answers: input.answers as Json,
    })
    .select()
    .single()

  if (error) {
    // Postgres unique violation — 같은 phone+festival 재제출
    if (error.code === '23505') {
      throw new Error('이미 제출하신 연락처입니다. 설문은 한 번만 참여 가능합니다.')
    }
    throw new Error(error.message || '설문 제출에 실패했습니다.')
  }

  // 3) 쿠폰 자동 발급
  const coupon = await issueSurveyCoupon(input.phone)

  return { survey: data as Survey, coupon }
}
