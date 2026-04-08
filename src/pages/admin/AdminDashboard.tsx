import { useState } from 'react'
import StatsRevenueTab from './stats/StatsRevenueTab'
import styles from './AdminDashboard.module.css'

type TabKey = 'revenue'

interface TabDef {
  key: TabKey
  label: string
}

const TABS: TabDef[] = [
  { key: 'revenue', label: '매출관리' },
  // 추후 추가: 신청 통계, 집객 통계 등
]

export default function AdminDashboard() {
  const [tab, setTab] = useState<TabKey>('revenue')

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.title}>대시보드</h1>
        <p className={styles.sub}>축제 전체 통계 · 결과보고서 용</p>
      </header>

      <nav className={styles.tabs} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className={styles.tabPanel}>{tab === 'revenue' && <StatsRevenueTab />}</div>
    </div>
  )
}
