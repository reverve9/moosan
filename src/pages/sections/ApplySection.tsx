import { useNavigate } from 'react-router-dom'
import ChoirApplyForm from './apply/choir/ChoirApplyForm'
import WritingApplyForm from './apply/writing/WritingApplyForm'
import ArtApplyForm from './apply/art/ArtApplyForm'
import styles from './ApplySection.module.css'

const PROGRAMS = [
  { slug: 'baekiljang', label: '백일장' },
  { slug: 'saesaeng', label: '사생대회' },
  { slug: 'dance', label: '댄스' },
  { slug: 'choir', label: '합창' },
]

interface Props {
  programSlug?: string
}

export default function ApplySection({ programSlug }: Props) {
  const navigate = useNavigate()
  const activeSlug = PROGRAMS.find((p) => p.slug === programSlug)?.slug || PROGRAMS[0].slug

  const renderForm = () => {
    switch (activeSlug) {
      case 'baekiljang':
        return <WritingApplyForm />
      case 'saesaeng':
        return <ArtApplyForm />
      case 'choir':
        return <ChoirApplyForm />
      case 'dance':
        return <div className={styles.placeholder}>준비 중입니다.</div>
      default:
        return null
    }
  }

  return (
    <section className={styles.apply}>
      <div className={styles.container}>
        <h2 className={styles.title}>참가신청</h2>
        <p className={styles.subtitle}>프로그램을 선택하고 참가신청서를 작성해주세요</p>
      </div>

      <div className={styles.tabs}>
        {PROGRAMS.map((p) => (
          <button
            key={p.slug}
            className={`${styles.tab} ${activeSlug === p.slug ? styles.tabActive : ''}`}
            onClick={() => navigate(`/apply/${p.slug}`)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {renderForm()}
    </section>
  )
}
