import { isDevMode } from '@/config/flags'
import type { ChoirFormData } from './ChoirApplyForm'
import Input from '@/components/ui/Input'
import RadioGroup from '@/components/ui/RadioGroup'
import styles from '../StepCommon.module.css'

interface Props {
  form: ChoirFormData
  update: (u: Partial<ChoirFormData>) => void
  onNext: () => void
  onPrev: () => void
}

const COMPOSITION_OPTIONS = [
  { value: '여자', label: '여자' },
  { value: '남자', label: '남자' },
  { value: '혼성', label: '혼성' },
]

export default function ChoirStep2Info({ form, update, onNext, onPrev }: Props) {
  const canNext =
    form.teamName &&
    form.choirComposition &&
    form.choirRegion &&
    form.memberCount &&
    form.representativeName &&
    form.representativePhone &&
    form.conductorName &&
    form.awardAddress

  return (
    <div className={styles.step}>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>합창단 기본 정보</h3>
        <div className={styles.fields}>
          <Input
            label="팀명(합창단 이름)"
            required
            value={form.teamName}
            onChange={(e) => update({ teamName: e.target.value })}
            placeholder="팀명"
          />
          <RadioGroup
            label="합창단 구성"
            required
            options={COMPOSITION_OPTIONS}
            value={form.choirComposition}
            onChange={(v) => update({ choirComposition: v })}
          />
          <Input
            label="합창단 지역"
            required
            value={form.choirRegion}
            onChange={(e) => update({ choirRegion: e.target.value })}
            placeholder="예) 서울 강남구, 경기도 양평군, 강원특별자치도 속초시"
            hint="도/광역시/특별시 + 시·군·구까지 입력해 주세요."
          />
          <Input
            label="합창단 인원"
            required
            value={form.memberCount}
            onChange={(e) => update({ memberCount: e.target.value })}
            placeholder="인원 수"
            hint="어린이 단원 인원수만 작성해 주세요."
          />
          <Input
            label="대표자 이름"
            required
            value={form.representativeName}
            onChange={(e) => update({ representativeName: e.target.value })}
            placeholder="대표자 성명"
            hint="대회 관련 공식 연락을 받을 대표자 성명을 입력해 주세요."
          />
          <Input
            label="대표자 연락처"
            required
            value={form.representativePhone}
            onChange={(e) => update({ representativePhone: e.target.value })}
            placeholder="연락처"
            hint="대회 관련 공식 연락을 받을 대표자 휴대전화 번호를 입력해 주세요."
          />
          <Input
            label="지휘자 성함"
            required
            value={form.conductorName}
            onChange={(e) => update({ conductorName: e.target.value })}
            placeholder="지휘자 성함"
          />
          <Input
            label="반주자 성함"
            value={form.accompanistName}
            onChange={(e) => update({ accompanistName: e.target.value })}
            placeholder="반주자 성함"
            hint="MR 사용 시 '없음'이라고 입력해 주세요."
          />
          <Input
            label="수상 시 상장 및 상패를 수령할 주소"
            required
            value={form.awardAddress}
            onChange={(e) => update({ awardAddress: e.target.value })}
            placeholder="우편번호 + 상세 주소"
            hint="입력하신 정보는 수상자에 한해 상장 발송 목적으로만 사용됩니다."
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
