import { useEffect, useState } from 'react'
import {
  forceReconnect,
  getRealtimeHealth,
  type RealtimeHealthState,
  type RealtimeHealthStatus,
  subscribeRealtimeHealth,
} from '@/lib/realtimeHealth'

export interface UseRealtimeHealthResult {
  status: RealtimeHealthStatus
  degradedSince: number | null
  forceReconnect: () => void
}

/**
 * supabase realtime 글로벌 연결 상태를 구독하는 훅.
 * 첫 mount 시점에 polling 이 시작되며 이후로는 unmount 와 무관하게 유지된다.
 */
export function useRealtimeHealth(): UseRealtimeHealthResult {
  const [state, setState] = useState<RealtimeHealthState>(getRealtimeHealth)

  useEffect(() => {
    const unsub = subscribeRealtimeHealth(setState)
    return unsub
  }, [])

  return {
    status: state.status,
    degradedSince: state.degradedSince,
    forceReconnect,
  }
}
