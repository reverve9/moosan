import { useEffect, useMemo, useState } from 'react'
import { loadAdminSession } from '@/lib/adminAuth'
import HelpDeskOrderTab from './HelpDeskOrderTab'
import HelpDeskHistoryTab from './HelpDeskHistoryTab'
import HelpDeskCashTab from './HelpDeskCashTab'
import HelpDeskKioskQueueTab from './HelpDeskKioskQueueTab'
import styles from './AdminHelpDesk.module.css'

type Tab = 'order' | 'kiosk' | 'history' | 'cash'

const TABS: { key: Tab; label: string }[] = [
  { key: 'order', label: '주문 입력' },
  { key: 'kiosk', label: '키오스크 대기' },
  { key: 'history', label: '금일 결제 내역' },
  { key: 'cash', label: '시재 관리' },
]

export default function AdminHelpDesk() {
  const [tab, setTab] = useState<Tab>('order')
  const [adminId, setAdminId] = useState<string>('')

  useEffect(() => {
    const session = loadAdminSession()
    setAdminId(session?.id ?? '')
  }, [])

  const tabContent = useMemo(() => {
    if (!adminId) return null
    if (tab === 'order') return <HelpDeskOrderTab adminId={adminId} />
    if (tab === 'kiosk') return <HelpDeskKioskQueueTab adminId={adminId} />
    if (tab === 'history') return <HelpDeskHistoryTab adminId={adminId} />
    return <HelpDeskCashTab adminId={adminId} />
  }, [tab, adminId])

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>결제 도우미</h1>
          <p className={styles.sub}>현금 / 직영카드 결제 대행 + 시재 관리</p>
        </div>
      </header>

      <div className={styles.tabs} role="tablist">
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
      </div>

      {tabContent}
    </div>
  )
}
