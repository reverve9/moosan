import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import type { FormData } from './ApplyForm'
import styles from './StepCommon.module.css'

interface Props {
  form: FormData
  updateForm: (updates: Partial<FormData>) => void
  onNext: () => void
  onPrev: () => void
}

const PROGRAM_OPTIONS = [
  { value: 'baekiljang', label: '백일장' },
  { value: 'saesaeng', label: '사생대회' },
  { value: 'dance', label: '댄스경연대회' },
  { value: 'choir', label: '합창대회' },
]

const DIVISION_OPTIONS_YOUTH = [
  { value: '유치부', label: '유치부' },
  { value: '초등부', label: '초등부' },
]

const DIVISION_OPTIONS_STUDENT = [
  { value: '초등부', label: '초등부' },
  { value: '중등부', label: '중등부' },
  { value: '고등부', label: '고등부' },
]

const PARTICIPATION_OPTIONS = [
  { value: 'individual', label: '개인' },
  { value: 'team', label: '팀' },
]

const RELATION_OPTIONS = [
  { value: '부', label: '부' },
  { value: '모', label: '모' },
  { value: '조부모', label: '조부모' },
  { value: '기타', label: '기타' },
]

function getDivisionOptions(program: string) {
  if (program === 'dance' || program === 'choir') return DIVISION_OPTIONS_STUDENT
  return DIVISION_OPTIONS_YOUTH
}

function isTeamProgram(program: string) {
  return program === 'dance' || program === 'choir'
}

function isYouthProgram(division: string) {
  return division === '유치부' || division === '초등부'
}

export default function Step2Info({ form, updateForm, onNext, onPrev }: Props) {
  const showTeamFields = isTeamProgram(form.programId) && form.participationType === 'team'
  const showParentFields = isYouthProgram(form.division)
  const showParticipationType = isTeamProgram(form.programId)

  const canNext =
    form.programId &&
    form.division &&
    form.applicantName &&
    form.schoolName &&
    form.phone

  return (
    <div className={styles.step}>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>참가 정보</h3>

        <div className={styles.fields}>
          <Select
            label="프로그램"
            required
            placeholder="프로그램을 선택하세요"
            options={PROGRAM_OPTIONS}
            value={form.programId}
            onChange={(e) => updateForm({
              programId: e.target.value,
              division: '',
              participationType: 'individual',
              teamName: '',
            })}
          />

          {form.programId && (
            <Select
              label="부문"
              required
              placeholder="부문을 선택하세요"
              options={getDivisionOptions(form.programId)}
              value={form.division}
              onChange={(e) => updateForm({ division: e.target.value })}
            />
          )}

          {showParticipationType && (
            <Select
              label="참가 유형"
              required
              options={PARTICIPATION_OPTIONS}
              value={form.participationType}
              onChange={(e) => updateForm({
                participationType: e.target.value as 'individual' | 'team',
              })}
            />
          )}

          {showTeamFields && (
            <>
              <Input
                label="팀명"
                required
                placeholder="팀명을 입력하세요"
                value={form.teamName}
                onChange={(e) => updateForm({ teamName: e.target.value })}
              />
              <Input
                label="총 인원"
                placeholder="예) 총 8명 (남 3명 / 여 5명)"
                value={form.teamMemberCount}
                onChange={(e) => updateForm({ teamMemberCount: e.target.value })}
              />
              <Input
                label="팀 구성"
                placeholder="예) 중등 5명, 고등 3명"
                value={form.teamComposition}
                onChange={(e) => updateForm({ teamComposition: e.target.value })}
              />
              <Input
                label="공연 소요 시간"
                hint="공연 시간: 최소 3분 이상"
                placeholder="예) 4분 30초"
                value={form.performanceDuration}
                onChange={(e) => updateForm({ performanceDuration: e.target.value })}
              />
            </>
          )}
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>
          {showTeamFields ? '대표자 정보' : '참가자 정보'}
        </h3>

        <div className={styles.fields}>
          <Input
            label={showTeamFields ? '대표자 이름' : '참가자 이름'}
            required
            placeholder="이름을 입력하세요"
            value={form.applicantName}
            onChange={(e) => updateForm({ applicantName: e.target.value })}
          />
          <Input
            label="생년월일"
            type="date"
            value={form.applicantBirth}
            onChange={(e) => updateForm({ applicantBirth: e.target.value })}
          />
          <Input
            label="소속 (학교/기관)"
            required
            placeholder="학교 또는 소속 기관명"
            value={form.schoolName}
            onChange={(e) => updateForm({ schoolName: e.target.value })}
          />
          <Input
            label="학년"
            placeholder="예) 3학년"
            value={form.schoolGrade}
            onChange={(e) => updateForm({ schoolGrade: e.target.value })}
          />
          <Input
            label={showTeamFields ? '대표자 연락처' : '연락처'}
            required
            type="tel"
            placeholder="01012345678"
            hint="긴급 공지 및 문자 안내가 발송됩니다."
            value={form.phone}
            onChange={(e) => updateForm({ phone: e.target.value })}
          />
          <Input
            label="이메일"
            type="email"
            placeholder="example@email.com"
            value={form.email}
            onChange={(e) => updateForm({ email: e.target.value })}
          />
        </div>
      </div>

      {showParentFields && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>보호자 정보</h3>
          <div className={styles.fields}>
            <Input
              label="보호자 이름"
              placeholder="보호자 성명"
              value={form.parentName}
              onChange={(e) => updateForm({ parentName: e.target.value })}
            />
            <Input
              label="보호자 연락처"
              type="tel"
              placeholder="01012345678"
              value={form.parentPhone}
              onChange={(e) => updateForm({ parentPhone: e.target.value })}
            />
            <Select
              label="관계"
              placeholder="관계를 선택하세요"
              options={RELATION_OPTIONS}
              value={form.parentRelation}
              onChange={(e) => updateForm({ parentRelation: e.target.value })}
            />
          </div>
        </div>
      )}

      {isTeamProgram(form.programId) && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>지도교사 정보</h3>
          <div className={styles.fields}>
            <Input
              label="지도교사 이름"
              placeholder="지도교사 성명"
              value={form.teacherName}
              onChange={(e) => updateForm({ teacherName: e.target.value })}
            />
            <Input
              label="지도교사 연락처"
              type="tel"
              placeholder="01012345678"
              value={form.teacherPhone}
              onChange={(e) => updateForm({ teacherPhone: e.target.value })}
            />
            <Input
              label="지도교사 이메일"
              type="email"
              placeholder="example@email.com"
              value={form.teacherEmail}
              onChange={(e) => updateForm({ teacherEmail: e.target.value })}
            />
          </div>
        </div>
      )}

      <div className={styles.actions}>
        <button className={styles.btnSecondary} onClick={onPrev}>이전</button>
        <button className={styles.btnPrimary} disabled={!canNext} onClick={onNext}>다음</button>
      </div>
    </div>
  )
}
