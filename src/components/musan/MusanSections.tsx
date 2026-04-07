import { useEffect, useState } from 'react'
import {
  fetchFestivalEvents,
  fetchFestivalGuests,
  getAssetUrl,
} from '@/lib/festival'
import type { FestivalEvent, FestivalGuest } from '@/types/festival_extras'
import styles from './MusanSections.module.css'

interface Props {
  festivalId: string
}

export default function MusanSections({ festivalId }: Props) {
  const [ceremonies, setCeremonies] = useState<FestivalEvent[]>([])
  const [programs, setPrograms] = useState<FestivalEvent[]>([])
  const [guests, setGuests] = useState<FestivalGuest[]>([])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchFestivalEvents(festivalId, ['opening', 'closing']),
      fetchFestivalEvents(festivalId, 'program'),
      fetchFestivalGuests(festivalId),
    ]).then(([cer, prog, gst]) => {
      if (cancelled) return
      setCeremonies(cer)
      setPrograms(prog)
      setGuests(gst)
    })
    return () => {
      cancelled = true
    }
  }, [festivalId])

  return (
    <>
      {ceremonies.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>개폐막식 일정</h2>
          <div className={styles.ceremonyList}>
            {ceremonies.map((c) => (
              <article key={c.id} className={styles.ceremonyCard}>
                <header className={styles.ceremonyHeader}>
                  <h3 className={styles.ceremonyName}>{c.name}</h3>
                  {c.schedule && (
                    <span className={styles.ceremonySchedule}>{c.schedule}</span>
                  )}
                </header>
                {c.venue && <p className={styles.ceremonyVenue}>{c.venue}</p>}
                {c.description && (
                  <p className={styles.ceremonyDesc}>{c.description}</p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {guests.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>스페셜 게스트</h2>
          <div className={styles.guestRow}>
            {guests.map((g) => {
              const photo = getAssetUrl(g.photo_url)
              return (
                <article key={g.id} className={styles.guestCard}>
                  <div className={styles.guestPhotoWrap}>
                    {photo ? (
                      <img
                        src={photo}
                        alt={g.name}
                        className={styles.guestPhoto}
                      />
                    ) : (
                      <div className={styles.guestPhotoPlaceholder} aria-hidden="true" />
                    )}
                  </div>
                  <h3 className={styles.guestName}>{g.name}</h3>
                  {g.description && (
                    <p className={styles.guestDesc}>{g.description}</p>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      )}

      {programs.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>기타 프로그램</h2>
          <ul className={styles.programList}>
            {programs.map((p) => (
              <li key={p.id} className={styles.programItem}>
                <div className={styles.programHead}>
                  <h3 className={styles.programName}>{p.name}</h3>
                  {p.schedule && (
                    <span className={styles.programSchedule}>{p.schedule}</span>
                  )}
                </div>
                {p.venue && <p className={styles.programVenue}>{p.venue}</p>}
                {p.description && (
                  <p className={styles.programDesc}>{p.description}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
