/**
 * 엑셀 Export/Import 공용 유틸.
 * xlsx(SheetJS) 래퍼 — 어드민 페이지에서 공통 사용.
 * dynamic import 로 번들 분리 (~420KB).
 */

const loadXLSX = () => import('xlsx')

/** 데이터 행(헤더 제외) 의 숫자 셀에 천단위 구분 포맷 `#,##0` 적용 */
function applyThousandsFormat(
  ws: Record<string, unknown>,
  XLSX: typeof import('xlsx'),
): void {
  const ref = ws['!ref'] as string | undefined
  if (!ref) return
  const range = XLSX.utils.decode_range(ref)
  // 헤더 행(첫 행) 은 건너뛰고 데이터 셀만
  for (let R = range.s.r + 1; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C })
      const cell = ws[addr] as { t?: string; z?: string } | undefined
      if (cell && cell.t === 'n') {
        cell.z = '#,##0'
      }
    }
  }
}

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
  applyThousandsFormat(ws as unknown as Record<string, unknown>, XLSX)

  // 열 너비 자동 조정 (숫자는 천단위 구분 적용 후 길이 기준)
  ws['!cols'] = columns.map((c) => {
    const maxLen = Math.max(
      c.label.length,
      ...data.map((row) => {
        const cell = row[columns.indexOf(c)]
        if (typeof cell === 'number') return cell.toLocaleString().length
        return String(cell ?? '').length
      }),
    )
    return { wch: Math.min(Math.max(maxLen + 2, 8), 40) }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, `${fileName}.xlsx`)
}

/**
 * 여러 시트를 한 워크북으로 묶어 .xlsx 다운로드.
 * 정산관리 같이 "전체/매장별 × 일별/종합" 4시트 묶음 export 용.
 */
export interface ExcelSheet {
  name: string
  rows: Record<string, unknown>[]
  columns: { key: string; label: string }[]
}

export async function exportToExcelMultiSheet(
  sheets: ExcelSheet[],
  fileName: string,
): Promise<void> {
  const XLSX = await loadXLSX()
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const header = sheet.columns.map((c) => c.label)
    const data = sheet.rows.map((row) =>
      sheet.columns.map((c) => {
        const v = row[c.key]
        if (v === null || v === undefined) return ''
        if (v instanceof Date) return v.toISOString()
        return v
      }),
    )
    const ws = XLSX.utils.aoa_to_sheet([header, ...data])
    applyThousandsFormat(ws as unknown as Record<string, unknown>, XLSX)
    ws['!cols'] = sheet.columns.map((c, idx) => {
      const maxLen = Math.max(
        c.label.length,
        ...data.map((row) => {
          const cell = row[idx]
          if (typeof cell === 'number') return cell.toLocaleString().length
          return String(cell ?? '').length
        }),
      )
      return { wch: Math.min(Math.max(maxLen + 2, 8), 40) }
    })
    // sheet name 31자 제한 + 일부 특수문자 금지
    const safeName = sheet.name.replace(/[\\/:*?[\]]/g, '_').slice(0, 31)
    XLSX.utils.book_append_sheet(wb, ws, safeName)
  }
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

