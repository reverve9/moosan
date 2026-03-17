import styles from './StepIndicator.module.css'

interface StepIndicatorProps {
  current: number
  total: number
}

export default function StepIndicator({ current, total }: StepIndicatorProps) {
  return (
    <div className={styles.wrapper}>
      <span className={styles.count}>{current}/{total}</span>
      <div className={styles.bar}>
        <div
          className={styles.fill}
          style={{ width: `${(current / total) * 100}%` }}
        />
      </div>
    </div>
  )
}
