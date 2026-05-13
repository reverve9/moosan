import styles from './ResetConfirmModal.module.css'

interface Props {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}

/** "처음으로" 버튼 클릭 시 장바구니 있을 때 띄우는 확인 모달. */
export default function ResetConfirmModal({ open, onCancel, onConfirm }: Props) {
  if (!open) return null

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <h2 className={styles.title}>처음부터 다시 시작할까요?</h2>
        <p className={styles.body}>
          담은 메뉴를 모두 비우고 처음 화면으로 돌아갑니다.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onCancel}>
            취소
          </button>
          <button type="button" className={styles.confirm} onClick={onConfirm}>
            다시 시작
          </button>
        </div>
      </div>
    </div>
  )
}
