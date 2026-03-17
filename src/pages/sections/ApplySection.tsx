import styles from './ApplySection.module.css'

export default function ApplySection() {
  return (
    <section id="apply" className={styles.apply}>
      <div className={styles.container}>
        <h2 className={styles.title}>참가신청</h2>
        <p className={styles.subtitle}>프로그램을 선택하고 참가신청서를 작성해주세요</p>
        <div className={styles.placeholder}>
          <p>참가신청 폼이 이곳에 구현됩니다.</p>
        </div>
      </div>
    </section>
  )
}
