import PageTitle from '@/components/layout/PageTitle'
import styles from './LocationSection.module.css'

export default function LocationSection() {
  return (
    <section id="location" className={styles.location}>
      <PageTitle
        title="오시는 길"
        description="강원도 속초시 청초호수공원 엑스포광장"
      />
      <div className={styles.container}>
        <div className={styles.mapPlaceholder}>
          <p>지도가 이곳에 표시됩니다.</p>
        </div>
      </div>
    </section>
  )
}
