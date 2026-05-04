import { Download, Copy, Check } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getCustomerOrigin } from '@/lib/festival'
import { useToast } from '@/components/ui/Toast'
import styles from './AdminQRCodes.module.css'

interface BoothRow {
  id: string
  booth_no: string | null
  name: string
}

const QR_SIZE = 180
const QR_EXPORT_SIZE = 1024

export default function AdminQRCodes() {
  const { showToast } = useToast()
  const [booths, setBooths] = useState<BoothRow[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const origin = getCustomerOrigin()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('food_booths')
        .select('id, booth_no, name')
        .eq('is_active', true)
        .order('booth_no', { ascending: true })
      if (cancelled) return
      if (error) {
        showToast(`부스 조회 실패: ${error.message}`, { type: 'error' })
        setBooths([])
      } else {
        setBooths(data ?? [])
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [showToast])

  const buildUrl = (boothId: string) =>
    `${origin}/program/food?booth=${boothId}`

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>QR 코드</h1>
          <p className={styles.sub}>
            부스별 QR 코드를 생성합니다. 스캔 시 해당 매장 메뉴 모달이 자동으로 열려요.
          </p>
        </div>
        <div className={styles.originBadge}>{origin}</div>
      </div>

      {loading ? (
        <div className={styles.loading}>불러오는 중…</div>
      ) : booths.length === 0 ? (
        <div className={styles.empty}>등록된 활성 매장이 없습니다</div>
      ) : (
        <div className={styles.grid}>
          {booths.map((booth) => {
            const url = buildUrl(booth.id)
            const filename = `QR_${booth.booth_no ?? 'X'}_${booth.name}.png`
            const isCopied = copiedId === booth.id
            return (
              <BoothQRCard
                key={booth.id}
                booth={booth}
                url={url}
                filename={filename}
                isCopied={isCopied}
                onCopy={async () => {
                  try {
                    await navigator.clipboard.writeText(url)
                    setCopiedId(booth.id)
                    window.setTimeout(() => setCopiedId(null), 1500)
                  } catch {
                    showToast('링크 복사 실패', { type: 'error' })
                  }
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

interface CardProps {
  booth: BoothRow
  url: string
  filename: string
  isCopied: boolean
  onCopy: () => void
}

function BoothQRCard({ booth, url, filename, isCopied, onCopy }: CardProps) {
  const exportCanvasRef = useRef<HTMLDivElement>(null)

  const handleDownload = () => {
    const container = exportCanvasRef.current
    if (!container) return
    const canvas = container.querySelector('canvas') as HTMLCanvasElement | null
    if (!canvas) return
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = filename
    link.click()
  }

  return (
    <div className={styles.card}>
      <div className={styles.boothTitle}>
        {booth.booth_no && <span className={styles.boothNo}>{booth.booth_no}</span>}
        {booth.name}
      </div>

      <div className={styles.qrWrap}>
        <QRCodeCanvas value={url} size={QR_SIZE} level="M" />
      </div>

      {/* 다운로드용 hidden 고해상도 canvas */}
      <div ref={exportCanvasRef} className={styles.offscreen} aria-hidden="true">
        <QRCodeCanvas value={url} size={QR_EXPORT_SIZE} level="M" />
      </div>

      <div className={styles.linkRow}>{url}</div>

      <div className={styles.cardActions}>
        <button type="button" className={styles.downloadBtn} onClick={handleDownload}>
          <Download size={14} />
          PNG 저장
        </button>
        <button type="button" className={styles.copyBtn} onClick={onCopy}>
          {isCopied ? <Check size={14} /> : <Copy size={14} />}
          {isCopied ? '복사됨' : '링크'}
        </button>
      </div>
    </div>
  )
}
