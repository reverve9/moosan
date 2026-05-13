import { Navigate, useParams } from 'react-router-dom'

/**
 * 어드민 ID 기반 키오스크 단축 진입.
 *
 *   /k/admin02 → /kiosk?station=helpdesk-1
 *   /k/admin03 → /kiosk?station=helpdesk-2
 *   /k/admin01 / /k/musanfesta → /kiosk?station=helpdesk-1 (기본)
 *
 * 외부 디바이스(스탠바이미고 등)의 브라우저 주소창에 짧은 URL 만 입력해서
 * 자기 station 키오스크로 바로 진입할 수 있게 한다. AdminHelpDesk 의
 * `pickKioskStation` 매핑과 동일 규칙.
 */
function pickStation(adminId: string | undefined): 'helpdesk-1' | 'helpdesk-2' {
  return adminId === 'admin03' ? 'helpdesk-2' : 'helpdesk-1'
}

export default function KioskRedirect() {
  const { adminId } = useParams<{ adminId: string }>()
  const station = pickStation(adminId)
  return <Navigate to={`/kiosk?station=${station}`} replace />
}
