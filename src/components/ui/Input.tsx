import type { InputHTMLAttributes } from 'react'
import styles from './Input.module.css'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
  required?: boolean
}

export default function Input({ label, error, hint, required, id, ...props }: InputProps) {
  const inputId = id || label.replace(/\s/g, '-')

  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        {required && <span className={styles.required}>*</span>}
        {label}
      </label>
      {hint && <p className={styles.hint}>{hint}</p>}
      <input
        id={inputId}
        className={`${styles.input} ${error ? styles.inputError : ''}`}
        {...props}
      />
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
