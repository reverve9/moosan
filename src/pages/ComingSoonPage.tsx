import { Link } from 'react-router-dom'
import { Hourglass } from 'lucide-react'
import Text from '@/components/ui/Text'
import styles from './ComingSoonPage.module.css'

export default function ComingSoonPage() {
  return (
    <section className={styles.page}>
      <div className={styles.iconWrap}>
        <Hourglass className={styles.icon} strokeWidth={1.5} />
      </div>
      <Text as="h1" variant="title" color="primary" align="center">
        준비 중입니다
      </Text>
      <Text variant="body" color="muted" align="center">
        더 나은 경험을 위해 열심히 준비하고 있어요.
        <br />
        곧 찾아뵙겠습니다.
      </Text>
      <Link to="/" className={styles.homeButton}>
        홈으로 돌아가기
      </Link>
    </section>
  )
}
