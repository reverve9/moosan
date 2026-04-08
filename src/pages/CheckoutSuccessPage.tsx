import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import PageTitle from '@/components/layout/PageTitle'
import { confirmPayment } from '@/lib/toss'
import { findOrderByNumber, markOrderPaid } from '@/lib/orders'
import { useCart } from '@/store/cartStore'
import styles from './CheckoutResult.module.css'

type Phase = 'confirming' | 'success' | 'failed'

export default function CheckoutSuccessPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { clear } = useCart()

  const paymentKey = params.get('paymentKey')
  const orderNumber = params.get('orderId') // 토스의 orderId = 우리 order_number
  const amountStr = params.get('amount')
  const amount = amountStr ? Number(amountStr) : NaN

  const [phase, setPhase] = useState<Phase>('confirming')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [orderId, setOrderId] = useState<string | null>(null)
  const ranRef = useRef(false)

  useEffect(() => {
    // StrictMode 중복 호출 방지
    if (ranRef.current) return
    ranRef.current = true

    if (!paymentKey || !orderNumber || !Number.isFinite(amount)) {
      setErrorMessage('잘못된 접근입니다')
      setPhase('failed')
      return
    }

    void (async () => {
      try {
        // 1) 우리 orders 조회 → id 확보
        const order = await findOrderByNumber(orderNumber)
        if (!order) throw new Error('주문 정보를 찾을 수 없습니다')

        // 2) 금액 검증 (위변조 방지)
        if (order.total_amount !== amount) {
          throw new Error('결제 금액이 일치하지 않습니다')
        }

        // 3) 토스 confirm API (server-side)
        await confirmPayment({ paymentKey, orderId: orderNumber, amount })

        // 4) orders 상태 paid + payment_key 저장
        await markOrderPaid(order.id, paymentKey)

        // 5) 카트 비우기
        clear()

        setOrderId(order.id)
        setPhase('success')

        // 잠시 보여주고 주문 상태 페이지로 이동
        window.setTimeout(() => {
          navigate(`/order/${order.id}`, { replace: true })
        }, 1200)
      } catch (err) {
        const message = err instanceof Error ? err.message : '결제 승인 중 오류가 발생했습니다'
        setErrorMessage(message)
        setPhase('failed')
      }
    })()
  }, [paymentKey, orderNumber, amount, clear, navigate])

  return (
    <section className={styles.page}>
      <PageTitle title={phase === 'success' ? '결제 완료' : '결제 처리'} />

      <div className={styles.center}>
        {phase === 'confirming' && (
          <>
            <div className={styles.spinner} aria-hidden="true" />
            <p className={styles.message}>결제를 확인하고 있어요…</p>
          </>
        )}

        {phase === 'success' && (
          <>
            <CheckCircleIcon className={`${styles.icon} ${styles.iconSuccess}`} />
            <p className={styles.message}>결제가 완료되었어요</p>
            <p className={styles.submessage}>주문 상태 페이지로 이동합니다…</p>
            {orderId && (
              <Link to={`/order/${orderId}`} replace className={styles.cta}>
                지금 이동하기
              </Link>
            )}
          </>
        )}

        {phase === 'failed' && (
          <>
            <ExclamationTriangleIcon className={`${styles.icon} ${styles.iconError}`} />
            <p className={styles.message}>결제 승인에 실패했어요</p>
            {errorMessage && <p className={styles.errorDetail}>{errorMessage}</p>}
            <Link to="/cart" className={styles.cta}>
              장바구니로 돌아가기
            </Link>
          </>
        )}
      </div>
    </section>
  )
}
