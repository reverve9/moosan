/**
 * 부스 대시보드용 소리 재생 유틸.
 *
 * 사운드 파일
 *  - /sounds/order_alarm.mp3 — 미확인 주문 1분 간격 알람
 *
 * 정책
 *  - `playSound(repeat)` 기본 3회 순차 재생 (겹침 방지 위해 await)
 *  - 실패 (autoplay 차단 / 파일 없음 / 로딩 에러) 는 조용히 무시
 *  - iOS Safari autoplay 정책 — 사용자 제스처 이후에만 재생 가능.
 *    `unlock()` 을 로그인 버튼 클릭 등 제스처 이벤트에서 호출해
 *    AudioContext 를 미리 깨워두면 이후 자동 재생이 통과함.
 */

const SOUNDS = {
  order: '/sounds/order_alarm.mp3',
  overdue: '/sounds/order_overdue.mp3',
} as const

type SoundKey = keyof typeof SOUNDS

let playing = false

/**
 * 소리 재생. 기본 3회 순차 반복. Promise 는 마지막 반복 종료 시 resolve.
 * 다른 사운드 재생 중이면 스킵 (겹침 방지).
 * 실패는 조용히 무시 — 호출부에서 try/catch 불필요.
 */
export async function playSound(repeat: number = 3, sound: SoundKey = 'order'): Promise<void> {
  if (playing) return
  playing = true
  const src = SOUNDS[sound]
  for (let i = 0; i < repeat; i += 1) {
    await new Promise<void>((resolve) => {
      try {
        const audio = new Audio(src)
        audio.onended = () => resolve()
        audio.onerror = () => resolve()
        audio.play().catch(() => resolve())
      } catch {
        resolve()
      }
    })
  }
  playing = false
}

/**
 * iOS Safari autoplay 우회 — 사용자 제스처 이벤트 핸들러 안에서 한 번 호출.
 * 무음 짧은 재생으로 AudioContext unlock. 실패는 조용히 무시.
 *
 * 호출 예: BoothLoginPage.handleSubmit 첫 줄.
 */
export function unlockAudio(): void {
  try {
    const audio = new Audio(SOUNDS.order)
    audio.volume = 0
    void audio.play().then(() => {
      // 재생 성공 후 즉시 정지 — AudioContext 는 unlocked 상태로 남음
      audio.pause()
      audio.currentTime = 0
    }).catch(() => {
      /* 무시 */
    })
  } catch {
    /* 무시 */
  }
}
