import { useEffect, useState } from 'react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { fetchFoodBooths, getAssetUrl } from '@/lib/festival'
import type { FoodBoothWithMenus } from '@/types/festival_extras'
import type { Festival } from '@/types/database'
import styles from './FoodSections.module.css'

interface Props {
  festival: Festival
}

export default function FoodSections({ festival }: Props) {
  const [booths, setBooths] = useState<FoodBoothWithMenus[]>([])
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchFoodBooths(festival.id).then((data) => {
      if (!cancelled) setBooths(data)
    })
    return () => {
      cancelled = true
    }
  }, [festival.id])

  // layout_image_url 은 05_musan_food.sql 에서 추가된 신규 컬럼
  const layoutPath = (festival as Festival & { layout_image_url?: string | null })
    .layout_image_url
  const layoutUrl = getAssetUrl(layoutPath ?? null)

  return (
    <>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>부스 위치도</h2>
        <div className={styles.layoutWrap}>
          {layoutUrl ? (
            <img
              src={layoutUrl}
              alt="음식문화페스티벌 부스 위치도"
              className={styles.layoutImage}
            />
          ) : (
            <div className={styles.layoutPlaceholder} aria-hidden="true">
              부스 위치도가 곧 공개됩니다
            </div>
          )}
        </div>
      </section>

      {booths.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>참여 매장</h2>
          <div className={styles.boothList}>
            {booths.map((b) => {
              const open = openId === b.id
              const thumb = getAssetUrl(b.thumbnail_url)
              return (
                <article
                  key={b.id}
                  className={`${styles.boothCard} ${open ? styles.boothOpen : ''}`}
                >
                  <button
                    type="button"
                    className={styles.boothHeader}
                    onClick={() => setOpenId((cur) => (cur === b.id ? null : b.id))}
                    aria-expanded={open}
                  >
                    <div className={styles.boothThumb}>
                      {thumb ? (
                        <img src={thumb} alt={b.name} />
                      ) : (
                        <div className={styles.boothThumbPlaceholder} aria-hidden="true" />
                      )}
                    </div>
                    <div className={styles.boothHeadText}>
                      <div className={styles.boothNameRow}>
                        {b.booth_no && (
                          <span className={styles.boothNo}>#{b.booth_no}</span>
                        )}
                        <h3 className={styles.boothName}>{b.name}</h3>
                      </div>
                      {b.description && (
                        <p className={styles.boothDesc}>{b.description}</p>
                      )}
                    </div>
                    <ChevronDownIcon className={styles.chevron} />
                  </button>

                  <div className={styles.bodyWrap}>
                    <div className={styles.body}>
                      {b.menus.length > 0 ? (
                        <ul className={styles.menuList}>
                          {b.menus.map((m) => (
                            <li key={m.id} className={styles.menuItem}>
                              <div className={styles.menuHead}>
                                <span className={styles.menuName}>
                                  {m.is_signature && (
                                    <span className={styles.signatureMark}>대표</span>
                                  )}
                                  {m.name}
                                </span>
                                <span className={styles.menuPrice}>
                                  {m.price != null
                                    ? `${m.price.toLocaleString()}원`
                                    : '시가'}
                                </span>
                              </div>
                              {m.description && (
                                <p className={styles.menuDesc}>{m.description}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className={styles.emptyMenu}>메뉴 정보가 곧 업데이트됩니다</p>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}
    </>
  )
}
