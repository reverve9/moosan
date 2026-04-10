import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { normalizePhone } from '@/lib/phone'
import { useFormContents } from '@/hooks/useFormContents'
import StepIndicator from './StepIndicator'
import Step1Agreement from './Step1Agreement'
import Step2Info from './Step2Info'
import Step3Privacy from './Step3Privacy'
import styles from './ApplyForm.module.css'

export interface FormData {
  // Step 1
  infoConfirmed: boolean

  // Step 2 — 참가팀 정보
  programId: string
  division: string
  teamName: string
  schoolName: string
  applicantName: string
  phone: string
  email: string
  teamMemberCount: string
  teamComposition: string
  performanceDuration: string

  // Step 3
  rulesAgreed: boolean
  privacyAgreed: boolean
}

const INITIAL_FORM: FormData = {
  infoConfirmed: false,
  programId: '',
  division: '',
  teamName: '',
  schoolName: '',
  applicantName: '',
  phone: '',
  email: '',
  teamMemberCount: '',
  teamComposition: '',
  performanceDuration: '',
  rulesAgreed: false,
  privacyAgreed: false,
}

const TOTAL_STEPS = 3

interface Props {
  defaultProgramId?: string
}

export default function ApplyForm({ defaultProgramId }: Props) {
  const { contents } = useFormContents('dance')
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormData>({ ...INITIAL_FORM, programId: defaultProgramId || '' })
  const [submitted, setSubmitted] = useState(false)

  const updateForm = (updates: Partial<FormData>) => {
    setForm((prev) => ({ ...prev, ...updates }))
  }

  const handleNext = () => {
    if (step < TOTAL_STEPS) setStep(step + 1)
  }

  const handlePrev = () => {
    if (step > 1) setStep(step - 1)
  }

  const handleSubmit = async () => {
    // programs 테이블에서 slug로 실제 UUID 조회
    const { data: program } = await supabase
      .from('programs')
      .select('id')
      .eq('slug', form.programId)
      .single()

    if (!program) return

    const { error } = await supabase.from('applications').insert({
      program_id: program.id,
      division: form.division,
      participation_type: 'team',
      team_name: form.teamName || null,
      applicant_name: form.applicantName,
      school_name: form.schoolName,
      phone: normalizePhone(form.phone),
      email: form.email || null,
      privacy_agreed: form.privacyAgreed,
      privacy_agreed_at: form.privacyAgreed ? new Date().toISOString() : null,
      meta: {
        team_member_count: form.teamMemberCount || null,
        team_composition: form.teamComposition || null,
        performance_duration: form.performanceDuration || null,
      },
    })

    if (!error) setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className={styles.success}>
        <div className={styles.successIcon}>&#10003;</div>
        <h3 className={styles.successTitle}>참가신청이 완료되었습니다</h3>
        <p className={styles.successDesc}>
          신청 내역은 검토 후 승인됩니다.
          <br />
          참가신청 여부는 추후 개별 문자로 통보됩니다.
        </p>
        <button
          className={styles.successBtn}
          onClick={() => {
            setForm(INITIAL_FORM)
            setStep(1)
            setSubmitted(false)
          }}
        >
          새로운 신청하기
        </button>
      </div>
    )
  }

  return (
    <div className={styles.form}>
      <StepIndicator current={step} total={TOTAL_STEPS} />

      {step === 1 && (
        <Step1Agreement form={form} updateForm={updateForm} onNext={handleNext} contents={contents} />
      )}
      {step === 2 && (
        <Step2Info form={form} updateForm={updateForm} onNext={handleNext} onPrev={handlePrev} />
      )}
      {step === 3 && (
        <Step3Privacy form={form} updateForm={updateForm} onPrev={handlePrev} onSubmit={handleSubmit} contents={contents} />
      )}
    </div>
  )
}
