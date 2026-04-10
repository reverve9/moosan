import { useCallback, useEffect, useState } from 'react'
import { fetchFormContents, upsertFormContents, type FormContentMap } from '@/lib/formContents'
import type { Program } from '@/types/database'
import styles from './AdminApplications.module.css'

const FIELD_KEYS = ['notice', 'rules', 'privacy_items', 'privacy_purpose', 'privacy_retention'] as const

const FIELD_LABELS: Record<string, { label: string; rows: number }> = {
  notice: { label: '참가신청 안내문', rows: 6 },
  rules: { label: '대회 운영 규정', rows: 10 },
  privacy_items: { label: '개인정보 수집 항목', rows: 2 },
  privacy_purpose: { label: '개인정보 수집 목적', rows: 3 },
  privacy_retention: { label: '개인정보 보유 기간', rows: 2 },
}

interface Props {
  programs: Program[]
}

export default function AdminFormContents({ programs }: Props) {
  const [selectedProgramId, setSelectedProgramId] = useState<string>(programs[0]?.id ?? '')
  const [contents, setContents] = useState<FormContentMap>({})
  const [original, setOriginal] = useState<FormContentMap>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const dirty = FIELD_KEYS.some((k) => (contents[k] ?? '') !== (original[k] ?? ''))

  const load = useCallback(async () => {
    if (!selectedProgramId) return
    setLoading(true)
    try {
      const data = await fetchFormContents(selectedProgramId)
      setContents(data)
      setOriginal(data)
    } catch {
      // 실패 시 빈 상태
    } finally {
      setLoading(false)
    }
  }, [selectedProgramId])

  useEffect(() => {
    void load()
  }, [load])

  const handleSave = async () => {
    if (!selectedProgramId || saving) return
    setSaving(true)
    try {
      await upsertFormContents(selectedProgramId, contents)
      setOriginal({ ...contents })
      alert('저장 완료')
    } catch (err) {
      alert('저장 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className={styles.programTabs}>
        {programs.map((p) => (
          <button
            key={p.id}
            className={`${styles.programTab} ${selectedProgramId === p.id ? styles.programTabActive : ''}`}
            onClick={() => setSelectedProgramId(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.empty}>불러오는 중...</div>
      ) : (
        <div className={styles.formEditor}>
          {FIELD_KEYS.map((key) => {
            const meta = FIELD_LABELS[key]
            return (
              <div key={key} className={styles.fieldCard}>
                <label className={styles.fieldLabel}>{meta.label}</label>
                <textarea
                  className={styles.fieldTextarea}
                  rows={meta.rows}
                  value={contents[key] ?? ''}
                  onChange={(e) => setContents((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            )
          })}

          <button
            type="button"
            className={styles.saveBtn}
            disabled={!dirty || saving}
            onClick={handleSave}
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      )}
    </div>
  )
}
