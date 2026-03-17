import type { InputHTMLAttributes } from 'react'
import { CheckIcon } from '@heroicons/react/24/solid'
import styles from './Checkbox.module.css'

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  error?: string
}

export default function Checkbox({ label, error, checked, ...props }: CheckboxProps) {
  return (
    <label className={`${styles.wrapper} ${error ? styles.wrapperError : ''}`}>
      <span className={`${styles.box} ${checked ? styles.boxChecked : ''}`}>
        {checked && <CheckIcon className={styles.icon} />}
      </span>
      <input type="checkbox" className={styles.input} checked={checked} {...props} />
      <span className={styles.label}>{label}</span>
    </label>
  )
}
