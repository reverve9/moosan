import Text from '@/components/ui/Text'
import Divider from '@/components/ui/Divider'
import styles from './Footer.module.css'

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.info}>
          <Text variant="body" weight="semibold">
            설악만해사상실천선양회
          </Text>
          <Text variant="caption" color="secondary">
            강원도 속초시 청초호수공원 엑스포광장
          </Text>
        </div>
        <div className={styles.sponsors}>
          <Text variant="caption" weight="semibold" color="primary" className={styles.sponsorLabel}>
            후원
          </Text>
          <Text variant="caption" color="secondary">문화체육관광부</Text>
          <Text variant="caption" color="secondary">강원특별자치도</Text>
          <Text variant="caption" color="secondary">속초시</Text>
        </div>
        <Divider />
        <Text variant="caption" color="muted">
          &copy; 2026 설악무산문화축전. All rights reserved.
        </Text>
      </div>
    </footer>
  )
}
