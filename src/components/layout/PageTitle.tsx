import type { ReactNode } from 'react'
import Text from '@/components/ui/Text'
import styles from './PageTitle.module.css'

type Align = 'left' | 'center'

interface Props {
  title: ReactNode
  /** 영문/짧은 부제 — 국문 title 하단에 별도 라인으로 스택 배치 */
  subtitle?: ReactNode
  /** 한국어/긴 설명 텍스트 — title row 하단에 별도 단락으로 배치 */
  description?: ReactNode
  align?: Align
  meta?: ReactNode
}

export default function PageTitle({
  title,
  subtitle,
  description,
  align = 'left',
  meta,
}: Props) {
  return (
    <header className={`${styles.wrapper} ${styles[align]}`}>
      <div className={styles.titleRow}>
        <Text as="h1" variant="title" weight="bold" className={styles.title}>
          {title}
        </Text>
        {subtitle && (
          <Text variant="body" color="secondary" className={styles.subtitle}>
            {subtitle}
          </Text>
        )}
      </div>
      {description && <p className={styles.description}>{description}</p>}
      {meta && <div className={styles.meta}>{meta}</div>}
    </header>
  )
}
