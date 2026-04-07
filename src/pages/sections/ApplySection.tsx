import { useNavigate } from 'react-router-dom'
import PageTitle from '@/components/layout/PageTitle'
import ApplyForm from './apply/ApplyForm'
import ChoirApplyForm from './apply/choir/ChoirApplyForm'
import WritingApplyForm from './apply/writing/WritingApplyForm'
import ArtApplyForm from './apply/art/ArtApplyForm'
import styles from './ApplySection.module.css'

const PROGRAMS = [
  { slug: 'saesaeng', label: '전국 어린이 사생대회' },
  { slug: 'choir', label: '전국 어린이 합창대회' },
  { slug: 'baekiljang', label: '전국 청소년 백일장' },
  { slug: 'dance', label: '전국 청소년 스트리트댄스' },
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
        return <ApplyForm defaultProgramId="dance" />
      default:
        return null
    }
  }

  return (
    <section className={styles.apply}>
      <PageTitle
        title="참가신청"
        description="프로그램을 선택하고 참가신청서를 작성해주세요"
      />

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
