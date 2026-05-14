import { useEffect, useState } from 'react'
import { CircleX } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import PageTitle from '@/components/layout/PageTitle'
import { clearPendingPaymentId, getPendingPaymentId } from '@/lib/paymentPending'
import { supabase } from '@/lib/supabase'
import styles from './CheckoutResult.module.css'

const REASON_LABEL: Record<string, string> = {
  invalid_access: '잘못된 접근이에요',
  invalid_response: '결제 응답이 올바르지 않아요',
  no_enc_data: '결제 데이터가 누락됐어요',
  decrypt_failed: '결제 결과 확인에 실패했어요',
  decrypt_error: '결제 결과 확인 중 오류가 발생했어요',
  missing_fields: '결제 응답 필드가 누락됐어요',
  invalid_amount: '결제 금액 정보가 올바르지 않아요',
  payment_not_found: '결제 정보를 찾을 수 없어요',
  amount_mismatch: '결제 금액이 일치하지 않아요',
  db_update_failed: '결제 처리에 실패했어요. 잠시 후 다시 시도해주세요',
}

export default function PaymentCancelPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const reason = params.get('reason') ?? ''
  const friendly = REASON_LABEL[reason] ?? (reason ? decodeURIComponent(reason) : '결제를 취소했어요')

  // verify 가 끝나기 전 깜박임 방지용 — pending id 있으면 잠깐 verifying 상태로 시작
  const [verifying, setVerifying] = useState<boolean>(() => !!getPendingPaymentId())

  // 결제창에서 push 된 history 흔적 차단 + pending id 정리 + self-verify.
  //
  // self-verify: PG 가 RETURNURL Form POST 를 보냈지만 ENC_DATA 가 누락 등으로
  // cancel 페이지로 분기됐어도 server-to-server noti 가 paid 전이 시켰을 수 있음.
  // pending id 가 있고 실제 paid 면 cancel UI 거치지 않고 /order/:pid 로 자동 이동.
  useEffect(() => {
    let cancelledFlag = false

    const verify = async () => {
      const pid = getPendingPaymentId()
      if (!pid) {
        setVerifying(false)
        return
      }
      const { data, error } = await supabase
        .from('payments')
        .select('status')
        .eq('id', pid)
        .maybeSingle()
      if (cancelledFlag) return
      if (!error && data?.status === 'paid') {
        clearPendingPaymentId()
        navigate(`/order/${pid}?from=checkout`, { replace: true })
        return
      }
      clearPendingPaymentId()
      setVerifying(false)
    }

    void verify()
    window.history.pushState(null, '', window.location.href)
    const handler = () => navigate('/cart', { replace: true })
    window.addEventListener('popstate', handler)
    return () => {
      cancelledFlag = true
      window.removeEventListener('popstate', handler)
    }
  }, [navigate])

  if (verifying) {
    return (
      <section className={styles.page}>
        <PageTitle title="결제 확인 중" />
        <div className={styles.center}>
          <p className={styles.message}>결제 결과 확인 중이에요…</p>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.page}>
      <PageTitle title="결제 취소" />
      <div className={styles.center}>
        <CircleX className={`${styles.icon} ${styles.iconError}`} />
        <p className={styles.message}>{friendly}</p>
        <Link to="/cart" replace className={styles.cta}>
          장바구니로 돌아가기
        </Link>
      </div>
    </section>
  )
}
