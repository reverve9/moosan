import { Link } from 'react-router-dom'
import { isDevMode } from '@/config/flags'
import styles from './HeroSection.module.css'

type Align = 'left' | 'right'

interface Marker {
  top: string
  align: Align
  /** 좌/우 가장자리에서의 offset (예: '5%'). 미지정 시 .left/.right 클래스 기본값 사용 */
  inset?: string
  date: string
  title: string[]
  to: string
}

const markers: Marker[] = [
  {
    top: '33.8%',
    align: 'left',
    inset: '7%',
    date: '5월 15일(금)',
    title: ['개막식'],
    to: '/program/musan',
  },
  {
    top: '60.8%',
    align: 'left',
    date: '5월 15일(금) - 17일(일)',
    title: ['제3회', '설악음식문화페스티벌'],
    to: '/program/food',
  },
  {
    top: '47.3%',
    align: 'right',
    date: '5월 15일(금) - 17일(일)',
    title: ['제4회', '설악청소년문화축전'],
    to: '/program/youth',
  },
  {
    top: '74.3%',
    align: 'right',
    inset: '7%',
    date: '5월 17일(일)',
    title: ['폐막식'],
    to: '/program/musan',
  },
]

export default function HeroSection() {
  return (
    <section className={styles.hero}>
      <img src="/images/home_bg.png" alt="" className={styles.bg} />
      <img
        src="/images/home_title.png"
        alt="2026 설악무산문화축전"
        className={styles.title}
      />
      <img src="/images/home_logo.png" alt="" className={styles.logo} />
      <div className={styles.info}>
        <span className={styles.infoLine}>
          5월 15일(금) - 5월 17일(일) · 속초 엑스포잔디광장 일원
        </span>
      </div>
      <div className={styles.markers}>
        {markers.map((m, i) => {
          const dimmed = !isDevMode && m.to === '/program/food'
          return (
            <Link
              key={i}
              to={m.to}
              className={`${styles.marker} ${styles[m.align]} ${
                dimmed ? styles.markerDimmed : ''
              }`}
              style={{
                top: m.top,
                ...(m.inset ? { [m.align]: m.inset } : null),
              }}
            >
              <span className={styles.date}>{m.date}</span>
              {m.title.map((line, i) => (
                <span key={i} className={styles.name}>
                  {line}
                </span>
              ))}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
