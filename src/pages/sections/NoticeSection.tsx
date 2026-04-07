import PageTitle from '@/components/layout/PageTitle'
import styles from './NoticeSection.module.css'

export default function NoticeSection() {
  return (
    <section id="notice" className={styles.notice}>
      <PageTitle title="공지사항" />
      <div className={styles.container}>
        <div className={styles.placeholder}>
          <p>공지사항 목록이 이곳에 표시됩니다.</p>
        </div>
      </div>
    </section>
  )
}
