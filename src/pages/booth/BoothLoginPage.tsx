import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  loadBoothSession,
  saveBoothSession,
  verifyBoothLogin,
} from '@/lib/boothAuth'
import styles from './BoothLoginPage.module.css'

export default function BoothLoginPage() {
  const navigate = useNavigate()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // 이미 세션 있으면 곧장 dashboard 로
  useEffect(() => {
    if (loadBoothSession()) {
      navigate('/booth/dashboard', { replace: true })
    }
  }, [navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(null)

    const result = await verifyBoothLogin(loginId, password)

    if (result.ok && result.session) {
      saveBoothSession(result.session)
      navigate('/booth/dashboard', { replace: true })
      return
    }

    if (result.error === 'network_error') {
      setError('네트워크 오류가 발생했습니다. 다시 시도해주세요.')
    } else {
      setError('아이디 또는 비밀번호가 일치하지 않습니다.')
    }
    setSubmitting(false)
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.title}>매장 로그인</h2>
        <p className={styles.sub}>설악무산문화축전 음식페스티벌</p>
        <form className={styles.form} onSubmit={handleSubmit}>
          <input
            className={styles.input}
            type="text"
            inputMode="text"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="아이디"
            value={loginId}
            onChange={(e) => {
              setLoginId(e.target.value)
              setError(null)
            }}
            autoFocus
          />
          <input
            className={styles.input}
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(null)
            }}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.btn} type="submit" disabled={submitting}>
            {submitting ? '확인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
