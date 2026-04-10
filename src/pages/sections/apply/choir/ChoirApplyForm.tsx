import { useState } from 'react'
import { isDevMode } from '@/config/flags'
import { supabase } from '@/lib/supabase'
import { normalizePhone } from '@/lib/phone'
import Checkbox from '@/components/ui/Checkbox'
import StepIndicator from '../StepIndicator'
import ChoirStep2Info from './ChoirStep2Info'
import ChoirStep3Songs from './ChoirStep3Songs'
import styles from '../StepCommon.module.css'
import formStyles from '../ApplyForm.module.css'

export interface ChoirFormData {
  infoConfirmed: boolean
  teamName: string
  choirComposition: string
  choirRegion: string
  memberCount: string
  representativeName: string
  representativePhone: string
  conductorName: string
  accompanistName: string
  awardAddress: string
  song1Title: string
  song1Composer: string
  song1Duration: string
  song2Title: string
  song2Composer: string
  song2Duration: string
  rulesAgreed: boolean
  privacyAgreed: boolean
}

const INITIAL: ChoirFormData = {
  infoConfirmed: false,
  teamName: '',
  choirComposition: '',
  choirRegion: '',
  memberCount: '',
  representativeName: '',
  representativePhone: '',
  conductorName: '',
  accompanistName: '',
  awardAddress: '',
  song1Title: '',
  song1Composer: '',
  song1Duration: '',
  song2Title: '',
  song2Composer: '',
  song2Duration: '',
  rulesAgreed: false,
  privacyAgreed: false,
}

const TOTAL_STEPS = 4

export default function ChoirApplyForm() {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<ChoirFormData>(INITIAL)
  const [submitted, setSubmitted] = useState(false)

  const update = (u: Partial<ChoirFormData>) => setForm((p) => ({ ...p, ...u }))
  const next = () => step < TOTAL_STEPS && setStep(step + 1)
  const prev = () => step > 1 && setStep(step - 1)

  const handleSubmit = async () => {
    const { data: program } = await supabase
      .from('programs')
      .select('id')
      .eq('slug', 'choir')
      .single()

    if (!program) return

    const { error } = await supabase.from('applications').insert({
      program_id: program.id,
      division: '',
      participation_type: 'team' as const,
      team_name: form.teamName,
      applicant_name: form.representativeName,
      phone: normalizePhone(form.representativePhone),
      school_name: '',
      privacy_agreed: form.privacyAgreed,
      privacy_agreed_at: form.privacyAgreed ? new Date().toISOString() : null,
      meta: {
        choir_composition: form.choirComposition,
        choir_region: form.choirRegion,
        member_count: form.memberCount,
        conductor_name: form.conductorName,
        accompanist_name: form.accompanistName,
        award_address: form.awardAddress,
        songs: [
          { title: form.song1Title, composer: form.song1Composer, duration: form.song1Duration },
          { title: form.song2Title, composer: form.song2Composer, duration: form.song2Duration },
        ],
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
      <StepIndicator current={step} total={TOTAL_STEPS} />

      {step === 1 && (
        <div className={styles.step}>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>참가신청 안내</h3>
            <div className={styles.notice}>
              <p>
                본 신청서는 원활한 대회 운영을 위해 사용됩니다.
                정확한 정보가 기재될 수 있도록 지도교사 및 대표자께서는
                내용을 확인 후 제출해 주시기 바랍니다.
              </p>
              <p>
                잘못된 정보로 인해 발생하는 불이익은
                주최 측에서 책임지지 않습니다.
              </p>
            </div>
          </div>
          <Checkbox
            label="네, 확인하였습니다."
            checked={form.infoConfirmed}
            onChange={(e) => update({ infoConfirmed: e.target.checked })}
          />
          <div className={styles.actions}>
            <button className={styles.btnPrimary} disabled={!form.infoConfirmed && !isDevMode} onClick={next}>
              다음
            </button>
          </div>
        </div>
      )}

      {step === 2 && <ChoirStep2Info form={form} update={update} onNext={next} onPrev={prev} />}
      {step === 3 && <ChoirStep3Songs form={form} update={update} onNext={next} onPrev={prev} />}

      {step === 4 && (
        <div className={styles.step}>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>대회 운영 규정 동의</h3>
            <div className={styles.notice}>
              <ul className={styles.rulesList}>
                <li>본 합창단은 대회 일정 및 운영 방침을 준수합니다.</li>
                <li>참가 신청에 기재한 내용은 사실과 다를시 심사에서 제외되며, 위배 사항이 확인될 경우 참가가 취소될 수 있습니다.</li>
                <li>대회 당일 준비물 및 시간에 맞게 도착하여야 하며, 관련 운영 변경시 사전 안내는 참가자에게만 진행됩니다.</li>
                <li>대회 입장 리허설 및 본 공연 시간은 대회의 사정에 따라 변경 가능하며, 상세 내용은 문자발송이 진행됩니다.</li>
                <li>천재지변, 감염병, 기타 불가항력적 사유 발생 시 대회 일정 및 방식이 변경될 수 있습니다.</li>
                <li>대회 시 촬영된 사진 및 영상은 기록, 홍보, 보도 자료를 위해 비상업적 목적으로 활용됩니다.</li>
              </ul>
            </div>
            <Checkbox
              label="내용을 충분히 숙지하였으며, 이에 동의합니다."
              checked={form.rulesAgreed}
              onChange={(e) => update({ rulesAgreed: e.target.checked })}
            />
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>개인정보 수집 및 이용 동의</h3>
            <div className={styles.privacyTable}>
              <div className={styles.privacyRow}>
                <span className={styles.privacyLabel}>수집 항목</span>
                <span className={styles.privacyValue}>이름, 연락처, 주소, 생년월일, 통장사본 등</span>
              </div>
              <div className={styles.privacyRow}>
                <span className={styles.privacyLabel}>수집 목적</span>
                <span className={styles.privacyValue}>
                  대회 참가신청서 작성 시 참가팀이 제공한 자료 및 추후
                  자료 지급에 한하여 대회 운영을 목적으로 수집하며
                  이외의 목적으로 사용하지 않습니다.
                </span>
              </div>
              <div className={styles.privacyRow}>
                <span className={styles.privacyLabel}>보유 기간</span>
                <span className={styles.privacyValue}>
                  저장 된 개인정보는 수집 및 이용목적이 달성되면 파기합니다.
                </span>
              </div>
            </div>
            <Checkbox
              label="개인정보 수집 및 이용에 동의합니다."
              checked={form.privacyAgreed}
              onChange={(e) => update({ privacyAgreed: e.target.checked })}
            />
          </div>

          <div className={styles.actions}>
            <button className={styles.btnSecondary} onClick={prev}>이전</button>
            <button
              className={styles.btnPrimary}
              disabled={!(form.rulesAgreed && form.privacyAgreed) && !isDevMode}
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
