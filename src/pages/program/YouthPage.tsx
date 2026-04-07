import { useEffect, useState, type CSSProperties } from 'react'
import PageTitle from '@/components/layout/PageTitle'
import ProgramAccordion from '@/components/program/ProgramAccordion'
import { fetchFestivalBySlug, getAssetUrl } from '@/lib/festival'
import type { Festival } from '@/types/database'
import styles from './YouthPage.module.css'

export default function YouthPage() {
  const [festival, setFestival] = useState<Festival | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchFestivalBySlug('youth').then((result) => {
      if (result) setFestival(result.festival)
      setLoading(false)
    })
  }, [])

  if (loading || !festival) {
    return <div className={styles.page} />
  }

  const lead = festival.description_lead ?? ''
  const dropChar = lead.charAt(0)
  const restLead = lead.slice(1)
  const posterUrl = getAssetUrl(festival.poster_url)
  const themeStyle = {
    '--festival-tint': festival.theme_color ?? '#FBF1CC',
  } as CSSProperties

  return (
    <div className={styles.page} style={themeStyle}>
      <PageTitle
        title={festival.name}
        subtitle={festival.subtitle ?? ''}
        meta={
          <dl className={styles.infoLine}>
            {festival.schedule && (
              <div className={styles.infoItem}>
                <dt className={styles.infoLabel}>행사기간</dt>
                <dd className={styles.infoValue}>{festival.schedule}</dd>
              </div>
            )}
            {festival.venue && (
              <div className={styles.infoItem}>
                <dt className={styles.infoLabel}>장소</dt>
                <dd className={styles.infoValue}>{festival.venue}</dd>
              </div>
            )}
          </dl>
        }
      />
      <section className={styles.about}>
        <div className={styles.posterWrap}>
          <img
            src={posterUrl ?? '/images/program_youth.png'}
            alt={`${festival.name} 포스터`}
            className={styles.poster}
            onError={(e) => {
              e.currentTarget.src = '/images/program_youth.png'
            }}
          />
        </div>
        <div className={styles.content}>
          <div className={styles.descriptionGroup}>
            <p className={styles.description}>
              <span className={styles.dropCap}>
                <span className={styles.dropCapChar}>{dropChar}</span>
              </span>
              {restLead}
            </p>
            {festival.description_body && (
              <p className={styles.description}>{festival.description_body}</p>
            )}
          </div>
        </div>
      </section>
      <ProgramAccordion />
    </div>
  )
}
