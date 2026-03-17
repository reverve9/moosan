import type { SelectHTMLAttributes } from 'react'
import styles from './Select.module.css'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  error?: string
  required?: boolean
  options: { value: string; label: string }[]
  placeholder?: string
}

export default function Select({ label, error, required, options, placeholder, id, ...props }: SelectProps) {
  const selectId = id || label.replace(/\s/g, '-')

  return (
    <div className={styles.field}>
      <label htmlFor={selectId} className={styles.label}>
        {required && <span className={styles.required}>*</span>}
        {label}
      </label>
      <select
        id={selectId}
        className={`${styles.select} ${error ? styles.selectError : ''}`}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
