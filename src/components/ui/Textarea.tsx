import type { TextareaHTMLAttributes } from 'react'
import styles from './Textarea.module.css'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  error?: string
  hint?: string
  required?: boolean
}

export default function Textarea({
  label,
  error,
  hint,
  required,
  id,
  rows = 4,
  ...props
}: TextareaProps) {
  const textareaId = id || label.replace(/\s/g, '-')

  return (
    <div className={styles.field}>
      <label htmlFor={textareaId} className={styles.label}>
        {required && <span className={styles.required}>*</span>}
        {label}
      </label>
      {hint && <p className={styles.hint}>{hint}</p>}
      <textarea
        id={textareaId}
        rows={rows}
        className={`${styles.textarea} ${error ? styles.textareaError : ''}`}
        {...props}
      />
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
