import styles from './LocationSection.module.css'

export default function LocationSection() {
  return (
    <section id="location" className={styles.location}>
      <div className={styles.container}>
        <h2 className={styles.title}>오시는 길</h2>
        <div className={styles.info}>
          <p className={styles.address}>강원도 속초시 청초호수공원 엑스포광장</p>
        </div>
        <div className={styles.mapPlaceholder}>
          <p>지도가 이곳에 표시됩니다.</p>
        </div>
      </div>
    </section>
  )
}
