import { useEffect, useRef } from 'react'
import { CreditCard, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import styles from './WaitingStep.module.css'

interface Props {
  paymentId: string | null
  orderNumbers: string[]
  onPaid: () => void
}

/**
 * 결제 대기 화면.
 *
 * payments[id=paymentId] 의 status='paid' 전이를 realtime 으로 감지 → onPaid().
 * 직원이 어드민 결제 대기 큐에서 `markPaymentPaid()` 호출하면 paid 로 전이.
 *
 * UI: 큰 안내 문구 + 주문번호 리스트. 헤더 "처음으로" 버튼은 KioskPage 에서
 * 이미 숨김. 손님이 빠져나갈 수 있는 경로는 force-reset / paid / 새로고침 만.
 */
export default function WaitingStep({ paymentId, orderNumbers, onPaid }: Props) {
  const paidFiredRef = useRef(false)

  useEffect(() => {
    if (!paymentId) return
    paidFiredRef.current = false

    // 1) 1차로 현재 status 한 번 확인 (구독 미스 방지 — 직원이 매우 빨리 처리한 경우)
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('payments')
        .select('status')
        .eq('id', paymentId)
        .maybeSingle()
      if (cancelled) return
      if (data?.status === 'paid' && !paidFiredRef.current) {
        paidFiredRef.current = true
        onPaid()
      }
    })()

    // 2) realtime 구독
    const channel = supabase
      .channel(`kiosk-payment-${paymentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'payments',
          filter: `id=eq.${paymentId}`,
        },
        (payload) => {
          const newRow = payload.new as { status?: string }
          if (newRow.status === 'paid' && !paidFiredRef.current) {
            paidFiredRef.current = true
            onPaid()
          }
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [paymentId, onPaid])

  return (
    <div className={styles.layout}>
      <div className={styles.card}>
        <div className={styles.iconRow}>
          <CreditCard strokeWidth={1.2} size={80} aria-hidden />
          <Wallet strokeWidth={1.2} size={80} aria-hidden />
        </div>
        <h2 className={styles.title}>직원에게 카드 또는 현금을 제시해주세요</h2>
        <p className={styles.subtitle}>
          결제가 완료되면 자동으로 다음 화면으로 넘어갑니다.
        </p>

        {orderNumbers.length > 0 && (
          <div className={styles.numbersBlock}>
            <div className={styles.numbersLabel}>주문 번호</div>
            <ul className={styles.numbersList}>
              {orderNumbers.map((n) => (
                <li key={n} className={styles.numberItem}>
                  {n}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.dotRow} aria-hidden>
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
        </div>
      </div>
    </div>
  )
}
