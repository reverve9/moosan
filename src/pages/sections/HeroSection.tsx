import styles from './HeroSection.module.css'

function getCountdown(targetDate: Date) {
  const now = new Date()
  const diff = targetDate.getTime() - now.getTime()

  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }

  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
}

import { useState, useEffect } from 'react'

export default function HeroSection() {
  const targetDate = new Date('2026-05-15T00:00:00+09:00')
  const [countdown, setCountdown] = useState(getCountdown(targetDate))

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(getCountdown(targetDate))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <section id="hero" className={styles.hero}>
      <div className={styles.overlay} />
      <div className={styles.content}>
        <p className={styles.subtitle}>2026</p>
        <h1 className={styles.title}>설악무산문화축전</h1>
        <p className={styles.date}>2026. 5. 15(금) — 17(일)</p>
        <p className={styles.venue}>강원도 속초 청초호수공원 엑스포광장</p>

        <div className={styles.countdown}>
          <div className={styles.countdownItem}>
            <span className={styles.countdownNumber}>{countdown.days}</span>
            <span className={styles.countdownLabel}>일</span>
          </div>
          <div className={styles.countdownItem}>
            <span className={styles.countdownNumber}>{countdown.hours}</span>
            <span className={styles.countdownLabel}>시간</span>
          </div>
          <div className={styles.countdownItem}>
            <span className={styles.countdownNumber}>{countdown.minutes}</span>
            <span className={styles.countdownLabel}>분</span>
          </div>
          <div className={styles.countdownItem}>
            <span className={styles.countdownNumber}>{countdown.seconds}</span>
            <span className={styles.countdownLabel}>초</span>
          </div>
        </div>

        <div className={styles.cta}>
          <a href="#programs" className={styles.ctaPrimary}>프로그램 보기</a>
          <a href="#apply" className={styles.ctaSecondary}>참가신청하기</a>
        </div>
      </div>
    </section>
  )
}
