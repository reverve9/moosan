import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpTrayIcon,
  PlusIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase'
import { fetchFoodBooths, getAssetUrl } from '@/lib/festival'
import type {
  FoodBoothWithMenus,
  FoodCategory,
  FoodMenu,
} from '@/types/festival_extras'
import styles from './AdminFood.module.css'

const STORAGE_BUCKET = 'festival-assets'
const FOOD_SLUG = 'food'

const CATEGORY_OPTIONS: { value: FoodCategory; label: string }[] = [
  { value: 'korean', label: '한식' },
  { value: 'chinese', label: '중식' },
  { value: 'japanese', label: '일식' },
  { value: 'fusion', label: '퓨전' },
]

const CATEGORY_LABEL: Record<FoodCategory, string> = {
  korean: '한식',
  chinese: '중식',
  japanese: '일식',
  fusion: '퓨전',
}

type CategoryFilter = 'all' | FoodCategory

const CATEGORY_FILTER_TABS: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'korean', label: '한식' },
  { key: 'chinese', label: '중식' },
  { key: 'japanese', label: '일식' },
  { key: 'fusion', label: '퓨전' },
]

type BoothForm = {
  booth_no: string
  name: string
  category: '' | FoodCategory
  description: string
  sort_order: number
  avg_prep_minutes: number
}

type MenuForm = {
  name: string
  price: string
  description: string
  is_signature: boolean
  sort_order: number
}

const emptyMenuForm: MenuForm = {
  name: '',
  price: '',
  description: '',
  is_signature: false,
  sort_order: 0,
}

function boothToForm(b: FoodBoothWithMenus): BoothForm {
  return {
    booth_no: b.booth_no ?? '',
    name: b.name,
    category: b.category ?? '',
    description: b.description ?? '',
    sort_order: b.sort_order,
    avg_prep_minutes: b.avg_prep_minutes,
  }
}

function menuToForm(m: FoodMenu): MenuForm {
  return {
    name: m.name,
    price: m.price != null ? String(m.price) : '',
    description: m.description ?? '',
    is_signature: m.is_signature,
    sort_order: m.sort_order,
  }
}

export default function AdminFood() {
  const [festivalId, setFestivalId] = useState<string | null>(null)
  const [booths, setBooths] = useState<FoodBoothWithMenus[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all')

  const filteredBooths = useMemo(() => {
    if (activeCategory === 'all') return booths
    return booths.filter((b) => b.category === activeCategory)
  }, [booths, activeCategory])

  // 부스 폼 상태 (lazy: 펼친 카드만 채워짐)
  const [boothForms, setBoothForms] = useState<Record<string, BoothForm>>({})
  // 메뉴 폼 상태 (key = menu.id)
  const [menuForms, setMenuForms] = useState<Record<string, MenuForm>>({})

  const [savingBoothId, setSavingBoothId] = useState<string | null>(null)
  const [savedBoothId, setSavedBoothId] = useState<string | null>(null)
  const [savingMenuId, setSavingMenuId] = useState<string | null>(null)
  const [savedMenuId, setSavedMenuId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [uploadingMenuId, setUploadingMenuId] = useState<string | null>(null)

  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})
  const menuFileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const refetch = async () => {
    if (!festivalId) return
    const data = await fetchFoodBooths(festivalId)
    // sort_order 로 정렬해 어드민에서는 결정적으로 노출
    data.sort((a, b) => a.sort_order - b.sort_order)
    setBooths(data)
  }

  const init = async () => {
    setLoading(true)
    const { data: festival } = await supabase
      .from('festivals')
      .select('id')
      .eq('slug', FOOD_SLUG)
      .single()
    if (!festival) {
      setLoading(false)
      return
    }
    setFestivalId(festival.id)
    const data = await fetchFoodBooths(festival.id)
    data.sort((a, b) => a.sort_order - b.sort_order)
    setBooths(data)
    setLoading(false)
  }

  useEffect(() => {
    init()
  }, [])

  // ESC 로 모달 닫기 + body scroll lock
  useEffect(() => {
    if (!selectedId) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null)
    }
    document.addEventListener('keydown', handleKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = prevOverflow
    }
  }, [selectedId])

  // refetch 후 selectedId 의 폼 상태를 최신 데이터로 동기화
  useEffect(() => {
    if (!selectedId) return
    const booth = booths.find((b) => b.id === selectedId)
    if (!booth) return
    setBoothForms((prev) =>
      prev[selectedId] ? prev : { ...prev, [selectedId]: boothToForm(booth) }
    )
    setMenuForms((prev) => {
      const next = { ...prev }
      for (const m of booth.menus) {
        if (!next[m.id]) next[m.id] = menuToForm(m)
      }
      return next
    })
  }, [selectedId, booths])

  // ──────────────── booth handlers ────────────────
  const openBooth = (booth: FoodBoothWithMenus) => {
    setSelectedId(booth.id)
    setBoothForms((prev) => ({ ...prev, [booth.id]: boothToForm(booth) }))
    setMenuForms((prev) => {
      const next = { ...prev }
      for (const m of booth.menus) {
        if (!next[m.id]) next[m.id] = menuToForm(m)
      }
      return next
    })
  }

  const closeModal = () => setSelectedId(null)

  const updateBoothField = <K extends keyof BoothForm>(
    id: string,
    field: K,
    value: BoothForm[K]
  ) => {
    setBoothForms((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }))
  }

  const handleAddBooth = async () => {
    if (!festivalId) return
    const nextSort =
      booths.length > 0 ? Math.max(...booths.map((b) => b.sort_order)) + 1 : 1
    const { data, error } = await supabase
      .from('food_booths')
      .insert({
        festival_id: festivalId,
        name: '새 매장',
        sort_order: nextSort,
      })
      .select()
      .single()
    if (error || !data) {
      alert('매장 추가 실패: ' + error?.message)
      return
    }
    await refetch()
    setSelectedId(data.id)
    setBoothForms((prev) => ({
      ...prev,
      [data.id]: {
        booth_no: '',
        name: '새 매장',
        category: '',
        description: '',
        sort_order: nextSort,
        avg_prep_minutes: 5,
      },
    }))
  }

  const handleSaveBooth = async (id: string) => {
    const form = boothForms[id]
    if (!form) return
    setSavingBoothId(id)
    const { error } = await supabase
      .from('food_booths')
      .update({
        booth_no: form.booth_no || null,
        name: form.name,
        category: form.category || null,
        description: form.description || null,
        sort_order: form.sort_order,
        avg_prep_minutes: Math.max(1, Math.min(30, form.avg_prep_minutes || 5)),
      })
      .eq('id', id)
    setSavingBoothId(null)
    if (error) {
      alert('저장 실패: ' + error.message)
      return
    }
    setSavedBoothId(id)
    setTimeout(() => setSavedBoothId(null), 1500)
    refetch()
  }

  const handleDeleteBooth = async (id: string) => {
    if (!confirm('이 매장을 삭제하시겠습니까? 메뉴도 함께 삭제됩니다.')) return
    const { error } = await supabase.from('food_booths').delete().eq('id', id)
    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }
    if (selectedId === id) setSelectedId(null)
    refetch()
  }

  const handleUploadThumbnail = async (
    booth: FoodBoothWithMenus,
    file: File
  ) => {
    setUploadingId(booth.id)
    const ext = file.name.split('.').pop() || 'png'
    const path = `food-booths/${booth.id}/thumbnail.${ext}`
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, { upsert: true, cacheControl: '3600' })
    if (uploadError) {
      alert('업로드 실패: ' + uploadError.message)
      setUploadingId(null)
      return
    }
    const { error: dbError } = await supabase
      .from('food_booths')
      .update({ thumbnail_url: path })
      .eq('id', booth.id)
    setUploadingId(null)
    if (dbError) {
      alert('DB 업데이트 실패: ' + dbError.message)
      return
    }
    refetch()
  }

  // ──────────────── menu handlers ────────────────
  const updateMenuField = <K extends keyof MenuForm>(
    menuId: string,
    field: K,
    value: MenuForm[K]
  ) => {
    setMenuForms((prev) => ({
      ...prev,
      [menuId]: { ...prev[menuId], [field]: value },
    }))
  }

  const handleAddMenu = async (booth: FoodBoothWithMenus) => {
    const nextSort =
      booth.menus.length > 0
        ? Math.max(...booth.menus.map((m) => m.sort_order)) + 1
        : 1
    const { data, error } = await supabase
      .from('food_menus')
      .insert({
        booth_id: booth.id,
        name: '새 메뉴',
        sort_order: nextSort,
      })
      .select()
      .single()
    if (error || !data) {
      alert('메뉴 추가 실패: ' + error?.message)
      return
    }
    setMenuForms((prev) => ({
      ...prev,
      [data.id]: { ...emptyMenuForm, name: '새 메뉴', sort_order: nextSort },
    }))
    refetch()
  }

  const handleSaveMenu = async (menuId: string) => {
    const form = menuForms[menuId]
    if (!form) return
    setSavingMenuId(menuId)
    const priceNum = form.price.trim() === '' ? null : Number(form.price)
    const { error } = await supabase
      .from('food_menus')
      .update({
        name: form.name,
        price: Number.isFinite(priceNum) ? priceNum : null,
        description: form.description || null,
        is_signature: form.is_signature,
        sort_order: form.sort_order,
      })
      .eq('id', menuId)
    setSavingMenuId(null)
    if (error) {
      alert('메뉴 저장 실패: ' + error.message)
      return
    }
    setSavedMenuId(menuId)
    setTimeout(() => setSavedMenuId(null), 1500)
    refetch()
  }

  const handleUploadMenuImage = async (menuId: string, file: File) => {
    setUploadingMenuId(menuId)
    const ext = file.name.split('.').pop() || 'png'
    const path = `food-menus/${menuId}/image.${ext}`
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, { upsert: true, cacheControl: '3600' })
    if (uploadError) {
      alert('업로드 실패: ' + uploadError.message)
      setUploadingMenuId(null)
      return
    }
    const { error: dbError } = await supabase
      .from('food_menus')
      .update({ image_url: path })
      .eq('id', menuId)
    setUploadingMenuId(null)
    if (dbError) {
      alert('DB 업데이트 실패: ' + dbError.message)
      return
    }
    refetch()
  }

  const handleDeleteMenu = async (menuId: string) => {
    if (!confirm('이 메뉴를 삭제하시겠습니까?')) return
    const { error } = await supabase.from('food_menus').delete().eq('id', menuId)
    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }
    setMenuForms((prev) => {
      const next = { ...prev }
      delete next[menuId]
      return next
    })
    refetch()
  }

  // ──────────────── render ────────────────
  if (loading) {
    return (
      <div>
        <div className={styles.header}>
          <h1 className={styles.title}>참여 매장 관리</h1>
        </div>
        <div className={styles.empty}>불러오는 중...</div>
      </div>
    )
  }

  if (!festivalId) {
    return (
      <div>
        <div className={styles.header}>
          <h1 className={styles.title}>참여 매장 관리</h1>
        </div>
        <div className={styles.empty}>
          food festival 이 존재하지 않습니다. 먼저 페스티벌을 등록해주세요.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>참여 매장 관리</h1>
          <span className={styles.count}>{booths.length}개</span>
        </div>
        <button className={styles.addBtn} onClick={handleAddBooth}>
          <PlusIcon width={16} height={16} /> 매장 추가
        </button>
      </div>

      <div className={styles.filterTabs} role="tablist" aria-label="카테고리 필터">
        {CATEGORY_FILTER_TABS.map((t) => {
          const active = activeCategory === t.key
          const count =
            t.key === 'all'
              ? booths.length
              : booths.filter((b) => b.category === t.key).length
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              className={`${styles.filterTab} ${active ? styles.filterTabActive : ''}`}
              onClick={() => setActiveCategory(t.key)}
            >
              {t.label}
              <span className={styles.filterCount}>{count}</span>
            </button>
          )
        })}
      </div>

      {booths.length === 0 ? (
        <div className={styles.empty}>등록된 매장이 없습니다. 우측 상단 ‘매장 추가’로 시작하세요.</div>
      ) : filteredBooths.length === 0 ? (
        <div className={styles.empty}>해당 카테고리에 매장이 없습니다.</div>
      ) : (
        <div className={styles.grid}>
          {filteredBooths.map((booth) => {
            const thumbUrl = getAssetUrl(booth.thumbnail_url)
            return (
              <button
                key={booth.id}
                type="button"
                className={styles.gridCard}
                onClick={() => openBooth(booth)}
              >
                <div className={styles.gridThumb}>
                  {thumbUrl ? (
                    <img src={thumbUrl} alt={booth.name} />
                  ) : (
                    <div className={styles.gridThumbEmpty}>—</div>
                  )}
                </div>
                <div className={styles.gridCardBody}>
                  <div className={styles.gridCardTopRow}>
                    {booth.category && (
                      <span className={styles.cardCategory}>
                        {CATEGORY_LABEL[booth.category]}
                      </span>
                    )}
                    <span className={styles.gridCardName}>{booth.name}</span>
                  </div>
                  <div className={styles.gridCardSubRow}>
                    <span className={styles.cardBoothNo}>
                      {booth.booth_no ? `#${booth.booth_no}` : '—'}
                    </span>
                    {booth.description && (
                      <span className={styles.gridCardDesc}>{booth.description}</span>
                    )}
                  </div>
                </div>
                <div className={styles.gridCardMeta}>{booth.menus.length}</div>
              </button>
            )
          })}
        </div>
      )}

      {selectedId && (() => {
        const booth = booths.find((b) => b.id === selectedId)
        const form = boothForms[selectedId]
        if (!booth || !form) return null
        const thumbUrl = getAssetUrl(booth.thumbnail_url)
        return (
          <div
            className={styles.modalBackdrop}
            onClick={closeModal}
            role="dialog"
            aria-modal="true"
            aria-label={`${booth.name} 편집`}
          >
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2 className={styles.modalTitle}>{booth.name}</h2>
                <button
                  type="button"
                  className={styles.modalClose}
                  onClick={closeModal}
                  aria-label="닫기"
                >
                  <XMarkIcon width={20} height={20} />
                </button>
              </div>

              <div className={styles.modalBody}>
                {/* ───── 부스 정보 ───── */}
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}>매장 정보</h3>

                  <div className={styles.formRow3}>
                    <div className={styles.field}>
                      <label className={styles.label}>부스번호</label>
                      <input
                        className={styles.input}
                        value={form.booth_no}
                        onChange={(e) =>
                          updateBoothField(booth.id, 'booth_no', e.target.value)
                        }
                        placeholder="01"
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>카테고리</label>
                      <select
                        className={styles.input}
                        value={form.category}
                        onChange={(e) =>
                          updateBoothField(
                            booth.id,
                            'category',
                            e.target.value as BoothForm['category']
                          )
                        }
                      >
                        <option value="">선택</option>
                        {CATEGORY_OPTIONS.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>정렬 순서</label>
                      <input
                        type="number"
                        className={styles.input}
                        value={form.sort_order}
                        onChange={(e) =>
                          updateBoothField(
                            booth.id,
                            'sort_order',
                            Number(e.target.value)
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>매장명</label>
                    <input
                      className={styles.input}
                      value={form.name}
                      onChange={(e) =>
                        updateBoothField(booth.id, 'name', e.target.value)
                      }
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>한 줄 설명</label>
                    <input
                      className={styles.input}
                      value={form.description}
                      onChange={(e) =>
                        updateBoothField(booth.id, 'description', e.target.value)
                      }
                      placeholder="속초 명물 오징어순대 전문"
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>건당 평균 처리 시간 (분)</label>
                    <input
                      type="number"
                      className={styles.input}
                      min={1}
                      max={30}
                      value={form.avg_prep_minutes}
                      onChange={(e) =>
                        updateBoothField(
                          booth.id,
                          'avg_prep_minutes',
                          Number(e.target.value),
                        )
                      }
                    />
                    <p className={styles.fieldHint}>
                      예상 대기 시간 계산에 사용됩니다 (1~30분, 기본 5분)
                    </p>
                  </div>

                  <div className={styles.thumbRow}>
                    <div className={styles.thumbPreview}>
                      {thumbUrl ? (
                        <img src={thumbUrl} alt={booth.name} />
                      ) : (
                        <div className={styles.thumbEmpty}>썸네일 없음</div>
                      )}
                    </div>
                    <input
                      ref={(el) => {
                        fileInputs.current[booth.id] = el
                      }}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleUploadThumbnail(booth, file)
                        e.target.value = ''
                      }}
                    />
                    <button
                      className={styles.uploadBtn}
                      onClick={() => fileInputs.current[booth.id]?.click()}
                      disabled={uploadingId === booth.id}
                    >
                      <ArrowUpTrayIcon width={16} height={16} />
                      {uploadingId === booth.id ? '업로드 중...' : '썸네일 교체'}
                    </button>
                  </div>

                  <div className={styles.boothActions}>
                    <button
                      className={styles.saveBtn}
                      onClick={() => handleSaveBooth(booth.id)}
                      disabled={savingBoothId === booth.id}
                    >
                      {savingBoothId === booth.id ? (
                        '저장 중...'
                      ) : savedBoothId === booth.id ? (
                        <>
                          <CheckIcon width={16} height={16} /> 저장됨
                        </>
                      ) : (
                        '매장 정보 저장'
                      )}
                    </button>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => handleDeleteBooth(booth.id)}
                    >
                      <TrashIcon width={16} height={16} /> 매장 삭제
                    </button>
                  </div>
                </div>

                {/* ───── 메뉴 ───── */}
                <div className={styles.section}>
                  <div className={styles.menuHeader}>
                    <h3 className={styles.sectionTitle}>메뉴</h3>
                    <button
                      className={styles.addMenuBtn}
                      onClick={() => handleAddMenu(booth)}
                    >
                      <PlusIcon width={14} height={14} /> 메뉴 추가
                    </button>
                  </div>

                  {booth.menus.length === 0 ? (
                    <p className={styles.emptyMenus}>아직 메뉴가 없습니다</p>
                  ) : (
                    <div className={styles.menuList}>
                      {booth.menus.map((m) => {
                        const mForm = menuForms[m.id]
                        if (!mForm) return null
                        return (
                          <div key={m.id} className={styles.menuRow}>
                            <div className={styles.menuThumbRow}>
                              <div className={styles.menuThumbPreview}>
                                {m.image_url ? (
                                  <img
                                    src={getAssetUrl(m.image_url) ?? ''}
                                    alt={m.name}
                                  />
                                ) : (
                                  <div className={styles.menuThumbEmpty}>없음</div>
                                )}
                              </div>
                              <input
                                ref={(el) => {
                                  menuFileInputs.current[m.id] = el
                                }}
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) handleUploadMenuImage(m.id, file)
                                  e.target.value = ''
                                }}
                              />
                              <button
                                className={styles.menuUploadBtn}
                                onClick={() =>
                                  menuFileInputs.current[m.id]?.click()
                                }
                                disabled={uploadingMenuId === m.id}
                              >
                                <ArrowUpTrayIcon width={14} height={14} />
                                {uploadingMenuId === m.id
                                  ? '업로드 중...'
                                  : '메뉴 사진'}
                              </button>
                            </div>
                            <div className={styles.menuFields}>
                              <input
                                className={`${styles.input} ${styles.menuName}`}
                                value={mForm.name}
                                onChange={(e) =>
                                  updateMenuField(m.id, 'name', e.target.value)
                                }
                                placeholder="메뉴명"
                              />
                              <input
                                type="number"
                                className={`${styles.input} ${styles.menuPrice}`}
                                value={mForm.price}
                                onChange={(e) =>
                                  updateMenuField(m.id, 'price', e.target.value)
                                }
                                placeholder="가격(원)"
                              />
                              <label className={styles.signatureLabel}>
                                <input
                                  type="checkbox"
                                  checked={mForm.is_signature}
                                  onChange={(e) =>
                                    updateMenuField(
                                      m.id,
                                      'is_signature',
                                      e.target.checked
                                    )
                                  }
                                />
                                대표
                              </label>
                            </div>
                            <input
                              className={styles.input}
                              value={mForm.description}
                              onChange={(e) =>
                                updateMenuField(
                                  m.id,
                                  'description',
                                  e.target.value
                                )
                              }
                              placeholder="메뉴 설명 (옵션)"
                            />
                            <div className={styles.menuActions}>
                              <button
                                className={styles.menuSaveBtn}
                                onClick={() => handleSaveMenu(m.id)}
                                disabled={savingMenuId === m.id}
                              >
                                {savingMenuId === m.id ? (
                                  '저장 중...'
                                ) : savedMenuId === m.id ? (
                                  <>
                                    <CheckIcon width={14} height={14} /> 저장됨
                                  </>
                                ) : (
                                  '저장'
                                )}
                              </button>
                              <button
                                className={styles.menuDeleteBtn}
                                onClick={() => handleDeleteMenu(m.id)}
                                aria-label="메뉴 삭제"
                              >
                                <TrashIcon width={14} height={14} />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
