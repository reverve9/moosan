import { useCallback, useEffect, useState } from 'react'
import {
  calcTodayCashFlow,
  endCashSession,
  fetchTodayCashSession,
  reopenCashSession,
  startCashSession,
} from '@/lib/helpDesk'
import type { CashSession } from '@/types/database'
import styles from './AdminHelpDesk.module.css'

interface HelpDeskCashTabProps {
  adminId: string
}

export default function HelpDeskCashTab({ adminId }: HelpDeskCashTabProps) {
  const [session, setSession] = useState<CashSession | null>(null)
  const [cashFlow, setCashFlow] = useState({ cashIn: 0, cashOut: 0, paidCount: 0, cancelledCount: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 입력 state
  const [startAmount, setStartAmount] = useState('')
  const [endAmount, setEndAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [endingMode, setEndingMode] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [s, flow] = await Promise.all([fetchTodayCashSession(), calcTodayCashFlow()])
      setSession(s)
      setCashFlow(flow)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const expectedAmount = session
    ? session.starting_amount + cashFlow.cashIn - cashFlow.cashOut
    : 0

  const handleStart = async () => {
    if (submitting) return
    const n = Number(startAmount.replace(/,/g, ''))
    if (!Number.isFinite(n) || n < 0) {
      setError('올바른 시작 시재 금액을 입력하세요')
      return
    }
    setSubmitting(true)
    try {
      await startCashSession({ startingAmount: n, startedBy: adminId })
      setStartAmount('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '세션 시작 실패')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReopen = async () => {
    if (submitting || !session) return
    const ok = window.confirm(
      '마감을 취소하고 세션을 다시 진행 중 상태로 되돌립니다.\n실제/예상 시재, 차액 값이 초기화됩니다. 계속할까요?',
    )
    if (!ok) return
    setSubmitting(true)
    try {
      await reopenCashSession(session.id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '세션 재오픈 실패')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEnd = async () => {
    if (submitting || !session) return
    const n = Number(endAmount.replace(/,/g, ''))
    if (!Number.isFinite(n) || n < 0) {
      setError('올바른 마감 금액을 입력하세요')
      return
    }
    setSubmitting(true)
    try {
      await endCashSession({
        sessionId: session.id,
        endingAmount: n,
        expectedAmount,
        notes: notes.trim() || null,
        endedBy: adminId,
      })
      setEndAmount('')
      setNotes('')
      setEndingMode(false)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '세션 마감 실패')
    } finally {
      setSubmitting(false)
    }
  }

  const renderDifference = (diff: number) => {
    if (diff === 0) return <span className={styles.cashDiffOk}>일치</span>
    if (diff > 0)
      return (
        <span className={styles.cashDiffPlus}>
          +{diff.toLocaleString()}원 (초과)
        </span>
      )
    return (
      <span className={styles.cashDiffMinus}>
        {diff.toLocaleString()}원 (부족)
      </span>
    )
  }

  if (loading) {
    return <div className={styles.menuEmpty}>불러오는 중…</div>
  }

  // (a) 세션 미시작
  if (!session) {
    return (
      <div className={styles.cashCard}>
        <h3 className={styles.cashTitle}>오늘 시재 세션</h3>
        <p className={styles.cashSub}>아직 시작되지 않았습니다. 거스름돈용 시작 시재를 입력하세요.</p>
        <input
          type="text"
          inputMode="numeric"
          className={styles.cashAmountInput}
          placeholder="시작 시재 (원)"
          value={startAmount}
          onChange={(e) => setStartAmount(e.target.value.replace(/[^\d,]/g, ''))}
        />
        {error && <div className={styles.cartError}>{error}</div>}
        <button
          type="button"
          className={styles.cashPrimaryBtn}
          onClick={handleStart}
          disabled={submitting}
        >
          {submitting ? '처리 중…' : '세션 시작'}
        </button>
      </div>
    )
  }

  const isClosed = session.ended_at != null

  // (d) 마감된 세션
  if (isClosed) {
    return (
      <div className={styles.cashCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 className={styles.cashTitle}>오늘 시재 ({session.session_date})</h3>
          <span className={styles.cashClosedBadge}>마감됨</span>
        </div>
        <div className={styles.cashRow}>
          <span className={styles.cashRowLabel}>시작 시재</span>
          <span className={styles.cashRowValue}>
            {session.starting_amount.toLocaleString()}원
          </span>
        </div>
        <div className={styles.cashRow}>
          <span className={styles.cashRowLabel}>예상 시재</span>
          <span className={styles.cashRowValue}>
            {(session.expected_amount ?? 0).toLocaleString()}원
          </span>
        </div>
        <div className={styles.cashRow}>
          <span className={styles.cashRowLabel}>실제 시재</span>
          <span className={styles.cashRowValue}>
            {(session.ending_amount ?? 0).toLocaleString()}원
          </span>
        </div>
        <div className={styles.cashTotalRow}>
          <span>차액</span>
          <span>{renderDifference(session.difference ?? 0)}</span>
        </div>
        {session.notes && (
          <div className={styles.cashRow}>
            <span className={styles.cashRowLabel}>메모</span>
            <span style={{ fontSize: 13, color: '#374151' }}>{session.notes}</span>
          </div>
        )}
        <div className={styles.cashRow}>
          <span className={styles.cashRowLabel}>마감 시각</span>
          <span style={{ fontSize: 13 }}>
            {session.ended_at
              ? new Date(session.ended_at).toLocaleString('ko-KR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : ''}
          </span>
        </div>
        <div className={styles.cashRow}>
          <span className={styles.cashRowLabel}>마감자</span>
          <span style={{ fontSize: 13 }}>{session.ended_by ?? '—'}</span>
        </div>
        {error && <div className={styles.cartError}>{error}</div>}
        <button
          type="button"
          className={styles.cashSecondaryBtn}
          onClick={handleReopen}
          disabled={submitting}
          title="잘못 마감했거나 테스트 중이면 진행 중 상태로 되돌립니다"
        >
          {submitting ? '처리 중…' : '마감 취소 (재오픈)'}
        </button>
      </div>
    )
  }

  // (b) 진행 중 / (c) 마감 입력 모드
  return (
    <div className={styles.cashCard}>
      <h3 className={styles.cashTitle}>오늘 시재 ({session.session_date})</h3>
      <div className={styles.cashRow}>
        <span className={styles.cashRowLabel}>시작 시재</span>
        <span className={styles.cashRowValue}>
          {session.starting_amount.toLocaleString()}원
        </span>
      </div>
      <div className={styles.cashRow}>
        <span className={styles.cashRowLabel}>
          현금 결제 누적 ({cashFlow.paidCount}건)
        </span>
        <span className={styles.cashRowValue}>
          +{cashFlow.cashIn.toLocaleString()}원
        </span>
      </div>
      <div className={styles.cashRow}>
        <span className={styles.cashRowLabel}>현금 환불 누적</span>
        <span className={`${styles.cashRowValue} ${styles.cashRowMinus}`}>
          -{cashFlow.cashOut.toLocaleString()}원
        </span>
      </div>
      <div className={styles.cashTotalRow}>
        <span>예상 시재</span>
        <span>{expectedAmount.toLocaleString()}원</span>
      </div>

      {!endingMode ? (
        <>
          <p className={styles.cashSub}>
            ※ 행사 종료 후 [세션 마감]을 눌러 실제 보유 현금과 대조하세요
          </p>
          <button
            type="button"
            className={styles.cashSecondaryBtn}
            onClick={refresh}
          >
            새로고침
          </button>
          <button
            type="button"
            className={styles.cashPrimaryBtn}
            onClick={() => setEndingMode(true)}
          >
            세션 마감
          </button>
        </>
      ) : (
        <>
          <div className={styles.cashRow}>
            <span className={styles.cashRowLabel}>실제 보유 현금 입력</span>
          </div>
          <input
            type="text"
            inputMode="numeric"
            className={styles.cashAmountInput}
            placeholder="실제 시재 (원)"
            value={endAmount}
            onChange={(e) => setEndAmount(e.target.value.replace(/[^\d,]/g, ''))}
          />
          {endAmount.length > 0 &&
            (() => {
              const n = Number(endAmount.replace(/,/g, ''))
              if (!Number.isFinite(n)) return null
              return (
                <div className={styles.cashRow}>
                  <span className={styles.cashRowLabel}>차액</span>
                  <span>{renderDifference(n - expectedAmount)}</span>
                </div>
              )
            })()}
          <textarea
            className={styles.cartTextarea}
            placeholder="메모 (옵션)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
          {error && <div className={styles.cartError}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={styles.cashSecondaryBtn}
              onClick={() => {
                setEndingMode(false)
                setEndAmount('')
                setNotes('')
                setError(null)
              }}
              disabled={submitting}
            >
              취소
            </button>
            <button
              type="button"
              className={styles.cashPrimaryBtn}
              onClick={handleEnd}
              disabled={submitting}
            >
              {submitting ? '처리 중…' : '마감 확정'}
            </button>
          </div>
        </>
      )}

      {error && !endingMode && <div className={styles.cartError}>{error}</div>}
    </div>
  )
}
