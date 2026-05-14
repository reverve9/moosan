import { Map as MapIcon, Navigation } from 'lucide-react'
import PageTitle from '@/components/layout/PageTitle'
import styles from './LocationSection.module.css'

/**
 * 오시는 길 — 구글맵 iframe 임베드 (키·심사 불필요) + 카카오/네이버 길찾기 deeplink.
 *
 * 원래 카카오맵 JavaScript SDK 사용 계획이었으나 2024.12.1~ 정책상 카카오맵 API 는
 * 비즈앱 전환 + 추가 기능 신청 + 카카오맵 권한 승인 절차가 필요해 D-day 마감엔
 * 부적합. 구글맵 iframe 으로 우회 + 카카오/네이버 길찾기 deeplink (키 불필요)
 * 버튼으로 실제 내비게이션 동선 보존. 비즈앱 통과되면 추후 SDK 교체 가능.
 */

// 청초호수공원 엑스포광장 — 강원도 속초시 조양동 1546-1
// 좌표는 카카오/네이버 길찾기 deeplink 용 추정값. 구글맵 iframe 은 주소 텍스트
// 자체를 geocoding 시키므로 핀 위치는 항상 정확.
const PIN_NAME = '청초호수공원 엑스포광장'
const ADDRESS = '강원도 속초시 조양동 1546-1'
const PIN_LAT = 38.199
const PIN_LNG = 128.5965

// 구글맵 iframe — 주소 텍스트 query 로 geocoding (정확한 핀)
const GOOGLE_MAPS_EMBED = `https://www.google.com/maps?q=${encodeURIComponent(
  ADDRESS,
)}&hl=ko&z=16&output=embed`

// 외부 지도/길찾기 deeplink — 모바일에선 앱 자동 호출, 데스크탑에선 웹.
// 모두 키 불필요 (kakao link / naver v5 URL scheme).
const KAKAO_MAP_URL = `https://map.kakao.com/link/map/${encodeURIComponent(
  PIN_NAME,
)},${PIN_LAT},${PIN_LNG}`
const KAKAO_NAVI_URL = `https://map.kakao.com/link/to/${encodeURIComponent(
  PIN_NAME,
)},${PIN_LAT},${PIN_LNG}`
const NAVER_NAVI_URL = `https://map.naver.com/v5/directions/-/${PIN_LNG},${PIN_LAT},${encodeURIComponent(
  PIN_NAME,
)},,/-/transit`

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

        <div className={styles.actions}>
          <a
            href={KAKAO_NAVI_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.action} ${styles.actionPrimary}`}
          >
            <Navigation strokeWidth={1.6} size={18} aria-hidden />
            <span>카카오 길찾기</span>
          </a>
          <a
            href={NAVER_NAVI_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.action}
          >
            <Navigation strokeWidth={1.6} size={18} aria-hidden />
            <span>네이버 길찾기</span>
          </a>
          <a
            href={KAKAO_MAP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.action}
          >
            <MapIcon strokeWidth={1.6} size={18} aria-hidden />
            <span>카카오맵으로 보기</span>
          </a>
        </div>
      </div>
    </section>
  )
}
