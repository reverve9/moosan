import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pin } from 'lucide-react'
import PageTitle from '@/components/layout/PageTitle'
import { fetchPublishedNotices } from '@/lib/notices'
import type { Notice } from '@/types/database'
import styles from './NoticeSection.module.css'

const PAGE_SIZE = 5

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

export default function NoticeSection() {
  const [rows, setRows] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const loadInitial = useCallback(async () => {
    setLoading(true)
    try {
      const { rows: data, hasMore: more } = await fetchPublishedNotices(0, PAGE_SIZE)
      setRows(data)
      setHasMore(more)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  // 무한스크롤 — sentinel 이 보이면 다음 배치 로드
  useEffect(() => {
    if (!hasMore || loading) return
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting && !loadingMore && hasMore) {
          void (async () => {
            setLoadingMore(true)
            try {
              const { rows: more, hasMore: stillMore } = await fetchPublishedNotices(
                rows.length,
                PAGE_SIZE,
              )
              setRows((prev) => [...prev, ...more])
              setHasMore(stillMore)
            } catch (e) {
              setError(e instanceof Error ? e.message : '불러오기 실패')
            } finally {
              setLoadingMore(false)
            }
          })()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loading, loadingMore, rows.length])

  return (
    <section id="notice" className={styles.notice}>
      <PageTitle title="공지사항" />
      <div className={styles.container}>
        {error && <div className={styles.errorBanner}>{error}</div>}

        {loading ? (
          <div className={styles.stateMessage}>불러오는 중...</div>
        ) : rows.length === 0 ? (
          <div className={styles.stateMessage}>등록된 공지가 없습니다.</div>
        ) : (
          <ul className={styles.list}>
            {rows.map((notice) => (
              <li key={notice.id}>
                <Link to={`/notice/${notice.id}`} className={styles.item}>
                  <div className={styles.itemHeader}>
                    {notice.is_pinned && (
                      <Pin className={styles.pinIcon} aria-label="고정" />
                    )}
                    <h3 className={styles.itemTitle}>{notice.title}</h3>
                  </div>
                  <span className={styles.itemDate}>
                    {formatDate(notice.published_at ?? notice.created_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {hasMore && <div ref={sentinelRef} className={styles.sentinel} />}
        {loadingMore && <div className={styles.stateMessage}>더 불러오는 중...</div>}
      </div>
    </section>
  )
}
