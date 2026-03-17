import styles from './Footer.module.css'

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.info}>
          <p className={styles.org}>설악만해사상실천선양회</p>
          <p className={styles.address}>강원도 속초시 청초호수공원 엑스포광장</p>
        </div>
        <div className={styles.sponsors}>
          <span className={styles.sponsorLabel}>후원</span>
          <span>문화체육관광부</span>
          <span>강원특별자치도</span>
          <span>속초시</span>
        </div>
        <p className={styles.copyright}>
          &copy; 2026 설악무산문화축전. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
