import { Plus, X, Trash2, RotateCw, Upload } from 'lucide-react'
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
  const [category, setCategory] = useState<NoticeCategory>(
    (target?.category as NoticeCategory) ?? 'general',
  )
  const [isPinned, setIsPinned] = useState(target?.is_pinned ?? false)
  const [isPublished, setIsPublished] = useState(target?.is_published ?? false)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleImageFile = async (file: File) => {
    if (uploading) return
    setUploading(true)
    setError(null)
    try {
      const url = await uploadNoticeImage(file)
      const markdown = `\n![](${url})\n`
      const textarea = textareaRef.current
      if (textarea) {
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const next = content.slice(0, start) + markdown + content.slice(end)
        setContent(next)
        // 커서 위치 복원
        requestAnimationFrame(() => {
          textarea.focus()
          const pos = start + markdown.length
          textarea.setSelectionRange(pos, pos)
        })
      } else {
        setContent((c) => c + markdown)
      }
    } catch (e) {
      setError('이미지 업로드 실패: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async () => {
    if (submitting) return
    if (!title.trim()) {
      setError('제목을 입력해주세요')
      return
    }
    if (!content.trim()) {
      setError('내용을 입력해주세요')
      return
    }
    const payload: NoticeInput = {
      title: title.trim(),
      content: content.trim(),
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

          <div className={styles.field}>
            <div className={styles.contentLabelRow}>
              <label className={styles.fieldLabel}>내용 (Markdown)</label>
              <button
                type="button"
                className={styles.imageBtn}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className={styles.btnIcon} />
                <span>{uploading ? '업로드 중...' : '이미지 삽입'}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className={styles.hiddenFileInput}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleImageFile(f)
                  e.target.value = ''
                }}
              />
            </div>
            <textarea
              ref={textareaRef}
              className={styles.contentTextarea}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                '공지 내용을 입력하세요.\n\n마크다운 사용 가능:\n# 제목\n**굵게**\n*기울임*\n[링크](https://example.com)\n![이미지](url) ← 이미지 삽입 버튼 사용'
              }
              rows={14}
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
