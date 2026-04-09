/**
 * 부분 오픈용 기능 플래그.
 *
 * 프로덕션(musanfesta.com)에서는 VITE_DEV_MODE 를 설정하지 않음 → false.
 * 개발(musanfesta-dev) / 로컬 에서는 VITE_DEV_MODE=true → 전체 기능 노출.
 *
 * 정식 오픈 시: 이 파일 사용처 전부 정리하고 파일 제거.
 */
export const isDevMode = import.meta.env.VITE_DEV_MODE === 'true'
