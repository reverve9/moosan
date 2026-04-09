import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getAssetUrl } from '@/lib/festival'
import {
  ArrowUpTrayIcon,
  CheckIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline'
import type { Festival, Program } from '@/types/database'
import styles from './AdminContentDetail.module.css'

const STORAGE_BUCKET = 'festival-assets'

type Slug = 'musan' | 'youth' | 'food'

interface Props {
  slug: Slug
}

const SLUG_LABELS: Record<Slug, string> = {
  musan: '설악무산문화축전',
  youth: '청소년문화축전',
  food: '음식문화페스티벌',
}

// ============================================================================
// festivals 폼 상태
// ============================================================================
type FestivalForm = {
  name: string
  subtitle: string
  description_lead: string
  description_body: string
  schedule: string
  venue: string
  theme_color: string
}

function toFestivalForm(f: Festival): FestivalForm {
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

// ============================================================================
// programs 폼 상태 (youth 전용)
// ============================================================================
type ProgramForm = {
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

function toProgramForm(p: Program): ProgramForm {
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

// ============================================================================
// 컴포넌트
// ============================================================================
export default function AdminContentDetail({ slug }: Props) {
  // ── festival ────────────────────────────────────────────────────────────
  const [festival, setFestival] = useState<Festival | null>(null)
  const [festivalForm, setFestivalForm] = useState<FestivalForm | null>(null)
  const [festivalSaving, setFestivalSaving] = useState(false)
  const [festivalSaved, setFestivalSaved] = useState(false)
  const [festivalUploading, setFestivalUploading] = useState(false)
  const festivalFileRef = useRef<HTMLInputElement | null>(null)

  // ── programs (youth 만 사용) ────────────────────────────────────────────
  const [programs, setPrograms] = useState<Program[]>([])
  const [programForms, setProgramForms] = useState<Record<string, ProgramForm>>({})
  const [programSavingId, setProgramSavingId] = useState<string | null>(null)
  const [programSavedId, setProgramSavedId] = useState<string | null>(null)
  const [programUploadingId, setProgramUploadingId] = useState<string | null>(null)
  const programFileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    setLoading(true)

    const { data: f } = await supabase
      .from('festivals')
      .select('*')
      .eq('slug', slug)
      .single()
    if (f) {
      setFestival(f)
      setFestivalForm(toFestivalForm(f))
    } else {
      setFestival(null)
      setFestivalForm(null)
    }

    if (slug === 'youth') {
      const { data: p } = await supabase
        .from('programs')
        .select('*')
        .order('sort_order', { ascending: true })
      const list = p ?? []
      setPrograms(list)
      setProgramForms(
        Object.fromEntries(list.map((pr) => [pr.id, toProgramForm(pr)])),
      )
    } else {
      setPrograms([])
      setProgramForms({})
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    // slug 가 바뀌면 다시 로드
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // ── festival 핸들러 ─────────────────────────────────────────────────────
  const updateFestivalField = (field: keyof FestivalForm, value: string) => {
    setFestivalForm((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  const handleFestivalSave = async () => {
    if (!festival || !festivalForm) return
    setFestivalSaving(true)
    const { error } = await supabase
      .from('festivals')
      .update({
        name: festivalForm.name,
        subtitle: festivalForm.subtitle || null,
        description_lead: festivalForm.description_lead || null,
        description_body: festivalForm.description_body || null,
        schedule: festivalForm.schedule || null,
        venue: festivalForm.venue || null,
        theme_color: festivalForm.theme_color || null,
      })
      .eq('id', festival.id)
    setFestivalSaving(false)
    if (error) {
      alert('저장 실패: ' + error.message)
      return
    }
    setFestivalSaved(true)
    setTimeout(() => setFestivalSaved(false), 2000)
    fetchData()
  }

  const handleFestivalUpload = async (file: File) => {
    if (!festival) return
    setFestivalUploading(true)
    const ext = file.name.split('.').pop() || 'png'
    const path = `festivals/${festival.slug}/poster.${ext}`

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, { upsert: true, cacheControl: '3600' })

    if (uploadError) {
      alert('업로드 실패: ' + uploadError.message)
      setFestivalUploading(false)
      return
    }

    const { error: dbError } = await supabase
      .from('festivals')
      .update({ poster_url: path })
      .eq('id', festival.id)

    setFestivalUploading(false)
    if (dbError) {
      alert('DB 업데이트 실패: ' + dbError.message)
    } else {
      fetchData()
    }
  }

  // ── program 핸들러 (youth 전용) ─────────────────────────────────────────
  const updateProgramField = (
    id: string,
    field: keyof ProgramForm,
    value: string,
  ) => {
    setProgramForms((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }))
  }

  const handleProgramSave = async (program: Program) => {
    setProgramSavingId(program.id)
    const form = programForms[program.id]
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
    setProgramSavingId(null)
    if (error) {
      alert('저장 실패: ' + error.message)
      return
    }
    setProgramSavedId(program.id)
    setTimeout(() => setProgramSavedId(null), 2000)
    fetchData()
  }

  const handleProgramUpload = async (program: Program, file: File) => {
    setProgramUploadingId(program.id)
    const ext = file.name.split('.').pop() || 'png'
    const path = `programs/${program.slug}/thumbnail.${ext}`

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, { upsert: true, cacheControl: '3600' })

    if (uploadError) {
      alert('업로드 실패: ' + uploadError.message)
      setProgramUploadingId(null)
      return
    }

    const { error: dbError } = await supabase
      .from('programs')
      .update({ thumbnail_url: path })
      .eq('id', program.id)

    setProgramUploadingId(null)
    if (dbError) {
      alert('DB 업데이트 실패: ' + dbError.message)
    } else {
      fetchData()
    }
  }

  // ── 렌더 ────────────────────────────────────────────────────────────────
  if (loading || !festival || !festivalForm) {
    return (
      <div>
        <div className={styles.header}>
          <h1 className={styles.title}>{SLUG_LABELS[slug]}</h1>
        </div>
        <div className={styles.empty}>불러오는 중...</div>
      </div>
    )
  }

  const posterUrl = getAssetUrl(festival.poster_url)

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>{SLUG_LABELS[slug]}</h1>
        <span className={styles.slug}>/program/{festival.slug}</span>
      </div>

      {/* ─────────────── 섹션 1 — 페이지 상단 영역 ─────────────── */}
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>페이지 상단 영역</h2>
        </header>

        <div className={styles.card}>
          <div
            className={
              slug === 'musan' ? styles.cardBodyFull : styles.cardBody
            }
          >
            {/* musan 은 손님 페이지에서 포스터를 안 쓰므로 (quote 블록으로 대체) 어드민에서도 포스터 영역 숨김 */}
            {slug !== 'musan' && (
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
                  ref={festivalFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFestivalUpload(file)
                    e.target.value = ''
                  }}
                />
                <button
                  className={styles.uploadBtn}
                  onClick={() => festivalFileRef.current?.click()}
                  disabled={festivalUploading}
                >
                  <ArrowUpTrayIcon width={16} height={16} />
                  {festivalUploading ? '업로드 중...' : '포스터 교체'}
                </button>
              </div>
            )}

            <div className={styles.formSection}>
              <div className={styles.field}>
                <label className={styles.label}>행사명</label>
                <input
                  className={styles.input}
                  value={festivalForm.name}
                  onChange={(e) => updateFestivalField('name', e.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>영문 부제</label>
                <input
                  className={styles.input}
                  value={festivalForm.subtitle}
                  onChange={(e) => updateFestivalField('subtitle', e.target.value)}
                />
              </div>

              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label}>행사기간</label>
                  <input
                    className={styles.input}
                    value={festivalForm.schedule}
                    onChange={(e) => updateFestivalField('schedule', e.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>장소</label>
                  <input
                    className={styles.input}
                    value={festivalForm.venue}
                    onChange={(e) => updateFestivalField('venue', e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>테마 컬러 (드롭캡/박스 배경)</label>
                <div className={styles.colorRow}>
                  <input
                    type="color"
                    className={styles.colorPicker}
                    value={festivalForm.theme_color}
                    onChange={(e) => updateFestivalField('theme_color', e.target.value)}
                  />
                  <input
                    className={styles.input}
                    value={festivalForm.theme_color}
                    onChange={(e) => updateFestivalField('theme_color', e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>본문 — 첫 단락 (드롭캡 적용)</label>
                <textarea
                  className={styles.textarea}
                  rows={4}
                  value={festivalForm.description_lead}
                  onChange={(e) =>
                    updateFestivalField('description_lead', e.target.value)
                  }
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>본문 — 두 번째 단락</label>
                <textarea
                  className={styles.textarea}
                  rows={4}
                  value={festivalForm.description_body}
                  onChange={(e) =>
                    updateFestivalField('description_body', e.target.value)
                  }
                />
              </div>

              <div className={styles.actions}>
                <button
                  className={styles.saveBtn}
                  onClick={handleFestivalSave}
                  disabled={festivalSaving}
                >
                  {festivalSaving ? (
                    '저장 중...'
                  ) : festivalSaved ? (
                    <>
                      <CheckIcon width={16} height={16} /> 저장됨
                    </>
                  ) : (
                    '저장'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────── 섹션 2 — 페이지 하단 영역 ─────────────── */}
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>페이지 하단 영역</h2>
          {slug === 'youth' && (
            <p className={styles.sectionSub}>
              참가신청 행사 카드 ({programs.length}개)
            </p>
          )}
        </header>

        {/* youth — programs 카드 리스트 편집 */}
        {slug === 'youth' && (
          <div className={styles.list}>
            {programs.map((program) => {
              const form = programForms[program.id]
              if (!form) return null
              const thumbUrl = getAssetUrl(program.thumbnail_url)

              return (
                <div key={program.id} className={styles.card}>
                  <div className={styles.subCardHeader}>
                    <div>
                      <h3 className={styles.subCardTitle}>{program.name}</h3>
                      <p className={styles.subCardSlug}>/apply/{program.slug}</p>
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
                        ref={(el) => {
                          programFileInputs.current[program.id] = el
                        }}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleProgramUpload(program, file)
                          e.target.value = ''
                        }}
                      />
                      <button
                        className={styles.uploadBtn}
                        onClick={() =>
                          programFileInputs.current[program.id]?.click()
                        }
                        disabled={programUploadingId === program.id}
                      >
                        <ArrowUpTrayIcon width={16} height={16} />
                        {programUploadingId === program.id
                          ? '업로드 중...'
                          : '썸네일 교체'}
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
                          onChange={(e) =>
                            updateProgramField(program.id, 'name', e.target.value)
                          }
                        />
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label}>카드 설명 (1-3줄)</label>
                        <textarea
                          className={styles.textarea}
                          rows={3}
                          value={form.description}
                          onChange={(e) =>
                            updateProgramField(program.id, 'description', e.target.value)
                          }
                        />
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label}>행사명 (정식 명칭)</label>
                        <input
                          className={styles.input}
                          value={form.event_name}
                          onChange={(e) =>
                            updateProgramField(program.id, 'event_name', e.target.value)
                          }
                        />
                      </div>

                      <div className={styles.row}>
                        <div className={styles.field}>
                          <label className={styles.label}>일 시</label>
                          <input
                            className={styles.input}
                            value={form.schedule}
                            onChange={(e) =>
                              updateProgramField(program.id, 'schedule', e.target.value)
                            }
                          />
                        </div>
                        <div className={styles.field}>
                          <label className={styles.label}>장 소</label>
                          <input
                            className={styles.input}
                            value={form.venue}
                            onChange={(e) =>
                              updateProgramField(program.id, 'venue', e.target.value)
                            }
                          />
                        </div>
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label}>참가대상 (Shift+Enter로 줄바꿈)</label>
                        <textarea
                          className={styles.textarea}
                          rows={2}
                          value={form.target_text}
                          onChange={(e) =>
                            updateProgramField(program.id, 'target_text', e.target.value)
                          }
                        />
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label}>시상내용 (Shift+Enter로 줄바꿈)</label>
                        <textarea
                          className={styles.textarea}
                          rows={2}
                          value={form.awards_text}
                          onChange={(e) =>
                            updateProgramField(program.id, 'awards_text', e.target.value)
                          }
                        />
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label}>접수기간</label>
                        <input
                          className={styles.input}
                          value={form.registration_period}
                          onChange={(e) =>
                            updateProgramField(program.id, 'registration_period', e.target.value)
                          }
                        />
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label}>접수방법 (Shift+Enter로 줄바꿈)</label>
                        <textarea
                          className={styles.textarea}
                          rows={2}
                          value={form.application_method}
                          onChange={(e) =>
                            updateProgramField(program.id, 'application_method', e.target.value)
                          }
                        />
                      </div>

                      <div className={styles.actions}>
                        <button
                          className={styles.saveBtn}
                          onClick={() => handleProgramSave(program)}
                          disabled={programSavingId === program.id}
                        >
                          {programSavingId === program.id ? (
                            '저장 중...'
                          ) : programSavedId === program.id ? (
                            <>
                              <CheckIcon width={16} height={16} /> 저장됨
                            </>
                          ) : (
                            '저장'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* musan — events/guests 안내 */}
        {slug === 'musan' && (
          <div className={styles.notice}>
            <InformationCircleIcon className={styles.noticeIcon} />
            <div className={styles.noticeBody}>
              <strong>이벤트 / 게스트 편집은 클라이언트 UI 정리 후 추가될 예정입니다.</strong>
              <p>
                현재는 DB 직접 입력만 가능합니다. 표시 항목: 개·폐막식 일정 (festival_events)
                · 스페셜 게스트 (festival_guests) · 기타 프로그램 (festival_events).
              </p>
            </div>
          </div>
        )}

        {/* food — 가맹점 안내 */}
        {slug === 'food' && (
          <div className={styles.notice}>
            <InformationCircleIcon className={styles.noticeIcon} />
            <div className={styles.noticeBody}>
              <strong>참여 매장 / 메뉴는 [참여 매장 관리] 메뉴에서 관리합니다.</strong>
              <p>
                좌측 사이드바 → 매장 관리 → 참여 매장 관리. 부스 / 메뉴 / 품절 / 영업 상태 등.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
