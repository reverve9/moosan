import { Navigate, useParams } from 'react-router-dom'
import { EXTERNAL_DEFAULT_STATION, getStationByAdminId } from '@/lib/kioskStation'

/**
 * 키오스크 단축 진입 라우트.
 *
 *   /k             → admin01 station (스탠바이미고 외부 URL 전용)
 *   /k/admin01     → helpdesk-1
 *   /k/admin02     → helpdesk-2
 *   /k/admin03     → helpdesk-3
 *   /k/{그 외}     → helpdesk-1 (기본)
 *
 * 외부 디바이스(스탠바이미고) 브라우저 주소창에 짧은 URL 입력 또는
 * 어드민이 직접 URL 입력하는 두 경로를 한 번에 흡수한다.
 */
export default function KioskRedirect() {
  const { adminId } = useParams<{ adminId: string }>()
  const station = adminId ? getStationByAdminId(adminId) : EXTERNAL_DEFAULT_STATION
  return <Navigate to={`/kiosk?station=${station}`} replace />
}
