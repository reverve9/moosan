import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import styles from './AlcoholConsentModal.module.css'

interface Props {
  open: boolean
  onCancel: () => void
  /** 동의한 ISO timestamp (모달이 confirm 시점에 캡처해 전달). */
  onConfirm: (consentAt: string) => void
}

/**
 * 키오스크 주류 동의 모달. PWA 의 동일 흐름과 카피·구조는 일치 (재사용성을 위해
 * 컴포넌트로 분리 — PWA 코드는 인라인 JSX 라 그대로 두고, 키오스크용으로 별도 작성).
 *
 * 동의 사실은 DB 에 따로 저장하지 않고, `alcoholConsentAt` ISO timestamp 만
 * `createKioskPaymentPending` 으로 흘려보내 orders.alcohol_consent_at 에 기록한다.
 */
export default function AlcoholConsentModal({ open, onCancel, onConfirm }: Props) {
  const [checked, setChecked] = useState(false)

  if (!open) return null

  const handleConfirm = () => {
    if (!checked) return
    onConfirm(new Date().toISOString())
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <TriangleAlert strokeWidth={1.2} size={36} aria-hidden />
          <h2 className={styles.title}>주류 포함 주문 확인</h2>
        </div>
        <p className={styles.lead}>주문 내역에 주류가 포함되어 있습니다.</p>
        <ul className={styles.list}>
          <li>만 19세 미만은 주문할 수 없습니다</li>
          <li>픽업 시 신분증을 반드시 제시해야 합니다</li>
          <li>신분증 미제시 시 환불 처리되며, 주류는 제공되지 않습니다</li>
        </ul>
        <label className={styles.consent}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className={styles.checkbox}
          />
          <span>만 19세 이상이며, 위 사항을 확인하고 동의합니다</span>
        </label>
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onCancel}>
            취소
          </button>
          <button
            type="button"
            className={styles.confirm}
            disabled={!checked}
            onClick={handleConfirm}
          >
            동의하고 결제 요청
          </button>
        </div>
      </div>
    </div>
  )
}
