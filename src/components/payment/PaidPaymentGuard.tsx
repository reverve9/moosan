import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { clearPendingPaymentId, getPendingPaymentId } from '@/lib/paymentPending'

/**
 * 결제 후 어떤 클라이언트 시그널도 닿지 않아도 사용자가 본 사이트(같은 탭/새 탭/PWA 신규 인스턴스)
 * 어디로든 돌아오기만 하면 paid 전이를 감지해 /order/:pid 로 자동 이동시키는 사이트-와이드 가드.
 *
 * 동작:
 *   1) mount 또는 location 변화 시 sessionStorage→localStorage 순으로 pending id 조회
 *   2) 이미 /order/{pid} 또는 /payment/cancel 페이지면 가드 skip (목적지 도달 또는 명시 취소)
 *   3) 즉시 1회 status 체크 (noti.ts 가 이미 paid 시켰을 수 있음)
 *   4) Supabase realtime `payments.id=eq.{pid}` UPDATE 구독
 *   5) 2.5초 간격 polling fallback (최대 60회 ≒ 150초)
 *   6) status='paid' 감지 시 sessionStorage+localStorage 정리 후 /order/{pid}?from=checkout 으로 replace navigate
 *
 * Customer 모드 라우트 트리에만 마운트되어야 함 (booth/admin 무관).
 */
export default function PaidPaymentGuard() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const pid = getPendingPaymentId()
    if (!pid) return

    // 이미 결과/취소 페이지면 가드 동작 불필요
    if (location.pathname.startsWith(`/order/${pid}`)) return
    if (location.pathname === '/payment/cancel') return

    let stopped = false

    const goToOrder = () => {
      if (stopped) return
      stopped = true
      clearPendingPaymentId()
      navigate(`/order/${pid}?from=checkout`, { replace: true })
    }

    const checkOnce = async () => {
      if (stopped) return
      const { data, error } = await supabase
        .from('payments')
        .select('status')
        .eq('id', pid)
        .maybeSingle()
      if (stopped || error) return
      if (data?.status === 'paid') goToOrder()
    }

    void checkOnce()

    const channel = supabase
      .channel(`paid-guard-${pid}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'payments',
          filter: `id=eq.${pid}`,
        },
        (payload) => {
          const row = payload.new as { status?: string } | null
          if (row?.status === 'paid') goToOrder()
        },
      )
      .subscribe()

    let pollCount = 0
    const POLL_MAX = 60
    const intervalId = window.setInterval(() => {
      if (stopped) return
      pollCount += 1
      if (pollCount > POLL_MAX) {
        window.clearInterval(intervalId)
        return
      }
      void checkOnce()
    }, 2500)

    return () => {
      stopped = true
      window.clearInterval(intervalId)
      void supabase.removeChannel(channel)
    }
  }, [navigate, location.pathname])

  return null
}
