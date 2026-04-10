import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  fetchMonitorSummary,
  type MonitorBoothSummary,
  type MonitorConfirmedRow,
  subscribeMonitor,
} from '@/lib/boothMonitor'

/**
 * 어드민 전역 알림 상태 — AdminLayout 이 인증된 동안 1회 구독.
 *
 * 책임
 *  - `fetchMonitorSummary` 초기 로드 + realtime 변화 시 재조회
 *  - 1초 tick 으로 `now` 업데이트 → elapsed 재계산
 *  - `WARN_SECONDS` (1분) / `ALERT_SECONDS` (2분) 임계 초과 주문 수 집계
 *
 * 소비자
 *  - AdminLayout: 사이드바 배지 숫자/색, document.title
 *  - AdminMonitor: 스탯 박스, 카드 강조, 상단 배너, 부스 그리드, 상세 모달
 *    (자체 fetch/subscribe/tick 없이 이 context 만 구독)
 */

export const WARN_SECONDS = 60   // 1분 초과 = 주황 경고
export const ALERT_SECONDS = 120 // 2분 초과 = 빨강 경보
const TICK_MS = 1_000

export function elapsedSeconds(iso: string, nowMs: number): number {
  const t = new Date(iso).getTime()
  return Math.max(0, Math.floor((nowMs - t) / 1000))
}

export interface AdminAlertValue {
  summaries: MonitorBoothSummary[]
  confirmedOrders: MonitorConfirmedRow[]
  now: number
  /** 2분 초과 주문 수 (빨강 경보) */
  alertCount: number
  /** 1분 초과 주문 수 (주황 경고) */
  warnCount: number
  /** 전체 미확인 주문 수 */
  totalPending: number
  /** 조리시간 초과 주문 수 (confirmed_at + estimated_minutes + 1분 초과) */
  overdueCount: number
  loading: boolean
  error: string | null
  refreshing: boolean
  /** 수동 새로고침 — AdminMonitor 의 새로고침 버튼용 */
  refetch: () => Promise<void>
}

const AdminAlertContext = createContext<AdminAlertValue | null>(null)

export function AdminAlertProvider({ children }: { children: ReactNode }) {
  const [summaries, setSummaries] = useState<MonitorBoothSummary[]>([])
  const [confirmedOrders, setConfirmedOrders] = useState<MonitorConfirmedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const applyData = useCallback((data: { summaries: MonitorBoothSummary[]; confirmedOrders: MonitorConfirmedRow[] }) => {
    setSummaries(data.summaries)
    setConfirmedOrders(data.confirmedOrders)
    setError(null)
  }, [])

  const refetch = useCallback(async () => {
    setRefreshing(true)
    try {
      applyData(await fetchMonitorSummary())
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터 조회 실패')
    } finally {
      setRefreshing(false)
    }
  }, [applyData])

  // 초기 로드 + realtime 구독 (AdminLayout 인증 이후 provider 가 mount 됨)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const data = await fetchMonitorSummary()
        if (cancelled) return
        applyData(data)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : '데이터 조회 실패')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    const unsub = subscribeMonitor(() => {
      void (async () => {
        try {
          const data = await fetchMonitorSummary()
          if (!cancelled) applyData(data)
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : '데이터 조회 실패')
        }
      })()
    }, 'admin-alert-context')

    return () => {
      cancelled = true
      unsub()
    }
  }, [applyData])

  // 1초 tick — elapsed 재계산 트리거
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  const { totalPending, warnCount, alertCount } = useMemo(() => {
    let pending = 0
    let warn = 0
    let alert = 0
    for (const s of summaries) {
      pending += s.count
      for (const o of s.orders) {
        const e = elapsedSeconds(o.paid_at, now)
        if (e >= ALERT_SECONDS) {
          alert += 1
        } else if (e >= WARN_SECONDS) {
          warn += 1
        }
      }
    }
    return { totalPending: pending, warnCount: warn, alertCount: alert }
  }, [summaries, now])

  const overdueCount = useMemo(() => {
    let count = 0
    for (const o of confirmedOrders) {
      const confirmedMs = new Date(o.confirmed_at).getTime()
      const deadline = confirmedMs + (o.estimated_minutes + 1) * 60 * 1000
      if (now > deadline) count += 1
    }
    return count
  }, [confirmedOrders, now])

  const value = useMemo<AdminAlertValue>(
    () => ({
      summaries,
      confirmedOrders,
      now,
      alertCount,
      warnCount,
      totalPending,
      overdueCount,
      loading,
      error,
      refreshing,
      refetch,
    }),
    [summaries, confirmedOrders, now, alertCount, warnCount, totalPending, overdueCount, loading, error, refreshing, refetch],
  )

  return <AdminAlertContext.Provider value={value}>{children}</AdminAlertContext.Provider>
}

export function useAdminAlert(): AdminAlertValue {
  const ctx = useContext(AdminAlertContext)
  if (!ctx) throw new Error('useAdminAlert must be used within AdminAlertProvider')
  return ctx
}
