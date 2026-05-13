import type { KioskStationId } from '@/types/database'

/**
 * 어드민 ID → 키오스크 station 매핑.
 *
 * 운영 구조:
 *   - admin01 → helpdesk-1 (스탠바이미고, 외부 URL `/k` 진입)
 *   - admin02 → helpdesk-2 (노트북 02 + 확장 모니터, 헬프데스크 버튼)
 *   - admin03 → helpdesk-3 (노트북 03 + 확장 모니터, 헬프데스크 버튼)
 *   - 그 외      → helpdesk-1 (기본값)
 */
export function getStationByAdminId(adminId: string | null | undefined): KioskStationId {
  if (adminId === 'admin02') return 'helpdesk-2'
  if (adminId === 'admin03') return 'helpdesk-3'
  return 'helpdesk-1'
}

export const STATION_LABEL: Record<KioskStationId, string> = {
  'helpdesk-1': '#1',
  'helpdesk-2': '#2',
  'helpdesk-3': '#3',
}

export const ALL_STATIONS: KioskStationId[] = ['helpdesk-1', 'helpdesk-2', 'helpdesk-3']

/**
 * 외부 URL `/k` 진입 시 station — admin01(스탠바이미고) 고정.
 * `/k/:adminId` 패턴은 기존대로 adminId 매핑.
 */
export const EXTERNAL_DEFAULT_STATION: KioskStationId = 'helpdesk-1'
