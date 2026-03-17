import styles from './AdminPage.module.css'

export default function AdminApplications() {
  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>참가신청 관리</h1>
      </div>
      <div className={styles.placeholder}>
        <p>참가신청 목록이 이곳에 표시됩니다.</p>
      </div>
    </div>
  )
}
