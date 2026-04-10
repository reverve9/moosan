import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { isDevMode } from '@/config/flags'
import type { FormData } from './ApplyForm'
import styles from './StepCommon.module.css'

interface Props {
  form: FormData
  updateForm: (updates: Partial<FormData>) => void
  onNext: () => void
  onPrev: () => void
}

const DIVISION_OPTIONS = [
  { value: '초등부', label: '초등부' },
  { value: '중등부', label: '중등부' },
  { value: '고등부', label: '고등부' },
]

export default function Step2Info({ form, updateForm, onNext, onPrev }: Props) {
  const canNext =
    form.division &&
    form.teamName &&
    form.schoolName &&
    form.applicantName &&
    form.phone

  return (
    <div className={styles.step}>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>참가팀 정보</h3>
        <div className={styles.fields}>
          <Select
            label="부문"
            required
            placeholder="부문을 선택하세요"
            options={DIVISION_OPTIONS}
            value={form.division}
            onChange={(e) => updateForm({ division: e.target.value })}
          />
          <Input
            label="참가팀 이름"
            required
            placeholder="참가팀 이름을 입력하세요"
            value={form.teamName}
            onChange={(e) => updateForm({ teamName: e.target.value })}
          />
          <Input
            label="소속 (학교/기관)"
            required
            placeholder="학교 또는 소속 기관명"
            value={form.schoolName}
            onChange={(e) => updateForm({ schoolName: e.target.value })}
          />
          <Input
            label="대표자 이름"
            required
            placeholder="대표자 성명"
            hint="대회 관련 공식 연락을 받을 대표자 성명을 입력해 주세요."
            value={form.applicantName}
            onChange={(e) => updateForm({ applicantName: e.target.value })}
          />
          <Input
            label="대표자 연락처"
            required
            type="tel"
            placeholder="01012345678"
            hint="대회 관련 공식 연락을 받을 대표자 휴대전화 번호를 입력해 주세요."
            value={form.phone}
            onChange={(e) => updateForm({ phone: e.target.value })}
          />
          <Input
            label="대표자 이메일"
            type="email"
            placeholder="example@email.com"
            value={form.email}
            onChange={(e) => updateForm({ email: e.target.value })}
          />
          <Input
            label="총 인원"
            placeholder="인원 수"
            hint="참가 인원수를 입력해 주세요."
            value={form.teamMemberCount}
            onChange={(e) => updateForm({ teamMemberCount: e.target.value })}
          />
          <Input
            label="팀 구성"
            placeholder="예) 중등5, 고등1, 초등1"
            value={form.teamComposition}
            onChange={(e) => updateForm({ teamComposition: e.target.value })}
          />
          <Input
            label="공연 소요 시간"
            placeholder="예) 4분 30초"
            hint="공연 시간: 최소 3분 이상"
            value={form.performanceDuration}
            onChange={(e) => updateForm({ performanceDuration: e.target.value })}
          />
        </div>
      </div>

      <div className={styles.actions}>
        <button className={styles.btnSecondary} onClick={onPrev}>이전</button>
        <button className={styles.btnPrimary} disabled={!canNext && !isDevMode} onClick={onNext}>다음</button>
      </div>
    </div>
  )
}
