import { Check } from 'lucide-react'
import styles from './RadioGroup.module.css'

interface RadioGroupProps {
  label: string
  required?: boolean
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  hint?: string
}

export default function RadioGroup({ label, required, options, value, onChange, hint }: RadioGroupProps) {
  return (
    <div className={styles.field}>
      <span className={styles.label}>
        {required && <span className={styles.required}>*</span>}
        {label}
      </span>
      {hint && <p className={styles.hint}>{hint}</p>}
      <div className={styles.options}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`${styles.option} ${value === opt.value ? styles.optionSelected : ''}`}
            onClick={() => onChange(opt.value)}
          >
            <span className={`${styles.radio} ${value === opt.value ? styles.radioSelected : ''}`}>
              {value === opt.value && <Check className={styles.checkIcon} />}
            </span>
            <span className={styles.optionLabel}>{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
