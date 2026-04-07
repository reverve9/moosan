import type { ReactNode } from 'react'
import Text from '@/components/ui/Text'
import styles from './PageTitle.module.css'

type Align = 'left' | 'center'

interface Props {
  title: ReactNode
  subtitle?: ReactNode
  align?: Align
  meta?: ReactNode
}

export default function PageTitle({ title, subtitle, align = 'left', meta }: Props) {
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
      {meta && <div className={styles.meta}>{meta}</div>}
    </header>
  )
}
