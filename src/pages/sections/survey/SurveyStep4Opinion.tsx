import Checkbox from '@/components/ui/Checkbox'
import LikertScale from '@/components/ui/LikertScale'
import Textarea from '@/components/ui/Textarea'
import type { SurveyFormData } from './SurveyForm'
import { Q17_ITEMS, Q18_ITEMS, FUTURE_PROGRAM_OPTIONS } from './questions'
import styles from './SurveyForm.module.css'

interface Props {
  form: SurveyFormData
  updateForm: (updates: Partial<SurveyFormData>) => void
  onPrev: () => void
  onSubmit: () => void
  submitting: boolean
  submitError: string | null
}

export default function SurveyStep4Opinion({
  form,
  updateForm,
  onPrev,
  onSubmit,
  submitting,
  submitError,
}: Props) {
  const updateQ17 = (key: string, value: number) => {
    updateForm({ q17: { ...form.q17, [key]: value } })
  }
  const updateQ18 = (key: string, value: number) => {
    updateForm({ q18: { ...form.q18, [key]: value } })
  }

  const toggleFutureProgram = (value: string) => {
    const next = form.q19.includes(value)
      ? form.q19.filter((v) => v !== value)
      : [...form.q19, value]
    updateForm({ q19: next })
  }

  const canSubmit =
    Q17_ITEMS.every((item) => form.q17[item.key] !== null) &&
    Q18_ITEMS.every((item) => form.q18[item.key] !== null) &&
    form.q19.length > 0 &&
    !submitting

  return (
    <div className={styles.step}>
      {/* ── Q17 ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>17. 행사 참여·추천 의향</h3>
        <p className={styles.cardSubtitle}>
          1점부터 7점까지이며, 동의하시는 정도가 클수록 높은 점수를 주시면 됩니다
        </p>
        <div className={styles.fieldsDense}>
          {Q17_ITEMS.map((item) => (
            <LikertScale
              key={item.key}
              label={item.label}
              required
              value={form.q17[item.key]}
              onChange={(value) => updateQ17(item.key, value)}
              leftLabel="전혀 그렇지 않다"
              rightLabel="매우 그렇다"
            />
          ))}
        </div>
      </div>

      {/* ── Q18 ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>18. 행사 성과</h3>
        <div className={styles.fieldsDense}>
          {Q18_ITEMS.map((item) => (
            <LikertScale
              key={item.key}
              label={item.label}
              required
              value={form.q18[item.key]}
              onChange={(value) => updateQ18(item.key, value)}
              leftLabel="전혀 그렇지 않다"
              rightLabel="매우 그렇다"
            />
          ))}
        </div>
      </div>

      {/* ── Q19: 복수선택 ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>
          19. 향후 참여를 원하시는 프로그램 유형이 있다면 선택해 주세요
        </h3>
        <p className={styles.cardSubtitle}>복수응답 가능</p>
        <div className={styles.fields}>
          {FUTURE_PROGRAM_OPTIONS.map((opt) => (
            <Checkbox
              key={opt.value}
              label={opt.label}
              checked={form.q19.includes(opt.value)}
              onChange={() => toggleFutureProgram(opt.value)}
            />
          ))}
        </div>
      </div>

      {/* ── Q20: 개선사항 ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>20. 행사에 대한 개선사항</h3>
        <Textarea
          label="참여하신 행사에 대하여 하고 싶은 말씀이 있으면 자유롭게 말씀해 주십시오"
          placeholder="의견을 자유롭게 작성해 주세요 (선택)"
          rows={5}
          value={form.q20}
          onChange={(e) => updateForm({ q20: e.target.value })}
        />
      </div>

      {submitError && <div className={styles.submitError}>{submitError}</div>}

      <div className={styles.actions}>
        <button type="button" className={styles.btnSecondary} onClick={onPrev}>
          이전
        </button>
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={!canSubmit && !import.meta.env.DEV}
          onClick={onSubmit}
        >
          {submitting ? '제출 중…' : '제출'}
        </button>
      </div>
    </div>
  )
}
