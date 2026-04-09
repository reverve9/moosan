import { X } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { formatPhoneDisplay } from '@/lib/phone'
import type { Application, Program, Json } from '@/types/database'
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

type AppWithProgram = Application & { programs: { name: string; slug: string } | null }

function MetaField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailValue}>{value}</span>
    </div>
  )
}

function renderMeta(app: AppWithProgram) {
  const meta = app.meta as Record<string, Json> | null
  if (!meta) return null

  const slug = app.programs?.slug

  return (
    <>
      <MetaField label="성별" value={meta.gender as string} />
      <MetaField label="주소" value={meta.address as string} />
      <MetaField label="작품 유형" value={meta.work_type as string} />
      <MetaField label="팀 인원" value={meta.team_member_count as string} />
      <MetaField label="팀 구성" value={meta.team_composition as string} />
      <MetaField label="공연 시간" value={meta.performance_duration as string} />
      <MetaField label="합창단 구성" value={meta.choir_composition as string} />
      <MetaField label="합창단 지역" value={meta.choir_region as string} />
      <MetaField label="단원 수" value={meta.member_count as string} />
      <MetaField label="지휘자" value={meta.conductor_name as string} />
      <MetaField label="반주자" value={meta.accompanist_name as string} />
      <MetaField label="수상 주소" value={meta.award_address as string} />

      {slug === 'choir' && Array.isArray(meta.songs) && (
        <div className={styles.detailSongs}>
          <span className={styles.detailLabel}>참가곡</span>
          {(meta.songs as { title: string; composer: string; duration: string }[]).map((s, i) => (
            <div key={i} className={styles.songItem}>
              <strong>곡 {i + 1}.</strong> {s.title} — {s.composer} ({s.duration})
            </div>
          ))}
        </div>
      )}
    </>
  )
}

export default function AdminApplications() {
  const [applications, setApplications] = useState<AppWithProgram[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<Application['status'] | 'all'>('all')
  const [programFilter, setProgramFilter] = useState<string>('all')
  const [selected, setSelected] = useState<AppWithProgram | null>(null)

  useEffect(() => {
    supabase
      .from('programs')
      .select('*')
      .order('sort_order')
      .then(({ data }) => setPrograms(data || []))
  }, [])

  // 상단 통계 카드가 상태 필터와 무관하게 계산돼야 해서
  // status 필터는 server 가 아닌 client 측에서 적용.
  // program 필터만 server 쿼리에 적용됨.
  const fetchApplications = async () => {
    setLoading(true)
    let query = supabase
      .from('applications')
      .select('*, programs(name, slug)')
      .order('created_at', { ascending: false })

    if (programFilter !== 'all') {
      query = query.eq('program_id', programFilter)
    }

    const { data } = await query
    setApplications((data as AppWithProgram[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchApplications()
  }, [programFilter])

  // 상태 필터 적용된 리스트 (렌더링용)
  const visibleApplications = useMemo(
    () =>
      statusFilter === 'all'
        ? applications
        : applications.filter((a) => a.status === statusFilter),
    [applications, statusFilter],
  )

  // 상단 카드용 집계 — 상태 필터와 무관, programFilter 만 반영됨
  const stats = useMemo(() => {
    let pending = 0
    let approved = 0
    let rejected = 0
    let waitlist = 0
    for (const a of applications) {
      if (a.status === 'pending') pending += 1
      else if (a.status === 'approved') approved += 1
      else if (a.status === 'rejected' || a.status === 'cancelled') rejected += 1
      else if (a.status === 'waitlist') waitlist += 1
    }
    return {
      total: applications.length,
      pending,
      approved,
      rejected,
      waitlist,
    }
  }, [applications])

  const updateStatus = async (id: string, status: Application['status']) => {
    await supabase.from('applications').update({ status }).eq('id', id)
    fetchApplications()
    if (selected?.id === id) {
      setSelected((prev) => prev ? { ...prev, status } : null)
    }
  }

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>참가신청 관리</h1>
        <span className={styles.count}>{visibleApplications.length}건</span>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>총 신청</p>
          <p className={styles.statValue}>{stats.total}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>승인 대기</p>
          <p className={`${styles.statValue} ${styles.statPending}`}>{stats.pending}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>승인</p>
          <p className={`${styles.statValue} ${styles.statApproved}`}>{stats.approved}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>반려/취소</p>
          <p className={`${styles.statValue} ${styles.statRejected}`}>{stats.rejected}</p>
        </div>
      </div>

      <div className={styles.programTabs}>
        <button
          className={`${styles.programTab} ${programFilter === 'all' ? styles.programTabActive : ''}`}
          onClick={() => setProgramFilter('all')}
        >
          전체
        </button>
        {programs.map((p) => (
          <button
            key={p.id}
            className={`${styles.programTab} ${programFilter === p.id ? styles.programTabActive : ''}`}
            onClick={() => setProgramFilter(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className={styles.filters}>
        {(['all', 'pending', 'approved', 'rejected'] as const).map((s) => (
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
        </div>

        {loading ? (
          <div className={styles.empty}>불러오는 중...</div>
        ) : visibleApplications.length === 0 ? (
          <div className={styles.empty}>신청 내역이 없습니다.</div>
        ) : (
          visibleApplications.map((app) => (
            <div
              key={app.id}
              className={styles.tableRow}
              onClick={() => setSelected(app)}
            >
              <span className={styles.colName}>
                <strong>{app.applicant_name}</strong>
                <small>{formatPhoneDisplay(app.phone)}</small>
              </span>
              <span className={styles.colProgram}>{app.programs?.name || '-'}</span>
              <span className={styles.colDivision}>{app.division || '-'}</span>
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
            </div>
          ))
        )}
      </div>

      {selected && (
        <div className={styles.overlay} onClick={() => setSelected(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalTitle}>{selected.applicant_name}</h2>
                <p className={styles.modalSub}>
                  {selected.programs?.name}{selected.division ? ` · ${selected.division}` : ''}
                </p>
              </div>
              <button className={styles.closeBtn} onClick={() => setSelected(null)}>
                <X width={20} height={20} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.detailSection}>
                <h3 className={styles.detailSectionTitle}>신청 정보</h3>
                <MetaField label="상태" value={STATUS_LABELS[selected.status]} />
                <MetaField label="신청일" value={new Date(selected.created_at).toLocaleString('ko-KR')} />
                <MetaField label="참가 유형" value={selected.participation_type === 'team' ? '팀' : '개인'} />
                {selected.team_name && <MetaField label="팀명" value={selected.team_name} />}
              </div>

              <div className={styles.detailSection}>
                <h3 className={styles.detailSectionTitle}>
                  {selected.participation_type === 'team' ? '대표자 정보' : '참가자 정보'}
                </h3>
                <MetaField label="이름" value={selected.applicant_name} />
                <MetaField label="생년월일" value={selected.applicant_birth} />
                <MetaField label="소속" value={selected.school_name || undefined} />
                <MetaField label="학년" value={selected.school_grade} />
                <MetaField label="연락처" value={formatPhoneDisplay(selected.phone)} />
                <MetaField label="이메일" value={selected.email} />
              </div>

              {(selected.parent_name || selected.parent_phone) && (
                <div className={styles.detailSection}>
                  <h3 className={styles.detailSectionTitle}>보호자 정보</h3>
                  <MetaField label="이름" value={selected.parent_name} />
                  <MetaField label="연락처" value={formatPhoneDisplay(selected.parent_phone)} />
                  <MetaField label="관계" value={selected.parent_relation} />
                </div>
              )}

              {(selected.teacher_name || selected.teacher_phone) && (
                <div className={styles.detailSection}>
                  <h3 className={styles.detailSectionTitle}>지도교사 정보</h3>
                  <MetaField label="이름" value={selected.teacher_name} />
                  <MetaField label="연락처" value={formatPhoneDisplay(selected.teacher_phone)} />
                  <MetaField label="이메일" value={selected.teacher_email} />
                </div>
              )}

              <div className={styles.detailSection}>
                <h3 className={styles.detailSectionTitle}>프로그램별 정보</h3>
                {renderMeta(selected)}
              </div>

              <div className={styles.detailSection}>
                <h3 className={styles.detailSectionTitle}>동의</h3>
                <MetaField label="개인정보 동의" value={selected.privacy_agreed ? '동의함' : '미동의'} />
                <MetaField label="동의 일시" value={selected.privacy_agreed_at ? new Date(selected.privacy_agreed_at).toLocaleString('ko-KR') : undefined} />
              </div>
            </div>

            {selected.status === 'pending' && (
              <div className={styles.modalFooter}>
                <button
                  className={styles.approveBtn}
                  onClick={() => updateStatus(selected.id, 'approved')}
                >
                  승인
                </button>
                <button
                  className={styles.rejectBtn}
                  onClick={() => updateStatus(selected.id, 'rejected')}
                >
                  반려
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
