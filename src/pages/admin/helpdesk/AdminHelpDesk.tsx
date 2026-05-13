import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, PauseCircle, PlayCircle } from 'lucide-react'
import { loadAdminSession, type AdminRole } from '@/lib/adminAuth'
import { getStationByAdminId } from '@/lib/kioskStation'
import { supabase } from '@/lib/supabase'
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

interface BoothPauseRow {
  id: string
  is_paused: boolean
}

export default function AdminHelpDesk() {
  const [tab, setTab] = useState<Tab>('order')
  const [adminId, setAdminId] = useState<string>('')
  const [role, setRole] = useState<AdminRole | null>(null)

  // 매장 일괄 준비중 토글 (super 계정 전용) — food 페스티벌의 is_active=true 부스
  // 전체 대상. is_paused 동기화는 supabase realtime 구독.
  const [booths, setBooths] = useState<BoothPauseRow[]>([])
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)

  useEffect(() => {
    const session = loadAdminSession()
    setAdminId(session?.id ?? '')
    setRole(session?.role ?? null)
  }, [])

  useEffect(() => {
    if (role !== 'super') return
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    ;(async () => {
      const { data: festival } = await supabase
        .from('festivals')
        .select('id')
        .eq('slug', 'food')
        .single()
      if (!festival || cancelled) return

      const { data: rows } = await supabase
        .from('food_booths')
        .select('id, is_paused')
        .eq('festival_id', festival.id)
        .eq('is_active', true)
      if (cancelled) return
      setBooths(
        (rows ?? []).map((r) => ({ id: r.id, is_paused: !!r.is_paused })),
      )

      channel = supabase
        .channel('helpdesk-booth-pause')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'food_booths' },
          (payload) => {
            const updated = payload.new as
              | { id?: string; is_paused?: boolean; is_active?: boolean }
              | null
            if (!updated?.id) return
            setBooths((prev) => {
              const next = prev.map((b) =>
                b.id === updated.id
                  ? { ...b, is_paused: updated.is_paused ?? b.is_paused }
                  : b,
              )
              // is_active=false 로 바뀐 부스는 제거 (대상 외)
              if (updated.is_active === false) {
                return next.filter((b) => b.id !== updated.id)
              }
              return next
            })
          },
        )
        .subscribe()
    })()

    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [role])

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

  const totalBooths = booths.length
  const pausedCount = booths.filter((b) => b.is_paused).length
  const allPaused = totalBooths > 0 && pausedCount === totalBooths
  const nextValue = !allPaused // 클릭 시 적용될 is_paused 값 (전체 paused 면 해제, 그 외 일괄 paused)
  const showBulkPause = role === 'super' && totalBooths > 0

  const handleBulkPauseConfirm = async () => {
    if (bulkSubmitting || booths.length === 0) return
    setBulkSubmitting(true)
    setBulkError(null)
    try {
      const ids = booths.map((b) => b.id)
      const { error } = await supabase
        .from('food_booths')
        .update({ is_paused: nextValue })
        .in('id', ids)
      if (error) throw error
      setBulkConfirmOpen(false)
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : '일괄 적용 실패')
    } finally {
      setBulkSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>결제 도우미</h1>
          <p className={styles.sub}>현금 / 직영카드 결제 대행 + 시재 관리</p>
        </div>
        <div className={styles.headerActions}>
          {showBulkPause && (
            <button
              type="button"
              className={`${styles.bulkPauseButton} ${
                allPaused ? styles.bulkPauseButtonActive : ''
              }`}
              onClick={() => {
                setBulkError(null)
                setBulkConfirmOpen(true)
              }}
              disabled={bulkSubmitting}
            >
              {allPaused ? (
                <PlayCircle strokeWidth={1.4} size={16} aria-hidden />
              ) : (
                <PauseCircle strokeWidth={1.4} size={16} aria-hidden />
              )}
              <span>
                {allPaused ? '전체 준비중 해제' : '전체 준비중'} ({pausedCount}/{totalBooths})
              </span>
            </button>
          )}
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

      {bulkConfirmOpen && (
        <div
          className={styles.bulkBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label="매장 일괄 준비중 변경 확인"
          onClick={() => (bulkSubmitting ? null : setBulkConfirmOpen(false))}
        >
          <div className={styles.bulkModal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.bulkTitle}>
              {nextValue ? '전체 매장 준비중 변경' : '전체 매장 준비중 해제'}
            </h3>
            <p className={styles.bulkBody}>
              {totalBooths}개 매장의 상태를 일괄로{' '}
              <strong>{nextValue ? '준비중' : '운영중'}</strong> 으로 변경합니다.
              <br />
              사용자앱 / 키오스크 진입 손님에게 즉시 반영됩니다.
            </p>
            {bulkError && <div className={styles.bulkError}>{bulkError}</div>}
            <div className={styles.bulkActions}>
              <button
                type="button"
                className={styles.bulkCancelBtn}
                onClick={() => setBulkConfirmOpen(false)}
                disabled={bulkSubmitting}
              >
                취소
              </button>
              <button
                type="button"
                className={styles.bulkConfirmBtn}
                onClick={() => void handleBulkPauseConfirm()}
                disabled={bulkSubmitting}
              >
                {bulkSubmitting ? '적용 중…' : nextValue ? '준비중으로 변경' : '준비중 해제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
