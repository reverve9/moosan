import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StepIndicator from '../apply/StepIndicator'
import SurveyStep1Basic from './SurveyStep1Basic'
import SurveyStep2Experience from './SurveyStep2Experience'
import SurveyStep3Evaluation from './SurveyStep3Evaluation'
import SurveyStep4Opinion from './SurveyStep4Opinion'
import { submitSurvey, hasSurveyDoneLocally, markSurveyDoneLocally } from '@/lib/survey'
import { DuplicateSurveyCouponError } from '@/lib/coupons'
import { normalizePhone } from '@/lib/phone'
import styles from './SurveyForm.module.css'

const TOTAL_STEPS = 4

export interface SurveyFormData {
  // 기본 정보 (Step 1)
  gender: '' | 'male' | 'female'
  age: string
  region: string
  name: string
  phone: string
  privacyConsented: boolean

  // Q1~Q3-1 종교 (Step 1)
  q1: string
  q1_1: string
  q1_2: string
  q2: string
  q3: string
  q3_1: string

  // Q4~Q8 참여 경험 + 첫인상 (Step 2)
  q4: string
  q5: string
  q6: string[] // 복수선택
  q7: string
  q8: Record<string, number | null> // 4 하위 문항

  // Q9~Q16 행사/운영 평가 (Step 3)
  q9: Record<string, number | null>
  q10: Record<string, number | null>
  q11: number | null
  q11_1: string
  q11_2: string
  q12: string
  q13: string
  q14: string
  q15: string
  q16: string

  // Q17~Q20 의향/성과/개선 (Step 4)
  q17: Record<string, number | null>
  q18: Record<string, number | null>
  q19: string[] // 복수선택
  q20: string
}

const INITIAL_FORM: SurveyFormData = {
  gender: '',
  age: '',
  region: '',
  name: '',
  phone: '',
  privacyConsented: false,
  q1: '',
  q1_1: '',
  q1_2: '',
  q2: '',
  q3: '',
  q3_1: '',
  q4: '',
  q5: '',
  q6: [],
  q7: '',
  q8: {
    ordinary_attractive: null,
    unpleasant_pleasant: null,
    uncomfortable_comfortable: null,
    boring_interesting: null,
  },
  q9: { '1': null, '2': null, '3': null },
  q10: { '1': null, '2': null, '3': null },
  q11: null,
  q11_1: '',
  q11_2: '',
  q12: '',
  q13: '',
  q14: '',
  q15: '',
  q16: '',
  q17: { '1': null, '2': null, '3': null },
  q18: { '1': null, '2': null, '3': null },
  q19: [],
  q20: '',
}

export default function SurveyForm() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<SurveyFormData>(INITIAL_FORM)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [duplicateCoupon, setDuplicateCoupon] = useState(false)
  const [alreadyDone] = useState(() => hasSurveyDoneLocally())

  const updateForm = (updates: Partial<SurveyFormData>) => {
    setForm((prev) => ({ ...prev, ...updates }))
  }

  const handleNext = () => {
    if (step < TOTAL_STEPS) {
      setStep(step + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handlePrev = () => {
    if (step > 1) {
      setStep(step - 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      // answers JSONB 구조로 정리
      const answers: Record<string, unknown> = {
        q1: form.q1,
        q1_1: form.q1_1 || null,
        q1_2: form.q1_2 || null,
        q2: form.q2,
        q3: form.q3,
        q3_1: form.q3_1,
        q4: form.q4,
        q5: form.q5,
        q6: form.q6,
        q7: form.q7,
        q8: form.q8,
        q9: form.q9,
        q10: form.q10,
        q11: form.q11,
        q11_1: form.q11_1 || null,
        q11_2: form.q11_2 || null,
        q12: form.q12,
        q13: form.q13,
        q14: form.q14,
        q15: form.q15,
        q16: form.q16,
        q17: form.q17,
        q18: form.q18,
        q19: form.q19,
        q20: form.q20 || null,
      }

      await submitSurvey({
        festivalId: null, // festival_id 연결은 다음 세션 (활성 festival 조회)
        gender: form.gender as 'male' | 'female',
        age: Number(form.age),
        region: form.region,
        name: form.name,
        phone: normalizePhone(form.phone),
        privacyConsented: form.privacyConsented,
        answers,
      })

      markSurveyDoneLocally()
      setSubmitted(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      if (err instanceof DuplicateSurveyCouponError) {
        // 이미 발급받은 번호 — 설문 저장 자체 차단 (오염 방지)
        setDuplicateCoupon(true)
      } else {
        const message = err instanceof Error ? err.message : '설문 제출에 실패했습니다.'
        setSubmitError(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (alreadyDone) {
    return (
      <div className={styles.success}>
        <div className={styles.successIcon}>&#10003;</div>
        <h3 className={styles.successTitle}>이미 설문에 참여하셨습니다</h3>
        <p className={styles.successDesc}>
          소중한 의견 감사합니다. 음식 주문 시 쿠폰이 자동 적용됩니다.
        </p>
        <button
          type="button"
          className={styles.successBtn}
          onClick={() => navigate('/program/food')}
        >
          음식 주문하러 가기
        </button>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className={styles.success}>
        <div className={styles.successIcon}>&#10003;</div>
        <h3 className={styles.successTitle}>설문조사에 참여해 주셔서 감사합니다</h3>
        <p className={styles.successDesc}>
          소중한 의견은 내년 축전 준비에 반영하겠습니다.
        </p>
        <div className={styles.couponNotice}>
          <div className={styles.couponNoticeTitle}>
            🎟 2,000원 할인 쿠폰이 발급되었습니다
          </div>
          <p className={styles.couponNoticeDesc}>
            음식 결제 시 입력하신 전화번호를 그대로 사용하면
            <br />
            쿠폰이 자동으로 적용됩니다.
          </p>
        </div>
        <button
          type="button"
          className={styles.successBtn}
          onClick={() => navigate('/program/food')}
        >
          음식 주문하러 가기
        </button>
      </div>
    )
  }

  return (
    <div className={styles.form}>
      {duplicateCoupon && (
        <div
          className={styles.modalOverlay}
          onClick={() => setDuplicateCoupon(false)}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalIcon}>!</div>
            <h3 className={styles.modalTitle}>이미 쿠폰이 발급된 번호입니다</h3>
            <p className={styles.modalDesc}>
              입력하신 전화번호로 이미 설문조사 참여 쿠폰이 발급되어
              <br />
              추가 발급이 불가능합니다.
              <br />
              <br />
              음식 결제 시 해당 번호를 입력하면
              <br />
              쿠폰이 자동으로 적용됩니다.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalBtnSecondary}
                onClick={() => setDuplicateCoupon(false)}
              >
                닫기
              </button>
              <button
                type="button"
                className={styles.modalBtnPrimary}
                onClick={() => navigate('/program/food')}
              >
                음식 주문하러 가기
              </button>
            </div>
          </div>
        </div>
      )}
      <StepIndicator current={step} total={TOTAL_STEPS} />

      {step === 1 && (
        <SurveyStep1Basic
          form={form}
          updateForm={updateForm}
          onNext={handleNext}
        />
      )}
      {step === 2 && (
        <SurveyStep2Experience
          form={form}
          updateForm={updateForm}
          onNext={handleNext}
          onPrev={handlePrev}
        />
      )}
      {step === 3 && (
        <SurveyStep3Evaluation
          form={form}
          updateForm={updateForm}
          onNext={handleNext}
          onPrev={handlePrev}
        />
      )}
      {step === 4 && (
        <SurveyStep4Opinion
          form={form}
          updateForm={updateForm}
          onPrev={handlePrev}
          onSubmit={handleSubmit}
          submitting={submitting}
          submitError={submitError}
        />
      )}
    </div>
  )
}
