import { Download, Upload } from 'lucide-react'
import { useRef } from 'react'
import styles from './ExcelButtons.module.css'

interface ExportButtonProps {
  onClick: () => void
  disabled?: boolean
  label?: string
}

export function ExportButton({ onClick, disabled, label = '내보내기' }: ExportButtonProps) {
  return (
    <button
      type="button"
      className={styles.btn}
      onClick={onClick}
      disabled={disabled}
    >
      <Download className={styles.icon} />
      <span>{label}</span>
    </button>
  )
}

interface ImportButtonProps {
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void
  disabled?: boolean
  label?: string
}

export function ImportButton({ onFile, disabled, label = '가져오기' }: ImportButtonProps) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xls,.csv"
        hidden
        onChange={onFile}
      />
      <button
        type="button"
        className={styles.btn}
        onClick={() => ref.current?.click()}
        disabled={disabled}
      >
        <Upload className={styles.icon} />
        <span>{label}</span>
      </button>
    </>
  )
}
