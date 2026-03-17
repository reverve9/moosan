import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Application } from '@/types/database'
import styles from './AdminApplications.module.css'

const STATUS_LABELS: Record<string, string> = {
  pending: '대기',
  approved: '승인',
  rejected: '반려',
  cancelled: '취소',
  waitlist: '대기명단',
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B',
  approved: '#10B981',
  rejected: '#EF4444',
  cancelled: '#6B7280',
  waitlist: '#8B5CF6',
}

export default function AdminApplications() {
  const [applications, setApplications] = useState<(Application & { programs: { name: string } | null })[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const fetchApplications = async () => {
    setLoading(true)
    let query = supabase
      .from('applications')
      .select('*, programs(name)')
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    const { data } = await query
    setApplications(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchApplications()
  }, [statusFilter])

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('applications').update({ status }).eq('id', id)
    fetchApplications()
  }

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>참가신청 관리</h1>
        <span className={styles.count}>{applications.length}건</span>
      </div>

      <div className={styles.filters}>
        {['all', 'pending', 'approved', 'rejected'].map((s) => (
          <button
            key={s}
            className={`${styles.filterBtn} ${statusFilter === s ? styles.filterBtnActive : ''}`}
            onClick={() => setStatusFilter(s)}
          >
            {s === 'all' ? '전체' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <span className={styles.colName}>신청자</span>
          <span className={styles.colProgram}>프로그램</span>
          <span className={styles.colDivision}>부문</span>
          <span className={styles.colStatus}>상태</span>
          <span className={styles.colDate}>신청일</span>
          <span className={styles.colActions}>관리</span>
        </div>

        {loading ? (
          <div className={styles.empty}>불러오는 중...</div>
        ) : applications.length === 0 ? (
          <div className={styles.empty}>신청 내역이 없습니다.</div>
        ) : (
          applications.map((app) => (
            <div key={app.id} className={styles.tableRow}>
              <span className={styles.colName}>
                <strong>{app.applicant_name}</strong>
                <small>{app.phone}</small>
              </span>
              <span className={styles.colProgram}>{app.programs?.name || '-'}</span>
              <span className={styles.colDivision}>{app.division}</span>
              <span className={styles.colStatus}>
                <span
                  className={styles.badge}
                  style={{ backgroundColor: `${STATUS_COLORS[app.status]}18`, color: STATUS_COLORS[app.status] }}
                >
                  {STATUS_LABELS[app.status]}
                </span>
              </span>
              <span className={styles.colDate}>
                {new Date(app.created_at).toLocaleDateString('ko-KR')}
              </span>
              <span className={styles.colActions}>
                {app.status === 'pending' && (
                  <>
                    <button
                      className={styles.approveBtn}
                      onClick={() => updateStatus(app.id, 'approved')}
                    >
                      승인
                    </button>
                    <button
                      className={styles.rejectBtn}
                      onClick={() => updateStatus(app.id, 'rejected')}
                    >
                      반려
                    </button>
                  </>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
