import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import { useCart } from '@/store/cartStore'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import type { KioskStationId } from '@/types/database'
import styles from './KioskPage.module.css'
import MenuStep from './steps/MenuStep'
import PhoneStep from './steps/PhoneStep'
import WaitingStep from './steps/WaitingStep'
import DoneStep from './steps/DoneStep'
import ResetConfirmModal from './ResetConfirmModal'
import AlcoholConsentModal from './AlcoholConsentModal'

export type KioskStep = 'menu' | 'phone' | 'waiting' | 'done'

const IDLE_TIMEOUT_MS = 3 * 60 * 1000
const WARN_BEFORE_MS = 5 * 1000
const FORCE_RESET_EVENT = 'force-reset'

function parseStation(raw: string | null): KioskStationId {
  if (raw === 'helpdesk-2') return 'helpdesk-2'
  if (raw === 'helpdesk-3') return 'helpdesk-3'
  return 'helpdesk-1'
}

/**
 * 헬프데스크 키오스크 단일 페이지.
 *
 * 4단계 step state 머신으로 화면 전환:
 *   menu → phone → waiting → done → (auto reset) → menu
 *
 * 핵심 원칙
 *   · 풀스크린 1920×1080 가로 기준. AdminLayout 외부 standalone 라우트.
 *   · waiting step 에서는 헤더 "처음으로" 버튼 숨김 (이미 orders 인서트 후라
 *     직원 처리만 가능).
 *   · 페이지 마운트 시 cart.clear() — 이전 손님 잔여 장바구니 제거.
 *   · 무동작 타임아웃·force-reset broadcast 는 별도 hook 으로 분리.
 */
export default function KioskPage() {
  const [step, setStep] = useState<KioskStep>('menu')
  const [orderNumbers, setOrderNumbers] = useState<string[]>([])
  const [paymentId, setPaymentId] = useState<string | null>(null)
  const [phone, setPhone] = useState<string>('')
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [alcoholModalOpen, setAlcoholModalOpen] = useState(false)
  const [alcoholConsentAt, setAlcoholConsentAt] = useState<string | null>(null)
  const { clear, items } = useCart()
  const { showToast } = useToast()
  const [searchParams] = useSearchParams()
  const stationId = useMemo<KioskStationId>(
    () => parseStation(searchParams.get('station')),
    [searchParams],
  )
  const forceResetChannelName = `kiosk:${stationId}`

  // 첫 진입 시 한 번만 장바구니 비우기. clear 는 안정적 콜백이지만 의도상 마운트
  // 1회로 한정.
  const didInitRef = useRef(false)
  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true
    clear()
  }, [clear])

  const resetToMenu = useCallback(() => {
    clear()
    setStep('menu')
    setOrderNumbers([])
    setPaymentId(null)
    setPhone('')
    setResetConfirmOpen(false)
    setAlcoholModalOpen(false)
    setAlcoholConsentAt(null)
  }, [clear])

  // menu → phone 전환 진입점. 카트에 주류 메뉴 있으면 알코올 동의 모달부터.
  const handleGoToPhone = useCallback(() => {
    const hasAlcohol = items.some((i) => i.isAlcohol === true)
    if (hasAlcohol && !alcoholConsentAt) {
      setAlcoholModalOpen(true)
      return
    }
    setStep('phone')
  }, [items, alcoholConsentAt])

  const handleAlcoholConfirm = useCallback((consentAt: string) => {
    setAlcoholConsentAt(consentAt)
    setAlcoholModalOpen(false)
    setStep('phone')
  }, [])

  // 무동작 타임아웃 (3분). menu / phone step 에서만 적용. waiting 은 직원 처리
  // 대기 중이므로 제외, done 은 자체 카운트다운으로 자동 리셋.
  useEffect(() => {
    if (step !== 'menu' && step !== 'phone') return

    let warnTimer: number | null = null
    let resetTimer: number | null = null

    const armTimers = () => {
      if (warnTimer) window.clearTimeout(warnTimer)
      if (resetTimer) window.clearTimeout(resetTimer)
      warnTimer = window.setTimeout(() => {
        showToast('잠시 후 처음 화면으로 돌아갑니다', {
          type: 'info',
          duration: WARN_BEFORE_MS - 200,
        })
      }, IDLE_TIMEOUT_MS - WARN_BEFORE_MS)
      resetTimer = window.setTimeout(() => {
        resetToMenu()
      }, IDLE_TIMEOUT_MS)
    }

    const handler = () => armTimers()
    armTimers()

    window.addEventListener('pointerdown', handler)
    window.addEventListener('keydown', handler)
    window.addEventListener('touchstart', handler)

    return () => {
      if (warnTimer) window.clearTimeout(warnTimer)
      if (resetTimer) window.clearTimeout(resetTimer)
      window.removeEventListener('pointerdown', handler)
      window.removeEventListener('keydown', handler)
      window.removeEventListener('touchstart', handler)
    }
  }, [step, resetToMenu, showToast])

  // 어드민에서 보내는 force-reset broadcast 구독 (자신의 station 채널만).
  // 직원이 "키오스크 #N 초기화" 버튼 클릭 시 즉시 menu 로 리셋. step 무관.
  useEffect(() => {
    const channel = supabase
      .channel(forceResetChannelName)
      .on('broadcast', { event: FORCE_RESET_EVENT }, () => {
        resetToMenu()
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [forceResetChannelName, resetToMenu])

  const showResetButton = step === 'menu' || step === 'phone'

  const handleResetClick = () => {
    if (items.length === 0 && step === 'menu') {
      resetToMenu()
      return
    }
    setResetConfirmOpen(true)
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.brand}>
          설악무산문화축전 · 헬프데스크
          <span className={styles.stationBadge}>
            #{stationId === 'helpdesk-3' ? '3' : stationId === 'helpdesk-2' ? '2' : '1'}
          </span>
        </div>
        <div className={styles.headerSpacer} />
        {showResetButton && (
          <button
            type="button"
            className={styles.resetButton}
            onClick={handleResetClick}
            aria-label="처음으로"
          >
            <RotateCcw strokeWidth={1.2} size={28} aria-hidden />
            <span>처음으로</span>
          </button>
        )}
      </header>

      <main className={styles.main}>
        {step === 'menu' && <MenuStep onGoToPhone={handleGoToPhone} />}
        {step === 'phone' && (
          <PhoneStep
            phone={phone}
            stationId={stationId}
            alcoholConsentAt={alcoholConsentAt}
            onPhoneChange={setPhone}
            onBack={() => setStep('menu')}
            onSubmit={(newPaymentId, numbers) => {
              setPaymentId(newPaymentId)
              setOrderNumbers(numbers)
              setStep('waiting')
            }}
          />
        )}
        {step === 'waiting' && (
          <WaitingStep
            paymentId={paymentId}
            orderNumbers={orderNumbers}
            onPaid={() => setStep('done')}
          />
        )}
        {step === 'done' && <DoneStep onAutoReset={resetToMenu} />}
      </main>

      <ResetConfirmModal
        open={resetConfirmOpen}
        onCancel={() => setResetConfirmOpen(false)}
        onConfirm={resetToMenu}
      />

      <AlcoholConsentModal
        open={alcoholModalOpen}
        onCancel={() => setAlcoholModalOpen(false)}
        onConfirm={handleAlcoholConfirm}
      />
    </div>
  )
}
