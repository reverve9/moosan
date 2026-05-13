import { useCallback, useEffect, useMemo, useState } from 'react'
import { CreditCard, Wallet, Power, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  confirmKioskPayment,
  fetchKioskPendingQueue,
  sendKioskForceReset,
  type KioskQueueGroup,
} from '@/lib/helpDesk'
import { ALL_STATIONS, STATION_LABEL } from '@/lib/kioskStation'
import type { KioskStationId } from '@/types/database'
import { useToast } from '@/components/ui/Toast'
import { formatPhoneDisplay } from '@/lib/phone'
import styles from './HelpDeskKioskQueueTab.module.css'

interface Props {
  adminId: string
}

type Method = 'external_card' | 'cash'

function StationBadge({ stationId }: { stationId: string | null }) {
  if (stationId === 'helpdesk-1') {
    return <span className={`${styles.stationBadge} ${styles.stationBadge1}`}>키오스크 #1</span>
  }
  if (stationId === 'helpdesk-2') {
    return <span className={`${styles.stationBadge} ${styles.stationBadge2}`}>키오스크 #2</span>
  }
  if (stationId === 'helpdesk-3') {
    return <span className={`${styles.stationBadge} ${styles.stationBadge3}`}>키오스크 #3</span>
  }
  return <span className={`${styles.stationBadge} ${styles.stationBadgeAdmin}`}>직원입력</span>
}

/**
 * 헬프데스크 키오스크 결제 대기 큐.
 *
 * 손님이 키오스크에서 "결제 요청" 누르면 status='payment_pending', payment_channel='helpdesk'
 * 인 orders 가 생성됨. 이 화면은 그 큐를 실시간으로 표시하고, 직원이 카드/현금을
 * 받은 후 "결제 완료" 처리하면 `confirmKioskPayment` 호출 → status='paid' 전이.
 *
 * Realtime: orders 테이블 INSERT/UPDATE 감지 → 큐 refetch (단순 무효화 방식 —
 * 핸드오프 §1-6 "Realtime 구독으로 신규 주문 즉시 표시").
 */
export default function HelpDeskKioskQueueTab({ adminId }: Props) {
  const { showToast } = useToast()
  const [queue, setQueue] = useState<KioskQueueGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null)
  const [chosenMethod, setChosenMethod] = useState<Method | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    try {
      const data = await fetchKioskPendingQueue()
      setQueue(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  // Realtime — orders INSERT/UPDATE 감지 시 큐 갱신.
  useEffect(() => {
    const channel = supabase
      .channel('helpdesk-kiosk-queue')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        () => void refetch(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        () => void refetch(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [refetch])

  const selected = useMemo(
    () => queue.find((g) => g.paymentId === selectedPaymentId) ?? null,
    [queue, selectedPaymentId],
  )

  const openModal = (paymentId: string) => {
    setSelectedPaymentId(paymentId)
    setChosenMethod(null)
    setError(null)
  }

  const closeModal = () => {
    if (submitting) return
    setSelectedPaymentId(null)
    setChosenMethod(null)
  }

  const handleConfirm = async () => {
    if (!selected || submitting) return
    // 잔액 0(식권 단독) 케이스 — chosenMethod 없이도 voucher_only 로 즉시 처리.
    const method: 'external_card' | 'cash' | 'voucher_only' =
      selected.totalAmount === 0 ? 'voucher_only' : (chosenMethod as 'external_card' | 'cash')
    if (selected.totalAmount > 0 && !chosenMethod) return
    setSubmitting(true)
    setError(null)
    try {
      await confirmKioskPayment(selected.paymentId, method, adminId)
      showToast('결제 완료 처리됨', { type: 'success' })
      setSelectedPaymentId(null)
      setChosenMethod(null)
      await refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : '결제 완료 처리 실패')
    } finally {
      setSubmitting(false)
    }
  }

  const handleForceReset = async (stationId: KioskStationId) => {
    try {
      await sendKioskForceReset(stationId)
      showToast(`키오스크 ${STATION_LABEL[stationId]} 초기화 요청 보냄`, { type: 'info' })
    } catch (e) {
      showToast(e instanceof Error ? e.message : '초기화 요청 실패', { type: 'error' })
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.queueCount}>대기 {queue.length}건</span>
        </div>
        <div className={styles.toolbarRight}>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => void refetch()}
            aria-label="새로고침"
          >
            <RefreshCw strokeWidth={1.4} size={18} aria-hidden />
            <span>새로고침</span>
          </button>
          {ALL_STATIONS.map((sid) => (
            <button
              key={sid}
              type="button"
              className={styles.kioskResetButton}
              onClick={() => void handleForceReset(sid)}
            >
              <Power strokeWidth={1.4} size={18} aria-hidden />
              <span>키오스크 {STATION_LABEL[sid]} 초기화</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className={styles.empty}>불러오는 중…</div>
      ) : queue.length === 0 ? (
        <div className={styles.empty}>대기 중인 키오스크 결제가 없습니다.</div>
      ) : (
        <ul className={styles.queueList}>
          {queue.map((g) => {
            const elapsedSec = Math.max(
              0,
              Math.round((Date.now() - new Date(g.createdAt).getTime()) / 1000),
            )
            const elapsedLabel =
              elapsedSec < 60 ? `${elapsedSec}초` : `${Math.floor(elapsedSec / 60)}분`
            return (
              <li key={g.paymentId}>
                <button
                  type="button"
                  className={styles.queueItem}
                  onClick={() => openModal(g.paymentId)}
                >
                  <div className={styles.queueItemHead}>
                    <div className={styles.queueItemHeadLeft}>
                      <StationBadge stationId={g.kioskStationId} />
                      <div className={styles.queueItemPhone}>
                        {formatPhoneDisplay(g.phone)}
                      </div>
                    </div>
                    <div className={styles.queueItemElapsed}>대기 {elapsedLabel}</div>
                  </div>
                  <div className={styles.queueItemBooths}>
                    {g.orders.map((o) => (
                      <span key={o.id} className={styles.boothChip}>
                        {o.booth_no}번 · {o.booth_name}
                      </span>
                    ))}
                    {g.voucherConsumed > 0 && (
                      <span className={`${styles.boothChip} ${styles.voucherChip}`}>
                        식권 -{g.voucherConsumed.toLocaleString()}원
                      </span>
                    )}
                  </div>
                  <div className={styles.queueItemTotal}>
                    {g.totalAmount.toLocaleString()}원
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {selected && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={closeModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>결제 처리</h2>
              <div className={styles.modalPhone}>{formatPhoneDisplay(selected.phone)}</div>
            </header>

            <div className={styles.modalOrders}>
              {selected.orders.map((o) => (
                <div key={o.id} className={styles.modalOrder}>
                  <div className={styles.modalOrderHead}>
                    <span className={styles.modalOrderBooth}>
                      {o.booth_no}번 · {o.booth_name}
                    </span>
                    <span className={styles.modalOrderSubtotal}>
                      {o.subtotal.toLocaleString()}원
                    </span>
                  </div>
                  <ul className={styles.modalItems}>
                    {o.items.map((it, idx) => (
                      <li key={`${o.id}-${idx}`}>
                        {it.menu_name} × {it.quantity} ·{' '}
                        {it.subtotal.toLocaleString()}원
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {selected.voucherConsumed > 0 && (
              <div className={styles.voucherInfoRow}>
                <span>식권 차감</span>
                <span className={styles.voucherInfoAmount}>
                  -{selected.voucherConsumed.toLocaleString()}원
                </span>
              </div>
            )}

            <div className={styles.modalTotal}>
              <span>{selected.totalAmount === 0 ? '추가 결제 없음' : '추가 결제 금액'}</span>
              <span className={styles.modalTotalAmount}>
                {selected.totalAmount.toLocaleString()}원
              </span>
            </div>

            {selected.totalAmount === 0 ? (
              <div className={styles.voucherOnlyHint}>
                식권으로 전액 결제됩니다. 카드/현금을 받지 마세요.
              </div>
            ) : (
              <div className={styles.methodRow}>
                <button
                  type="button"
                  className={`${styles.methodButton} ${
                    chosenMethod === 'external_card' ? styles.methodButtonActive : ''
                  }`}
                  onClick={() => setChosenMethod('external_card')}
                  disabled={submitting}
                >
                  <CreditCard strokeWidth={1.4} size={28} aria-hidden />
                  <span>카드</span>
                </button>
                <button
                  type="button"
                  className={`${styles.methodButton} ${
                    chosenMethod === 'cash' ? styles.methodButtonActive : ''
                  }`}
                  onClick={() => setChosenMethod('cash')}
                  disabled={submitting}
                >
                  <Wallet strokeWidth={1.4} size={28} aria-hidden />
                  <span>현금</span>
                </button>
              </div>
            )}

            {error && <div className={styles.modalError}>{error}</div>}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={closeModal}
                disabled={submitting}
              >
                취소
              </button>
              <button
                type="button"
                className={styles.confirmButton}
                onClick={() => void handleConfirm()}
                disabled={(selected.totalAmount > 0 && !chosenMethod) || submitting}
              >
                {submitting
                  ? '처리 중…'
                  : selected.totalAmount === 0
                    ? '식권 결제 완료'
                    : '결제 완료'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
