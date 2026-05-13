import { useEffect } from 'react'
import { CircleX } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import PageTitle from '@/components/layout/PageTitle'
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

  // 결제창에서 push 된 history 흔적 차단 — 뒤로가기 누르면 결제 외부 SDK 페이지로
  // 돌아가지 않고 /cart 로 강제 이동. dummy pushState 후 popstate 가로채는 패턴.
  useEffect(() => {
    window.history.pushState(null, '', window.location.href)
    const handler = () => navigate('/cart', { replace: true })
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [navigate])

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
