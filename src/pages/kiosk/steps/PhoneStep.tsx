import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Delete, Ticket } from 'lucide-react'
import { useCart } from '@/store/cartStore'
import { formatPhone, normalizePhone, isValidPhone } from '@/lib/phone'
import { createKioskPaymentPending } from '@/lib/orders'
import {
  type AvailableCouponOption,
  type BoothVoucherDistribution,
  calcVoucherSettlement,
  fetchAvailableCouponsByPhone,
} from '@/lib/coupons'
import type { KioskStationId } from '@/types/database'
import styles from './PhoneStep.module.css'

interface Props {
  phone: string
  stationId: KioskStationId
  alcoholConsentAt: string | null
  onPhoneChange: (phone: string) => void
  onBack: () => void
  onSubmit: (paymentId: string, orderNumbers: string[]) => void
}

const KEYPAD_KEYS: (string | 'back' | 'space')[] = [
  '1', '2', '3',
  '4', '5', '6',
  '7', '8', '9',
  'space', '0', 'back',
]

/**
 * 키오스크 phone step — 큰 숫자 키패드로 전번 입력 후 결제 요청.
 *
 * 쿠폰 흐름 (전화번호 자동 매칭):
 *  - 11자리 정확히 입력 → fetchAvailableCouponsByPhone 로 보유 쿠폰 자동 표시
 *  - 손님이 직접 라디오 선택 (사용 안 함 / 보유 쿠폰 단일 선택)
 *  - 선택 시 calcVoucherSettlement 으로 부스 분배 + 추가 결제 금액 자동 계산
 *  - 결제요청 시 createKioskPaymentPending 에 couponId + voucherDistributions 전달
 *
 * 운영 정책: 발급된 모든 쿠폰은 type='meal_voucher'. discount 쿠폰은 필터링하여 표시 X.
 */
export default function PhoneStep({
  phone,
  stationId,
  alcoholConsentAt,
  onPhoneChange,
  onBack,
  onSubmit,
}: Props) {
  const { items, totalAmount: cartSubtotal } = useCart()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [availableCoupons, setAvailableCoupons] = useState<AvailableCouponOption[]>([])
  const [selectedCouponId, setSelectedCouponId] = useState<string>('none')
  const [couponsLoading, setCouponsLoading] = useState(false)

  const digits = normalizePhone(phone)
  const display = formatPhone(digits)
  const phoneValid = isValidPhone(display)

  // 전번 11자리 입력 완료 시 보유 쿠폰 자동 조회
  useEffect(() => {
    if (!phoneValid) {
      setAvailableCoupons([])
      setSelectedCouponId('none')
      setCouponsLoading(false)
      return
    }
    let cancelled = false
    setCouponsLoading(true)
    fetchAvailableCouponsByPhone(digits)
      .then((opts) => {
        if (cancelled) return
        // 운영 정책: 쿠폰(meal_voucher) 만 키오스크에서 적용 가능
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
  }, [digits, phoneValid])

  // 부스별 정가 합 그룹 (calcVoucherSettlement 인자)
  const boothGroups = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) {
      m.set(it.boothId, (m.get(it.boothId) ?? 0) + it.price * it.quantity)
    }
    return Array.from(m.entries()).map(([boothId, subtotal]) => ({ boothId, subtotal }))
  }, [items])

  const selectedCoupon = useMemo(
    () => availableCoupons.find((c) => c.couponId === selectedCouponId) ?? null,
    [availableCoupons, selectedCouponId],
  )

  const calc = useMemo(() => {
    const base = {
      voucherConsumed: 0,
      voucherBurned: 0,
      userPaid: cartSubtotal,
      distributions: [] as BoothVoucherDistribution[],
    }
    if (!selectedCoupon || selectedCoupon.kind !== 'voucher') return base
    const s = calcVoucherSettlement(boothGroups, selectedCoupon.amount)
    return {
      voucherConsumed: s.consumed,
      voucherBurned: s.burned,
      userPaid: s.userPaid,
      distributions: s.distributions,
    }
  }, [selectedCoupon, boothGroups, cartSubtotal])

  const userPaid = calc.userPaid

  const handleKey = (key: string | 'back' | 'space') => {
    setError(null)
    if (key === 'space') return
    if (key === 'back') {
      onPhoneChange(formatPhone(digits.slice(0, -1)))
      return
    }
    if (digits.length >= 11) return
    onPhoneChange(formatPhone(digits + key))
  }

  const handleSubmit = async () => {
    if (!phoneValid || items.length === 0 || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await createKioskPaymentPending({
        phone: digits,
        totalAmount: userPaid,
        items,
        kioskStationId: stationId,
        alcoholConsentAt,
        couponId: selectedCoupon?.couponId ?? null,
        voucherDistributions: selectedCoupon
          ? calc.distributions.map((d) => ({
              boothId: d.boothId,
              voucherConsumed: d.voucherConsumed,
              voucherBurned: d.voucherBurned,
            }))
          : undefined,
      })
      onSubmit(
        result.payment.id,
        result.orders.map((o) => o.order_number),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : '결제 요청 실패')
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.layout}>
      <div className={styles.inner}>
        <h2 className={styles.title}>휴대폰 번호를 입력해주세요</h2>
        <p className={styles.subtitle}>
          입력하신 번호로 픽업 안내가 전송됩니다.
        </p>

        <div className={styles.displayWrap}>
          <div className={styles.display} aria-live="polite">
            {display || <span className={styles.placeholder}>010-0000-0000</span>}
          </div>
          {!phoneValid && digits.length > 0 && (
            <div className={styles.hint}>11자리 010 번호를 입력해주세요</div>
          )}
        </div>

        <div className={styles.keypadWrap}>
          <div className={styles.keypad}>
            {KEYPAD_KEYS.map((key, idx) => {
              if (key === 'space') {
                return <span key={`sp-${idx}`} className={styles.keypadSpacer} aria-hidden />
              }
              if (key === 'back') {
                return (
                  <button
                    key={`bk-${idx}`}
                    type="button"
                    className={`${styles.keyButton} ${styles.keyButtonBack}`}
                    onClick={() => handleKey('back')}
                    aria-label="한 글자 지우기"
                    disabled={submitting}
                  >
                    <Delete strokeWidth={1.2} size={36} aria-hidden />
                  </button>
                )
              }
              return (
                <button
                  key={`k-${idx}`}
                  type="button"
                  className={styles.keyButton}
                  onClick={() => handleKey(key)}
                  disabled={submitting}
                >
                  {key}
                </button>
              )
            })}
          </div>
        </div>

        {/* ─── 보유 쿠폰 (전번 매칭, 있을 때만) ─── */}
        {phoneValid && !couponsLoading && availableCoupons.length > 0 && (
          <div className={styles.couponSection}>
            <div className={styles.couponSectionTitle}>
              <Ticket strokeWidth={1.4} size={20} aria-hidden />
              <span>보유 쿠폰 — 사용하시겠습니까?</span>
            </div>
            <div className={styles.couponList}>
              <button
                type="button"
                className={`${styles.couponCard} ${styles.couponCardNone} ${
                  selectedCouponId === 'none' ? styles.couponCardActive : ''
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
                    className={`${styles.couponCard} ${active ? styles.couponCardActive : ''}`}
                    onClick={() => setSelectedCouponId(c.couponId)}
                    disabled={submitting}
                  >
                    <span className={styles.couponCardPrimary}>
                      {c.amount.toLocaleString()}원 쿠폰
                    </span>
                    <span className={styles.couponCardSub}>{c.remainingCount}장 보유</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ─── 쿠폰 적용 요약 ─── */}
        {selectedCoupon && calc.voucherConsumed > 0 && (
          <div className={styles.couponSummary}>
            <div className={styles.couponSummaryRow}>
              <span>메뉴 합계</span>
              <span>{cartSubtotal.toLocaleString()}원</span>
            </div>
            <div className={styles.couponSummaryRow}>
              <span>쿠폰 차감</span>
              <span className={styles.couponSummaryStrong}>
                -{calc.voucherConsumed.toLocaleString()}원
              </span>
            </div>
            {calc.voucherBurned > 0 && (
              <div className={styles.couponSummaryRow}>
                <span>쿠폰 잔액 소멸</span>
                <span>-{calc.voucherBurned.toLocaleString()}원</span>
              </div>
            )}
          </div>
        )}

        <div className={styles.totalRow}>
          <span>{selectedCoupon ? '추가 결제 금액' : '총 결제 금액'}</span>
          <span className={styles.totalAmount}>{userPaid.toLocaleString()}원</span>
        </div>
        {selectedCoupon && userPaid === 0 && (
          <div className={styles.voucherFullCover}>
            쿠폰으로 전액 결제 — 직원은 별도 카드/현금 받지 않습니다.
          </div>
        )}

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.backButton}
            onClick={onBack}
            disabled={submitting}
          >
            <ArrowLeft strokeWidth={1.2} size={28} aria-hidden />
            <span>메뉴로</span>
          </button>
          <button
            type="button"
            className={styles.submitButton}
            disabled={!phoneValid || items.length === 0 || submitting}
            onClick={handleSubmit}
          >
            <span>{submitting ? '요청 중…' : '결제 요청'}</span>
            <ArrowRight strokeWidth={1.2} size={28} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}
