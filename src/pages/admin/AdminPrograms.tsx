import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getAssetUrl } from '@/lib/festival'
import { ArrowUpTrayIcon, CheckIcon } from '@heroicons/react/24/outline'
import type { Program } from '@/types/database'
import styles from './AdminPrograms.module.css'

const STORAGE_BUCKET = 'festival-assets'

type FormState = {
  name: string
  description: string
  event_name: string
  schedule: string
  venue: string
  target_text: string
  awards_text: string
  registration_period: string
  application_method: string
}

function toForm(p: Program): FormState {
  return {
    name: p.name ?? '',
    description: p.description ?? '',
    event_name: p.event_name ?? '',
    schedule: p.schedule ?? '',
    venue: p.venue ?? '',
    target_text: p.target_text ?? '',
    awards_text: p.awards_text ?? '',
    registration_period: p.registration_period ?? '',
    application_method: p.application_method ?? '',
  }
}

export default function AdminPrograms() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [forms, setForms] = useState<Record<string, FormState>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const fetchPrograms = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('programs')
      .select('*')
      .order('sort_order', { ascending: true })
    const list = data ?? []
    setPrograms(list)
    setForms(Object.fromEntries(list.map((p) => [p.id, toForm(p)])))
    setLoading(false)
  }

  useEffect(() => {
    fetchPrograms()
  }, [])

  const updateField = (id: string, field: keyof FormState, value: string) => {
    setForms((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  const handleSave = async (program: Program) => {
    setSavingId(program.id)
    const form = forms[program.id]
    const { error } = await supabase
      .from('programs')
      .update({
        name: form.name,
        description: form.description || null,
        event_name: form.event_name || null,
        schedule: form.schedule || null,
        venue: form.venue || null,
        target_text: form.target_text || null,
        awards_text: form.awards_text || null,
        registration_period: form.registration_period || null,
        application_method: form.application_method || null,
      })
      .eq('id', program.id)

    setSavingId(null)
    if (!error) {
      setSavedId(program.id)
      setTimeout(() => setSavedId(null), 2000)
      fetchPrograms()
    } else {
      alert('저장 실패: ' + error.message)
    }
  }

  const handleUpload = async (program: Program, file: File) => {
    setUploadingId(program.id)
    const ext = file.name.split('.').pop() || 'png'
    const path = `programs/${program.slug}/thumbnail.${ext}`

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, { upsert: true, cacheControl: '3600' })

    if (uploadError) {
      alert('업로드 실패: ' + uploadError.message)
      setUploadingId(null)
      return
    }

    const { error: dbError } = await supabase
      .from('programs')
      .update({ thumbnail_url: path })
      .eq('id', program.id)

    setUploadingId(null)
    if (dbError) {
      alert('DB 업데이트 실패: ' + dbError.message)
    } else {
      fetchPrograms()
    }
  }

  if (loading) {
    return (
      <div>
        <div className={styles.header}>
          <h1 className={styles.title}>프로그램 관리</h1>
        </div>
        <div className={styles.empty}>불러오는 중...</div>
      </div>
    )
  }

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>프로그램 관리</h1>
        <span className={styles.count}>{programs.length}개</span>
      </div>

      <div className={styles.list}>
        {programs.map((program) => {
          const form = forms[program.id]
          if (!form) return null
          const thumbUrl = getAssetUrl(program.thumbnail_url)

          return (
            <div key={program.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>{program.name}</h2>
                  <p className={styles.cardSlug}>/apply/{program.slug}</p>
                </div>
              </div>

              <div className={styles.cardBody}>
                <div className={styles.thumbSection}>
                  <div className={styles.thumbPreview}>
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={program.name}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className={styles.thumbEmpty}>썸네일 없음</div>
                    )}
                  </div>
                  <input
                    ref={(el) => { fileInputs.current[program.id] = el }}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleUpload(program, file)
                      e.target.value = ''
                    }}
                  />
                  <button
                    className={styles.uploadBtn}
                    onClick={() => fileInputs.current[program.id]?.click()}
                    disabled={uploadingId === program.id}
                  >
                    <ArrowUpTrayIcon width={16} height={16} />
                    {uploadingId === program.id ? '업로드 중...' : '썸네일 교체'}
                  </button>

                  <div className={styles.galleryPlaceholder}>
                    <p className={styles.galleryLabel}>지난 행사 사진 (4컷)</p>
                    <div className={styles.galleryGrid}>
                      <div className={styles.galleryEmpty}>+</div>
                      <div className={styles.galleryEmpty}>+</div>
                      <div className={styles.galleryEmpty}>+</div>
                      <div className={styles.galleryEmpty}>+</div>
                    </div>
                    <p className={styles.galleryNote}>업로드 기능 준비 중</p>
                  </div>
                </div>

                <div className={styles.formSection}>
                  <div className={styles.field}>
                    <label className={styles.label}>표시명 (탭/카드 라벨)</label>
                    <input
                      className={styles.input}
                      value={form.name}
                      onChange={(e) => updateField(program.id, 'name', e.target.value)}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>카드 설명 (1-3줄)</label>
                    <textarea
                      className={styles.textarea}
                      rows={3}
                      value={form.description}
                      onChange={(e) => updateField(program.id, 'description', e.target.value)}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>행사명 (정식 명칭)</label>
                    <input
                      className={styles.input}
                      value={form.event_name}
                      onChange={(e) => updateField(program.id, 'event_name', e.target.value)}
                    />
                  </div>

                  <div className={styles.row}>
                    <div className={styles.field}>
                      <label className={styles.label}>일 시</label>
                      <input
                        className={styles.input}
                        value={form.schedule}
                        onChange={(e) => updateField(program.id, 'schedule', e.target.value)}
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>장 소</label>
                      <input
                        className={styles.input}
                        value={form.venue}
                        onChange={(e) => updateField(program.id, 'venue', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>참가대상 (Shift+Enter로 줄바꿈)</label>
                    <textarea
                      className={styles.textarea}
                      rows={2}
                      value={form.target_text}
                      onChange={(e) => updateField(program.id, 'target_text', e.target.value)}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>시상내용 (Shift+Enter로 줄바꿈)</label>
                    <textarea
                      className={styles.textarea}
                      rows={2}
                      value={form.awards_text}
                      onChange={(e) => updateField(program.id, 'awards_text', e.target.value)}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>접수기간</label>
                    <input
                      className={styles.input}
                      value={form.registration_period}
                      onChange={(e) => updateField(program.id, 'registration_period', e.target.value)}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>접수방법 (Shift+Enter로 줄바꿈)</label>
                    <textarea
                      className={styles.textarea}
                      rows={2}
                      value={form.application_method}
                      onChange={(e) => updateField(program.id, 'application_method', e.target.value)}
                    />
                  </div>

                  <div className={styles.actions}>
                    <button
                      className={styles.saveBtn}
                      onClick={() => handleSave(program)}
                      disabled={savingId === program.id}
                    >
                      {savingId === program.id ? '저장 중...' : savedId === program.id ? (
                        <><CheckIcon width={16} height={16} /> 저장됨</>
                      ) : '저장'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
