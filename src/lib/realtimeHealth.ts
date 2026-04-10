import { supabase } from './supabase'

/**
 * 전역 Supabase Realtime 연결 상태 추적 + 자동 복구.
 *
 * 동작:
 *  - 2초 간격으로 supabase.realtime 의 socket 상태를 폴링한다.
 *  - 활성 채널이 있는데 socket 이 끊긴 상태가 2틱(=4초) 이상 이어지면
 *    'degraded' 로 전환한다 (잠깐의 transient flicker 방지용 debounce).
 *  - degraded 상태가 FORCE_RECONNECT_AFTER_MS 를 넘어가면 supabase 의
 *    내장 reconnect 가 막혀 있을 가능성이 있으므로 manual disconnect →
 *    connect() 로 강제 재시도한다. 채널 객체는 그대로 유지되며 socket
 *    재연결 시 _onConnOpen() 안에서 자동 rejoin 된다.
 *  - 'healthy' 로 회복되면 즉시 통지.
 *
 * 호출자는 React 컴포넌트 mount 와 무관하게 한 번만 시작되며 (singleton),
 * 첫 구독 시점에 polling 이 시작된다.
 */

export type RealtimeHealthStatus = 'healthy' | 'degraded'

export interface RealtimeHealthState {
  status: RealtimeHealthStatus
  /** degraded 로 전환된 시점 (epoch ms). healthy 면 null */
  degradedSince: number | null
}

const POLL_INTERVAL_MS = 2_000
/** debounce — 이 횟수만큼 연속 down 이어야 degraded 로 인정 */
const DEGRADED_THRESHOLD_TICKS = 2
/** degraded 가 이 시간을 넘으면 강제 disconnect+connect 시도 */
const FORCE_RECONNECT_AFTER_MS = 15_000
/** 강제 재연결 시도 cooldown */
const RECONNECT_COOLDOWN_MS = 10_000

let state: RealtimeHealthState = {
  status: 'healthy',
  degradedSince: null,
}

const listeners = new Set<(s: RealtimeHealthState) => void>()
let everConnected = false
let consecutiveDownTicks = 0
let lastForceReconnectAt = 0
let started = false

function emit() {
  for (const listener of listeners) listener(state)
}

function setState(next: Partial<RealtimeHealthState>) {
  const merged = { ...state, ...next }
  if (merged.status === state.status && merged.degradedSince === state.degradedSince) {
    return
  }
  state = merged
  emit()
}

function tick() {
  const realtime = supabase.realtime
  const isConnected = realtime.isConnected()
  const hasChannels = realtime.getChannels().length > 0

  if (isConnected) {
    everConnected = true
    consecutiveDownTicks = 0
    if (state.status !== 'healthy') {
      setState({ status: 'healthy', degradedSince: null })
    }
    return
  }

  // 앱 시작 직후로 한 번도 연결되지 않았거나, 활성 채널이 없으면
  // socket 이 닫혀 있는 게 정상이므로 상태를 건드리지 않는다.
  if (!everConnected || !hasChannels) {
    consecutiveDownTicks = 0
    return
  }

  consecutiveDownTicks += 1

  if (consecutiveDownTicks >= DEGRADED_THRESHOLD_TICKS && state.status !== 'degraded') {
    setState({ status: 'degraded', degradedSince: Date.now() })
  }

  if (
    state.status === 'degraded' &&
    state.degradedSince !== null &&
    Date.now() - state.degradedSince > FORCE_RECONNECT_AFTER_MS &&
    Date.now() - lastForceReconnectAt > RECONNECT_COOLDOWN_MS &&
    !realtime.isConnecting()
  ) {
    forceReconnect()
  }
}

/**
 * 강제 disconnect → connect. supabase 내부 reconnectTimer 가 멈춰 있을
 * 가능성을 우회하기 위함. 채널 객체는 client.channels 배열에 그대로
 * 유지되며 _onConnOpen() 에서 joining 상태인 채널을 자동 rejoin 한다.
 */
export function forceReconnect(): void {
  lastForceReconnectAt = Date.now()
  try {
    supabase.realtime.disconnect()
  } catch {
    /* noop */
  }
  try {
    supabase.realtime.connect()
  } catch {
    /* noop */
  }
}

function start() {
  if (started) return
  started = true
  // 폴링 시작 전에 한 번 체크해서 초기 상태를 잡는다.
  tick()
  window.setInterval(tick, POLL_INTERVAL_MS)
}

export function subscribeRealtimeHealth(
  listener: (s: RealtimeHealthState) => void,
): () => void {
  start()
  listeners.add(listener)
  // 가입 즉시 현재 상태 1회 통지
  listener(state)
  return () => {
    listeners.delete(listener)
  }
}

export function getRealtimeHealth(): RealtimeHealthState {
  return state
}

