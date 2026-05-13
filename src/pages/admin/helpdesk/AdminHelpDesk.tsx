import { useEffect, useMemo, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { loadAdminSession } from '@/lib/adminAuth'
import { getStationByAdminId } from '@/lib/kioskStation'
import type { KioskStationId } from '@/types/database'
import HelpDeskOrderTab from './HelpDeskOrderTab'
import HelpDeskHistoryTab from './HelpDeskHistoryTab'
import HelpDeskCashTab from './HelpDeskCashTab'
import HelpDeskKioskQueueTab from './HelpDeskKioskQueueTab'
import styles from './AdminHelpDesk.module.css'

function openKioskWindow(station: KioskStationId) {
  const url = `${window.location.origin}/kiosk?station=${station}`
  // popup feature + size 명시 → Chrome 이 새 탭 대신 새 창으로 처리 (HDMI 확장
  // 모니터로 드래그·풀스크린 가능). named target 으로 같은 station 재호출 시
  // 새 창 또 열지 않고 기존 창 focus.
  window.open(
    url,
    `kiosk-${station}`,
    'popup,width=1920,height=1080,noopener,noreferrer',
  )
}

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

  const myStation = getStationByAdminId(adminId)
  // admin01 은 스탠바이미고(외부 URL) 전용 — 헬프데스크에서 키오스크 버튼 숨김.
  const showKioskButton = adminId === 'admin02' || adminId === 'admin03'

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>결제 도우미</h1>
          <p className={styles.sub}>현금 / 직영카드 결제 대행 + 시재 관리</p>
        </div>
        {showKioskButton && (
          <button
            type="button"
            className={styles.kioskOpenButton}
            onClick={() => openKioskWindow(myStation)}
            disabled={!adminId}
          >
            <ExternalLink strokeWidth={1.4} size={16} aria-hidden />
            <span>키오스크 열기</span>
          </button>
        )}
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
