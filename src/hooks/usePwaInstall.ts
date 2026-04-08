import { useSyncExternalStore } from 'react'
import {
  subscribePwaInstall,
  getPwaSnapshot,
  clearDeferredPrompt,
  isStandalone,
  isIOS,
  PWA_IS_DEV,
} from '@/lib/pwaInstall'

export interface UsePwaInstall {
  /** Android Chrome 등에서 deferredPrompt 가 잡혀 즉시 prompt() 호출 가능한 상태 */
  canPrompt: boolean
  /** iOS Safari 여부 (별도 가이드 모달 필요) */
  ios: boolean
  /** 이미 설치되어 standalone 모드로 실행 중 */
  standalone: boolean
  /** 컴포넌트가 UI 를 숨겨야 하는지 (dev 에서는 항상 false) */
  hidden: boolean
  /** dev 모드 플래그 */
  isDev: boolean
  /** Android: 네이티브 prompt 호출. 결과 또는 'unavailable' 반환 */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>
}

export function usePwaInstall(): UsePwaInstall {
  const snap = useSyncExternalStore(subscribePwaInstall, getPwaSnapshot, getPwaSnapshot)
  const ios = isIOS()
  const standalone = isStandalone()
  const canPrompt = !!snap.deferredPrompt
  const hidden = !PWA_IS_DEV && (standalone || snap.installed)

  async function promptInstall() {
    const dp = snap.deferredPrompt
    if (!dp) return 'unavailable' as const
    try {
      await dp.prompt()
      const { outcome } = await dp.userChoice
      clearDeferredPrompt()
      return outcome
    } catch {
      clearDeferredPrompt()
      return 'dismissed' as const
    }
  }

  return { canPrompt, ios, standalone, hidden, isDev: PWA_IS_DEV, promptInstall }
}
