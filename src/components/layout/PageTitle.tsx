import type { ReactNode } from 'react'
import Text from '@/components/ui/Text'
import styles from './PageTitle.module.css'

type Align = 'left' | 'center'

interface Props {
  title: ReactNode
  subtitle?: ReactNode
  align?: Align
}

export default function PageTitle({ title, subtitle, align = 'left' }: Props) {
  return (
    <header className={`${styles.wrapper} ${styles[align]}`}>
      <Text as="h1" variant="title" weight="bold" className={styles.title}>
        {title}
      </Text>
      {subtitle && (
        <Text variant="body" color="secondary" className={styles.subtitle}>
          {subtitle}
        </Text>
      )}
    </header>
  )
}
