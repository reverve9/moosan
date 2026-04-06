import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import styles from './ProgramAccordion.module.css'

interface ProgramData {
  slug: string
  name: string
  description: string
  thumbnail: string         // 썸네일 이미지 경로
  eventName: string         // 행사명 (정식 명칭)
  schedule: string          // 일시
  venue: string             // 장소
  target: string            // 참가대상
  awardsText: string        // 시상내용
  registrationPeriod: string // 접수기간
  applicationMethod: string  // 접수방법
  galleryColors: string[]  // 임시 placeholder 색상 (갤러리 업로드 전)
}

const PROGRAMS: ProgramData[] = [
  {
    slug: 'saesaeng',
    name: '전국 어린이 사생대회',
    description: '전국 어린이 사생대회는 2025년도 제3회 설악청소년문화축전 행사의 하나로, 전국의 미취학아동 및 초등학생을 대상으로 열리는 문화예술 경연 행사입니다.',
    thumbnail: '/images/thumb_sasaeng.png',
    eventName: '2025 설악청소년문화축전 전국 어린이 사생대회',
    schedule: '2025년 5월 24일(토) 오후 1시 ~ 3시 30분',
    venue: '속초시 청호호수공원 및 엑스포광장 일대',
    target: '대한민국 거주 미취학 아동 및 초등학생(어린이집, 유치원, 초등학교)',
    awardsText: '강원특별자치도지사/도의회의장상, 속초시장상, 고성교육지원교육장상 등',
    registrationPeriod: '2025년 3월 14일(금)~5월 2일(금) 18:00까지',
    applicationMethod: "아래 '접수하기'에 링크된 신청양식을 통해 접수",
    galleryColors: ['#F5D6C8', '#EFC9B8', '#E9BCA8', '#E3AF98'],
  },
  {
    slug: 'choir',
    name: '전국 어린이 합창대회',
    description: '2025 전국 어린이 합창대회는 제3회 설악청소년문화축전 행사의 하나로, 전국의 어린이합창단을 속초로 초청, 경연하여 지역 문화 발전에 기여하는 행사입니다.',
    thumbnail: '/images/thumb_choir.png',
    eventName: '2025 설악청소년문화축전 전국 어린이 합창대회',
    schedule: '2025년 5월 23일(금) 오후 5시 ~ 7시 30분',
    venue: '속초시 청호호수공원 엑스포광장 특설무대',
    target: '미취학 아동 및 초등학교에 재학 중인 어린이\n최소 8명 ~ 최대 50명 이내로 구성된 합창단',
    awardsText: '강원특별자치도지사상, 속초시장상 등',
    registrationPeriod: '2025년 3월 14일(금)~5월 2일(금) 18:00까지',
    applicationMethod: "아래 '접수하기'에 링크된 신청양식을 통해 접수",
    galleryColors: ['#FDE68A', '#FCD34D', '#FBBF24', '#F59E0B'],
  },
  {
    slug: 'baekiljang',
    name: '전국 청소년 백일장',
    description: '전국 청소년 백일장은 2025 설악청소년문화축전 행사의 하나로, 전국의 중·고등학생을 대상으로 운문과 산문 두 부문에 걸쳐 열리는 문화예술행사입니다.',
    thumbnail: '/images/thumb_baekiljang.png',
    eventName: '2025 설악청소년문화축전 전국 청소년 백일장',
    schedule: '2025년 5월 24일(토) 오후 2시 ~ 4시 30분',
    venue: '속초시 청호호수공원 및 엑스포광장 일대',
    target: '대한민국 거주 중·고등학생 혹은 해당 연령 개인',
    awardsText: '강원특별자치도지사상, 도의회의장상, 속초양양/고성 교육지원청교육장상 등',
    registrationPeriod: '2025년 3월 14일(금)~5월 2일(금) 18:00까지',
    applicationMethod: "아래 '접수하기'에 링크된 신청양식을 통해 접수",
    galleryColors: ['#D4E8CC', '#C8DDC0', '#BCD2B4', '#B0C7A8'],
  },
  {
    slug: 'dance',
    name: '전국 청소년 스트리트댄스 페스티벌',
    description: '전국 청소년 스트리트댄스 페스티벌은 2025 설악청소년문화축전의 메인이벤트로서, 전국의 청소년 댄서나 댄스팀의 경연을 통해 문화 체험의 기회를 확대하고 지역 문화 발전에 기여하고자 합니다.',
    thumbnail: '/images/thumb_dance.png',
    eventName: '2025 전국 청소년 스트리트댄스 페스티벌',
    schedule: '2025년 5월 25일(일) 오후 5시 ~ 7시',
    venue: '속초시 청호호수공원 엑스포광장 특설무대',
    target: '중·고등학생 최소 2명 ~ 최대 20명 이하로 구성된 동아리, 팀',
    awardsText: '강원특별자치도의회의장상, 속초시장상 등',
    registrationPeriod: '2025년 3월 14일(금)~5월 2일(금) 18:00까지',
    applicationMethod: "아래 '접수하기'에 링크된 신청양식을 통해 접수",
    galleryColors: ['#C7D2FE', '#A5B4FC', '#818CF8', '#6366F1'],
  },
]

function ProgramCard({
  data,
  open,
  onToggle,
}: {
  data: ProgramData
  open: boolean
  onToggle: () => void
}) {
  return (
    <div className={`${styles.card} ${open ? styles.cardOpen : ''}`}>
      <button
        type="button"
        className={styles.header}
        onClick={onToggle}
        aria-expanded={open}
      >
        <img
          src={data.thumbnail}
          alt={data.name}
          className={styles.thumbnail}
        />
        <div className={styles.headerText}>
          <h3 className={styles.name}>{data.name}</h3>
          <p className={styles.desc}>{data.description}</p>
        </div>
        <ChevronDownIcon className={styles.chevron} />
      </button>

      <div className={styles.bodyWrap}>
        <div className={styles.body}>
          <div className={styles.detailBox}>
            <dl className={styles.infoGrid}>
              <dt className={styles.infoLabel}>행사명</dt>
              <dd className={styles.infoValue}>{data.eventName}</dd>

              <dt className={styles.infoLabel}>일 시</dt>
              <dd className={styles.infoValue}>{data.schedule}</dd>

              <dt className={styles.infoLabel}>장 소</dt>
              <dd className={styles.infoValue}>{data.venue}</dd>

              <dt className={styles.infoLabel}>참가대상</dt>
              <dd className={styles.infoValue}>{data.target}</dd>

              <dt className={styles.infoLabel}>시상내용</dt>
              <dd className={styles.infoValue}>{data.awardsText}</dd>

              <dt className={styles.infoLabel}>참가신청</dt>
              <dd className={styles.infoValue}>
                <ul className={styles.subList}>
                  <li>접수기간: {data.registrationPeriod}</li>
                  <li>접수방법: {data.applicationMethod}</li>
                </ul>
              </dd>
            </dl>
          </div>

          {/* 지난 행사 사진 — 추후 어드민 업로드 후 표시 */}

          <div className={styles.applyAction}>
            <Link to={`/apply/${data.slug}`} className={styles.applyButton}>
              참가신청
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ProgramAccordion() {
  const [openSlug, setOpenSlug] = useState<string | null>(null)

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>참가 프로그램</h2>
      <div className={styles.list}>
        {PROGRAMS.map((p) => (
          <ProgramCard
            key={p.slug}
            data={p}
            open={openSlug === p.slug}
            onToggle={() => setOpenSlug((cur) => (cur === p.slug ? null : p.slug))}
          />
        ))}
      </div>
    </section>
  )
}
