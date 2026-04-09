import { CircleX } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import PageTitle from '@/components/layout/PageTitle'
import styles from './CheckoutResult.module.css'

const ERROR_LABEL: Record<string, string> = {
  PAY_PROCESS_CANCELED: '결제를 취소했어요',
  PAY_PROCESS_ABORTED: '결제가 중단되었어요',
  REJECT_CARD_COMPANY: '카드사에서 결제를 거절했어요',
  INVALID_CARD_NUMBER: '카드 번호가 올바르지 않아요',
  EXPIRED_CARD: '만료된 카드예요',
}

export default function CheckoutFailPage() {
  const [params] = useSearchParams()
  const code = params.get('code') ?? ''
  const message = params.get('message') ?? ''

  const friendly = ERROR_LABEL[code] ?? message ?? '결제에 실패했어요'

  return (
    <section className={styles.page}>
      <PageTitle title="결제 실패" />
      <div className={styles.center}>
        <CircleX className={`${styles.icon} ${styles.iconError}`} />
        <p className={styles.message}>{friendly}</p>
        {code && <p className={styles.errorDetail}>코드: {code}</p>}
        <Link to="/cart" className={styles.cta}>
          장바구니로 돌아가기
        </Link>
      </div>
    </section>
  )
}
