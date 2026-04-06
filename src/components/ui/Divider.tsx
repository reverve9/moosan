import styles from './Divider.module.css'

type Orientation = 'horizontal' | 'vertical'
type Tone = 'default' | 'strong'

interface Props {
  orientation?: Orientation
  tone?: Tone
  className?: string
}

export default function Divider({
  orientation = 'horizontal',
  tone = 'default',
  className = '',
}: Props) {
  const classes = [
    styles.divider,
    styles[orientation],
    styles[`tone_${tone}`],
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return <span role="separator" aria-orientation={orientation} className={classes} />
}
