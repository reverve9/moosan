/**
 * 매장 대기 현황 유틸 — booth_waiting_counts 뷰 fetch + label 계산.
 *
 * 두 가지 라벨 시스템:
 *  1) calcWaitingInfo(count, avgPrepMinutes) — 시간 기반 ("약 10분", "약 20분 이상")
 *     · BoothModal / CheckoutPage 의 "예상 시간" 표시에 사용
 *  2) getBoothBadge(count) — 카운트 기반 (여유 / 대기 N건 / 혼잡 N건)
 *     · FoodSections 매장 카드의 배지에 사용
 */

import { supabase } from './supabase'

/* ──────────────── 시간 기반 라벨 (모달/체크아웃) ──────────────── */

export interface WaitingInfo {
  count: number
  estimatedMinutes: number
  label: string
}

export function calcWaitingInfo(
  waitingCount: number,
  avgPrepMinutes: number,
): WaitingInfo {
  const estimatedMinutes = waitingCount * avgPrepMinutes

  let label: string
  if (waitingCount === 0) label = '대기 없음'
  else if (estimatedMinutes <= 5) label = '약 5분 이내'
  else if (estimatedMinutes <= 10) label = '약 10분'
  else if (estimatedMinutes <= 20) label = '약 20분'
  else label = `약 ${Math.ceil(estimatedMinutes / 10) * 10}분 이상`

  return { count: waitingCount, estimatedMinutes, label }
}

/* ──────────────── 카운트 기반 배지 (매장 카드) ──────────────── */

export type BoothBadgeLevel = 'free' | 'busy' | 'crowded'

export interface BoothBadge {
  level: BoothBadgeLevel
  label: string
}

export function getBoothBadge(waitingCount: number): BoothBadge {
  if (waitingCount === 0) return { level: 'free', label: '여유' }
  if (waitingCount <= 5) return { level: 'busy', label: `대기 ${waitingCount}건` }
  return { level: 'crowded', label: `혼잡 ${waitingCount}건` }
}

/* ──────────────── 뷰 fetch ──────────────── */

interface BoothWaitingRow {
  booth_id: string
  waiting_count: number
}

/**
 * booth_waiting_counts 뷰 일괄 fetch.
 * LEFT JOIN 덕분에 모든 활성 부스가 행으로 들어옴 (0건 매장도 0 으로).
 * Map<booth_id, waiting_count> 반환.
 */
export async function fetchAllBoothWaitingCounts(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('booth_waiting_counts')
    .select('booth_id, waiting_count')

  if (error || !data) return new Map()

  const map = new Map<string, number>()
  for (const row of data as BoothWaitingRow[]) {
    map.set(row.booth_id, row.waiting_count)
  }
  return map
}

/**
 * 단일 booth 의 waiting_count fetch — Realtime 이벤트 발생 시 해당 booth 만 갱신.
 * 행이 없으면 0 (LEFT JOIN 덕분에 일반적으로 항상 행 있음).
 */
export async function fetchBoothWaitingCount(boothId: string): Promise<number> {
  const { data, error } = await supabase
    .from('booth_waiting_counts')
    .select('waiting_count')
    .eq('booth_id', boothId)
    .maybeSingle()

  if (error || !data) return 0
  return (data as { waiting_count: number }).waiting_count
}

/* ──────────────── 다수 booth 요약 fetch (CheckoutPage 용) ──────────────── */

export interface BoothWaitingSummary {
  boothId: string
  boothName: string
  count: number
  avgPrepMinutes: number
}

/**
 * 주어진 booth_id 들에 대해 [부스명 + 대기건수 + avg_prep_minutes] 를 한 번에 fetch.
 * food_booths + booth_waiting_counts 두 쿼리를 병렬로 돌려 client 에서 합침.
 * CheckoutPage 의 부스별 대기 요약 표시용.
 */
export async function fetchBoothWaitingSummariesByIds(
  boothIds: string[],
): Promise<BoothWaitingSummary[]> {
  if (boothIds.length === 0) return []

  const [boothsRes, countsRes] = await Promise.all([
    supabase
      .from('food_booths')
      .select('id, name, avg_prep_minutes')
      .in('id', boothIds),
    supabase
      .from('booth_waiting_counts')
      .select('booth_id, waiting_count')
      .in('booth_id', boothIds),
  ])

  if (boothsRes.error || !boothsRes.data) return []

  const countMap = new Map<string, number>()
  for (const row of (countsRes.data ?? []) as BoothWaitingRow[]) {
    countMap.set(row.booth_id, row.waiting_count)
  }

  return (boothsRes.data as { id: string; name: string; avg_prep_minutes: number }[]).map(
    (b) => ({
      boothId: b.id,
      boothName: b.name,
      count: countMap.get(b.id) ?? 0,
      avgPrepMinutes: b.avg_prep_minutes,
    }),
  )
}
