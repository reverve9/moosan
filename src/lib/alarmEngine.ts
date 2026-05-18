/**
 * 부스 대시보드 알람 큐 엔진.
 *
 * 배경
 *  - 기존 `audioCue.playSound` 는 글로벌 `playing` 락으로 중복 재생을 막았는데,
 *    autoplay/audio focus 실패로 락이 stuck 되면 25초 동안 들어온 모든 알람이
 *    silent drop 되는 현장 버그가 있었음 (2026-05 첫 행사).
 *  - 또 트리거 6곳(realtime onOrderPaid / SW push / unconfirmed transition /
 *    visibilitychange / 1분 recall / overdue) 이 같은 락을 두고 경합해 어느
 *    것이 silent drop 될지 비결정적이었음.
 *
 * 설계
 *  - 큐 기반 직렬 재생. `playSound` 호출은 이 엔진 한 곳에서만 (`runOne` 내부).
 *  - 알람 종류 3가지: `newOrder` / `overdue` / `recall`. 큐는 각 종류 **최대 1개**
 *    만 유지 (coalesce). 재생 중 같은 종류가 또 enqueue 되어도 1개만 대기.
 *  - 우선순위: newOrder > overdue > recall. 다음 재생을 픽할 때 적용.
 *  - **인터럽트 없음** — 진행 중인 재생은 끝까지 (≤21초). 직관성/안전성 우선.
 *  - newOrder 는 optional dedup key 받아 짧은 TTL 내 같은 key 중복 호출을 무시
 *    (realtime + SW push 가 같은 주문에 대해 동시 발화하는 케이스 dedup).
 *
 * 노출 API
 *  - `enqueueNewOrderAlarm(orderId?)`: 신규 주문 알람. orderId 가 있으면 10초
 *    내 같은 id 재호출은 무시.
 *  - `enqueueRecallAlarm()`: 미확인 주문 리콜 알람.
 *  - `enqueueOverdueAlarm()`: 조리 지연 알람.
 *  - `testAlarm()`: 헬스체크용 즉시 1회 재생.
 *  - `isAlarmPlaying()`: 디버그/상태 인디케이터용.
 */

import { playSound } from './audioCue'

type AlarmKind = 'newOrder' | 'overdue' | 'recall'

const NEW_ORDER_DEDUP_TTL_MS = 10_000

let playing = false
const queue: Set<AlarmKind> = new Set()
const newOrderDedup = new Map<string, number>() // orderId → expiresAt(ms)

function pruneDedup(now: number): void {
  for (const [id, exp] of newOrderDedup) {
    if (exp <= now) newOrderDedup.delete(id)
  }
}

function pickNext(): AlarmKind | null {
  if (queue.has('newOrder')) return 'newOrder'
  if (queue.has('overdue')) return 'overdue'
  if (queue.has('recall')) return 'recall'
  return null
}

async function runOne(kind: AlarmKind): Promise<void> {
  const sound = kind === 'overdue' ? 'overdue' : 'order'
  await playSound(3, sound)
}

async function drainLoop(): Promise<void> {
  // 호출 측에서 playing=true 보장
  while (true) {
    const next = pickNext()
    if (!next) {
      playing = false
      return
    }
    queue.delete(next)
    try {
      await runOne(next)
    } catch {
      /* playSound 자체는 throw 하지 않지만 방어 */
    }
  }
}

function enqueueAndMaybeStart(kind: AlarmKind): void {
  queue.add(kind)
  if (playing) return
  playing = true
  void drainLoop()
}

/**
 * 신규 주문 알람. orderId 가 주어지면 10초 dedup.
 * - realtime onOrderPaid: orderId 전달 → dedup 적용
 * - SW push (orderId 없음): 인자 없이 호출 → 큐 coalesce 만 작동
 */
export function enqueueNewOrderAlarm(orderId?: string): void {
  if (orderId) {
    const now = Date.now()
    pruneDedup(now)
    if (newOrderDedup.has(orderId)) return
    newOrderDedup.set(orderId, now + NEW_ORDER_DEDUP_TTL_MS)
  }
  enqueueAndMaybeStart('newOrder')
}

/** 미확인 주문 리콜 알람 (1분 interval / 미확인 false→true transition). */
export function enqueueRecallAlarm(): void {
  enqueueAndMaybeStart('recall')
}

/** 조리시간 초과 알람. 동시 발생 다건은 큐에서 1개로 coalesce. */
export function enqueueOverdueAlarm(): void {
  enqueueAndMaybeStart('overdue')
}

/** 헬스체크/테스트 — 큐 안 거치고 즉시 1회 재생. */
export async function testAlarm(): Promise<void> {
  await playSound(1, 'order')
}

/** 현재 알람 재생/대기 중인지. 상태 인디케이터/디버그용. */
export function isAlarmPlaying(): boolean {
  return playing
}
