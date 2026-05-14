import PageTitle from '@/components/layout/PageTitle'
import styles from './LocationSection.module.css'

/**
 * 오시는 길 — 구글맵 iframe 임베드만. 키·심사 불필요.
 *
 * 카카오맵 JavaScript SDK 는 2024.12.1~ 정책상 비즈앱 전환 + 추가 기능 신청 +
 * 카카오맵 권한 승인 절차가 필요해 D-day 마감엔 부적합 → 구글맵 우회.
 * 비즈앱 통과되면 추후 Kakao SDK 로 교체 가능.
 */

// 청초호수공원 엑스포광장 — 강원도 속초시 조양동 1546-1
const PIN_NAME = '청초호수공원 엑스포광장'
const ADDRESS = '강원도 속초시 조양동 1546-1'

// 구글맵 iframe — 주소 텍스트 query 로 geocoding. z 작을수록 넓게.
const GOOGLE_MAPS_EMBED = `https://www.google.com/maps?q=${encodeURIComponent(
  ADDRESS,
)}&hl=ko&z=14&output=embed`

export default function LocationSection() {
  return (
    <section id="location" className={styles.location}>
      <PageTitle title="오시는 길" description={ADDRESS} />
      <div className={styles.container}>
        <div className={styles.mapWrap}>
          <iframe
            title={`${PIN_NAME} 지도`}
            src={GOOGLE_MAPS_EMBED}
            className={styles.map}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      </div>
    </section>
  )
}
