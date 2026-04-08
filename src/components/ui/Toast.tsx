import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import styles from './Toast.module.css'

type ToastType = 'success' | 'info' | 'error'

interface ToastState {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  showToast: (message: string, opts?: { type?: ToastType; duration?: number }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DEFAULT_DURATION = 2200

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const [leaving, setLeaving] = useState(false)
  const timerRef = useRef<number | null>(null)
  const leaveTimerRef = useRef<number | null>(null)
  const idRef = useRef(0)

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (leaveTimerRef.current) {
      window.clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
  }, [])

  const showToast = useCallback(
    (message: string, opts?: { type?: ToastType; duration?: number }) => {
      clearTimers()
      idRef.current += 1
      setLeaving(false)
      setToast({ id: idRef.current, message, type: opts?.type ?? 'success' })

      const duration = opts?.duration ?? DEFAULT_DURATION
      timerRef.current = window.setTimeout(() => {
        setLeaving(true)
        leaveTimerRef.current = window.setTimeout(() => {
          setToast(null)
          setLeaving(false)
        }, 220)
      }, duration)
    },
    [clearTimers],
  )

  useEffect(() => () => clearTimers(), [clearTimers])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div
          className={`${styles.toast} ${styles[toast.type]} ${leaving ? styles.leaving : ''}`}
          role="status"
          aria-live="polite"
          key={toast.id}
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}
