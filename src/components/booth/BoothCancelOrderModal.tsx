import { TriangleAlert, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import styles from './BoothCancelOrderModal.module.css'

interface BoothCancelOrderModalProps {
  orderNumber: string
  refundAmount: number
  busy: boolean
  onConfirm: (reason: string) => void
  onClose: () => void
}

const PRESET_REASONS = [
  '재료 소진',
  '조리 불가',
  '손님 요청',
  '기타 (직접 입력)',
]

/**
 * 부스 대시보드의 주문 거절 사유 모달.
 * dropdown(사전정의 4종) + 자유 입력. "기타" 선택 시 자유 입력 강제.
 * 확인 → onConfirm(reason) 호출 (호출자가 cancelBoothOrder 실행).
 */
export default function BoothCancelOrderModal({
  orderNumber,
  refundAmount,
  busy,
  onConfirm,
  onClose,
}: BoothCancelOrderModalProps) {
  const [preset, setPreset] = useState<string>(PRESET_REASONS[0])
  const [customText, setCustomText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const isCustom = preset === PRESET_REASONS[3]

  // ESC 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSubmit = () => {
    const reason = isCustom ? customText.trim() : preset
    if (reason.length === 0) {
      setError('사유를 입력해주세요')
      return
    }
    setError(null)
    onConfirm(reason)
  }

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={styles.modal} role="dialog" aria-modal="true">
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <TriangleAlert className={styles.warningIcon} />
            <h2 className={styles.title}>주문 거절</h2>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="닫기"
            disabled={busy}
          >
            <X className={styles.closeIcon} />
          </button>
        </header>

        <div className={styles.body}>
          <p className={styles.notice}>
            <strong>{orderNumber}</strong> 주문을 거절합니다.
            <br />
            손님에게 <strong>{refundAmount.toLocaleString()}원</strong> 이 환불 처리됩니다.
          </p>

          <div className={styles.field}>
            <label className={styles.label}>거절 사유</label>
            <div className={styles.options}>
              {PRESET_REASONS.map((p) => (
                <label
                  key={p}
                  className={`${styles.option} ${preset === p ? styles.optionActive : ''}`}
                >
                  <input
                    type="radio"
                    name="reason-preset"
                    value={p}
                    checked={preset === p}
                    onChange={() => setPreset(p)}
                    disabled={busy}
                  />
                  <span>{p}</span>
                </label>
              ))}
            </div>
          </div>

          {isCustom && (
            <div className={styles.field}>
              <label className={styles.label}>사유 직접 입력</label>
              <textarea
                className={styles.textarea}
                placeholder="손님에게 표시될 사유를 입력해주세요"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                rows={3}
                disabled={busy}
                autoFocus
              />
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={busy}
          >
            취소
          </button>
          <button
            type="button"
            className={styles.confirmBtn}
            onClick={handleSubmit}
            disabled={busy}
          >
            {busy ? '처리 중...' : '거절 + 환불'}
          </button>
        </footer>
      </div>
    </div>
  )
}
