import StatsRevenueTab from './stats/StatsRevenueTab'
import styles from './AdminDashboard.module.css'

export default function AdminRevenue() {
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.title}>매출 관리</h1>
        <p className={styles.sub}>축제 매출 통계 · 결제/쿠폰 분석</p>
      </header>
      <StatsRevenueTab />
    </div>
  )
}
