import styles from './InstallConfirmModal.module.css'

interface Props {
  open: boolean
  onClose: () => void
  onInstall: () => void
}

export default function InstallConfirmModal({ open, onClose, onInstall }: Props) {
  if (!open) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="앱 설치 안내"
      >
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="닫기"
        >
          ×
        </button>
        <img src="/icon-192.png" alt="" className={styles.icon} />
        <div className={styles.title}>홈 화면에 추가하기</div>
        <div className={styles.subtitle}>
          앱처럼 빠르게 열어보세요.
          <br />
          오프라인에서도 정보를 확인할 수 있어요.
        </div>
        <button type="button" className={styles.installBtn} onClick={onInstall}>
          설치하기
        </button>
      </div>
    </div>
  )
}
