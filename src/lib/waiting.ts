/**
 * 매장 대기 현황 유틸 — booth_waiting_counts 뷰 fetch + label 계산.
 *
 * getBoothBadge(count) — 카운트 기반 (여유 / 대기 N건 / 혼잡 N건)
 *   · FoodSections 매장 카드의 배지에 사용
 */

import { supabase } from './supabase'

/* ──────────────── 카운트 기반 배지 (매장 카드) ──────────────── */

export type BoothBadgeLevel = 'free' | 'busy' | 'crowded'

export interface BoothBadge {
  level: BoothBadgeLevel
  label: string
}

export function getBoothBadge(waitingCount: number): BoothBadge {
  if (waitingCount === 0) return { level: 'free', label: '여유' }
  if (waitingCount <= 3) return { level: 'busy', label: `대기 ${waitingCount}건` }
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
