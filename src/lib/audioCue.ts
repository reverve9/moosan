/**
 * 부스 대시보드용 소리 재생 유틸 — Web Audio API 기반.
 *
 * 사운드 파일
 *  - /sounds/order_alarm.mp3   — 미확인 주문 1분 간격 알람 (≈ 3.5s)
 *  - /sounds/order_overdue.mp3 — 조리 지연 알람
 *
 * 정책
 *  - `playSound(repeat)` 기본 3회 순차 재생 (겹침 방지 위해 await)
 *  - 실패 (autoplay 차단 / 파일 로드 실패 / 디코드 실패) 는 조용히 무시
 *  - iOS Safari / Android Chrome autoplay 정책 — AudioContext 는 사용자
 *    제스처 이후에 resume 해야 'running' 상태가 됨.
 *    `unlockAudio()` 를 로그인 버튼 클릭 등 제스처 이벤트에서 호출.
 *
 * Web Audio API 채택 이유 (HTMLMediaElement → 전환)
 *  - `audio.play()` 가 Android Chrome 일부 케이스에서 promise resolve/reject
 *    둘 다 안 나오는 hang 발생 → 부스 알람 27초 지연 직접 원인
 *  - `AudioBufferSourceNode.start()` 는 동기 — 호출 즉시 성공/실패. hang X
 *  - `AudioContext.state` 로 'running'/'suspended'/'closed' 명시적 확인 가능
 *  - `AudioContext.resume()` 으로 suspended → running 명시적 복구
 *
 * 버퍼 prewarm — 첫 getCtx() 시 양쪽 mp3 fetch + decode 비동기 진행.
 * 첫 playSound 가 즉시 호출되어도 decode 가 늦으면 그 호출만 skip되고
 * 다음 trigger 부터 정상 발화.
 */

const SOUNDS = {
  order: '/sounds/order_alarm.mp3',
  overdue: '/sounds/order_overdue.mp3',
} as const

type SoundKey = keyof typeof SOUNDS

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

let audioCtx: AudioContext | null = null
const buffers = new Map<SoundKey, AudioBuffer>()
const loading = new Map<SoundKey, Promise<void>>()
let playing = false

function getCtx(): AudioContext | null {
  if (audioCtx && audioCtx.state !== 'closed') return audioCtx
  if (typeof window === 'undefined') return null
  try {
    const w = window as WebkitWindow
    const Ctx = window.AudioContext ?? w.webkitAudioContext
    if (!Ctx) return null
    audioCtx = new Ctx()
    // 첫 생성 직후 양쪽 버퍼 prewarm (비동기 — 실패해도 무시)
    void ensureBuffer('order')
    void ensureBuffer('overdue')
  } catch {
    audioCtx = null
    return null
  }
  return audioCtx
}

async function ensureBuffer(key: SoundKey): Promise<void> {
  if (buffers.has(key)) return
  const existing = loading.get(key)
  if (existing) return existing
  const ctx = getCtx()
  if (!ctx) return
  const p = (async () => {
    try {
      const res = await fetch(SOUNDS[key])
      if (!res.ok) return
      const arr = await res.arrayBuffer()
      const buf = await ctx.decodeAudioData(arr)
      buffers.set(key, buf)
    } catch {
      /* 무시 — 다음 호출에서 재시도 */
    } finally {
      loading.delete(key)
    }
  })()
  loading.set(key, p)
  return p
}

/**
 * 소리 재생. 기본 3회 순차 반복. Promise 는 마지막 반복 종료 시 resolve.
 * 다른 사운드 재생 중이면 스킵 (겹침 방지).
 * 실패는 조용히 무시 — 호출부에서 try/catch 불필요.
 */
export async function playSound(repeat: number = 3, sound: SoundKey = 'order'): Promise<void> {
  if (playing) return
  playing = true
  try {
    await ensureBuffer(sound)
    const ctx = getCtx()
    const buf = buffers.get(sound)
    if (!ctx || !buf) return
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch {
        return
      }
    }
    if (ctx.state !== 'running') return
    for (let i = 0; i < repeat; i += 1) {
      await new Promise<void>((resolve) => {
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          resolve()
        }
        try {
          const src = ctx.createBufferSource()
          src.buffer = buf
          src.connect(ctx.destination)
          src.onended = finish
          src.start()
          // 안전망 — onended 가 안 오는 드문 케이스 대비. buffer 길이 + 0.5s.
          window.setTimeout(finish, buf.duration * 1000 + 500)
        } catch {
          finish()
        }
      })
    }
  } finally {
    playing = false
  }
}

/**
 * AudioContext unlock — 사용자 제스처 이벤트에서 호출.
 * suspended 상태면 resume 시도. 미지원/실패는 조용히 무시.
 *
 * 호출 지점
 *  - BoothLoginPage.handleSubmit 첫 줄 (최초 unlock)
 *  - BoothDashboardPage visibilitychange listener (포커스 복귀 시 재unlock)
 *  - BoothDashboardPage 30초 주기 interval (audio focus 빼앗김 보강)
 */
export function unlockAudio(): void {
  const ctx = getCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {
      /* 무시 */
    })
  }
}
