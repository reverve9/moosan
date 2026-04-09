import { RotateCw } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useRealtimeHealth } from '@/hooks/useRealtimeHealth'
import { useToast } from './Toast'
import styles from './ConnectionBanner.module.css'

/**
 * 상단 고정 배너 — supabase realtime 연결이 끊겼을 때만 노출.
 * 회복 시에는 한 번 toast 로 알린다.
 *
 * 부스 대시보드 / 어드민 레이아웃에 공통 마운트 한다.
 */
export default function ConnectionBanner() {
  const { status, forceReconnect } = useRealtimeHealth()
  const { showToast } = useToast()
  const wasDegradedRef = useRef(false)

  useEffect(() => {
    if (status === 'degraded') {
      wasDegradedRef.current = true
      return
    }
    if (status === 'healthy' && wasDegradedRef.current) {
      wasDegradedRef.current = false
      showToast('서버와 다시 연결되었습니다', { type: 'success' })
    }
  }, [status, showToast])

  if (status !== 'degraded') return null

  return (
    <div className={styles.banner} role="alert" aria-live="assertive">
      <span className={styles.dot} aria-hidden />
      <span className={styles.message}>실시간 연결이 끊겼습니다 — 다시 연결 중...</span>
      <button
        type="button"
        className={styles.retryBtn}
        onClick={forceReconnect}
      >
        <RotateCw className={styles.retryIcon} />
        <span>다시 시도</span>
      </button>
    </div>
  )
}
