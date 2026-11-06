// 경매사례(인근 매각물건) 계산 — PC 프로그램 웹(auction-web src/lib/analysis.ts)을 그대로 옮겼다(2026-11-03).
// 엑셀 불러오기 · 내보내기(saleExcel.ts)가 PC 프로그램과 같은 양식 · 같은 셈을 쓰게. 고칠 때는 두 곳을 같이 고친다.
/**
 * 경매 매각물건 분석 계산 — PC 프로그램(auction_gui.py · nearby_avg.py)과 같은 규칙.
 * 화면·엑셀·테스트가 전부 이 파일 함수만 씀. 계산 고칠 땐 여기만 고치면 됨.
 */

/** 수집 레코드 (Firestore · PC 도우미 · 엑셀이 같은 모양을 씀) */
export interface Rec {
  사건번호: string | null
  소재지: string | null
  매각일: string | null
  감정가: number | null
  최저가: number | null
  매각가: number | null
  매각가율: number | null
  유찰회수: number | null
  응찰자수: number | null
  전용면적: number | null
  건축연도: number | null
  층: number | null
  원본: string | null
  상세ID: string | null
  건축연월: string | null
  출처: string | null
  /** 마이턴만 — 도우미가 적는 목록 종류('다세대주택'). 웹 종류 거르기에 쓴다(PC 프로그램 양식에는 없다) */
  종류?: string | null
}

export const FIELDS: (keyof Rec)[] = ['사건번호', '소재지', '매각일', '감정가', '최저가', '매각가', '매각가율', '유찰회수',
  '응찰자수', '전용면적', '건축연도', '층', '원본', '상세ID', '건축연월', '출처']
const NUM_FIELDS = new Set<keyof Rec>(['감정가', '최저가', '매각가', '매각가율', '유찰회수', '응찰자수', '전용면적', '건축연도', '층'])

/** 검색리스트 열: [머리글, 계산 열, 너비(px), 정렬] */
export type ColKey = '사건번호' | '매각일표시' | '감정가' | '최저가' | '매각가' | '매각가율' | '유찰회수' | '응찰자수' |
  '면적표시' | '건축표시' | '년차' | '층' | '소재지'
export const LIST_COLS: [string, ColKey, number, 'center' | 'right' | 'left'][] = [
  ['사건번호', '사건번호', 110, 'center'], ['매각년월일', '매각일표시', 92, 'center'], ['감정가', '감정가', 108, 'right'],
  ['최저입찰가', '최저가', 108, 'right'], ['매각가', '매각가', 108, 'right'], ['매각가율', '매각가율', 80, 'center'],
  ['유찰회수', '유찰회수', 78, 'center'], ['응찰', '응찰자수', 60, 'center'], ['전용㎡/평', '면적표시', 108, 'center'],
  ['건축연월', '건축표시', 84, 'center'], ['건축년차', '년차', 78, 'center'], ['층', '층', 52, 'center'],
  ['주소', '소재지', 420, 'left'],
]
export const HEADS = LIST_COLS.map((c) => c[0])

export const TYPES: Record<string, string[] | null> = {
  '전체': null, '연립다세대': ['연립', '다세대', '빌라'], '아파트': ['아파트'], '오피스텔': ['오피스텔'],
  '단독·다가구': ['단독', '다가구'], '상가·근린': ['근린', '상가', '점포'],
}
export const SITES: Record<string, string> = { '옥션원': 'https://www.auction1.co.kr', '탱크옥션': 'https://www.tankauction.com' }
export const PERIODS: Record<string, number> = { '6개월': 6, '12개월': 12, '24개월': 24, '36개월': 36, '전체': 0 }
export const BLANK = '(빈 셀)'

// ---------------------------------------------------------------- 글자 → 값
export function toDate(text: unknown): string | null {
  if (text instanceof Date && !isNaN(text.getTime())) return isoOf(text.getFullYear(), text.getMonth() + 1, text.getDate())
  const m = /(\d{2,4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/.exec(String(text ?? ''))
  if (!m) return null
  let y = Number(m[1])
  if (y < 100) y += 2000
  return isoOf(y, Number(m[2]), Number(m[3]))
}

function isoOf(y: number, mo: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** 주소 → 층 ('지하1층' → -1, 층 표기 없으면 호수로 추정: 201호 → 2) */
export function toFloor(text: string | null): number | null {
  const t = text ?? ''
  let m = /(?:지하\s*|B|(?<![가-힣])지)(\d{1,2})\s*층/.exec(t)
  if (m) return -Number(m[1])
  if (/반지하|지층/.test(t)) return -1
  m = /(?<!\d)(\d{1,2})\s*층/.exec(t)
  if (m) return Number(m[1])
  m = /(?<![\d-])(B)?(\d{1,2})\d{2}\s*호/.exec(t)
  if (m) return m[1] ? -Number(m[2]) : Number(m[2])
  return null
}

/** 유찰회수 없을 때 최저가÷감정가로 추정 (1회 유찰마다 30% 또는 20% 저감) */
export function guessFailCount(appraisal: number | null, minprice: number | null): number | null {
  if (!appraisal || !minprice) return null
  const r = minprice / appraisal
  if (r > 0.995) return 0
  for (const step of [0.7, 0.8]) {
    const n = pyRound(Math.log(r) / Math.log(step))
    if (n >= 1 && Math.abs(step ** n - r) < 0.006) return n
  }
  return null
}

/** 파이썬 round() 와 같은 반올림 (0.5 는 짝수 쪽) */
export function pyRound(x: number): number {
  const f = Math.floor(x)
  const diff = x - f
  if (diff > 0.5) return f + 1
  if (diff < 0.5) return f
  return f % 2 === 0 ? f : f + 1
}

export function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(String(v).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

export function missing(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v))
}

/** '152,000,000' · '1억5200만' · '15200만' -> 원 */
export function parseMoney(text: string): number | null {
  const t = String(text ?? '').replace(/[,\s원]/g, '')
  if (!t) return null
  const m = /^(?:(\d+(?:\.\d+)?)억)?(?:(\d+(?:\.\d+)?)만)?$/.exec(t)
  if (m && (m[1] || m[2])) return Number(m[1] ?? 0) * 1e8 + Number(m[2] ?? 0) * 1e4
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** 원 → '1억 5,200만' */
export function won(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return ''
  const man = pyRound(v / 10000)
  const eok = Math.floor(man / 10000)
  const rest = man - eok * 10000
  if (eok && rest) return `${eok}억 ${rest.toLocaleString('en-US')}만`
  return eok ? `${eok}억` : `${rest.toLocaleString('en-US')}만`
}

// ---------------------------------------------------------------- 주소
const DONG_RE = /^[가-힣][가-힣0-9·]*(?:동|읍|면|가|리)$/

/** 주소 → [시군구, 읍면동] */
export function splitRegion(addr: string | null): [string, string] {
  const s = String(addr ?? '')
  const t = s.replace(/,/g, ' ').split(/\s+/).filter(Boolean)
  if (!t.length) return ['', '']
  let sgg = t[0]
  let i = 1
  if (t.length > 1 && /(시|구|군)$/.test(t[1]) && !DONG_RE.test(t[1])) {
    sgg = `${sgg} ${t[1]}`
    i = 2
    if (t.length > 2 && t[1].endsWith('시') && t[2].endsWith('구')) {
      sgg = `${sgg} ${t[2]}`
      i = 3
    }
  }
  let dong = t.slice(i, i + 2).find((x) => DONG_RE.test(x)) ?? ''
  if (!dong) {
    const m = /\(([가-힣][가-힣0-9]*(?:동|읍|면|가|리))[,\s)]/.exec(s)
    dong = m ? m[1] : ''
  }
  return [sgg, dong]
}

const JIBUN_RE = /[가-힣][가-힣0-9]*(?:동|읍|면|가|리)\s+((?:산\s*)?\d+(?:-\d+)?)/
const ROAD_RE = /([가-힣0-9]+(?:로|길))\s*(\d+(?:-\d+)?)/

/** 주소 → 지번 ('검암동 679-2, …' → '679-2'). 도로명뿐이면 '서곶로 123' */
export function jibunOf(addr: string | null): string {
  const s = String(addr ?? '')
  let m = JIBUN_RE.exec(s)
  if (m) return m[1].replace(/\s+/g, '').replace('산', '산 ')
  m = ROAD_RE.exec(s)
  return m ? `${m[1]} ${m[2]}` : ''
}

export function buildingName(addr: string | null): string {
  const s = String(addr ?? '')
  const m = /\(\s*[^,()]+,\s*([^,()]+?)\s*\)/.exec(s) ??
    /(?:동|읍|면|가|리)\s+(?:산\s*)?\d+(?:-\d+)?\s*,?\s*([^\s,[(]+)/.exec(s)
  const n = m ? m[1].trim() : ''
  return /^(지하|제)?\d+(층|호|동)?$|^\d+층|^제\d/.test(n) ? '' : n
}

export function buildingKey(addr: string | null): string {
  const s = String(addr ?? '').trim()
  const m = /^(.*?[가-힣][가-힣0-9]*(?:동|읍|면|가|리)\s+(?:산\s*)?\d+(?:-\d+)?)/.exec(s)
  return m ? m[1].replace(/\s+/g, ' ') : s.split(',')[0]
}

export const jibunNorm = (t: unknown) => String(t ?? '').replace(/\s+/g, '')

export function jibunSortKey(jb: string): [number, number, number] {
  const m = /^(산\s*)?(\d+)(?:-(\d+))?$/.exec(String(jb ?? '').trim())
  return m ? [m[1] ? 1 : 0, Number(m[2]), Number(m[3] ?? 0)] : [2, 0, 0]
}

export function compareJibun(a: string, b: string): number {
  const x = jibunSortKey(a)
  const y = jibunSortKey(b)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

/** 동일지번 탭: 입력한 지번(동 이름이 붙어도 됨)과 물건 지번이 같은지 */
export function jibunMatches(input: string, recJibun: string): boolean {
  const q = jibunNorm(input)
  const r = jibunNorm(recJibun)
  if (!q || !r) return false
  if (q === r) return true
  if (!q.endsWith(r)) return false
  const before = q[q.length - r.length - 1]
  return !(/\d/.test(before) || before === '-')
}

// ---------------------------------------------------------------- 레코드 정리
export function emptyRec(): Rec {
  return Object.fromEntries(FIELDS.map((f) => [f, null])) as unknown as Rec
}

/** 아무 모양의 객체 → Rec (숫자칸은 숫자로, 모르는 칸은 버림) */
export function cleanRec(o: Record<string, unknown>): Rec {
  const r = emptyRec() as unknown as Record<string, unknown>
  for (const f of FIELDS) {
    const v = o[f]
    if (missing(v)) continue
    if (NUM_FIELDS.has(f)) r[f] = toNum(v)
    else r[f] = String(v).slice(0, f === '원본' ? 4000 : 500)
  }
  if (!missing(o.종류)) r.종류 = String(o.종류).slice(0, 50)   // 마이턴 — 종류를 지키지 않으면 불러오기 · 백업 때 빠졌다
  return r as unknown as Rec
}

/** nearby_avg.to_frame 과 같음: 층·유찰회수·매각가율을 채우고, 같은 건은 한 번만 */
export function normalizeRecords(items: Record<string, unknown>[]): Rec[] {
  const out: Rec[] = []
  const seen = new Set<string>()
  for (const o of items) {
    const r = cleanRec(o)
    if (r.층 === null) r.층 = toFloor(r.소재지)
    if (r.유찰회수 === null) r.유찰회수 = guessFailCount(r.감정가, r.최저가)
    if (r.매각가율 === null && r.감정가 && r.매각가) r.매각가율 = r.매각가 / r.감정가
    const k = JSON.stringify([r.사건번호, r.소재지, r.매각일, r.매각가])
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  // 최근 매각 건이 위로 (같은 날짜는 원래 순서 그대로)
  const key = (r: Rec) => toDate(r.매각일) ?? '1900-01-01'
  return out.map((r, i) => [r, i] as const)
    .sort((a, b) => (key(a[0]) < key(b[0]) ? 1 : key(a[0]) > key(b[0]) ? -1 : a[1] - b[1]))
    .map(([r]) => r)
}

/** 다른 사이트에서 같은 사건을 받아도 한 번만 세기 위한 키 */
export function caseKey(r: Rec): string {
  const d = toDate(r.매각일)
  return JSON.stringify([String(r.사건번호 ?? '').replace(/\D/g, ''), d ?? String(r.매각일), r.매각가])
}

/** 새 레코드를 더함. 반환: [합친 목록, 새로 더한 수] */
export function mergeRecords(base: Rec[], items: Rec[], source?: string): [Rec[], number] {
  const have = new Set(base.map(caseKey))
  const add: Rec[] = []
  for (const it of items) {
    const k = caseKey(it)
    if (have.has(k)) continue
    have.add(k)
    add.push(source ? { ...it, 출처: source } : it)
  }
  return [base.concat(add), add.length]
}

// ---------------------------------------------------------------- 화면용 행
export interface Row extends Rec {
  idx: number
  date: string | null
  매각일표시: string
  평: number | null
  년차: number | null
  건축표시: string
  평단가: number | null
  시군구: string
  읍면동: string
  지번: string
  면적표시: string
  src: string
  text: string
  d: Record<string, string>   // 머리글 → 화면 글자 (열 필터도 이 글자를 씀)
}

export function disp(v: unknown, col: ColKey | string): string {
  if (v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))) return ''
  if (typeof v === 'number') {
    if (col === '매각가' || col === '감정가' || col === '최저가') return pyFixed(v, 0, true)
    if (col === '매각가율') return `${pyFixed(v * 100, 1)}%`
    if (col === '건축연도' || col === '년차' || col === '층' || col === '응찰자수' || col === '유찰회수') return pyFixed(v, 0)
  }
  return String(v)
}

/** 파이썬 f"{v:,.Nf}" 처럼 (0.5 는 짝수 쪽으로 반올림) */
export function pyFixed(v: number, digits: number, comma = false): string {
  // 실수의 정확한 십진 전개(toFixed(60))에서 반올림해야 파이썬과 글자가 똑같음 (52.135 → 52.13)
  const neg = v < 0
  const exact = Math.abs(v).toFixed(60)
  const [ip, fp] = exact.split('.')
  const keep = (ip + fp.slice(0, digits)).split('').map(Number)
  const rest = fp.slice(digits)
  const first = Number(rest[0])
  const tail = /[1-9]/.test(rest.slice(1))
  const last = keep[keep.length - 1]
  if (first > 5 || (first === 5 && (tail || last % 2 === 1))) {
    let i = keep.length - 1
    while (i >= 0) {
      if (keep[i] === 9) { keep[i] = 0; i-- } else { keep[i]++; break }
    }
    if (i < 0) keep.unshift(1)
  }
  const s = keep.join('')
  let int = s.slice(0, s.length - digits).replace(/^0+(?=\d)/, '') || '0'
  const frac = digits ? s.slice(s.length - digits) : ''
  if (comma) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const zero = /^[0.,]*$/.test(int + frac)
  return `${neg && !zero ? '-' : ''}${int}${digits ? '.' + frac : ''}`
}

/** 레코드 → 화면용 행 (평 · 년차 · 지역 · 지번 · 화면 글자 계산) */
export function prepare(recs: Rec[], today = new Date()): Row[] {
  const year = today.getFullYear()
  return recs.map((r, idx) => {
    const ym = typeof r.건축연월 === 'string' && r.건축연월.trim() && r.건축연월 !== 'nan' ? r.건축연월 : ''
    const ymYear = ym ? Number(ym.slice(0, 4)) : NaN
    const 건축연도 = r.건축연도 ?? (Number.isFinite(ymYear) ? ymYear : null)
    const 평 = r.전용면적 === null ? null : r.전용면적 / 3.3058
    const [시군구, 읍면동] = splitRegion(r.소재지)
    const date = toDate(r.매각일)
    const src = r.출처 && r.출처.trim() && r.출처 !== 'nan' ? r.출처 : '인근'
    const row: Row = {
      ...r, idx, 건축연도, date, 매각일표시: date ?? '',
      평, 년차: 건축연도 === null ? null : year - 건축연도,
      건축표시: ym || (건축연도 === null ? '' : pyFixed(건축연도, 0)),
      평단가: r.매각가 !== null && 평 ? r.매각가 / 평 : null,
      시군구, 읍면동, 지번: jibunOf(r.소재지),
      면적표시: r.전용면적 === null ? '' : `${pyFixed(r.전용면적, 2)} / ${pyFixed(평 as number, 1)}`,
      src, text: '', d: {},
    }
    row.text = `${r.사건번호 ?? 'None'} ${r.소재지 ?? 'None'} ${r.원본 ?? ''}`.toLowerCase()
    for (const [h, col] of LIST_COLS) row.d[h] = disp(row[col as keyof Row], col)
    return row
  })
}

// ---------------------------------------------------------------- 열 필터
export type ColFilter = Record<string, Set<string>>

export function colPass(row: Row, chosen: ColFilter, skip?: string): boolean {
  for (const [h, allowed] of Object.entries(chosen)) {
    if (h === skip || !allowed) continue
    if (!allowed.has(row.d[h] || BLANK)) return false
  }
  return true
}

export function colText(chosen: ColFilter): string {
  const parts: string[] = []
  for (const h of HEADS) {
    const vals = chosen[h]
    if (vals) {
      const vs = [...vals].sort()
      parts.push(`${h} ${vs.slice(0, 3).join('·')}${vs.length > 3 ? ` 외 ${vs.length - 3}개` : ''}`)
    }
  }
  return parts.join(' / ')
}

/** 열 필터 목록에 보일 값과 건수 (숫자·날짜 열은 실제 값 순서) */
export function filterValues(rows: Row[], head: string): { value: string; count: number }[] {
  const col = LIST_COLS.find((c) => c[0] === head)![1]
  const counts = new Map<string, number>()
  const keyOf = new Map<string, number | string>()
  for (const r of rows) {
    const v = r.d[head] || BLANK
    counts.set(v, (counts.get(v) ?? 0) + 1)
    const raw = col === '매각일표시' ? r.date : (r as unknown as Record<string, unknown>)[col]
    if (raw !== null && raw !== undefined) {
      const prev = keyOf.get(v)
      if (prev === undefined || (raw as number | string) < prev) keyOf.set(v, raw as number | string)
    }
  }
  const vals = [...counts.keys()].filter((v) => v !== BLANK)
  if (['사건번호', '소재지', '면적표시', '건축표시'].includes(col)) {
    if (col === '면적표시') vals.sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0))
    else vals.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  } else {
    vals.sort((a, b) => {
      const x = keyOf.get(a)
      const y = keyOf.get(b)
      if (x === undefined || y === undefined) return x === undefined ? (y === undefined ? 0 : 1) : -1
      return x < y ? -1 : x > y ? 1 : 0
    })
  }
  if (counts.has(BLANK)) vals.push(BLANK)
  return vals.map((value) => ({ value, count: counts.get(value)! }))
}

// ---------------------------------------------------------------- 정렬
export const DESC_FIRST = new Set(['매각년월일', '매각가', '감정가', '최저입찰가', '매각가율'])

export function sortRows(rows: Row[], head: string | null, desc: boolean): Row[] {
  if (!head) return rows
  const col = LIST_COLS.find((c) => c[0] === head)![1]
  const val = (r: Row) => (col === '매각일표시' ? r.date : (r as unknown as Record<string, unknown>)[col]) as number | string | null
  const withV = rows.filter((r) => val(r) !== null && val(r) !== undefined && val(r) !== '')
  const without = rows.filter((r) => !withV.includes(r))
  const sorted = [...withV].sort((a, b) => {
    const x = val(a)!
    const y = val(b)!
    const c = x < y ? -1 : x > y ? 1 : 0
    return desc ? -c : c
  })
  return col === '매각일표시' && !desc ? [...without, ...sorted] : [...sorted, ...without]
}

// ---------------------------------------------------------------- 인근매각물건 탭
export interface NearCond {
  sgg: string; dong: string; type: string
  start: string | null; end: string | null
  amin: number | null; amax: number | null; ymin: number | null; ymax: number | null
  q: string
}

export function hasTypeInfo(rows: Row[]): boolean {
  const kws = Object.values(TYPES).flatMap((v) => v ?? [])
  return rows.some((r) => kws.some((k) => r.text.includes(k)))
}

/** 인근 탭 조건 적용 (skipCol: 그 열 필터만 빼고 — 머리글 필터 창 값 목록용) */
export function nearView(rows: Row[], c: NearCond, chosen: ColFilter, skipCol?: string): Row[] {
  const kws = TYPES[c.type]
  const useType = !!kws && hasTypeInfo(rows)
  const q = c.q.trim().toLowerCase()
  return rows.filter((r) =>
    (c.sgg === '' || c.sgg === '전체' || r.시군구 === c.sgg) &&
    (c.dong === '' || c.dong === '전체' || r.읍면동 === c.dong) &&
    (!useType || kws!.some((k) => r.text.includes(k))) &&
    (c.amin === null || (r.전용면적 !== null && r.전용면적 >= c.amin)) &&
    (c.amax === null || (r.전용면적 !== null && r.전용면적 <= c.amax)) &&
    (c.ymin === null || (r.건축연도 !== null && r.건축연도 >= c.ymin)) &&
    (c.ymax === null || (r.건축연도 !== null && r.건축연도 <= c.ymax)) &&
    (!c.start || (r.date !== null && r.date >= c.start)) &&
    (!c.end || (r.date !== null && r.date <= c.end)) &&
    (!q || r.text.includes(q)) &&
    colPass(r, chosen, skipCol))
}

const nums = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null && !Number.isNaN(x))
export const mean = (xs: (number | null)[]) => { const v = nums(xs); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
export function median(xs: (number | null)[]): number | null {
  const v = nums(xs).sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

export interface NearStats {
  평균감정가: number | null; 매각건수: number; 평균매각가: number | null; 중앙값매각가: number | null
  평균율: number | null; 중앙값율: number | null; 최저율: number | null; 최고율: number | null; 전체율: number | null
  평균응찰: number | null
}

/** 인근 탭 지표 9칸 (평균 · 중앙값 · 최저/최고 매각가율 · 전체율) */
export function nearStats(v: Row[]): NearStats {
  const rates = nums(v.map((r) => r.매각가율))
  const both = v.filter((r) => r.감정가 !== null && r.매각가 !== null)
  const sumA = both.reduce((a, r) => a + (r.감정가 as number), 0)
  const sumS = both.reduce((a, r) => a + (r.매각가 as number), 0)
  return {
    평균감정가: mean(v.map((r) => r.감정가)), 매각건수: v.length, 평균매각가: mean(v.map((r) => r.매각가)),
    중앙값매각가: median(v.map((r) => r.매각가)), 평균율: mean(rates), 중앙값율: median(rates),
    최저율: rates.length ? Math.min(...rates) : null, 최고율: rates.length ? Math.max(...rates) : null,
    전체율: both.length && sumA ? sumS / sumA : null, 평균응찰: mean(v.map((r) => r.응찰자수)),
  }
}

// ---------------------------------------------------------------- 동일지번 탭
export interface SameCond { sgg: string; dong: string; jibun: string; q: string }

export function regionRows(rows: Row[], sgg: string, dong: string): Row[] {
  return rows.filter((r) => (sgg === '' || sgg === '전체' || r.시군구 === sgg) && (dong === '' || dong === '전체' || r.읍면동 === dong))
}

/** 동일지번 탭 조건 적용. 지번 비어 있으면 지역 전체 */
export function sameView(rows: Row[], c: SameCond, chosen: ColFilter, skipCol?: string): Row[] {
  const q = c.q.trim().toLowerCase()
  const jb = c.jibun.trim()
  return regionRows(rows, c.sgg, c.dong).filter((r) =>
    (!jb || jibunMatches(jb, r.지번)) && (!q || r.text.includes(q)) && colPass(r, chosen, skipCol))
}

/** 지번을 안 골랐을 때: 읍면동 → 지번 순 */
export function sortByJibun(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => (a.읍면동 < b.읍면동 ? -1 : a.읍면동 > b.읍면동 ? 1 : compareJibun(a.지번, b.지번)))
}

export interface JibunItem { dong: string; jibun: string; count: number; own: number; name: string }

/** '목록에서 고르기' 항목: 지번별 건수 · 건물 이름 (동일지번 수집한 곳 먼저) */
export function jibunList(rows: Row[]): JibunItem[] {
  const groups = new Map<string, Row[]>()
  for (const r of rows) {
    if (!r.지번) continue
    const k = `${r.읍면동}\u0000${r.지번}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(r)
  }
  const out: JibunItem[] = []
  for (const [k, g] of groups) {
    const [dong, jibun] = k.split('\u0000')
    const name = g.map((r) => buildingName(r.소재지)).find((n) => n) ?? ''
    out.push({ dong, jibun, count: g.length, own: g.filter((r) => r.src === '동일지번').length, name })
  }
  out.sort((a, b) => b.own - a.own || b.count - a.count || (a.dong < b.dong ? -1 : a.dong > b.dong ? 1 : 0) ||
    (a.jibun < b.jibun ? -1 : a.jibun > b.jibun ? 1 : 0))
  return out
}

export interface SameStats { 매각건수: number; 평균율: number | null; 평균매각가: number | null; 평균최저가: number | null; 평균유찰: number | null; 평균응찰: number | null }

export function sameStats(v: Row[]): SameStats {
  return {
    매각건수: v.length, 평균율: mean(v.map((r) => r.매각가율)), 평균매각가: mean(v.map((r) => r.매각가)),
    평균최저가: mean(v.map((r) => r.최저가)), 평균유찰: mean(v.map((r) => r.유찰회수)), 평균응찰: mean(v.map((r) => r.응찰자수)),
  }
}

// ---------------------------------------------------------------- 날짜
export function monthsAgo(d: Date, n: number): string {
  const total = d.getFullYear() * 12 + d.getMonth() - n
  const y = Math.floor(total / 12)
  const m = total % 12
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return isoOf(y, m + 1, Math.min(d.getDate(), last)) as string
}

export function todayIso(d = new Date()): string {
  return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate()) as string
}
