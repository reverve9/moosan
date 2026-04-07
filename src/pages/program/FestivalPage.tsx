import { useEffect, useState, type CSSProperties } from 'react'
import PageTitle from '@/components/layout/PageTitle'
import ProgramAccordion from '@/components/program/ProgramAccordion'
import MusanSections from '@/components/musan/MusanSections'
import FoodSections from '@/components/food/FoodSections'
import { fetchFestivalBySlug, getAssetUrl } from '@/lib/festival'
import type { Festival } from '@/types/database'
import styles from './FestivalPage.module.css'

interface Props {
  slug: string
}

export default function FestivalPage({ slug }: Props) {
  const [festival, setFestival] = useState<Festival | null>(null)
  const [loading, setLoading] = useState(true)
  const [posterFailed, setPosterFailed] = useState(false)

  useEffect(() => {
    setLoading(true)
    setPosterFailed(false)
    fetchFestivalBySlug(slug).then((result) => {
      setFestival(result?.festival ?? null)
      setLoading(false)
    })
  }, [slug])

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
          slug === 'musan' ? undefined : (
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
          )
        }
      />
      {slug === 'musan' ? (
        // musan: 포스터 없이 우아한 따옴표 인용 블록 — 메인 포스터와 동일하므로 중복 제거
        <section className={styles.quoteSection}>
          <blockquote className={styles.quote}>
            {lead && <p className={styles.quoteText}>{lead}</p>}
            {festival.description_body && (
              <p className={styles.quoteText}>{festival.description_body}</p>
            )}
          </blockquote>
        </section>
      ) : (
        <section className={styles.about}>
          <div className={styles.posterWrap}>
            {posterUrl && !posterFailed ? (
              <img
                src={posterUrl}
                alt={`${festival.name} 포스터`}
                className={styles.poster}
                onError={() => setPosterFailed(true)}
              />
            ) : (
              <div className={styles.posterPlaceholder} aria-hidden="true" />
            )}
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
      )}
      {slug === 'youth' && <ProgramAccordion />}
      {slug === 'musan' && <MusanSections festivalId={festival.id} />}
      {slug === 'food' && <FoodSections festival={festival} />}
    </div>
  )
}
