import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import RadioGroup from '@/components/ui/RadioGroup'
import Checkbox from '@/components/ui/Checkbox'
import type { SurveyFormData } from './SurveyForm'
import {
  GENDER_OPTIONS,
  REGION_OPTIONS,
  RELIGION_OPTIONS,
  RELIGION_SINCE_OPTIONS,
  RELIGION_FREQUENCY_OPTIONS,
  INFLUENCE_OPTIONS,
} from './questions'
import styles from './SurveyForm.module.css'

interface Props {
  form: SurveyFormData
  updateForm: (updates: Partial<SurveyFormData>) => void
  onNext: () => void
}

export default function SurveyStep1Basic({ form, updateForm, onNext }: Props) {
  const hasReligion = form.q1 !== '' && form.q1 !== 'none'

  const basicFilled =
    form.gender !== '' &&
    form.age.trim() !== '' &&
    Number(form.age) > 0 &&
    form.region !== '' &&
    form.name.trim() !== '' &&
    form.phone.trim() !== '' &&
    form.privacyConsented

  const religionFilled =
    form.q1 !== '' &&
    (form.q1 === 'none' || (form.q1_1 !== '' && form.q1_2 !== '')) &&
    form.q2 !== '' &&
    form.q3 !== '' &&
    form.q3_1 !== ''

  const canNext = basicFilled && religionFilled

  return (
    <div className={styles.step}>
      {/* ── 기본 정보 ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>기본 정보</h3>
        <div className={styles.fields}>
          <RadioGroup
            label="귀하의 성별은 무엇입니까?"
            required
            options={GENDER_OPTIONS}
            value={form.gender}
            onChange={(value) => updateForm({ gender: value as 'male' | 'female' })}
          />
          <Input
            label="귀하의 연령은 만으로 몇 세입니까?"
            required
            type="number"
            inputMode="numeric"
            placeholder="예: 42"
            value={form.age}
            onChange={(e) => updateForm({ age: e.target.value })}
          />
          <Select
            label="귀하의 현재 거주지역은 어디입니까?"
            required
            options={REGION_OPTIONS}
            placeholder="선택해주세요"
            value={form.region}
            onChange={(e) => updateForm({ region: e.target.value })}
          />
          <Input
            label="성함"
            required
            placeholder="홍길동"
            value={form.name}
            onChange={(e) => updateForm({ name: e.target.value })}
          />
          <Input
            label="연락처"
            required
            type="tel"
            inputMode="tel"
            placeholder="010-0000-0000"
            hint="이벤트 및 경품 추첨 시 연락드립니다."
            value={form.phone}
            onChange={(e) => updateForm({ phone: e.target.value })}
          />
        </div>
      </div>

      {/* ── 개인정보 동의 ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>개인정보 수집 및 이용 동의</h3>
        <div className={styles.privacyTable}>
          <div className={styles.privacyRow}>
            <div className={styles.privacyLabel}>수집항목</div>
            <div className={styles.privacyValue}>성함 / 연락처</div>
          </div>
          <div className={styles.privacyRow}>
            <div className={styles.privacyLabel}>수집 목적</div>
            <div className={styles.privacyValue}>이벤트 및 경품 추첨</div>
          </div>
          <div className={styles.privacyRow}>
            <div className={styles.privacyLabel}>보유·이용기간</div>
            <div className={styles.privacyValue}>당첨자 발표 후 1개월 보관</div>
          </div>
        </div>
        <Checkbox
          label="개인정보 수집 및 이용에 동의합니다"
          checked={form.privacyConsented}
          onChange={(e) => updateForm({ privacyConsented: e.target.checked })}
        />
      </div>

      {/* ── 종교 ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>종교</h3>
        <div className={styles.fieldsDense}>
          <RadioGroup
            label="1. 귀하에게는 종교가 있습니까? 있다면 종교는 무엇입니까?"
            required
            options={RELIGION_OPTIONS}
            value={form.q1}
            onChange={(value) => {
              // 종교 없음 선택 시 서브 문항 초기화
              if (value === 'none') {
                updateForm({ q1: value, q1_1: '', q1_2: '' })
              } else {
                updateForm({ q1: value })
              }
            }}
          />

          {hasReligion && (
            <div className={styles.subField}>
              <RadioGroup
                label="1-1. 귀하께서는 현재의 종교를 언제부터 가지게 되었나요?"
                required
                options={RELIGION_SINCE_OPTIONS}
                value={form.q1_1}
                onChange={(value) => updateForm({ q1_1: value })}
              />
            </div>
          )}

          {hasReligion && (
            <div className={styles.subField}>
              <RadioGroup
                label="1-2. 귀하께서는 평소 얼마나 자주 예배·미사·법회 등 종교활동에 참여하시나요?"
                required
                options={RELIGION_FREQUENCY_OPTIONS}
                value={form.q1_2}
                onChange={(value) => updateForm({ q1_2: value })}
              />
            </div>
          )}

          <RadioGroup
            label="2. 1년 전에는 믿는 종교가 있었습니까? 있었다면 그 종교는 무엇입니까?"
            required
            options={RELIGION_OPTIONS}
            value={form.q2}
            onChange={(value) => updateForm({ q2: value })}
          />

          <RadioGroup
            label="3. 귀하께서 생각하시기에 종교가 귀하의 삶에 미치는 영향력은 어떠합니까?"
            required
            options={INFLUENCE_OPTIONS}
            value={form.q3}
            onChange={(value) => updateForm({ q3: value })}
          />

          <RadioGroup
            label="3-1. 귀하께서 생각하시기에 종교가 한국 사회에 미치는 영향력은 어느 정도라고 생각하십니까?"
            required
            options={INFLUENCE_OPTIONS}
            value={form.q3_1}
            onChange={(value) => updateForm({ q3_1: value })}
          />
        </div>
      </div>

      <div className={styles.actions}>
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
