/**
 * 엑셀 Export/Import 공용 유틸.
 * xlsx(SheetJS) 래퍼 — 어드민 페이지에서 공통 사용.
 * dynamic import 로 번들 분리 (~420KB).
 */

const loadXLSX = () => import('xlsx')

/** 2D 배열(헤더 + 데이터)을 .xlsx 파일로 다운로드 */
export async function exportToExcel(
  rows: Record<string, unknown>[],
  columns: { key: string; label: string }[],
  fileName: string,
): Promise<void> {
  const XLSX = await loadXLSX()
  const header = columns.map((c) => c.label)
  const data = rows.map((row) =>
    columns.map((c) => {
      const v = row[c.key]
      if (v === null || v === undefined) return ''
      if (v instanceof Date) return v.toISOString()
      return v
    }),
  )
  const ws = XLSX.utils.aoa_to_sheet([header, ...data])

  // 열 너비 자동 조정
  ws['!cols'] = columns.map((c) => {
    const maxLen = Math.max(
      c.label.length,
      ...data.map((row) => {
        const cell = row[columns.indexOf(c)]
        return String(cell ?? '').length
      }),
    )
    return { wch: Math.min(Math.max(maxLen + 2, 8), 40) }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, `${fileName}.xlsx`)
}

/** .xlsx / .xls / .csv 파일 → 객체 배열. 첫 행을 헤더로 사용 */
export async function importFromExcel(
  file: File,
): Promise<Record<string, string>[]> {
  const XLSX = await loadXLSX()
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []
  return XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })
}

/** KST 날짜 포맷 (엑셀 셀용) */
export function fmtDateKst(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

