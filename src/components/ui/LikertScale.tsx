import styles from './LikertScale.module.css'

interface LikertScaleProps {
  label: string
  required?: boolean
  value: number | null
  onChange: (value: number) => void
  /** 기본 1 */
  min?: number
  /** 기본 7 */
  max?: number
  /** 왼쪽 끝 라벨 (예: "전혀 그렇지 않다") */
  leftLabel?: string
  /** 오른쪽 끝 라벨 (예: "매우 그렇다") */
  rightLabel?: string
}

/**
 * 1~N 점 척도 (기본 7점). 양 끝에 라벨 표시.
 * radio 를 가로로 꽉 채워 배치. 탭 크기 충분히 확보.
 */
export default function LikertScale({
  label,
  required,
  value,
  onChange,
  min = 1,
  max = 7,
  leftLabel,
  rightLabel,
}: LikertScaleProps) {
  const points: number[] = []
  for (let i = min; i <= max; i++) points.push(i)

  return (
    <div className={styles.field}>
      <span className={styles.label}>
        {required && <span className={styles.required}>*</span>}
        {label}
      </span>
      <div className={styles.scale}>
        {points.map((point) => (
          <button
            key={point}
            type="button"
            className={`${styles.point} ${value === point ? styles.pointSelected : ''}`}
            onClick={() => onChange(point)}
            aria-label={`${point}점`}
          >
            <span className={styles.pointNumber}>{point}</span>
            <span className={styles.pointDot} />
          </button>
        ))}
      </div>
      {(leftLabel || rightLabel) && (
        <div className={styles.endLabels}>
          <span className={styles.endLabelLeft}>{leftLabel}</span>
          <span className={styles.endLabelRight}>{rightLabel}</span>
        </div>
      )}
    </div>
  )
}
