import { useParams, Link } from 'react-router-dom'
import styles from './ProgramDetailPage.module.css'

export default function ProgramDetailPage() {
  const { slug } = useParams<{ slug: string }>()

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Link to="/#programs" className={styles.back}>
          &larr; 프로그램 목록
        </Link>
        <h1 className={styles.title}>프로그램 상세</h1>
        <p className={styles.placeholder}>
          "{slug}" 프로그램 상세 정보가 이곳에 표시됩니다.
          <br />
          (세부정보 수령 후 구현 예정)
        </p>
      </div>
    </div>
  )
}
