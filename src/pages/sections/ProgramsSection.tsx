import { Link } from 'react-router-dom'
import styles from './ProgramsSection.module.css'

const PROGRAMS = [
  {
    slug: 'baekiljang',
    name: '백일장',
    category: '문학',
    target: '유치부 / 초등부',
    description: '설악의 아름다운 자연을 배경으로 펼치는 글짓기 대회',
  },
  {
    slug: 'saesaeng',
    name: '사생대회',
    category: '미술',
    target: '유치부 / 초등부',
    description: '청초호수공원의 풍경을 화폭에 담는 그림 대회',
  },
  {
    slug: 'dance',
    name: '댄스경연대회',
    category: '무용',
    target: '초등부 / 중등부 / 고등부',
    description: '열정과 에너지를 무대 위에서 표현하는 댄스 경연',
  },
  {
    slug: 'choir',
    name: '합창대회',
    category: '음악',
    target: '초등부 / 중등부 / 고등부',
    description: '하나된 목소리로 감동을 전하는 합창 경연',
  },
]

export default function ProgramsSection() {
  return (
    <section id="programs" className={styles.programs}>
      <div className={styles.container}>
        <h2 className={styles.title}>프로그램</h2>
        <p className={styles.subtitle}>다양한 분야에서 재능을 펼쳐보세요</p>
        <div className={styles.grid}>
          {PROGRAMS.map((program) => (
            <Link
              key={program.slug}
              to={`/program/${program.slug}`}
              className={styles.card}
            >
              <span className={styles.cardCategory}>{program.category}</span>
              <h3 className={styles.cardName}>{program.name}</h3>
              <p className={styles.cardTarget}>{program.target}</p>
              <p className={styles.cardDesc}>{program.description}</p>
              <span className={styles.cardLink}>자세히 보기</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
