/**
 * 부스 대시보드용 소리 재생 유틸 (low-level).
 *
 * 사운드 파일
 *  - /sounds/order_alarm.mp3   — 미확인 주문 알람 (≈ 3.5s)
 *  - /sounds/order_overdue.mp3 — 조리 지연 알람
 *
 * 정책
 *  - `playSound(repeat)` 기본 3회 순차 재생 (겹침 방지 위해 await)
 *  - 실패 (autoplay 차단 / 파일 없음 / 로딩 에러) 는 조용히 무시
 *  - **글로벌 락 없음** — 호출 직렬화는 상위 레이어(`alarmEngine`)가 담당.
 *    (예전 글로벌 `playing` 락이 stuck 되면 25초간 모든 알람을 silent drop
 *    하던 현장 버그가 있었음. 락을 빼고 큐 기반 엔진으로 이관.)
 *  - iOS Safari autoplay 정책 — 사용자 제스처 이후에만 재생 가능.
 *    `unlockAudio()` 를 로그인 버튼 클릭 등 제스처 이벤트에서 호출해
 *    AudioContext 를 미리 깨워두면 이후 자동 재생이 통과함.
 *
 * 락 안전망 (per-iter)
 *  - Android Chrome 에서 `audio.play()` 가 resolve/reject 둘 다 안 나오는
 *    케이스가 있어 iter 타임아웃(7s)으로 영구 hang 을 방지한다.
 *  - iter 내부에서 1회 실패 시 `unlockAudio()` 후 200ms 뒤 재시도. 부스
 *    태블릿 PWA standalone 에서 audio block 인 상황의 사실상 유일한 복구
 *    메커니즘 — 제거하면 mp3 가 영영 안 울리는 사례 확인됨.
 */

const SOUNDS = {
  order: '/sounds/order_alarm.mp3',
  overdue: '/sounds/order_overdue.mp3',
} as const

export type SoundKey = keyof typeof SOUNDS

const ITER_TIMEOUT_MS = 7_000 // 1회 재생 (≈ 3.5s) + 재시도 여유 (3.5s)
const RETRY_DELAY_MS = 200

/**
 * 소리 재생. 기본 3회 순차 반복. Promise 는 마지막 반복 종료 시 resolve.
 * 실패는 조용히 무시 — 호출부에서 try/catch 불필요.
 *
 * **주의:** 글로벌 락 없음. 동시에 두 번 부르면 두 번 동시 재생됨.
 * 직렬화가 필요하면 `alarmEngine` 을 통해 호출할 것.
 */
export async function playSound(
  repeat: number = 3,
  sound: SoundKey = 'order',
): Promise<void> {
  const src = SOUNDS[sound]
  for (let i = 0; i < repeat; i += 1) {
    await playOnce(src)
  }
}

function playOnce(src: string): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false
    let attempt = 0
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(iterTimer)
      resolve()
    }
    const tryPlay = () => {
      if (settled) return
      try {
        const audio = new Audio(src)
        audio.onended = finish
        audio.onerror = onFail
        audio.play().catch(onFail)
      } catch {
        finish()
      }
    }
    const onFail = () => {
      if (settled) return
      if (attempt === 0) {
        attempt = 1
        unlockAudio()
        window.setTimeout(tryPlay, RETRY_DELAY_MS)
        return
      }
      finish()
    }
    const iterTimer = window.setTimeout(finish, ITER_TIMEOUT_MS)
    tryPlay()
  })
}

/**
 * iOS Safari / Android Chrome autoplay 우회 — 사용자 제스처 이벤트 또는
 * visibilitychange(→ visible) 직후에 호출해 AudioContext 를 unlock.
 * 무음 짧은 재생으로 unlock. 실패는 조용히 무시.
 *
 * 호출 지점
 *  - BoothLoginPage.handleSubmit 첫 줄 (최초 unlock)
 *  - BoothDashboardPage visibilitychange listener (포커스 복귀 시 재unlock)
 *  - BoothDashboardPage 30초 주기 interval (visibilitychange 안 뜨는 audio
 *    focus 빼앗김 케이스 보강)
 *  - playSound 의 iter 내부 첫 실패 시 (재시도 직전)
 */
export function unlockAudio(): void {
  try {
    const audio = new Audio(SOUNDS.order)
    audio.volume = 0
    void audio
      .play()
      .then(() => {
        audio.pause()
        audio.currentTime = 0
      })
      .catch(() => {
        /* 무시 */
      })
  } catch {
    /* 무시 */
  }
}
