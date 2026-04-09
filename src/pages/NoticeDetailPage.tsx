import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pin } from 'lucide-react'
import { fetchPublishedNoticeById } from '@/lib/notices'
import type { Notice } from '@/types/database'
import styles from './NoticeDetailPage.module.css'

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export default function NoticeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [notice, setNotice] = useState<Notice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      setLoading(true)
      try {
        const data = await fetchPublishedNoticeById(id)
        if (!data) {
          setError('공지를 찾을 수 없습니다.')
        } else {
          setNotice(data)
          setError(null)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '불러오기 실패')
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  return (
    <section className={styles.page}>
      <button
        type="button"
        className={styles.backBtn}
        onClick={() => navigate('/notice')}
        aria-label="목록으로"
      >
        <ArrowLeft />
        <span>목록</span>
      </button>

      {loading ? (
        <div className={styles.stateMessage}>불러오는 중...</div>
      ) : error ? (
        <div className={styles.stateMessage}>{error}</div>
      ) : notice ? (
        <article className={styles.article}>
          <header className={styles.header}>
            <div className={styles.titleRow}>
              {notice.is_pinned && <Pin className={styles.pinIcon} aria-label="고정" />}
              <h1 className={styles.title}>{notice.title}</h1>
            </div>
            <div className={styles.meta}>
              {formatDate(notice.published_at ?? notice.created_at)}
            </div>
          </header>
          {notice.images.length > 0 && (
            <div className={styles.imageList}>
              {notice.images.map((url, i) => (
                <img
                  key={`${url}-${i}`}
                  src={url}
                  alt={`${notice.title} 이미지 ${i + 1}`}
                  className={styles.contentImage}
                  loading="lazy"
                />
              ))}
            </div>
          )}
          {notice.content.trim().length > 0 && (
            <div className={styles.content}>{notice.content}</div>
          )}
        </article>
      ) : null}
    </section>
  )
}
