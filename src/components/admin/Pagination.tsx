import { ChevronLeft, ChevronRight } from 'lucide-react'
import styles from './Pagination.module.css'

interface PaginationProps {
  /** 현재 페이지 (1-based) */
  currentPage: number
  /** 전체 페이지 수 */
  totalPages: number
  /** 전체 아이템 수 — 좌측 "총 N건" 렌더에 사용 */
  totalItems?: number
  /** 페이지 변경 콜백 */
  onChange: (page: number) => void
  /** 단위 라벨 (기본 "건") */
  unit?: string
  /** 좌측 meta 영역에 추가할 액션 버튼 (내보내기/가져오기 등) */
  actions?: React.ReactNode
}

/**
 * 어드민 리스트 상단 우측에 놓는 공용 페이지네이션.
 * `<` / 현재/전체 / `>` 패턴.
 */
export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  onChange,
  unit = '건',
  actions,
}: PaginationProps) {
  const clampedPage = Math.min(Math.max(1, currentPage), Math.max(1, totalPages))
  return (
    <div className={styles.toolbar}>
      <div className={styles.metaGroup}>
        {typeof totalItems === 'number' && (
          <div className={styles.meta}>
            총 {totalItems.toLocaleString()}
            {unit}
          </div>
        )}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
      <div className={styles.pagination}>
        <button
          type="button"
          className={styles.pageBtn}
          onClick={() => onChange(Math.max(1, clampedPage - 1))}
          disabled={clampedPage <= 1}
          aria-label="이전 페이지"
        >
          <ChevronLeft className={styles.pageIcon} />
        </button>
        <span className={styles.pageLabel}>
          {clampedPage} / {totalPages}
        </span>
        <button
          type="button"
          className={styles.pageBtn}
          onClick={() => onChange(Math.min(totalPages, clampedPage + 1))}
          disabled={clampedPage >= totalPages}
          aria-label="다음 페이지"
        >
          <ChevronRight className={styles.pageIcon} />
        </button>
      </div>
    </div>
  )
}

/** 한 페이지에 보여줄 기본 건수 */
export const DEFAULT_PAGE_SIZE = 15
