import styles from './AdminPage.module.css'

export default function AdminNotices() {
  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>공지사항 관리</h1>
      </div>
      <div className={styles.placeholder}>
        <p>공지사항 목록이 이곳에 표시됩니다.</p>
      </div>
    </div>
  )
}
