import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Delete, Ticket } from 'lucide-react'
import { useCart } from '@/store/cartStore'
import { formatPhone, normalizePhone, isValidPhone } from '@/lib/phone'
import { createKioskPaymentPending } from '@/lib/orders'
import { validateCouponByCode, calcVoucherSettlement } from '@/lib/coupons'
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

interface ValidatedVoucher {
  couponId: string
  voucherAmount: number
}

/**
 * 키오스크 phone step — 큰 숫자 키패드로 전번 입력 후 결제 요청.
 *
 * 식권 (선택) — `pwa` 의 자동 감지 로직은 이식하지 않고, 손님이 식권 코드 직접
 * 입력하는 형태. validateCouponByCode 호출로 검증 후 차감 금액·잔액 표시.
 *
 * 검증 통과 시 createKioskPaymentPending 호출 → orders insert (status=payment_pending)
 * → waiting step 으로 전환.
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

  // 식권 입력
  const [voucherCode, setVoucherCode] = useState('')
  const [voucherValidating, setVoucherValidating] = useState(false)
  const [voucherError, setVoucherError] = useState<string | null>(null)
  const [validatedVoucher, setValidatedVoucher] = useState<ValidatedVoucher | null>(null)

  const digits = normalizePhone(phone)
  const display = formatPhone(digits)
  const phoneValid = isValidPhone(display)

  // 식권 분배 — boothId 별 subtotal 합산 후 calcVoucherSettlement
  const settlement = useMemo(() => {
    if (!validatedVoucher) return null
    const boothSubtotalMap = new Map<string, number>()
    for (const it of items) {
      boothSubtotalMap.set(
        it.boothId,
        (boothSubtotalMap.get(it.boothId) ?? 0) + it.price * it.quantity,
      )
    }
    const booths = Array.from(boothSubtotalMap.entries()).map(([boothId, subtotal]) => ({
      boothId,
      subtotal,
    }))
    return calcVoucherSettlement(booths, validatedVoucher.voucherAmount)
  }, [items, validatedVoucher])

  const userPaid = settlement ? settlement.userPaid : cartSubtotal

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

  const handleVoucherApply = async () => {
    const code = voucherCode.trim().toUpperCase()
    if (!code || voucherValidating) return
    setVoucherValidating(true)
    setVoucherError(null)
    try {
      const result = await validateCouponByCode(code, cartSubtotal)
      if (!result.valid) {
        setVoucherError(result.error || '식권 검증 실패')
        return
      }
      if (result.type !== 'meal_voucher') {
        setVoucherError('식권만 사용 가능합니다')
        return
      }
      setValidatedVoucher({
        couponId: result.couponId,
        voucherAmount: result.voucherAmount,
      })
    } catch (e) {
      setVoucherError(e instanceof Error ? e.message : '식권 검증 실패')
    } finally {
      setVoucherValidating(false)
    }
  }

  const handleVoucherClear = () => {
    setValidatedVoucher(null)
    setVoucherCode('')
    setVoucherError(null)
  }

  const handleSubmit = async () => {
    if (!phoneValid || items.length === 0 || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await createKioskPaymentPending({
        phone: normalizePhone(display),
        totalAmount: userPaid,
        items,
        kioskStationId: stationId,
        alcoholConsentAt,
        couponId: validatedVoucher?.couponId ?? null,
        voucherDistributions: settlement
          ? settlement.distributions.map((d) => ({
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
      <div className={styles.left}>
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

        {/* ─── 식권 영역 ─── */}
        <div className={styles.voucherBlock}>
          <div className={styles.voucherHeader}>
            <Ticket strokeWidth={1.2} size={22} aria-hidden />
            <span className={styles.voucherLabel}>식권 사용 (선택)</span>
          </div>
          {!validatedVoucher ? (
            <div className={styles.voucherRow}>
              <input
                type="text"
                value={voucherCode}
                onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                placeholder="식권 코드 입력"
                className={styles.voucherInput}
                disabled={voucherValidating || submitting}
                spellCheck={false}
                autoCapitalize="characters"
              />
              <button
                type="button"
                className={styles.voucherButton}
                onClick={() => void handleVoucherApply()}
                disabled={!voucherCode.trim() || voucherValidating || submitting}
              >
                {voucherValidating ? '확인 중…' : '적용'}
              </button>
            </div>
          ) : (
            <div className={styles.voucherApplied}>
              <div className={styles.voucherAppliedInfo}>
                <span className={styles.voucherAppliedLabel}>식권 차감</span>
                <span className={styles.voucherAppliedAmount}>
                  -{Math.min(validatedVoucher.voucherAmount, cartSubtotal).toLocaleString()}원
                </span>
              </div>
              <button
                type="button"
                className={styles.voucherClearButton}
                onClick={handleVoucherClear}
                disabled={submitting}
              >
                해제
              </button>
            </div>
          )}
          {voucherError && <div className={styles.voucherError}>{voucherError}</div>}
        </div>

        <div className={styles.totalRow}>
          <span>{validatedVoucher ? '추가 결제 금액' : '총 결제 금액'}</span>
          <span className={styles.totalAmount}>{userPaid.toLocaleString()}원</span>
        </div>
        {validatedVoucher && userPaid === 0 && (
          <div className={styles.voucherFullCover}>
            식권으로 전액 결제 — 직원은 별도 카드/현금 받지 않습니다.
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

      <div className={styles.right}>
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
    </div>
  )
}
