import RadioGroup from '@/components/ui/RadioGroup'
import Checkbox from '@/components/ui/Checkbox'
import LikertScale from '@/components/ui/LikertScale'
import type { SurveyFormData } from './SurveyForm'
import {
  YES_NO_OPTIONS,
  DECISION_MAKER_OPTIONS,
  INFO_SOURCE_OPTIONS,
  EXPECTATION_OPTIONS,
  IMAGE_ITEMS,
} from './questions'
import styles from './SurveyForm.module.css'

interface Props {
  form: SurveyFormData
  updateForm: (updates: Partial<SurveyFormData>) => void
  onNext: () => void
  onPrev: () => void
}

export default function SurveyStep2Experience({ form, updateForm, onNext, onPrev }: Props) {
  const toggleInfoSource = (value: string) => {
    const next = form.q6.includes(value)
      ? form.q6.filter((v) => v !== value)
      : [...form.q6, value]
    updateForm({ q6: next })
  }

  const updateQ8 = (key: string, value: number) => {
    updateForm({ q8: { ...form.q8, [key]: value } })
  }

  const canNext =
    form.q4 !== '' &&
    form.q5 !== '' &&
    form.q6.length > 0 &&
    form.q7 !== '' &&
    IMAGE_ITEMS.every((item) => form.q8[item.key] !== null)

  return (
    <div className={styles.step}>
      {/* ── Q4~Q5 ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>참여 경험</h3>
        <div className={styles.fieldsDense}>
          <RadioGroup
            label="4. 귀하께서는 올해를 제외하고 과거에 행사에 참여하신 경험이 있으십니까?"
            required
            options={YES_NO_OPTIONS}
            value={form.q4}
            onChange={(value) => updateForm({ q4: value })}
          />
          <RadioGroup
            label="5. 이번 행사의 참여는 누가 결정하셨습니까?"
            required
            options={DECISION_MAKER_OPTIONS}
            value={form.q5}
            onChange={(value) => updateForm({ q5: value })}
          />
        </div>
      </div>

      {/* ── Q6: 복수선택 ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>6. 참여하신 행사에 대한 정보는 어떻게 알게 되셨습니까?</h3>
        <p className={styles.cardSubtitle}>복수응답 가능</p>
        <div className={styles.fields}>
          {INFO_SOURCE_OPTIONS.map((opt) => (
            <Checkbox
              key={opt.value}
              label={opt.label}
              checked={form.q6.includes(opt.value)}
              onChange={() => toggleInfoSource(opt.value)}
            />
          ))}
        </div>
      </div>

      {/* ── Q7 ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>기대</h3>
        <RadioGroup
          label="7. 축제에 참여하기 전에 어떤 부분을 가장 기대하셨나요?"
          required
          options={EXPECTATION_OPTIONS}
          value={form.q7}
          onChange={(value) => updateForm({ q7: value })}
        />
      </div>

      {/* ── Q8: 행사 이미지 라이커트 4문항 ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>8. 참여하신 행사에 대한 이미지를 평가해 주세요</h3>
        <p className={styles.cardSubtitle}>
          1점부터 7점까지이며, 동의하시는 정도가 클수록 높은 점수를 주시면 됩니다
        </p>
        <div className={styles.fieldsDense}>
          {IMAGE_ITEMS.map((item) => (
            <LikertScale
              key={item.key}
              label={item.left}
              required
              value={form.q8[item.key]}
              onChange={(value) => updateQ8(item.key, value)}
              leftLabel={item.left}
              rightLabel={item.right}
            />
          ))}
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
