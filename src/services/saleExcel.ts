// 경매사례 엑셀 불러오기 · 내보내기 — PC 프로그램 웹(auction-web src/lib/excel.ts)과 같은 양식(2026-11-03 옮김).
// exceljs(약 1MB)는 웹 묶음(pdfparse.js)에 넣지 않는다 — 우리 사이트의 /vendor/exceljs-4.4.0.min.js 를 단추를 누를 때만 불러온다
import { FIELDS, LIST_COLS, normalizeRecords, toDate, type Rec, type Row } from './saleAnalysis'

const HEADER_MAP: Record<string, string> = {
  사건번호: '사건번호', 매각년월일: '매각일', 감정가: '감정가', 최저입찰가: '최저가', 매각가: '매각가', 매각율: '매각가율',
  유찰회수: '유찰회수', 응찰자수: '응찰자수', '전용㎡': '전용면적', 건축연도: '건축연도', 층: '층', 주소: '소재지',
}
export const MAX_FILE_BYTES = 15 * 1024 * 1024
export const MAX_ROWS = 20_000

function cellValue(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return toDate(v)
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('result' in o) return cellValue(o.result)
    if ('richText' in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join('')
    if ('text' in o) return String(o.text)
    if ('error' in o) return null
    return null
  }
  return v
}

/** 이 프로그램(또는 PC 프로그램)이 저장한 엑셀 → 레코드 */
export async function readWorkbook(buf: ArrayBuffer): Promise<Rec[]> {
  if (buf.byteLength > MAX_FILE_BYTES) throw new Error('파일이 너무 큽니다 (15MB까지).')
  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  const ws = ['전체', '데이터', '목록'].map((n) => wb.getWorksheet(n)).find((w) => w)
  if (!ws) throw new Error("데이터 시트(전체/데이터/목록)를 찾지 못했습니다. 이 프로그램이 저장한 엑셀인지 확인해 주세요.")
  if (ws.rowCount > MAX_ROWS + 1) throw new Error(`${MAX_ROWS.toLocaleString()}줄까지 불러올 수 있습니다.`)
  const heads: (string | null)[] = []
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => {
    const h = String(cellValue(c.value) ?? '').trim()
    const f = (FIELDS as string[]).includes(h) || h === '종류' ? h : HEADER_MAP[h] ?? null   // 마이턴 — 종류 칸도 읽는다
    heads[col] = f
  })
  if (!heads.some((h) => h === '소재지') && !heads.some((h) => h === '사건번호')) throw new Error('사건번호·주소 열이 없습니다.')
  const items: Record<string, unknown>[] = []
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return
    const o: Record<string, unknown> = {}
    row.eachCell({ includeEmpty: false }, (c, col) => {
      const f = heads[col]
      if (f) o[f] = cellValue(c.value)
    })
    if (o.매각일) o.매각일 = toDate(o.매각일) ?? o.매각일
    if (Object.keys(o).length) items.push(o)
  })
  return normalizeRecords(items)
}

/** 첫 시트를 칸 글 표로(기일별물건 목록처럼 머리 줄이 1줄이 아닌 파일용) */
export async function readSheetRows(buf: ArrayBuffer): Promise<unknown[][]> {
  if (buf.byteLength > MAX_FILE_BYTES) throw new Error('파일이 너무 큽니다 (15MB까지).')
  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  const ws = wb.worksheets[0]
  if (!ws) return []
  const out: unknown[][] = []
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: unknown[] = []
    row.eachCell({ includeEmpty: true }, (c, col) => { cells[col - 1] = cellValue(c.value) })
    out.push(cells)
  })
  return out
}

type ExcelNS = typeof import('exceljs')
let excelP: Promise<ExcelNS> | null = null
/** 한 번만 불러 둔다 — 실패하면 다음에 다시 해 본다 */
function loadExcelJS(): Promise<ExcelNS> {
  const w = window as unknown as { ExcelJS?: ExcelNS }
  if (w.ExcelJS) return Promise.resolve(w.ExcelJS)
  excelP ??= new Promise<ExcelNS>((res, rej) => {
    const s = document.createElement('script')
    s.src = '/vendor/exceljs-4.4.0.min.js'
    s.onload = () => (w.ExcelJS ? res(w.ExcelJS) : rej(new Error('엑셀 도구를 읽지 못했습니다.')))
    s.onerror = () => { excelP = null; rej(new Error('엑셀 도구를 불러오지 못했습니다 — 인터넷 연결을 확인해 주세요.')) }
    document.head.appendChild(s)
  })
  return excelP
}

type WB = import('exceljs').Workbook
type WS = import('exceljs').Worksheet

async function newBook(): Promise<WB> {
  const ExcelJS = await loadExcelJS()
  return new ExcelJS.Workbook()
}

const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } })
const center = { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true }

function writeList(ws: WS, rows: Row[], start: number) {
  LIST_COLS.forEach(([h], i) => {
    const c = ws.getCell(start, i + 1)
    c.value = h
    c.fill = fill('FF073763')
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.alignment = center
  })
  const fmt: Record<string, string> = { 감정가: '#,##0', 최저가: '#,##0', 매각가: '#,##0', 매각가율: '0.0%', 유찰회수: '0', 응찰자수: '0', 년차: '0', 층: '0', 매각일표시: 'yyyy-mm-dd' }
  rows.forEach((r, k) => {
    LIST_COLS.forEach(([, col], i) => {
      let v: unknown = col === '매각일표시' ? (r.date ? new Date(`${r.date}T00:00:00Z`) : null) : (r as unknown as Record<string, unknown>)[col]
      if (typeof v === 'number' && Number.isNaN(v)) v = null
      const c = ws.getCell(start + 1 + k, i + 1)
      c.value = (v ?? null) as never
      if (fmt[col]) c.numFmt = fmt[col]
    })
  })
  ;[16, 12, 14, 14, 14, 10, 9, 7, 14, 9, 9, 6, 55].forEach((w, i) => { ws.getColumn(i + 1).width = w })
  ws.views = [{ state: 'frozen', ySplit: start }]
}

function writeHeadCells(ws: WS, heads: string[], vals: (number | null)[], fmts: string[], row: number) {
  heads.forEach((h, i) => {
    const hc = ws.getCell(row, i + 1)
    hc.value = h
    hc.fill = fill(i === 0 ? 'FFF4CCCC' : 'FFD9D9D9')
    hc.alignment = center
    hc.font = { bold: true }
    const vc = ws.getCell(row + 1, i + 1)
    const v = vals[i]
    vc.value = v === null || Number.isNaN(v) ? null : v
    vc.numFmt = fmts[i]
    vc.alignment = center
  })
  ws.getRow(row).height = 45
}

function writeBids(ws: WS, bids: [string, number | null][]) {
  bids.forEach(([h, v], k) => {
    const col = 1 + k * 2
    const hc = ws.getCell(4, col)
    hc.value = h
    hc.fill = fill('FFD9D9D9')
    ws.mergeCells(4, col, 4, col + 1)
    const vc = ws.getCell(5, col)
    vc.value = v ? Math.round(v) : null
    vc.numFmt = '#,##0'
    vc.font = { bold: true, color: { argb: 'FF990000' }, size: 12 }
    ws.mergeCells(5, col, 5, col + 1)
  })
}

export async function exportNear(o: {
  condition: string; my: number | null; rows: Row[]
  stats: { 평균감정가: number | null; 매각건수: number; 평균매각가: number | null; 중앙값매각가: number | null; 평균율: number | null
    중앙값율: number | null; 최저율: number | null; 최고율: number | null; 전체율: number | null }
}): Promise<Blob> {
  const wb = await newBook()
  const ws = wb.addWorksheet('인근매각물건 분석')
  const s = o.stats
  ws.getCell('A1').value = '경매 인근 매각물건 분석'
  ws.getCell('A1').font = { bold: true, size: 13 }
  ws.getCell('A2').value = o.condition
  const bid = (r: number | null) => (o.my && r !== null ? o.my * r : null)
  writeBids(ws, [['예상 입찰가 (감정가 X 평균 매각가율)', bid(s.평균율)], ['예상 입찰가 (감정가 X 중앙값 매각가율)', bid(s.중앙값율)]])
  writeHeadCells(ws,
    ['내 물건 감정가', '평균 감정가', '매각건수', '평균 매각가', '중앙값 매각가', '평균 매각율%(건별단순평균)', '중앙값 매각가율%',
      '최저 매각가율%', '최고 매각가율%', '전체 매각율%(매각가합÷감정가합)'],
    [o.my, s.평균감정가, s.매각건수, s.평균매각가, s.중앙값매각가, s.평균율, s.중앙값율, s.최저율, s.최고율, s.전체율],
    [...Array(5).fill('#,##0'), ...Array(5).fill('0.0%')], 7)
  writeList(ws, o.rows, 10)
  return new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export async function exportSame(o: {
  condition: string; my: number | null; rows: Row[]
  stats: { 매각건수: number; 평균율: number | null; 평균매각가: number | null; 평균최저가: number | null; 평균유찰: number | null }
}): Promise<Blob> {
  const wb = await newBook()
  const ws = wb.addWorksheet('동일지번매각물건 분석')
  const s = o.stats
  ws.getCell('A1').value = '경매 동일지번 매각물건 분석'
  ws.getCell('A1').font = { bold: true, size: 13 }
  ws.getCell('A2').value = o.condition
  writeBids(ws, [['예상 입찰가 (감정가 X 평균 매각률)', o.my && s.평균율 !== null ? o.my * s.평균율 : null]])
  writeHeadCells(ws, ['내 물건 감정가', '매각건수', '평균 매각률(%)', '평균 매각가', '평균 최저입찰가', '평균 매각회차(유찰)'],
    [o.my, s.매각건수, s.평균율, s.평균매각가, s.평균최저가, s.평균유찰], ['#,##0', '#,##0', '0.0%', '#,##0', '#,##0', '0.0'], 7)
  writeList(ws, o.rows, 10)
  return new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/** 전체 데이터 (다시 불러올 수 있는 양식) */
export async function exportData(recs: Rec[]): Promise<Blob> {
  const wb = await newBook()
  const ws = wb.addWorksheet('데이터')
  const cols = [...FIELDS, '종류' as const]   // 마이턴 — 종류까지 담아야 다시 불러와도 종류로 거를 수 있다
  ws.addRow(cols)
  for (const r of recs) ws.addRow(cols.map((f) => (r as unknown as Record<string, unknown>)[f] ?? null))
  return new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
