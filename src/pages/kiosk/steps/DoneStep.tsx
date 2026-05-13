import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import styles from './DoneStep.module.css'

interface Props {
  onAutoReset: () => void
}

const COUNTDOWN_SECONDS = 5

/** 결제 완료 후 5초 카운트다운 → menu 로 자동 리셋. */
export default function DoneStep({ onAutoReset }: Props) {
  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS)

  useEffect(() => {
    if (remaining <= 0) {
      onAutoReset()
      return
    }
    const id = window.setTimeout(() => setRemaining((n) => n - 1), 1000)
    return () => window.clearTimeout(id)
  }, [remaining, onAutoReset])

  return (
    <div className={styles.layout}>
      <div className={styles.card}>
        <CheckCircle2
          strokeWidth={1.2}
          size={120}
          className={styles.icon}
          aria-hidden
        />
        <h2 className={styles.title}>결제 완료</h2>
        <p className={styles.subtitle}>
          주문이 정상 접수되었습니다.
          <br />
          부스에서 픽업 안내를 따라 메뉴를 받아주세요.
        </p>
        <div className={styles.countdown}>
          <span className={styles.countdownNumber}>{remaining}</span>
          <span className={styles.countdownLabel}>초 후 처음 화면으로 돌아갑니다</span>
        </div>
      </div>
    </div>
  )
}
