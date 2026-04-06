import styles from './HeroSection.module.css'

export default function HeroSection() {
  return (
    <section className={styles.hero}>
      <img src="/images/home_bg.png" alt="" className={styles.bg} />
      <img
        src="/images/home_title.png"
        alt="2026 설악무산문화축전"
        className={styles.title}
      />
    </section>
  )
}
