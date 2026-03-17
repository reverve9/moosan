import styles from './NoticeSection.module.css'

export default function NoticeSection() {
  return (
    <section id="notice" className={styles.notice}>
      <div className={styles.container}>
        <h2 className={styles.title}>공지사항</h2>
        <div className={styles.placeholder}>
          <p>공지사항 목록이 이곳에 표시됩니다.</p>
        </div>
      </div>
    </section>
  )
}
