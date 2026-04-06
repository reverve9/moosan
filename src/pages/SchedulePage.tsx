import Text from '@/components/ui/Text'
import styles from './Page.module.css'

export default function SchedulePage() {
  return (
    <section className={styles.page}>
      <Text as="h1" variant="title" color="primary">
        일정
      </Text>
      <Text variant="body" color="muted">
        준비 중입니다.
      </Text>
    </section>
  )
}
