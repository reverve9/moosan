/**
 * 부스 대시보드용 소리 재생 유틸.
 *
 * 사운드 파일
 *  - /sounds/order_alarm.mp3   — 미확인 주문 1분 간격 알람 (≈ 3.5s)
 *  - /sounds/order_overdue.mp3 — 조리 지연 알람
 *
 * 정책
 *  - `playSound(repeat)` 기본 3회 순차 재생 (겹침 방지 위해 await)
 *  - 실패 (autoplay 차단 / 파일 없음 / 로딩 에러) 는 조용히 무시
 *  - iOS Safari autoplay 정책 — 사용자 제스처 이후에만 재생 가능.
 *    `unlockAudio()` 를 로그인 버튼 클릭 등 제스처 이벤트에서 호출해
 *    AudioContext 를 미리 깨워두면 이후 자동 재생이 통과함.
 *
 * 락 안전망
 *  - Android Chrome 에서 `audio.play()` 가 resolve/reject 둘 다 안 나오는
 *    케이스가 있어 (audio focus 빼앗김 / 백그라운드 전환 직후 등),
 *    iter 단위 타임아웃 + 전체 락 타임아웃으로 영구 lock 을 방지한다.
 *    이 안전망이 없으면 한 번 hang 한 뒤로는 새 주문/1분 반복/지연 알람이
 *    모두 silent skip 됨.
 */

const SOUNDS = {
  order: '/sounds/order_alarm.mp3',
  overdue: '/sounds/order_overdue.mp3',
} as const

type SoundKey = keyof typeof SOUNDS

const ITER_TIMEOUT_MS = 5_000        // 1회 재생 (≈ 3.5s) + 여유
const PLAY_LOCK_TIMEOUT_MS = 15_000  // repeat=3 (≈ 10.5s) + 여유

let playing = false

/**
 * 소리 재생. 기본 3회 순차 반복. Promise 는 마지막 반복 종료 시 resolve.
 * 다른 사운드 재생 중이면 스킵 (겹침 방지).
 * 실패는 조용히 무시 — 호출부에서 try/catch 불필요.
 */
export async function playSound(repeat: number = 3, sound: SoundKey = 'order'): Promise<void> {
  if (playing) return
  playing = true
  const lockTimer = window.setTimeout(() => { playing = false }, PLAY_LOCK_TIMEOUT_MS)
  try {
    const src = SOUNDS[sound]
    for (let i = 0; i < repeat; i += 1) {
      await new Promise<void>((resolve) => {
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          window.clearTimeout(iterTimer)
          resolve()
        }
        const iterTimer = window.setTimeout(finish, ITER_TIMEOUT_MS)
        try {
          const audio = new Audio(src)
          audio.onended = finish
          audio.onerror = finish
          audio.play().catch(finish)
        } catch {
          finish()
        }
      })
    }
  } finally {
    window.clearTimeout(lockTimer)
    playing = false
  }
}

/**
 * iOS Safari / Android Chrome autoplay 우회 — 사용자 제스처 이벤트 또는
 * visibilitychange(→ visible) 직후에 호출해 AudioContext 를 unlock.
 * 무음 짧은 재생으로 unlock. 실패는 조용히 무시.
 *
 * 호출 지점
 *  - BoothLoginPage.handleSubmit 첫 줄 (최초 unlock)
 *  - BoothDashboardPage visibilitychange listener (포커스 복귀 시 재unlock)
 */
export function unlockAudio(): void {
  try {
    const audio = new Audio(SOUNDS.order)
    audio.volume = 0
    void audio.play().then(() => {
      audio.pause()
      audio.currentTime = 0
    }).catch(() => {
      /* 무시 */
    })
  } catch {
    /* 무시 */
  }
}
