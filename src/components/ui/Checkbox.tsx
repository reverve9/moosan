import { Check } from 'lucide-react'
import type { InputHTMLAttributes } from 'react'
import styles from './Checkbox.module.css'

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  error?: string
}

export default function Checkbox({ label, error, checked, ...props }: CheckboxProps) {
  return (
    <label className={`${styles.wrapper} ${error ? styles.wrapperError : ''}`}>
      <span className={`${styles.box} ${checked ? styles.boxChecked : ''}`}>
        {checked && <Check className={styles.icon} />}
      </span>
      <input type="checkbox" className={styles.input} checked={checked} {...props} />
      <span className={styles.label}>{label}</span>
    </label>
  )
}
