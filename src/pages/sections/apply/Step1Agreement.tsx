import Checkbox from '@/components/ui/Checkbox'
import type { FormData } from './ApplyForm'
import styles from './StepCommon.module.css'

interface Props {
  form: FormData
  updateForm: (updates: Partial<FormData>) => void
  onNext: () => void
}

export default function Step1Agreement({ form, updateForm, onNext }: Props) {
  const canNext = form.infoConfirmed

  return (
    <div className={styles.step}>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>참가신청 안내</h3>
        <div className={styles.notice}>
          <p>
            본 신청서는 원활한 대회 운영을 위해 사용됩니다.
            정확한 정보가 기재될 수 있도록 지도교사 및 대표자께서는
            내용을 확인 후 제출해주시기 바랍니다.
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
        onChange={(e) => updateForm({ infoConfirmed: e.target.checked })}
      />

      <div className={styles.actions}>
        <button
          className={styles.btnPrimary}
          disabled={!canNext}
          onClick={onNext}
        >
          다음
        </button>
      </div>
    </div>
  )
}
