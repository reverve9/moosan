import { Plus, X, Trash2, RotateCw, Upload, ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createNotice,
  deleteNotice,
  fetchAllNotices,
  updateNotice,
  uploadNoticeImage,
  type NoticeCategory,
  type NoticeInput,
} from '@/lib/notices'
import type { Notice } from '@/types/database'
import Pagination, { DEFAULT_PAGE_SIZE } from '@/components/admin/Pagination'
import styles from './AdminNotices.module.css'

const CATEGORY_LABEL: Record<NoticeCategory, string> = {
  general: '일반',
  program: '프로그램',
  result: '결과',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

export default function AdminNotices() {
  const [rows, setRows] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Notice | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = DEFAULT_PAGE_SIZE

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAllNotices()
      setRows(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pageRows = rows.slice(pageStart, pageStart + PAGE_SIZE)

  const totals = useMemo(() => {
    let published = 0
    let draft = 0
    let pinned = 0
    for (const r of rows) {
      if (r.is_published) published += 1
      else draft += 1
      if (r.is_pinned) pinned += 1
    }
    return { published, draft, pinned }
  }, [rows])

  const handleDelete = async (notice: Notice) => {
    if (!window.confirm(`"${notice.title}" 공지를 삭제하시겠습니까?`)) return
    try {
      await deleteNotice(notice.id)
      await refetch()
    } catch (e) {
      alert('삭제 실패: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const handleNew = () => {
    setEditTarget(null)
    setFormOpen(true)
  }

  const handleEdit = (notice: Notice) => {
    setEditTarget(notice)
    setFormOpen(true)
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>공지사항 관리</h1>
          <p className={styles.sub}>공지 작성 · 발행 · 고정</p>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{totals.published}</div>
            <div className={styles.statLabel}>발행</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{totals.draft}</div>
            <div className={styles.statLabel}>초안</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{totals.pinned}</div>
            <div className={styles.statLabel}>고정</div>
          </div>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => void refetch()}
            disabled={loading}
          >
            <RotateCw
              className={`${styles.btnIcon} ${loading ? styles.refreshIconSpin : ''}`}
            />
            <span>새로고침</span>
          </button>
          <button type="button" className={styles.newBtn} onClick={handleNew}>
            <Plus className={styles.btnIcon} />
            <span>새 공지</span>
          </button>
        </div>
      </header>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={rows.length}
        onChange={setPage}
      />

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.alignCenter}>#</th>
              <th>제목</th>
              <th>카테고리</th>
              <th>상태</th>
              <th>작성일</th>
              <th>발행일</th>
              <th className={styles.alignCenter}>조치</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className={styles.tablePlaceholder}>
                  불러오는 중...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.tablePlaceholder}>
                  등록된 공지가 없습니다.
                </td>
              </tr>
            ) : (
              pageRows.map((r, idx) => {
                const displayNo = rows.length - (pageStart + idx)
                return (
                  <tr
                    key={r.id}
                    className={`${styles.row} ${!r.is_published ? styles.rowDim : ''}`}
                    onClick={() => handleEdit(r)}
                  >
                    <td className={`${styles.alignCenter} ${styles.mono}`}>
                      {displayNo}
                    </td>
                    <td className={styles.titleCell}>
                      {r.is_pinned && <span className={styles.pinBadge}>📌</span>}
                      <span>{r.title}</span>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${styles[`badge_${r.category}`]}`}>
                        {CATEGORY_LABEL[r.category as NoticeCategory]}
                      </span>
                    </td>
                    <td>
                      {r.is_published ? (
                        <span className={`${styles.badge} ${styles.badge_published}`}>발행</span>
                      ) : (
                        <span className={`${styles.badge} ${styles.badge_draft}`}>초안</span>
                      )}
                    </td>
                    <td className={styles.mono}>{formatDate(r.created_at)}</td>
                    <td className={styles.mono}>
                      {r.published_at ? formatDate(r.published_at) : '—'}
                    </td>
                    <td className={styles.alignCenter}>
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleDelete(r)
                        }}
                        aria-label="삭제"
                      >
                        <Trash2 />
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <NoticeFormModal
          target={editTarget}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false)
            void refetch()
          }}
        />
      )}
    </div>
  )
}

// ─── 공지 작성/수정 모달 ──────────────────────────────────────

interface NoticeFormModalProps {
  target: Notice | null
  onClose: () => void
  onSaved: () => void
}

function NoticeFormModal({ target, onClose, onSaved }: NoticeFormModalProps) {
  const [title, setTitle] = useState(target?.title ?? '')
  const [content, setContent] = useState(target?.content ?? '')
  const [images, setImages] = useState<string[]>(target?.images ?? [])
  const [category, setCategory] = useState<NoticeCategory>(
    (target?.category as NoticeCategory) ?? 'general',
  )
  const [isPinned, setIsPinned] = useState(target?.is_pinned ?? false)
  const [isPublished, setIsPublished] = useState(target?.is_published ?? false)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleImageFiles = async (files: FileList) => {
    if (uploading) return
    if (files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      const urls: string[] = []
      for (const file of Array.from(files)) {
        const url = await uploadNoticeImage(file)
        urls.push(url)
      }
      setImages((prev) => [...prev, ...urls])
    } catch (e) {
      setError('이미지 업로드 실패: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleMoveImage = (index: number, direction: -1 | 1) => {
    setImages((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const handleSubmit = async () => {
    if (submitting) return
    if (!title.trim()) {
      setError('제목을 입력해주세요')
      return
    }
    if (!content.trim() && images.length === 0) {
      setError('내용 또는 이미지를 추가해주세요')
      return
    }
    const payload: NoticeInput = {
      title: title.trim(),
      content: content.trim(),
      images,
      category,
      is_pinned: isPinned,
      is_published: isPublished,
    }
    setSubmitting(true)
    setError(null)
    try {
      if (target) {
        await updateNotice(target.id, payload, {
          is_published: target.is_published,
          published_at: target.published_at,
        })
      } else {
        await createNotice(payload)
      }
      onSaved()
    } catch (e) {
      setError('저장 실패: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalLarge} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{target ? '공지 수정' : '새 공지 작성'}</h2>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="닫기"
          >
            <X />
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>제목</label>
            <input
              type="text"
              className={styles.fieldInput}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="공지 제목"
            />
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>카테고리</label>
              <select
                className={styles.fieldInput}
                value={category}
                onChange={(e) => setCategory(e.target.value as NoticeCategory)}
              >
                <option value="general">{CATEGORY_LABEL.general}</option>
                <option value="program">{CATEGORY_LABEL.program}</option>
                <option value="result">{CATEGORY_LABEL.result}</option>
              </select>
            </div>
            <label className={styles.toggleField}>
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
              />
              <span>상단 고정</span>
            </label>
            <label className={styles.toggleField}>
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
              />
              <span>발행</span>
            </label>
          </div>

          {/* ── 이미지 섹션 (본문 위) ── */}
          <div className={styles.field}>
            <div className={styles.contentLabelRow}>
              <label className={styles.fieldLabel}>
                이미지 <span className={styles.fieldLabelSub}>({images.length}장)</span>
              </label>
              <button
                type="button"
                className={styles.imageBtn}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className={styles.btnIcon} />
                <span>{uploading ? '업로드 중...' : '이미지 추가'}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className={styles.hiddenFileInput}
                onChange={(e) => {
                  const fs = e.target.files
                  if (fs && fs.length > 0) void handleImageFiles(fs)
                  e.target.value = ''
                }}
              />
            </div>
            {images.length === 0 ? (
              <div className={styles.imageEmpty}>
                첨부된 이미지가 없습니다. 상단 "이미지 추가" 버튼으로 올려주세요.
              </div>
            ) : (
              <ul className={styles.imageGrid}>
                {images.map((url, i) => (
                  <li key={`${url}-${i}`} className={styles.imageCard}>
                    <div className={styles.imageThumbWrap}>
                      <img src={url} alt={`첨부 ${i + 1}`} className={styles.imageThumb} />
                      <span className={styles.imageIndex}>{i + 1}</span>
                    </div>
                    <div className={styles.imageActions}>
                      <button
                        type="button"
                        className={styles.imageActionBtn}
                        onClick={() => handleMoveImage(i, -1)}
                        disabled={i === 0}
                        aria-label="앞으로"
                        title="앞으로"
                      >
                        <ChevronLeft />
                      </button>
                      <button
                        type="button"
                        className={styles.imageActionBtn}
                        onClick={() => handleMoveImage(i, 1)}
                        disabled={i === images.length - 1}
                        aria-label="뒤로"
                        title="뒤로"
                      >
                        <ChevronRight />
                      </button>
                      <button
                        type="button"
                        className={`${styles.imageActionBtn} ${styles.imageDeleteBtn}`}
                        onClick={() => handleRemoveImage(i)}
                        aria-label="삭제"
                        title="삭제"
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── 본문 (이미지 아래) ── */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>본문</label>
            <textarea
              className={styles.contentTextarea}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="공지 내용을 입력하세요. 줄바꿈과 빈 줄로 단락이 구분됩니다."
              rows={12}
            />
          </div>

          {error && <div className={styles.inlineError}>{error}</div>}

          <button
            type="button"
            className={styles.submitBtn}
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {submitting ? '저장 중...' : target ? '수정 저장' : '작성 완료'}
          </button>
        </div>
      </div>
    </div>
  )
}
