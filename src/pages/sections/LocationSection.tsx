import PageTitle from '@/components/layout/PageTitle'
import styles from './LocationSection.module.css'

/**
 * 오시는 길 — 구글맵 iframe 임베드만. 키·심사 불필요.
 *
 * 카카오맵 JavaScript SDK 는 2024.12.1~ 정책상 비즈앱 전환 + 추가 기능 신청 +
 * 카카오맵 권한 승인 절차가 필요해 D-day 마감엔 부적합 → 구글맵 우회.
 * 비즈앱 통과되면 추후 Kakao SDK 로 교체 가능.
 */

// 엑스포잔디광장 — 강원 속초시 조양동 1546-1
const PLACE_NAME = '강원 속초시 엑스포잔디광장'

// 구글맵 iframe — 장소명을 query 로 넘겨 Google geocoder 가 핀 박음. z 작을수록 넓게.
const GOOGLE_MAPS_EMBED = `https://www.google.com/maps?q=${encodeURIComponent(
  PLACE_NAME,
)}&hl=ko&z=14&output=embed`

export default function LocationSection() {
  return (
    <section id="location" className={styles.location}>
      <PageTitle title="오시는 길" description={PLACE_NAME} />
      <div className={styles.container}>
        <div className={styles.mapWrap}>
          <iframe
            title={`${PLACE_NAME} 지도`}
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
