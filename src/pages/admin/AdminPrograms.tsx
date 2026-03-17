import styles from './AdminPage.module.css'

export default function AdminPrograms() {
  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>프로그램 관리</h1>
      </div>
      <div className={styles.placeholder}>
        <p>프로그램 목록이 이곳에 표시됩니다.</p>
      </div>
    </div>
  )
}
