import styles from './IOSInstallGuide.module.css'

interface Props {
  open: boolean
  onClose: () => void
}

export default function IOSInstallGuide({ open, onClose }: Props) {
  if (!open) return null
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>홈 화면에 추가하기</div>
        <ol className={styles.steps}>
          <li>
            Safari 하단의 <strong>공유 버튼</strong>
            <span className={styles.shareIcon} aria-hidden="true">
              ↑
            </span>
            을 누르세요
          </li>
          <li>
            메뉴에서 <strong>"홈 화면에 추가"</strong>를 선택하세요
          </li>
          <li>
            오른쪽 위 <strong>"추가"</strong>를 누르면 완료!
          </li>
        </ol>
        <button type="button" className={styles.close} onClick={onClose}>
          알겠어요
        </button>
      </div>
    </div>
  )
}
