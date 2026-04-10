import { isDevMode } from '@/config/flags'
import type { ChoirFormData } from './ChoirApplyForm'
import Input from '@/components/ui/Input'
import styles from '../StepCommon.module.css'

interface Props {
  form: ChoirFormData
  update: (u: Partial<ChoirFormData>) => void
  onNext: () => void
  onPrev: () => void
}

export default function ChoirStep3Songs({ form, update, onNext, onPrev }: Props) {
  const canNext =
    form.song1Title &&
    form.song1Composer &&
    form.song1Duration &&
    form.song2Title &&
    form.song2Composer &&
    form.song2Duration

  return (
    <div className={styles.step}>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>참가곡 정보 (자유곡 2곡)</h3>
        <div className={styles.fields}>
          <Input
            label="참가곡명 ①"
            required
            value={form.song1Title}
            onChange={(e) => update({ song1Title: e.target.value })}
            placeholder="곡명을 입력해주세요."
          />
          <Input
            label="작사/작곡"
            id="song1-composer"
            required
            value={form.song1Composer}
            onChange={(e) => update({ song1Composer: e.target.value })}
            placeholder="작사/작곡을 입력해주세요."
          />
          <Input
            label="합창시간(#분 #초)"
            id="song1-duration"
            required
            value={form.song1Duration}
            onChange={(e) => update({ song1Duration: e.target.value })}
            placeholder="예) 3분 30초"
          />

          <div className={styles.fieldDivider} />

          <Input
            label="참가곡명 ②"
            required
            value={form.song2Title}
            onChange={(e) => update({ song2Title: e.target.value })}
            placeholder="곡명을 입력해주세요."
          />
          <Input
            label="작사/작곡"
            id="song2-composer"
            required
            value={form.song2Composer}
            onChange={(e) => update({ song2Composer: e.target.value })}
            placeholder="작사/작곡을 입력해주세요."
          />
          <Input
            label="합창시간(#분 #초)"
            id="song2-duration"
            required
            value={form.song2Duration}
            onChange={(e) => update({ song2Duration: e.target.value })}
            placeholder="예) 3분 30초"
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
