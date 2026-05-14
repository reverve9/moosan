import styles from './ResetConfirmModal.module.css'

interface Props {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
  /** 헤더 — 기본값은 "처음으로" 시나리오 */
  title?: string
  body?: string
  confirmLabel?: string
}

/** 카트/플로우 리셋 확인 모달.
 *  - 헤더 "처음으로": 기본 문구 그대로 (담은 메뉴+진행단계 전체 리셋)
 *  - 카트 바 "비우기": title/body/confirmLabel override (카트만 비우기) */
export default function ResetConfirmModal({
  open,
  onCancel,
  onConfirm,
  title = '처음부터 다시 시작할까요?',
  body = '담은 메뉴를 모두 비우고 처음 화면으로 돌아갑니다.',
  confirmLabel = '다시 시작',
}: Props) {
  if (!open) return null

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.body}>{body}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onCancel}>
            취소
          </button>
          <button type="button" className={styles.confirm} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
