import { useCallback, useEffect, useMemo, useState } from 'react'
import { CreditCard, Wallet, Power, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  cancelKioskPending,
  confirmKioskPayment,
  fetchKioskPendingQueue,
  sendKioskForceReset,
  type KioskQueueGroup,
} from '@/lib/helpDesk'
import {
  type AvailableCouponOption,
  type BoothVoucherDistribution,
  calcVoucherSettlement,
  fetchAvailableCouponsByPhone,
  VOUCHER_SOURCE_LABEL,
} from '@/lib/coupons'
import { ALL_STATIONS, STATION_LABEL } from '@/lib/kioskStation'
import type { KioskStationId } from '@/types/database'
import { useToast } from '@/components/ui/Toast'
import { formatPhoneDisplay, normalizePhone } from '@/lib/phone'
import styles from './HelpDeskKioskQueueTab.module.css'

interface Props {
  adminId: string
}

type Method = 'external_card' | 'cash'
type CouponSelection = string // 'none' | couponId

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
 * 인 orders 가 생성됨. 이 화면은 그 큐를 실시간으로 표시하고, 직원이:
 *   1) 손님 전화번호로 발급된 보유 쿠폰을 자동 조회해 보여주고
 *   2) 직원이 사용할 쿠폰을 단일 선택 (또는 사용 안 함)
 *   3) 추가 결제 금액(메뉴 합계 − 쿠폰 차감)이 0 → [쿠폰 결제 완료] 자동 분기
 *      > 0 → [카드]/[현금] 중 선택 받음
 *   4) `confirmKioskPayment` 호출 (쿠폰 적용 정보 포함)
 *
 * Realtime: orders 테이블 INSERT/UPDATE 감지 → 큐 refetch.
 */
export default function HelpDeskKioskQueueTab({ adminId }: Props) {
  const { showToast } = useToast()
  const [queue, setQueue] = useState<KioskQueueGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    try {
      const data = await fetchKioskPendingQueue()
      setQueue(data)
    } catch (e) {
      showToast(e instanceof Error ? e.message : '큐 조회 실패', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [showToast])

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
                  onClick={() => setSelectedPaymentId(g.paymentId)}
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
                  </div>
                  <div className={styles.queueItemTotal}>
                    {g.menuSubtotal.toLocaleString()}원
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {selected && (
        <PaymentModal
          group={selected}
          adminId={adminId}
          onClose={() => setSelectedPaymentId(null)}
          onDone={async () => {
            setSelectedPaymentId(null)
            await refetch()
          }}
          showToast={showToast}
        />
      )}
    </div>
  )
}

// ─── 결제 처리 모달 ────────────────────────────────────────────

interface PaymentModalProps {
  group: KioskQueueGroup
  adminId: string
  onClose: () => void
  onDone: () => Promise<void> | void
  showToast: ReturnType<typeof useToast>['showToast']
}

function PaymentModal({ group, adminId, onClose, onDone, showToast }: PaymentModalProps) {
  const [availableCoupons, setAvailableCoupons] = useState<AvailableCouponOption[]>([])
  const [couponsLoading, setCouponsLoading] = useState(true)
  const [selectedCouponId, setSelectedCouponId] = useState<CouponSelection>('none')
  const [chosenMethod, setChosenMethod] = useState<Method | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 전화번호 기준 보유 쿠폰 조회 (모달 열 때 1회)
  useEffect(() => {
    let cancelled = false
    setCouponsLoading(true)
    fetchAvailableCouponsByPhone(normalizePhone(group.phone))
      .then((opts) => {
        if (cancelled) return
        // 운영 정책: 식권(meal_voucher) 만 키오스크 큐에서 적용 가능
        setAvailableCoupons(opts.filter((c) => c.kind === 'voucher'))
      })
      .catch(() => {
        if (!cancelled) setAvailableCoupons([])
      })
      .finally(() => {
        if (!cancelled) setCouponsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [group.phone])

  // 부스별 정가 합 그룹 (calcVoucherSettlement 인자용)
  const boothGroups = useMemo(
    () => group.orders.map((o) => ({ boothId: o.booth_id, subtotal: o.subtotal })),
    [group.orders],
  )

  // 선택한 쿠폰 + 분배 계산
  const selectedCoupon = useMemo(
    () => availableCoupons.find((c) => c.couponId === selectedCouponId) ?? null,
    [availableCoupons, selectedCouponId],
  )

  const calc = useMemo(() => {
    const base = {
      voucherConsumed: 0,
      voucherBurned: 0,
      userPaid: group.menuSubtotal,
      distributions: [] as BoothVoucherDistribution[],
    }
    if (!selectedCoupon || selectedCoupon.kind !== 'voucher') return base
    const settle = calcVoucherSettlement(boothGroups, selectedCoupon.amount)
    return {
      voucherConsumed: settle.consumed,
      voucherBurned: settle.burned,
      userPaid: settle.userPaid,
      distributions: settle.distributions,
    }
  }, [selectedCoupon, boothGroups, group.menuSubtotal])

  const userPaid = calc.userPaid
  const isVoucherOnly = userPaid === 0 && !!selectedCoupon

  const handleConfirm = async () => {
    if (submitting) return
    if (userPaid > 0 && !chosenMethod) return
    setSubmitting(true)
    setError(null)
    try {
      const method: 'external_card' | 'cash' | 'voucher_only' = isVoucherOnly
        ? 'voucher_only'
        : (chosenMethod as Method)
      const couponApplication =
        selectedCoupon && selectedCoupon.kind === 'voucher'
          ? {
              couponId: selectedCoupon.couponId,
              totalAmount: userPaid,
              distributions: calc.distributions.map((d) => ({
                boothId: d.boothId,
                voucherConsumed: d.voucherConsumed,
                voucherBurned: d.voucherBurned,
              })),
            }
          : undefined
      await confirmKioskPayment(group.paymentId, method, adminId, couponApplication)
      showToast('결제 완료 처리됨', { type: 'success' })
      await onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : '결제 완료 처리 실패')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelRequest = async () => {
    if (submitting) return
    const input = window.prompt('결제 요청을 취소합니다. 사유를 입력하세요.', '관리자 취소')
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
        paymentId: group.paymentId,
        adminId,
        reason: trimmed,
        kioskStationId: group.kioskStationId,
      })
      showToast('결제 요청을 취소했습니다', { type: 'success' })
      await onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : '취소 처리 실패')
    } finally {
      setSubmitting(false)
    }
  }

  const handleOverlayClose = () => {
    if (submitting) return
    onClose()
  }

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      onClick={handleOverlayClose}
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>결제 처리</h2>
          <div className={styles.modalPhone}>{formatPhoneDisplay(group.phone)}</div>
        </header>

        <div className={styles.modalOrders}>
          {group.orders.map((o) => (
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
                    {it.menu_name} × {it.quantity} · {it.subtotal.toLocaleString()}원
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* ── 쿠폰 선택 ── */}
        <section className={styles.couponSection}>
          <h3 className={styles.couponSectionTitle}>보유 쿠폰 (전화번호 기준)</h3>
          {couponsLoading ? (
            <div className={styles.couponEmpty}>쿠폰 조회 중…</div>
          ) : availableCoupons.length === 0 ? (
            <div className={styles.couponEmpty}>발급된 쿠폰이 없습니다</div>
          ) : (
            <div className={styles.couponList}>
              <button
                type="button"
                className={`${styles.couponItem} ${styles.couponItemNone} ${
                  selectedCouponId === 'none' ? styles.couponItemActive : ''
                }`}
                onClick={() => setSelectedCouponId('none')}
                disabled={submitting}
              >
                <span>쿠폰 사용 안 함</span>
              </button>
              {availableCoupons.map((c) => {
                if (c.kind !== 'voucher') return null
                const active = selectedCouponId === c.couponId
                return (
                  <button
                    key={c.couponId}
                    type="button"
                    className={`${styles.couponItem} ${active ? styles.couponItemActive : ''}`}
                    onClick={() => setSelectedCouponId(c.couponId)}
                    disabled={submitting}
                  >
                    <span className={styles.couponPrimary}>
                      {c.amount.toLocaleString()}원 쿠폰
                    </span>
                    <span className={styles.couponSub}>
                      [{VOUCHER_SOURCE_LABEL[c.source]}] · {c.remainingCount}장
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* ── 금액 계산 ── */}
        <div className={styles.breakdown}>
          <div className={styles.breakdownRow}>
            <span>메뉴 합계</span>
            <span>{group.menuSubtotal.toLocaleString()}원</span>
          </div>
          {calc.voucherConsumed > 0 && (
            <div className={`${styles.breakdownRow} ${styles.breakdownDiscount}`}>
              <span>쿠폰 차감</span>
              <span>-{calc.voucherConsumed.toLocaleString()}원</span>
            </div>
          )}
          {calc.voucherBurned > 0 && (
            <div className={`${styles.breakdownRow} ${styles.breakdownDiscount}`}>
              <span>쿠폰 잔액 소멸</span>
              <span>-{calc.voucherBurned.toLocaleString()}원</span>
            </div>
          )}
        </div>

        <div className={styles.modalTotal}>
          <span>{isVoucherOnly ? '추가 결제 없음' : '추가 결제 금액'}</span>
          <span className={styles.modalTotalAmount}>{userPaid.toLocaleString()}원</span>
        </div>

        {isVoucherOnly ? (
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
            onClick={onClose}
            disabled={submitting}
          >
            닫기
          </button>
          <button
            type="button"
            className={styles.confirmButton}
            onClick={() => void handleConfirm()}
            disabled={(userPaid > 0 && !chosenMethod) || submitting}
          >
            {submitting ? '처리 중…' : isVoucherOnly ? '쿠폰 결제 완료' : '결제 완료'}
          </button>
        </div>
      </div>
    </div>
  )
}
