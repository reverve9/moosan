import { useCallback, useEffect, useMemo, useState } from 'react'
import { CreditCard, Wallet, Power, RefreshCw, Ticket } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  cancelKioskPending,
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
 * 손님이 키오스크 PhoneStep 에서 쿠폰 적용/미적용을 직접 결정한 뒤 결제요청.
 * 직원은 이 화면에서:
 *   - 메뉴 합계 / 쿠폰 사용 여부 + 차감액 / 받을 금액 확인
 *   - 받을 금액 > 0 이면 [카드]/[현금] 선택해서 결제 완료 처리
 *   - 받을 금액 = 0 (쿠폰 100%) 이면 [쿠폰 결제 완료] 자동 분기
 *
 * 쿠폰 결정 권한은 키오스크 손님에게 있고, 모달은 적용된 결과 표시 + 잔액 결제만 처리.
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
    // 쿠폰만으로 잔액 0 케이스 — chosenMethod 없이도 voucher_only 로 즉시 처리.
    const method: 'external_card' | 'cash' | 'voucher_only' =
      selected.totalAmount === 0 ? 'voucher_only' : (chosenMethod as Method)
    if (selected.totalAmount > 0 && !chosenMethod) return
    setSubmitting(true)
    setError(null)
    try {
      // 쿠폰은 키오스크에서 이미 적용된 상태로 큐에 들어오므로 couponApplication 미전달.
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

  const handleCancelRequest = async () => {
    if (!selected || submitting) return
    const input = window.prompt(
      '결제 요청을 취소합니다. 사유를 입력하세요.',
      '관리자 취소',
    )
    if (input === null) return
    const trimmed = input.trim()
    if (!trimmed) {
      showToast('취소 사유는 필수입니다', { type: 'error' })
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await cancelKioskPending({
        paymentId: selected.paymentId,
        adminId,
        reason: trimmed,
        kioskStationId: selected.kioskStationId,
      })
      showToast('결제 요청을 취소했습니다', { type: 'success' })
      setSelectedPaymentId(null)
      setChosenMethod(null)
      await refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : '취소 처리 실패')
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
                        쿠폰 사용 -{g.voucherConsumed.toLocaleString()}원
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

            {/* ── 쿠폰 사용 여부 + 금액 분해 ── */}
            <div className={styles.breakdown}>
              <div className={styles.breakdownRow}>
                <span>메뉴 합계</span>
                <span>{selected.menuSubtotal.toLocaleString()}원</span>
              </div>
              {selected.voucherConsumed > 0 ? (
                <>
                  <div
                    className={`${styles.breakdownRow} ${styles.breakdownDiscount}`}
                  >
                    <span>
                      <Ticket
                        strokeWidth={1.6}
                        size={16}
                        aria-hidden
                        style={{ verticalAlign: 'text-bottom', marginRight: 6 }}
                      />
                      쿠폰 사용
                    </span>
                    <span>-{selected.voucherConsumed.toLocaleString()}원</span>
                  </div>
                </>
              ) : (
                <div className={styles.breakdownRow} style={{ color: '#6b7280' }}>
                  <span>쿠폰 사용</span>
                  <span>사용 안 함</span>
                </div>
              )}
            </div>

            <div className={styles.modalTotal}>
              <span>{selected.totalAmount === 0 ? '추가 결제 없음' : '받을 금액'}</span>
              <span className={styles.modalTotalAmount}>
                {selected.totalAmount.toLocaleString()}원
              </span>
            </div>

            {selected.totalAmount === 0 ? (
              <div className={styles.voucherOnlyHint}>
                쿠폰으로 전액 결제됩니다. 카드/현금을 받지 마세요.
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
                className={styles.dangerButton}
                onClick={() => void handleCancelRequest()}
                disabled={submitting}
              >
                결제 요청 취소
              </button>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={closeModal}
                disabled={submitting}
              >
                닫기
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
                    ? '쿠폰 결제 완료'
                    : '결제 완료'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
