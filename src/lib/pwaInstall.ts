// PWA install 상태를 모듈 레벨에서 한 번만 캡처해서 여러 컴포넌트가 공유한다.
// (beforeinstallprompt 는 한 번만 발생하므로 한 곳에서만 잡고 store 로 배포해야 한다.)

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface PwaSnapshot {
  deferredPrompt: BeforeInstallPromptEvent | null
  installed: boolean
}

let snapshot: PwaSnapshot = { deferredPrompt: null, installed: false }
const listeners = new Set<() => void>()

function emit() {
  // useSyncExternalStore 가 reference 비교하므로 매 변경마다 새 객체로 교체.
  snapshot = { ...snapshot }
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    snapshot.deferredPrompt = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    snapshot.deferredPrompt = null
    snapshot.installed = true
    emit()
  })
}

export function subscribePwaInstall(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getPwaSnapshot(): PwaSnapshot {
  return snapshot
}

export function clearDeferredPrompt() {
  snapshot.deferredPrompt = null
  emit()
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function isIOS(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream
}

export const PWA_IS_DEV = import.meta.env.DEV
