import RadioGroup from '@/components/ui/RadioGroup'
import LikertScale from '@/components/ui/LikertScale'
import Textarea from '@/components/ui/Textarea'
import type { SurveyFormData } from './SurveyForm'
import {
  Q9_ITEMS,
  Q10_ITEMS,
  APPROPRIATE_5_OPTIONS,
  CONVENIENT_5_OPTIONS,
} from './questions'
import styles from './SurveyForm.module.css'

interface Props {
  form: SurveyFormData
  updateForm: (updates: Partial<SurveyFormData>) => void
  onNext: () => void
  onPrev: () => void
}

export default function SurveyStep3Evaluation({ form, updateForm, onNext, onPrev }: Props) {
  const updateQ9 = (key: string, value: number) => {
    updateForm({ q9: { ...form.q9, [key]: value } })
  }
  const updateQ10 = (key: string, value: number) => {
    updateForm({ q10: { ...form.q10, [key]: value } })
  }

  const q11Value = form.q11
  const showDissatisfied = q11Value !== null && q11Value >= 1 && q11Value <= 3
  const showSatisfied = q11Value !== null && q11Value >= 5 && q11Value <= 7

  const canNext =
    Q9_ITEMS.every((item) => form.q9[item.key] !== null) &&
    Q10_ITEMS.every((item) => form.q10[item.key] !== null) &&
    form.q11 !== null &&
    (!showDissatisfied || form.q11_1.trim() !== '') &&
    (!showSatisfied || form.q11_2.trim() !== '') &&
    form.q12 !== '' &&
    form.q13 !== '' &&
    form.q14 !== '' &&
    form.q15 !== '' &&
    form.q16 !== ''

  return (
    <div className={styles.step}>
      {/* ── Q9 ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>9. 다음은 행사에 대한 평가입니다</h3>
        <p className={styles.cardSubtitle}>
          1점부터 7점까지이며, 동의하시는 정도가 클수록 높은 점수를 주시면 됩니다
        </p>
        <div className={styles.fieldsDense}>
          {Q9_ITEMS.map((item) => (
            <LikertScale
              key={item.key}
              label={item.label}
              required
              value={form.q9[item.key]}
              onChange={(value) => updateQ9(item.key, value)}
              leftLabel="전혀 그렇지 않다"
              rightLabel="매우 그렇다"
            />
          ))}
        </div>
      </div>

      {/* ── Q10 ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>10. 행사 주관기관에 대한 평가</h3>
        <div className={styles.fieldsDense}>
          {Q10_ITEMS.map((item) => (
            <LikertScale
              key={item.key}
              label={item.label}
              required
              value={form.q10[item.key]}
              onChange={(value) => updateQ10(item.key, value)}
              leftLabel="전혀 그렇지 않다"
              rightLabel="매우 그렇다"
            />
          ))}
        </div>
      </div>

      {/* ── Q11: 종합 만족도 ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>11. 종합 만족도</h3>
        <div className={styles.fieldsDense}>
          <LikertScale
            label="지금까지 평가해 주신 사항을 전반적으로 고려할 때, 참여하신 행사에 대해 종합적으로 얼마나 만족하십니까?"
            required
            value={form.q11}
            onChange={(value) => updateForm({ q11: value })}
            leftLabel="전혀 그렇지 않다"
            rightLabel="매우 그렇다"
          />

          {showDissatisfied && (
            <div className={styles.subField}>
              <Textarea
                label="11-1. 참여하신 행사에 만족하지 않았다면 그 이유는 무엇입니까?"
                required
                placeholder="의견을 자유롭게 작성해 주세요"
                value={form.q11_1}
                onChange={(e) => updateForm({ q11_1: e.target.value })}
              />
            </div>
          )}

          {showSatisfied && (
            <div className={styles.subField}>
              <Textarea
                label="11-2. 참여하신 행사에 만족했다면 그 이유는 무엇입니까?"
                required
                placeholder="의견을 자유롭게 작성해 주세요"
                value={form.q11_2}
                onChange={(e) => updateForm({ q11_2: e.target.value })}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Q12~Q16 운영 ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>행사 운영</h3>
        <div className={styles.fieldsDense}>
          <RadioGroup
            label="12. 행사의 전체 소요 시간은 적절했습니까?"
            required
            options={APPROPRIATE_5_OPTIONS}
            value={form.q12}
            onChange={(value) => updateForm({ q12: value })}
          />
          <RadioGroup
            label="13. 행사 일정(요일/시간대)은 참석하기에 적절했습니까?"
            required
            options={APPROPRIATE_5_OPTIONS}
            value={form.q13}
            onChange={(value) => updateForm({ q13: value })}
          />
          <RadioGroup
            label="14. 행사장까지의 교통 접근성은 어땠습니까?"
            required
            options={CONVENIENT_5_OPTIONS}
            value={form.q14}
            onChange={(value) => updateForm({ q14: value })}
          />
          <RadioGroup
            label="15. 주차 시설은 이용하기 편리했습니까?"
            required
            options={CONVENIENT_5_OPTIONS}
            value={form.q15}
            onChange={(value) => updateForm({ q15: value })}
          />
          <RadioGroup
            label="16. 행사장 내 이동 동선 및 안내 표지판은 적절했습니까?"
            required
            options={APPROPRIATE_5_OPTIONS}
            value={form.q16}
            onChange={(value) => updateForm({ q16: value })}
          />
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.btnSecondary} onClick={onPrev}>
          이전
        </button>
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={!canNext && !import.meta.env.DEV}
          onClick={onNext}
        >
          다음
        </button>
      </div>
    </div>
  )
}
