import { useState } from 'react'
import { isDevMode } from '@/config/flags'
import { supabase } from '@/lib/supabase'
import { normalizePhone } from '@/lib/phone'
import StepIndicator from '../StepIndicator'
import Input from '@/components/ui/Input'
import RadioGroup from '@/components/ui/RadioGroup'
import Checkbox from '@/components/ui/Checkbox'
import styles from '../StepCommon.module.css'
import formStyles from '../ApplyForm.module.css'

interface FormData {
  name: string
  gender: string
  birth: string
  school: string
  phone: string
  parentPhone: string
  address: string
  email: string
  division: string
  workType: string
  rulesAgreed: boolean
  privacyAgreed: boolean
}

const INITIAL: FormData = {
  name: '',
  gender: '',
  birth: '',
  school: '',
  phone: '',
  parentPhone: '',
  address: '',
  email: '',
  division: '',
  workType: '',
  rulesAgreed: false,
  privacyAgreed: false,
}

const DIVISION_OPTIONS = [
  { value: '중등부', label: '중등부' },
  { value: '고등부', label: '고등부' },
]

const WORK_TYPE_OPTIONS = [
  { value: '산문', label: '산문 (수필/논술/기행문 등)' },
  { value: '운문', label: '운문 (시/시조 등)' },
]

export default function WritingApplyForm() {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormData>(INITIAL)
  const [submitted, setSubmitted] = useState(false)

  const update = (u: Partial<FormData>) => setForm((p) => ({ ...p, ...u }))

  const canNextStep1 = form.name && form.birth && form.school && form.phone && form.address

  const handleSubmit = async () => {
    const { data: program } = await supabase
      .from('programs')
      .select('id')
      .eq('slug', 'baekiljang')
      .single()

    if (!program) return

    const { error } = await supabase.from('applications').insert({
      program_id: program.id,
      division: form.division,
      participation_type: 'individual' as const,
      applicant_name: form.name,
      applicant_birth: form.birth || null,
      school_name: form.school,
      phone: normalizePhone(form.phone),
      email: form.email || null,
      parent_phone: form.parentPhone ? normalizePhone(form.parentPhone) : null,
      privacy_agreed: form.privacyAgreed,
      privacy_agreed_at: form.privacyAgreed ? new Date().toISOString() : null,
      meta: {
        gender: form.gender,
        address: form.address,
        work_type: form.workType,
      },
    })

    if (!error) setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className={formStyles.success}>
        <div className={formStyles.successIcon}>&#10003;</div>
        <h3 className={formStyles.successTitle}>참가신청이 완료되었습니다</h3>
        <p className={formStyles.successDesc}>
          신청 내역은 검토 후 승인됩니다.<br />
          참가신청 여부는 추후 개별 문자로 통보됩니다.
        </p>
        <button
          className={formStyles.successBtn}
          onClick={() => { setForm(INITIAL); setStep(1); setSubmitted(false) }}
        >
          새로운 신청하기
        </button>
      </div>
    )
  }

  return (
    <div className={formStyles.form}>
      <StepIndicator current={step} total={2} />

      {step === 1 && (
        <div className={styles.step}>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>참가 정보</h3>
            <div className={styles.fields}>
              <Input
                label="참가자 이름"
                required
                value={form.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="이름을 입력해주세요."
              />
              <RadioGroup
                label="참가자 성별"
                options={[
                  { value: '여', label: '여' },
                  { value: '남', label: '남' },
                ]}
                value={form.gender}
                onChange={(v) => update({ gender: v })}
              />
              <Input
                label="참가자 생년월일(6자리)"
                required
                value={form.birth}
                onChange={(e) => update({ birth: e.target.value })}
                placeholder="YYMMDD"
              />
              <Input
                label="참가자 소속"
                required
                value={form.school}
                onChange={(e) => update({ school: e.target.value })}
                placeholder="학교명 or 없음"
                hint="수상 시 발급되는 상장에는 참가자 이름과 소속이 함께 표기됩니다. 입력하신 소속 정보가 상장에 그대로 사용되므로, 오기재가 없도록 확인해 주세요."
              />
              <Input
                label="참가자 연락처"
                required
                value={form.phone}
                onChange={(e) => update({ phone: e.target.value })}
                placeholder="연락처를 입력해주세요."
                hint="연락 불가로 인한 불이익은 참가자에게 있습니다."
              />
              <Input
                label="부모님/보호자 연락처"
                value={form.parentPhone}
                onChange={(e) => update({ parentPhone: e.target.value })}
                placeholder="비상 시 연락용"
                hint="행사 중 긴급 상황 발생시 연락을 위해 사용됩니다."
              />
              <Input
                label="참가자 주소"
                required
                value={form.address}
                onChange={(e) => update({ address: e.target.value })}
                placeholder="우편번호 + 상세 주소"
                hint="입력하신 정보는 수상자에 한해 상장 발송 목적으로만 사용됩니다. 주소 오기재로 인한 배송 사고는 주최 측에서 책임지지 않습니다."
              />
              <Input
                label="참가자 이메일"
                value={form.email}
                onChange={(e) => update({ email: e.target.value })}
                placeholder="이메일 주소를 입력해주세요."
                type="email"
              />
            </div>
          </div>
          <div className={styles.actions}>
            <button
              className={styles.btnPrimary}
              disabled={!canNextStep1 && !isDevMode}
              onClick={() => setStep(2)}
            >
              다음
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className={styles.step}>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>참가 부문</h3>
            <div className={styles.fields}>
              <RadioGroup
                label="참가 부문"
                required
                options={DIVISION_OPTIONS}
                value={form.division}
                onChange={(v) => update({ division: v })}
              />
              <RadioGroup
                label="참가 작품 유형"
                required
                options={WORK_TYPE_OPTIONS}
                value={form.workType}
                onChange={(v) => update({ workType: v })}
                hint="주제는 현장에서 발표됩니다. 제한 시간 내에 작성 및 제출해야됩니다."
              />
            </div>
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>대회 운영 규정 동의</h3>
            <div className={styles.notice}>
              <div className={styles.rulesSection}>
                <strong>1. 참가 자격</strong>
                <ul className={styles.rulesList}>
                  <li>본 대회는 지정 연령/학년 범위 내 청소년 참가자를 대상으로 합니다.</li>
                  <li>참가 신청서에 기재한 정보가 사실과 다를 경우 참가가 취소될 수 있습니다.</li>
                </ul>
              </div>
              <div className={styles.rulesSection}>
                <strong>2. 현장 발표 및 작품 제출</strong>
                <ul className={styles.rulesList}>
                  <li>참가자는 대회 당일 현장에서 주어진 주제에 맞게 작품을 작성 및 제출합니다.</li>
                  <li>제한 시간 내에 작품을 완성하고 제출하여야 하며, 지각 또는 미제출 시 심사를 받을 수 없습니다.</li>
                </ul>
              </div>
              <div className={styles.rulesSection}>
                <strong>3. 심사</strong>
                <ul className={styles.rulesList}>
                  <li>독창성, 주제 적합성, 완성도, 표현력 등을 기준으로 심사합니다.</li>
                  <li>심사 결과에 대해 이의를 제기할 수 있으며, 심사위원의 평가를 존중합니다.</li>
                </ul>
              </div>
              <div className={styles.rulesSection}>
                <strong>4. 작품 저작권</strong>
                <ul className={styles.rulesList}>
                  <li>참가 작품의 저작권은 작성자에게 귀속됩니다.</li>
                  <li>대회 주최 측은 전시, SNS, 자료 등 비상업적 용도로 활용할 수 있습니다.</li>
                </ul>
              </div>
              <div className={styles.rulesSection}>
                <strong>5. 기타</strong>
                <ul className={styles.rulesList}>
                  <li>대회 일정, 장소, 인원 규정 등은 사정에 따라 변경될 수 있으며, 사전에 안내됩니다.</li>
                  <li>천재지변, 불가항력적 사유 발생 시 대회 일정 및 방식이 변경될 수 있습니다.</li>
                  <li>모든 참가자는 행사 진행 수칙을 준수하며, 본인 또는 보호자 확인하에 참여합니다.</li>
                </ul>
              </div>
            </div>
            <Checkbox
              label="위 내용을 충분히 확인하였으며, 이에 동의합니다."
              checked={form.rulesAgreed}
              onChange={(e) => update({ rulesAgreed: e.target.checked })}
            />
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>개인정보 수집 및 이용 동의</h3>
            <p className={styles.privacyNote}>동의를 거부하실 수 있으나 설문 참가가 불가능합니다.</p>
            <div className={styles.privacyTable}>
              <div className={styles.privacyRow}>
                <span className={styles.privacyLabel}>수집 항목</span>
                <span className={styles.privacyValue}>이름, 생년월일, 성별, 소속, 휴대전화, 이메일 등</span>
              </div>
              <div className={styles.privacyRow}>
                <span className={styles.privacyLabel}>수집 목적</span>
                <span className={styles.privacyValue}>대회 참가 자격 확인 및 대회 일정 안내 등</span>
              </div>
              <div className={styles.privacyRow}>
                <span className={styles.privacyLabel}>보유 기간</span>
                <span className={styles.privacyValue}>수상자 기록 및 증빙, 행사 운영 목적에 한해 이용 후 폐기</span>
              </div>
            </div>
            <Checkbox
              label="개인정보 수집 및 이용에 동의합니다."
              checked={form.privacyAgreed}
              onChange={(e) => update({ privacyAgreed: e.target.checked })}
            />
          </div>

          <div className={styles.actions}>
            <button className={styles.btnSecondary} onClick={() => setStep(1)}>이전</button>
            <button
              className={styles.btnPrimary}
              disabled={!(form.rulesAgreed && form.privacyAgreed && form.division && form.workType) && !isDevMode}
              onClick={handleSubmit}
            >
              제출
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
