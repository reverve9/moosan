import { useEffect, useState } from 'react'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import IOSInstallGuide from './IOSInstallGuide'
import InstallConfirmModal from './InstallConfirmModal'
import styles from './FloatingInstallButton.module.css'

const DISMISS_KEY = 'pwa-install-dismissed-at'
const DISMISS_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 7 // 7일
const STACK_OFFSET = 'calc(44px + var(--space-3))'

function isRecentlyDismissed(isDev: boolean): boolean {
  if (isDev) return false
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const ts = Number(raw)
    if (!Number.isFinite(ts)) return false
    return Date.now() - ts < DISMISS_COOLDOWN_MS
  } catch {
    return false
  }
}

export default function FloatingInstallButton() {
  const { canPrompt, ios, hidden, isDev, promptInstall } = usePwaInstall()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [iosGuideOpen, setIosGuideOpen] = useState(false)

  const dismissed = isRecentlyDismissed(isDev)
  const shouldShow = !hidden && !dismissed && (isDev || ios || canPrompt)

  // 마운트되어 실제 렌더되는 동안만 root 에 offset 변수 설정 → FloatingTopButton 이 위로 올라감
  useEffect(() => {
    if (!shouldShow) return
    const root = document.documentElement
    root.style.setProperty('--floating-extra-offset', STACK_OFFSET)
    return () => {
      root.style.removeProperty('--floating-extra-offset')
    }
  }, [shouldShow])

  if (!shouldShow) return null

  const handleOpenConfirm = () => {
    setConfirmOpen(true)
  }

  const handleConfirmInstall = async () => {
    setConfirmOpen(false)
    if (canPrompt) {
      await promptInstall()
      return
    }
    if (ios || isDev) {
      setIosGuideOpen(true)
    }
  }

  return (
    <>
      <div className={styles.wrapper}>
        <button
          type="button"
          onClick={handleOpenConfirm}
          className={styles.button}
          aria-label="홈 화면에 앱 설치"
        >
          <ArrowDownTrayIcon className={styles.icon} />
        </button>
      </div>
      <InstallConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onInstall={handleConfirmInstall}
      />
      <IOSInstallGuide open={iosGuideOpen} onClose={() => setIosGuideOpen(false)} />
    </>
  )
}
