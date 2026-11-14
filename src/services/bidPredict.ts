/**
 * 낙찰가 예측(테스트) — 공용 매각 자료로 '응찰 인원 → 최저가 배수'를 배우고,
 * 조회수가 있으면 '전일까지 누적 조회수 → 응찰 인원'을 배워 입찰가별 낙찰확률을 낸다.
 * 화면 없는 순수 계산(웹 · 앱 · 관리자 화면이 같이 쓸 수 있게). 금액은 원.
 */

export type SaleRecLike = Record<string, string | number | null | undefined>;

/** 예측에 쓰는 물건 하나 */
export type BidTarget = {
  round: number;            // 유찰 횟수(신건 0, 2차 1, 3차 2 …)
  appr: number;             // 감정가
  min: number;              // 최저가
  area: number | null;      // 전용(건물)면적 ㎡
  year: number | null;      // 건축연도
  floor: number | null;
  date: string;             // 매각기일 YYYY-MM-DD — 이날 이전 자료만 쓴다
  dong: string;             // 동 이름(검암동) — 같은 동 자료로 배운다
};

export const BAND_NAMES = ['1명', '2~3명', '4~6명', '7~10명', '11명 이상'] as const;
/** 인원 구간마다 대표 인원(배수 식에 넣는 값) */
const BAND_REP = [1, 2, 5, 8, 15];
export const bandOf = (n: number) => (n <= 1 ? 0 : n <= 3 ? 1 : n <= 6 ? 2 : n <= 10 ? 3 : 4);

/** 사건번호 → '2026-501308' 꼴(2026타경501308 · 2026-501308 모두) */
export const caseKey = (s: unknown): string => {
  // 물건번호가 여럿인 사건은 '2024-5754(1)' 꼴로 따로 둔다(한 사건에 물건 여럿 — 5계 11-13)
  const m = String(s ?? '').match(/(\d{4})\s*(?:타경|-)\s*0*(\d+)(?:\s*\(\s*(\d+)\s*\))?/);
  return m ? `${m[1]}-${m[2]}${m[3] ? `(${m[3]})` : ''}` : '';
};
export const caseLabel = (k: string) => k.replace('-', '타경');

/** 날짜 → YYYY-MM-DD */
export const ymd = (v: unknown): string => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  const m = String(v ?? '').match(/(\d{4})[.\-/년 ]\s*(\d{1,2})[.\-/월 ]\s*(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
};
const yearsBefore = (d: string, y: number) => `${Number(d.slice(0, 4)) - y}${d.slice(4)}`;

/** 최저가 ÷ 감정가 → 유찰 횟수(0.7 씩 저감, 0.8 저감 법원도 가까운 쪽으로) */
export const roundOfRatio = (r: number): number => {
  if (!(r > 0) || r >= 0.99) return 0;
  const k7 = Math.log(r) / Math.log(0.7);
  const k8 = Math.log(r) / Math.log(0.8);
  return Math.abs(k7 - Math.round(k7)) <= Math.abs(k8 - Math.round(k8)) ? Math.max(0, Math.round(k7)) : Math.max(0, Math.round(k8));
};

const num = (v: unknown): number | null => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null; };
export const dongOf = (addr: unknown) => String(addr ?? '').match(/([가-힣0-9]+(?:동|가|읍|면|리))\s+\d/)?.[1] ?? '';

/** 공용 매각 자료 한 줄 → 학습용 */
type Sold = { d: string; dong: string; round: number; appr: number; min: number; sold: number; bids: number | null; area: number | null; year: number | null; floor: number | null; mx: number; addr: string; key: string };
export const soldOf = (r: SaleRecLike): Sold | null => {
  const appr = num(r['감정가']); const min = num(r['최저가']); const sold = num(r['매각가']); const d = ymd(r['매각일']);
  if (!appr || !min || !sold || !d) return null;
  const fail = num(r['유찰회수']);
  return { d, dong: dongOf(r['소재지']), round: fail ?? roundOfRatio(min / appr), appr, min, sold, bids: num(r['응찰자수']), area: num(r['전용면적']), year: num(r['건축연도']), floor: num(r['층']), mx: sold / min, addr: String(r['소재지'] ?? ''), key: caseKey(r['사건번호']) };
};

const feat = (t: { round: number; appr: number; area: number | null; year: number | null; floor: number | null }, bids: number) => [
  1, t.round === 2 ? 1 : 0, t.round >= 3 ? 1 : 0, Math.log(t.appr / 1.5e8), (t.area ?? 50) - 50, (t.year ?? 2012) - 2012, Math.min(t.floor ?? 3, 6), Math.log(Math.max(1, bids)),
];
/** 최소제곱(정규방정식 + 아주 작은 능선) */
const lstsq = (X: number[][], y: number[]): number[] => {
  const p = X[0].length;
  const A = Array.from({ length: p }, (_, i) => Array.from({ length: p + 1 }, (_, j) => (j === p ? X.reduce((s, r, k) => s + r[i] * y[k], 0) : X.reduce((s, r) => s + r[i] * r[j], 0) + (i === j ? 1e-6 : 0))));
  for (let c = 0; c < p; c++) {
    let piv = c; for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    const d = A[c][c] || 1e-12;
    for (let r = 0; r < p; r++) if (r !== c) { const f = A[r][c] / d; for (let j = c; j <= p; j++) A[r][j] -= f * A[c][j]; }
  }
  return A.map((row, i) => row[p] / (A[i][i] || 1e-12));
};
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };

export type PriceModel = { b: number[]; res: number[][]; n: number; pool: Sold[] };
/** 매각기일 이전 2년 · 같은 동(모자라면 전체) · 2~4차 · 응찰자 수 있는 매각 건으로 배수 식을 맞춘다 */
export const fitPriceModel = (recs: Sold[], t: BidTarget): PriceModel | null => {
  const inWin = (r: Sold) => r.d < t.date && r.d >= yearsBefore(t.date, 2);
  let pool = recs.filter((r) => inWin(r) && r.round >= 1 && r.round <= 3 && r.bids != null && r.bids >= 1 && (!t.dong || r.dong === t.dong));
  if (pool.length < 60) pool = recs.filter((r) => inWin(r) && r.round >= 1 && r.round <= 3 && r.bids != null && r.bids >= 1);
  if (pool.length < 30) return null;
  const X = pool.map((r) => feat(r, r.bids as number)); const y = pool.map((r) => Math.log(r.mx));
  const b = lstsq(X, y);
  const res: number[][] = [[], [], [], [], []];
  pool.forEach((r, i) => res[bandOf(r.bids as number)].push(y[i] - X[i].reduce((s, v, j) => s + v * b[j], 0)));
  const all = res.flat();
  return { b, res: res.map((r) => (r.length >= 5 ? r : all)), n: pool.length, pool };
};

/** 비슷한 물건(같은 차수 · 전용 ±10㎡ · 연식 ±6년 · 감정가 ±25%)이 지난 2년 받은 인원 비율 */
export const similarBands = (recs: Sold[], t: BidTarget): { pi: number[]; n: number; loose: boolean } => {
  const r0 = Math.min(Math.max(t.round, 1), 3);
  const win = recs.filter((r) => r.d < t.date && r.d >= yearsBefore(t.date, 2) && r.bids != null && r.bids >= 1 && Math.min(Math.max(r.round, 1), 3) === r0 && (!t.dong || r.dong === t.dong));
  const sim = win.filter((r) => (r.area == null || t.area == null || Math.abs(r.area - t.area) <= 10) && (r.year == null || t.year == null || Math.abs(r.year - t.year) <= 6) && r.appr / t.appr >= 0.75 && r.appr / t.appr <= 1.33);
  const src = sim.length >= 10 ? sim : win; const c = [0, 0, 0, 0, 0];
  src.forEach((r) => { c[bandOf(r.bids as number)] += 1; });
  const n = src.length || 1;
  return { pi: c.map((x) => x / n), n: src.length, loose: sim.length < 10 };
};

/** 인원 비율 + 배수 식 → 낙찰가 분포 */
export const priceDist = (m: PriceModel, t: BidTarget, pi: number[]) => {
  const tt = { ...t, round: Math.min(Math.max(t.round, 1), 3) };
  const center = BAND_REP.map((n) => Math.exp(feat(tt, n).reduce((s, v, j) => s + v * m.b[j], 0)));
  const bandWon = center.map((c) => Math.round(t.min * c));
  /** 이 금액을 쓰면 이길 확률 = 낙찰가가 이보다 낮게 나올 확률 */
  const win = (w: number) => pi.reduce((s, p, k) => s + (p ? p * (m.res[k].filter((e) => center[k] * Math.exp(e) < w / t.min).length / m.res[k].length) : 0), 0);
  const q = (p: number) => { let lo = t.min, hi = t.min * 2.5; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (win(mid) < p) lo = mid; else hi = mid; } return Math.round(hi / 10_000) * 10_000; };
  return { bandWon, win, q, median: q(0.5), lo: q(0.25), hi: q(0.75) };
};

/* ===== 조회수 → 응찰 인원 ===== */
export type ViewPair = { key: string; views: number; bids: number };   // bids 0 = 유찰
export type ViewModel = { a: number; c: number; s: number; n: number };
const ln1 = (x: number) => Math.log(1 + Math.max(0, x));
/** ln(1+인원) = a + c·ln(1+조회수). 6건 미만이거나 조회수가 다 같으면 못 배운다 */
export const fitViewModel = (pairs: ViewPair[]): ViewModel | null => {
  if (pairs.length < 6) return null;
  const xs = pairs.map((p) => ln1(p.views)); const ys = pairs.map((p) => ln1(p.bids));
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length; const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  const sxx = xs.reduce((s, v) => s + (v - mx) ** 2, 0); if (sxx < 1e-6) return null;
  const c = xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0) / sxx; const a = my - c * mx;
  const sse = xs.reduce((s, v, i) => s + (ys[i] - a - c * v) ** 2, 0);
  return { a, c, s: Math.max(0.15, Math.sqrt(sse / Math.max(1, pairs.length - 2))), n: pairs.length };
};
const ncdf = (z: number) => { const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2); const e = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2); return z >= 0 ? (1 + e) / 2 : (1 - e) / 2; };
/** 조회수 → 유찰 확률 + 인원 구간 비율(팔린다고 칠 때) */
export const viewBands = (vm: ViewModel, views: number) => {
  const mu = vm.a + vm.c * ln1(views);
  const cut = [1.5, 2.5, 4.5, 7.5, 11.5].map(Math.log);
  const P = (y: number) => ncdf((y - mu) / vm.s);
  const p0 = P(cut[0]);
  const raw = [P(cut[1]) - P(cut[0]), P(cut[2]) - P(cut[1]), P(cut[3]) - P(cut[2]), P(cut[4]) - P(cut[3]), 1 - P(cut[4])];
  const sum = raw.reduce((s, v) => s + v, 0) || 1;
  return { p0, pi: raw.map((v) => v / sum), bids: Math.max(0, Math.exp(mu) - 1) };
};

/* ===== 기일 목록 파일(탱크옥션 기일별물건 CSV · 엑셀) ===== */
export type DayRow = { key: string; kind: string; addr: string; area: number | null; appr: number; min: number; sold: number; second: number; bids: number; status: string; date: string };
/** 머리 줄(사건번호 · 진행상태)을 찾아 그 아래를 읽는다. cells = 줄마다 칸 글 */
export const readDayRows = (rows: unknown[][]): DayRow[] => {
  const h = rows.findIndex((r) => r.some((c) => String(c ?? '').trim() === '사건번호') && r.some((c) => String(c ?? '').includes('진행상태')));
  if (h < 0) return [];
  const head = rows[h].map((c) => String(c ?? '').trim());
  const at = (name: string) => head.findIndex((c) => c.startsWith(name));
  const ix = { key: at('사건번호'), kind: at('종별'), addr: at('주소'), info: at('경매현황'), appr: at('감정가'), min: at('최저가'), sold: at('매각가'), second: at('차순위'), bids: at('입찰자수'), status: at('진행상태'), date: at('입찰일자') };
  return rows.slice(h + 1).map((r) => {
    const g = (i: number) => (i >= 0 ? r[i] : null);
    const area = String(g(ix.info) ?? '').match(/건물\s*([\d.]+)㎡/);
    return { key: caseKey(g(ix.key)), kind: String(g(ix.kind) ?? ''), addr: String(g(ix.addr) ?? '').replace(/\s+/g, ' ').trim(), area: area ? Number(area[1]) : null, appr: num(g(ix.appr)) ?? 0, min: num(g(ix.min)) ?? 0, sold: num(g(ix.sold)) ?? 0, second: num(g(ix.second)) ?? 0, bids: num(g(ix.bids)) ?? 0, status: String(g(ix.status) ?? '').trim(), date: ymd(g(ix.date)) };
  }).filter((d) => d.key && d.appr > 0);
};
/** CSV 글 → 칸 표(따옴표 · 쉼표 안 따옴표 처리) */
export const csvRows = (text: string): string[][] => {
  const out: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
    if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; } else if (ch === '\n') { row.push(cur); out.push(row); row = []; cur = ''; } else if (ch !== '\r') cur += ch;
  }
  if (cur || row.length) { row.push(cur); out.push(row); }
  return out;
};

/** 붙여넣은 줄 '사건번호 주소 조회수' → 사건마다 조회수(맨 끝 숫자) · 주소(가운데) */
export const parseViewLines = (text: string): Array<{ key: string; addr: string; views: number }> =>
  text.split(/\r?\n/).map((line) => {
    const key = caseKey(line); if (!key) return null;
    const rest = line.replace(/\d{4}\s*(?:타경|-)\s*\d+(?:\s*\(\s*\d+\s*\))?/, '').replace(/\t/g, ' ').trim();
    const m = rest.match(/([\d,]+)\s*(?:회)?\s*$/); if (!m) return null;
    return { key, addr: rest.slice(0, m.index).replace(/[,\s]+$/, '').trim(), views: Number(m[1].replace(/,/g, '')) };
  }).filter((x): x is { key: string; addr: string; views: number } => !!x);

/* ===== 회차별 표(사건 차트의 날짜별 조회수) → 팔릴 확률 · 인원 — 2026-11-14 =====
 * 회차마다 '매각 전날까지 누적 조회수'와 결과(유찰 0명 · 팔림 N명)를 짝짓는다. 매각 당일 이후 조회는 쓰지 않는다.
 * 검암동 1,068회차로 시간 순서대로 골랐다(6월 ~ 11-12 회차를 그날 이전 자료로만 맞혀 봄):
 *   팔림/유찰 맞힘 85% → 90%, 인원 구간 18% → 40%, 낙찰가 평균 차이 8.1% → 7.5%(실제 인원을 알아도 6.9%) */
export type HitLike = { key: string; addr: string; kind: string; area: number | null; appr: number; sold: number; bids: number; second: number; fails: number; next: string; asOf?: string; ev: { d: string; l: string }[]; hd: string[]; hc: number[]; he: number[] };   // asOf = 모은 날(차트에 그 뒤 날짜는 0 으로 미리 들어 있다)
export type Round = {
  key: string; addr: string; kind: string; area: number | null; appr: number; min: number;
  date: string; round: number;               // 매각기일 · 그때까지 유찰 횟수
  views: number; eff: number; last7: number;  // 전날까지 누적 조회 · 유효 · 마지막 7일 조회
  upTo: string;                               // 누적에 넣은 마지막 날짜(전날이 아니면 아직 덜 모은 것)
  complete: boolean;                          // 공고일부터 조회 기록이 있다(2025-06-15 수집 시작 뒤 공고)
  result: 'sold' | 'fail' | 'none'; sold: number; bids: number; second: number;
};
const STEP = 0.7;   // 인천 — 유찰마다 30% 저감
/** lead — 매각 며칠 전까지 센 값으로 볼지(0 = 전날까지). 다가오는 기일을 며칠 앞서 모았으면 배울 때도 같은 날수 앞으로 맞춘다 */
const dayShift = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const roundsOf = (h: HitLike, collectStart = '2025-06-15', lead = 0): Round[] => {
  const notice = h.ev.find((e) => e.l === '경매공고일')?.d ?? '';
  const complete = !!notice && notice >= collectStart;
  const sales = [...new Set(h.ev.filter((e) => /^\d+차 매각기일$/.test(e.l)).map((e) => e.d))].sort();
  if (h.next && /^\d{4}-\d{2}-\d{2}$/.test(h.next) && !sales.includes(h.next) && (!sales.length || h.next > sales[sales.length - 1])) sales.push(h.next);
  const soldDays = h.ev.filter((e) => e.l === '매각').map((e) => e.d);
  const chg = new Set(h.ev.filter((e) => e.l === '변경' || e.l === '결정변경').map((e) => e.d));
  const multi = soldDays.length > 1 || h.ev.some((e) => e.l === '미납' || e.l === '불허가');
  const out: Round[] = []; let k = 0;
  for (let i = 0; i < sales.length; i++) {
    const d = sales[i];
    if (chg.has(d)) continue;
    const cut = lead > 0 ? dayShift(d, -lead) : d;   // 이 날 앞까지만 센다
    const idx = h.hd.map((x, j) => (x < cut && (!h.asOf || x <= h.asOf) ? j : -1)).filter((j) => j >= 0);
    const views = idx.reduce((s, j) => s + (h.hc[j] ?? 0), 0); const eff = idx.reduce((s, j) => s + (h.he[j] ?? 0), 0);
    const last7 = idx.slice(-7).reduce((s, j) => s + (h.hc[j] ?? 0), 0);
    const base = { key: h.key, addr: h.addr, kind: h.kind, area: h.area, appr: h.appr, min: Math.round((h.appr * STEP ** k) / 1000) * 1000, date: d, round: k, views, eff, last7, upTo: idx.length ? h.hd[idx[idx.length - 1]] : '', complete };
    if (soldDays.includes(d)) { out.push({ ...base, result: multi ? 'none' : 'sold', sold: multi ? 0 : h.sold, bids: multi ? 0 : h.bids, second: multi ? 0 : h.second }); break; }
    if (i + 1 < sales.length) { out.push({ ...base, result: 'fail', sold: 0, bids: 0, second: 0 }); k++; continue; }
    out.push({ ...base, result: 'none', sold: 0, bids: 0, second: 0 });   // 아직 안 열렸거나 취하 · 기각
  }
  return out;
};
const lnp = (x: number) => Math.log(1 + Math.max(0, x));
/** 고른 방법 — 누적 조회수 + 마지막 7일 + 회차(신건 · 3차 이상) */
export const roundFeat = (r: Pick<Round, 'views' | 'last7' | 'round'>) => [1, lnp(r.views), lnp(r.last7), r.round === 0 ? 1 : 0, r.round >= 2 ? 1 : 0];
const ridge = (A: number[][], y: number[], lam: number) => {
  const p = A[0].length;
  const M = Array.from({ length: p }, (_, i) => Array.from({ length: p + 1 }, (_, j) => (j === p ? A.reduce((s, r, k) => s + r[i] * y[k], 0) : A.reduce((s, r) => s + r[i] * r[j], 0) + (i === j && i > 0 ? lam : 0))));
  for (let c = 0; c < p; c++) {
    let pv = c; for (let r = c + 1; r < p; r++) if (Math.abs(M[r][c]) > Math.abs(M[pv][c])) pv = r;
    [M[c], M[pv]] = [M[pv], M[c]];
    for (let r = 0; r < p; r++) if (r !== c) { const f = M[r][c] / (M[c][c] || 1e-12); for (let j = c; j <= p; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((row, i) => row[p] / (M[i][i] || 1e-12));
};
export type RoundModel = { ps: number[]; b: number[]; s: number; n: number; nSold: number; before: string };
/** before 날짜 이전 회차로만 배운다(그날과 그 뒤 결과는 안 본다). 공고일부터 기록이 있는 4회 유찰까지 */
export const fitRoundModel = (rounds: Round[], before: string): RoundModel | null => {
  const tr = rounds.filter((r) => r.complete && r.round <= 4 && r.date < before && (r.result === 'fail' || (r.result === 'sold' && r.bids > 0)));
  const sd = tr.filter((r) => r.result === 'sold');
  if (tr.length < 30 || sd.length < 10) return null;
  const X = tr.map(roundFeat); const y = tr.map((r) => (r.result === 'sold' ? 1 : 0));
  let ps = new Array(X[0].length).fill(0);
  for (let it = 0; it < 30; it++) {
    const w: number[] = []; const z: number[] = [];
    X.forEach((x, k) => { const e = x.reduce((s, v, j) => s + v * ps[j], 0); const p = 1 / (1 + Math.exp(-e)); const ww = Math.max(1e-6, p * (1 - p)); w.push(ww); z.push(e + (y[k] - p) / ww); });
    ps = ridge(X.map((x, k) => x.map((v) => v * Math.sqrt(w[k]))), z.map((v, k) => v * Math.sqrt(w[k])), 1);
  }
  const Xs = sd.map(roundFeat); const ys = sd.map((r) => lnp(r.bids)); const b = ridge(Xs, ys, 1e-3);
  const s = Math.max(0.15, Math.sqrt(Xs.reduce((a, x, k) => a + (ys[k] - x.reduce((q, v, j) => q + v * b[j], 0)) ** 2, 0) / Math.max(1, Xs.length - b.length)));
  return { ps, b, s, n: tr.length, nSold: sd.length, before };
};
/** 팔릴 확률 · 팔릴 때 인원 구간 비율 · 예상 인원 */
export const predictRound = (m: RoundModel, r: Pick<Round, 'views' | 'last7' | 'round'>) => {
  const x = roundFeat(r);
  const pSold = 1 / (1 + Math.exp(-x.reduce((s, v, j) => s + v * m.ps[j], 0)));
  const mu = x.reduce((s, v, j) => s + v * m.b[j], 0);
  const cut = [1.5, 2.5, 4.5, 7.5, 11.5].map(Math.log); const P = (y: number) => ncdf((y - mu) / m.s);
  const raw = [P(cut[1]) - P(cut[0]), P(cut[2]) - P(cut[1]), P(cut[3]) - P(cut[2]), P(cut[4]) - P(cut[3]), 1 - P(cut[4])];
  const tot = raw.reduce((a, v) => a + v, 0) || 1;
  return { pSold, pi: raw.map((v) => v / tot), expBids: Math.max(0, Math.exp(mu) - 1) };
};

export { median as medianOf };
