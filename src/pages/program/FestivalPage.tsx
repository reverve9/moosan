import { useEffect, useState, type CSSProperties } from 'react'
import PageTitle from '@/components/layout/PageTitle'
import ProgramAccordion from '@/components/program/ProgramAccordion'
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
  // 청소년문화축전만 현재 ProgramAccordion 콘텐츠가 있음.
  // musan / food 는 다른 콘텐츠가 추후 추가됨.
  const showAccordion = slug === 'youth'

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
      {showAccordion && <ProgramAccordion />}
    </div>
  )
}
