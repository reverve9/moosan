import styles from './AdminDashboard.module.css'

export default function AdminDashboard() {
  return (
    <div>
      <h1 className={styles.title}>대시보드</h1>
      <div className={styles.grid}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>총 신청</p>
          <p className={styles.cardValue}>0</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>승인 대기</p>
          <p className={styles.cardValue}>0</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>프로그램</p>
          <p className={styles.cardValue}>4</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>공지사항</p>
          <p className={styles.cardValue}>0</p>
        </div>
      </div>
    </div>
  )
}
