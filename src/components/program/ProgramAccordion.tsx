import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getAssetUrl } from '@/lib/festival'
import type { Program } from '@/types/database'
import styles from './ProgramAccordion.module.css'

interface Props {
  programs: Program[]
}

function ProgramCard({
  data,
  open,
  onToggle,
}: {
  data: Program
  open: boolean
  onToggle: () => void
}) {
  const thumbnailUrl = getAssetUrl(data.thumbnail_url)

  return (
    <div className={`${styles.card} ${open ? styles.cardOpen : ''}`}>
      <button
        type="button"
        className={styles.header}
        onClick={onToggle}
        aria-expanded={open}
      >
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={data.name} className={styles.thumbnail} />
        ) : (
          <div className={styles.thumbnail} aria-hidden="true" />
        )}
        <div className={styles.headerText}>
          <h3 className={styles.name}>{data.name}</h3>
          {data.description && <p className={styles.desc}>{data.description}</p>}
        </div>
        <ChevronDown className={styles.chevron} />
      </button>

      <div className={styles.bodyWrap}>
        <div className={styles.body}>
          <div className={styles.detailBox}>
            <dl className={styles.infoGrid}>
              {data.event_name && (
                <>
                  <dt className={styles.infoLabel}>행사명</dt>
                  <dd className={styles.infoValue}>{data.event_name}</dd>
                </>
              )}

              {data.schedule && (
                <>
                  <dt className={styles.infoLabel}>일 시</dt>
                  <dd className={styles.infoValue}>{data.schedule}</dd>
                </>
              )}

              {data.venue && (
                <>
                  <dt className={styles.infoLabel}>장 소</dt>
                  <dd className={styles.infoValue}>{data.venue}</dd>
                </>
              )}

              {data.target_text && (
                <>
                  <dt className={styles.infoLabel}>참가대상</dt>
                  <dd className={styles.infoValue}>{data.target_text}</dd>
                </>
              )}

              {data.awards_text && (
                <>
                  <dt className={styles.infoLabel}>시상내용</dt>
                  <dd className={styles.infoValue}>{data.awards_text}</dd>
                </>
              )}

              {(data.registration_period || data.application_method) && (
                <>
                  <dt className={styles.infoLabel}>참가신청</dt>
                  <dd className={styles.infoValue}>
                    <ul className={styles.subList}>
                      {data.registration_period && (
                        <li>접수기간: {data.registration_period}</li>
                      )}
                      {data.application_method && (
                        <li>접수방법: {data.application_method}</li>
                      )}
                    </ul>
                  </dd>
                </>
              )}
            </dl>
          </div>

          {/* 지난 행사 사진 — 추후 어드민 업로드 후 표시 */}

          <div className={styles.applyAction}>
            <Link to={`/apply/${data.slug}`} className={styles.applyButton}>
              참가신청
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ProgramAccordion({ programs }: Props) {
  const [openSlug, setOpenSlug] = useState<string | null>(null)

  if (programs.length === 0) return null

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>참가 프로그램</h2>
      <div className={styles.list}>
        {programs.map((p) => (
          <ProgramCard
            key={p.slug}
            data={p}
            open={openSlug === p.slug}
            onToggle={() => setOpenSlug((cur) => (cur === p.slug ? null : p.slug))}
          />
        ))}
      </div>
    </section>
  )
}
