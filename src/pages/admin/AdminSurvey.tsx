import StatsSurveyTab from './stats/StatsSurveyTab'
import styles from './AdminDashboard.module.css'

export default function AdminSurvey() {
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.title}>만족도조사 관리</h1>
        <p className={styles.sub}>누적 응답 통계 · 결과보고서 용</p>
      </header>
      <StatsSurveyTab />
    </div>
  )
}
