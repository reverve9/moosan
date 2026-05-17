import { useEffect } from 'react'

/**
 * Screen Wake Lock API — 탭이 활성인 동안 화면 꺼짐/절전 방지.
 * 부스 태블릿에서 오랫동안 주문 대시보드만 띄워둘 때 보험.
 *
 * 정책
 *  - 미지원 브라우저 / 비HTTPS / 실패 → no-op
 *  - 탭 비활성 시 브라우저가 자동으로 release → visibilitychange 에서 재요청
 *  - 시스템 사유 release (저전력/포커스 빼앗김 등) 는 onrelease 이벤트로
 *    sentinel 참조 해제 → 다음 visibility 체크에서 재취득 가능
 *  - 언마운트 시 수동 release
 *
 * 주의 — iOS Safari 는 최근 버전까지도 미지원. 탭 자체 keep-awake 설정이
 * 1차 방어선이고, 이 훅은 보조.
 */
type WakeLockSentinelLike = {
  release: () => Promise<void> | void
  addEventListener?: (type: 'release', listener: () => void) => void
  removeEventListener?: (type: 'release', listener: () => void) => void
}

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>
  }
}

export function useWakeLock(enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return

    let sentinel: WakeLockSentinelLike | null = null
    let cancelled = false

    const acquire = async () => {
      const nav = navigator as WakeLockNavigator
      if (!nav.wakeLock) return
      try {
        const s = await nav.wakeLock.request('screen')
        if (cancelled) {
          await s.release()
          return
        }
        sentinel = s
        // 시스템 사유 release 시 sentinel 참조 해제 — 다음 visibilitychange
        // 의 `!sentinel` 분기로 재취득 시도 가능. 해제 안 하면 sentinel 이
        // 살아있다고 판단해 영원히 재취득 못 함.
        s.addEventListener?.('release', () => {
          if (sentinel === s) sentinel = null
        })
      } catch {
        // 조용히 무시 — 권한/지원 문제
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinel) {
        void acquire()
      }
    }

    void acquire()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibility)
      if (sentinel) {
        void sentinel.release()
        sentinel = null
      }
    }
  }, [enabled])
}
