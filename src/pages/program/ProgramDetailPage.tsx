import { useParams, Link } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/Text'
import styles from './ProgramDetailPage.module.css'

export default function ProgramDetailPage() {
  const { slug } = useParams<{ slug: string }>()

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Link to="/programs" className={styles.back}>
          &larr; 프로그램 목록
        </Link>
        <Text as="h1" variant="title" color="primary" className={styles.title}>
          프로그램 상세
        </Text>
        <Text variant="body" color="muted" align="center" className={styles.placeholder}>
          "{slug}" 프로그램 상세 정보가 이곳에 표시됩니다.
          <br />
          (세부정보 수령 후 구현 예정)
        </Text>
        <Button to={`/apply/${slug}`} size="lg" fullWidth className={styles.applyButton}>
          참가신청 하기
        </Button>
      </div>
    </div>
  )
}
