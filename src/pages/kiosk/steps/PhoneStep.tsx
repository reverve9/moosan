import { useState } from 'react'
import { ArrowLeft, ArrowRight, Delete } from 'lucide-react'
import { useCart } from '@/store/cartStore'
import { formatPhone, normalizePhone, isValidPhone } from '@/lib/phone'
import { createKioskPaymentPending } from '@/lib/orders'
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
 * 쿠폰: 키오스크에서는 쿠폰 적용/입력 UI 가 없음. 손님은 전화번호만 입력하고
 * 헬프데스크 직원이 결제 처리 모달에서 그 번호로 발급된 보유 쿠폰을 자동
 * 조회·선택·적용한다 (HelpDeskKioskQueueTab).
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

  const digits = normalizePhone(phone)
  const display = formatPhone(digits)
  const phoneValid = isValidPhone(display)

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
        phone: normalizePhone(display),
        totalAmount: cartSubtotal,
        items,
        kioskStationId: stationId,
        alcoholConsentAt,
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

        <div className={styles.totalRow}>
          <span>총 결제 금액</span>
          <span className={styles.totalAmount}>{cartSubtotal.toLocaleString()}원</span>
        </div>

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
