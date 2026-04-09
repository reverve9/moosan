import { AtSymbolIcon, EnvelopeIcon, PhoneIcon } from '@heroicons/react/24/outline'
import Text from '@/components/ui/Text'
import styles from './Footer.module.css'

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.info}>
          <img
            src="/images/header_logo.png"
            alt="2026 설악무산문화축전"
            className={styles.logo}
          />
          <Text variant="caption" color="secondary">
            강원도 속초시 청초호수공원 엑스포광장 일원
          </Text>
        </div>
        <div className={styles.contact}>
          <Text variant="caption" weight="semibold" className={styles.sectionLabel}>
            문의처
          </Text>
          <div className={styles.contactList}>
            <div className={styles.contactRow}>
              <a href="tel:01048182674" className={styles.contactItem}>
                <PhoneIcon className={styles.contactIcon} aria-hidden="true" />
                <Text variant="caption" color="secondary" className={styles.contactText}>
                  010-4818-2674
                </Text>
              </a>
              <a href="mailto:seorakyouthfestival@gmail.com" className={styles.contactItem}>
                <EnvelopeIcon className={styles.contactIcon} aria-hidden="true" />
                <Text variant="caption" color="secondary" className={styles.contactTextEn}>
                  seorakyouthfestival@gmail.com
                </Text>
              </a>
            </div>
            <a
              href="https://instagram.com/seorak_youth_festival"
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.contactItem} ${styles.contactItemInsta}`}
            >
              <AtSymbolIcon className={styles.contactIcon} aria-hidden="true" />
              <Text variant="caption" color="secondary" className={styles.contactTextEn}>
                @seorak_youth_festival
              </Text>
            </a>
          </div>
        </div>
        <div className={styles.sponsorsBlock}>
          <img
            src="/images/footer_host.png"
            alt="주최·주관"
            className={`${styles.sponsorRow} ${styles.sponsorRowHost}`}
          />
          <img
            src="/images/footer_sponsors.png"
            alt="후원"
            className={`${styles.sponsorRow} ${styles.sponsorRowSponsors}`}
          />
        </div>
        <div className={styles.copyright}>
          <Text variant="caption" color="muted" className={styles.copyrightText}>
            &copy; Manhae Musan Foundation 2023 All Rights Reserved
          </Text>
          <Text variant="caption" color="muted" className={styles.copyrightText}>
            Produced by MGTNC 2026
          </Text>
        </div>
      </div>
    </footer>
  )
}
