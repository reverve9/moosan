import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getAssetUrl } from '@/lib/festival'
import { ArrowUpTrayIcon, CheckIcon } from '@heroicons/react/24/outline'
import type { Festival } from '@/types/database'
import styles from './AdminFestivals.module.css'

const STORAGE_BUCKET = 'festival-assets'

type FormState = {
  name: string
  subtitle: string
  description_lead: string
  description_body: string
  schedule: string
  venue: string
  theme_color: string
}

function toForm(f: Festival): FormState {
  return {
    name: f.name ?? '',
    subtitle: f.subtitle ?? '',
    description_lead: f.description_lead ?? '',
    description_body: f.description_body ?? '',
    schedule: f.schedule ?? '',
    venue: f.venue ?? '',
    theme_color: f.theme_color ?? '#FBF1CC',
  }
}

export default function AdminFestivals() {
  const [festivals, setFestivals] = useState<Festival[]>([])
  const [loading, setLoading] = useState(true)
  const [forms, setForms] = useState<Record<string, FormState>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const fetchFestivals = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('festivals')
      .select('*')
      .order('sort_order', { ascending: true })
    const list = data ?? []
    setFestivals(list)
    setForms(Object.fromEntries(list.map((f) => [f.id, toForm(f)])))
    setLoading(false)
  }

  useEffect(() => {
    fetchFestivals()
  }, [])

  const updateField = (id: string, field: keyof FormState, value: string) => {
    setForms((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  const handleSave = async (festival: Festival) => {
    setSavingId(festival.id)
    const form = forms[festival.id]
    const { error } = await supabase
      .from('festivals')
      .update({
        name: form.name,
        subtitle: form.subtitle || null,
        description_lead: form.description_lead || null,
        description_body: form.description_body || null,
        schedule: form.schedule || null,
        venue: form.venue || null,
        theme_color: form.theme_color || null,
      })
      .eq('id', festival.id)

    setSavingId(null)
    if (!error) {
      setSavedId(festival.id)
      setTimeout(() => setSavedId(null), 2000)
      fetchFestivals()
    } else {
      alert('저장 실패: ' + error.message)
    }
  }

  const handleUpload = async (festival: Festival, file: File) => {
    setUploadingId(festival.id)
    const ext = file.name.split('.').pop() || 'png'
    const path = `festivals/${festival.slug}/poster.${ext}`

    // 같은 경로에 upsert
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, { upsert: true, cacheControl: '3600' })

    if (uploadError) {
      alert('업로드 실패: ' + uploadError.message)
      setUploadingId(null)
      return
    }

    // DB poster_url 업데이트
    const { error: dbError } = await supabase
      .from('festivals')
      .update({ poster_url: path })
      .eq('id', festival.id)

    setUploadingId(null)
    if (dbError) {
      alert('DB 업데이트 실패: ' + dbError.message)
    } else {
      fetchFestivals()
    }
  }

  if (loading) {
    return (
      <div>
        <div className={styles.header}>
          <h1 className={styles.title}>축전 페이지 관리</h1>
        </div>
        <div className={styles.empty}>불러오는 중...</div>
      </div>
    )
  }

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>축전 페이지 관리</h1>
        <span className={styles.count}>{festivals.length}개</span>
      </div>

      <div className={styles.list}>
        {festivals.map((festival) => {
          const form = forms[festival.id]
          if (!form) return null
          const posterUrl = getAssetUrl(festival.poster_url)

          return (
            <div key={festival.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>{festival.name}</h2>
                  <p className={styles.cardSlug}>/program/{festival.slug}</p>
                </div>
              </div>

              <div className={styles.cardBody}>
                <div className={styles.posterSection}>
                  <div className={styles.posterPreview}>
                    {posterUrl ? (
                      <img
                        src={posterUrl}
                        alt={festival.name}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className={styles.posterEmpty}>포스터 없음</div>
                    )}
                  </div>
                  <input
                    ref={(el) => { fileInputs.current[festival.id] = el }}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleUpload(festival, file)
                      e.target.value = ''
                    }}
                  />
                  <button
                    className={styles.uploadBtn}
                    onClick={() => fileInputs.current[festival.id]?.click()}
                    disabled={uploadingId === festival.id}
                  >
                    <ArrowUpTrayIcon width={16} height={16} />
                    {uploadingId === festival.id ? '업로드 중...' : '포스터 교체'}
                  </button>
                </div>

                <div className={styles.formSection}>
                  <div className={styles.field}>
                    <label className={styles.label}>행사명</label>
                    <input
                      className={styles.input}
                      value={form.name}
                      onChange={(e) => updateField(festival.id, 'name', e.target.value)}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>영문 부제</label>
                    <input
                      className={styles.input}
                      value={form.subtitle}
                      onChange={(e) => updateField(festival.id, 'subtitle', e.target.value)}
                    />
                  </div>

                  <div className={styles.row}>
                    <div className={styles.field}>
                      <label className={styles.label}>행사기간</label>
                      <input
                        className={styles.input}
                        value={form.schedule}
                        onChange={(e) => updateField(festival.id, 'schedule', e.target.value)}
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>장소</label>
                      <input
                        className={styles.input}
                        value={form.venue}
                        onChange={(e) => updateField(festival.id, 'venue', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>테마 컬러 (드롭캡/박스 배경)</label>
                    <div className={styles.colorRow}>
                      <input
                        type="color"
                        className={styles.colorPicker}
                        value={form.theme_color}
                        onChange={(e) => updateField(festival.id, 'theme_color', e.target.value)}
                      />
                      <input
                        className={styles.input}
                        value={form.theme_color}
                        onChange={(e) => updateField(festival.id, 'theme_color', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>본문 — 첫 단락 (드롭캡 적용)</label>
                    <textarea
                      className={styles.textarea}
                      rows={4}
                      value={form.description_lead}
                      onChange={(e) => updateField(festival.id, 'description_lead', e.target.value)}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>본문 — 두 번째 단락</label>
                    <textarea
                      className={styles.textarea}
                      rows={4}
                      value={form.description_body}
                      onChange={(e) => updateField(festival.id, 'description_body', e.target.value)}
                    />
                  </div>

                  <div className={styles.actions}>
                    <button
                      className={styles.saveBtn}
                      onClick={() => handleSave(festival)}
                      disabled={savingId === festival.id}
                    >
                      {savingId === festival.id ? '저장 중...' : savedId === festival.id ? (
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
