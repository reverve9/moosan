import Checkbox from '@/components/ui/Checkbox'
import { isDevMode } from '@/config/flags'
import type { FormContentMap } from '@/lib/formContents'
import type { FormData } from './ApplyForm'
import styles from './StepCommon.module.css'

interface Props {
  form: FormData
  updateForm: (updates: Partial<FormData>) => void
  onPrev: () => void
  onSubmit: () => void
  contents?: FormContentMap
}

export default function Step3Privacy({ form, updateForm, onPrev, onSubmit, contents }: Props) {
  const canSubmit = form.rulesAgreed && form.privacyAgreed
  const rules = contents?.rules ?? '본 참가자는 대회 일정 및 운영 방침을 준수합니다.\n참가 신청에 기재한 내용은 사실과 다를시 심사에서 제외되며, 위부 사항이 확인될 경우 참가가 취소될 수 있습니다.\n대회 당일 준비물 및 시간에 맞게 도착하여야 하며, 관련 운영 변경시 사전 안내는 참가자에게만 진행됩니다.\n대회 입장 리허설 및 본 공연 시간은 대회의 사정에 따라 변경 가능하며, 상세 내용은 문자발송이 진행됩니다.\n천재지변, 감염병, 기타 불가항력적 사유 발생 시 대회 일정 및 방식이 변경될 수 있습니다.\n대회 시 촬영된 사진 및 영상은 기록, 홍보, 보도 자료를 위해 비상업적 목적으로 활용됩니다.'
  const privacyItems = contents?.privacy_items ?? '이름, 연락처, 주소, 생년월일, 통장사본 등'
  const privacyPurpose = contents?.privacy_purpose ?? '대회 참가신청서 작성 시 참가팀이 제공한 자료 및 추후 자료 지급에 한하여 대회 운영을 목적으로 수집하며 이외의 목적으로 사용하지 않습니다.'
  const privacyRetention = contents?.privacy_retention ?? '저장 된 개인정보는 수집 및 이용목적이 달성되면 파기합니다.'

  return (
    <div className={styles.step}>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>대회 운영 규정 동의</h3>
        <div className={styles.notice} style={{ whiteSpace: 'pre-wrap' }}>
          {rules}
        </div>
        <Checkbox
          label="내용을 충분히 숙지하였으며, 이에 동의합니다."
          checked={form.rulesAgreed}
          onChange={(e) => updateForm({ rulesAgreed: e.target.checked })}
        />
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>개인정보 수집 및 이용 동의</h3>
        <div className={styles.privacyTable}>
          <div className={styles.privacyRow}>
            <span className={styles.privacyLabel}>수집 항목</span>
            <span className={styles.privacyValue}>{privacyItems}</span>
          </div>
          <div className={styles.privacyRow}>
            <span className={styles.privacyLabel}>수집 목적</span>
            <span className={styles.privacyValue}>{privacyPurpose}</span>
          </div>
          <div className={styles.privacyRow}>
            <span className={styles.privacyLabel}>보유 기간</span>
            <span className={styles.privacyValue}>{privacyRetention}</span>
          </div>
        </div>
        <Checkbox
          label="개인정보 수집 및 이용에 동의합니다."
          checked={form.privacyAgreed}
          onChange={(e) => updateForm({ privacyAgreed: e.target.checked })}
        />
      </div>

      <div className={styles.actions}>
        <button className={styles.btnSecondary} onClick={onPrev}>이전</button>
        <button className={styles.btnPrimary} disabled={!canSubmit && !isDevMode} onClick={onSubmit}>제출</button>
      </div>
    </div>
  )
}
