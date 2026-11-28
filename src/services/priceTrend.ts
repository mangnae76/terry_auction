// 빌라 가격동향(시세예측 시안 v7, 2026-11-29) — 매매 실거래 평당가로 최근 흐름을 본다. 화면 없이 숫자만(웹 · 앱 같이 쓸 수 있게).
// - 월별: 최근 12개월 달마다 평당가 가운데값
// - 비교: 최근 3개월 묶음 가운데값을 3 · 6 · 12개월 전 3개월 묶음과 견준다(중개거래만 — 직거래는 값이 낮게 섞여 따로 본다)
// - 범위: 두 묶음에서 거래를 다시 뽑아(같은 수만큼, 중복 허용) 500번 계산했을 때 가운데 80%. 0을 넘나들면 '판단어려움'
// - 직거래: 최근 1년 직거래 건수 · 매매 중 비중 · 같은 기간 중개거래 가운데값보다 몇 % 낮은지
// 지어낸 값은 없다 — 거래가 모자라면 그 칸은 비운다(null).

export type TrendRow = { /** 'YYYYMMDD' */ ymd: string; perPy: number; direct: boolean };
export type TrendMonth = { label: string; med: number | null; n: number };
export type TrendCmp = { k: 3 | 6 | 12; pct: number | null; lo: number | null; hi: number | null; nNow: number; nThen: number; verdict: '상승' | '하락' | '판단어려움' | '' };
export type PriceTrend = {
  months: TrendMonth[];
  /** 최근 3개월 중개 매매 평당가 가운데값 */
  now: { med: number | null; n: number };
  cmp: TrendCmp[];
  direct: { n: number; share: number; gap: number | null };
};

const MIN_N = 3;   // 묶음에 거래가 이보다 적으면 비교하지 않는다
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y); const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const ymdOf = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
/** n달 전 같은 날 — 그 달에 그 날이 없으면 말일(11-29 에서 9달 전이 2월 29일 → 3월 1일로 넘어가 달 이름이 겹쳤다) */
const monthsBack = (d: Date, n: number) => { const x = new Date(d.getFullYear(), d.getMonth() - n, 1); const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); x.setDate(Math.min(d.getDate(), last)); return x; };
/** 같은 입력이면 같은 범위가 나오게 — 고정 씨앗 난수 */
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

export const priceTrend = (rows: TrendRow[], today = new Date()): PriceTrend => {
  const ok = rows.filter((r) => r.perPy > 0 && /^\d{8}$/.test(r.ymd));
  const broker = ok.filter((r) => !r.direct);
  const end = ymdOf(today);
  const win = (fromMo: number, toMo: number) => { const a = ymdOf(monthsBack(today, fromMo)); const b = toMo === 0 ? end : ymdOf(monthsBack(today, toMo)); return broker.filter((r) => r.ymd > a && r.ymd <= b).map((r) => r.perPy); };
  const nowXs = win(3, 0);
  const cmp: TrendCmp[] = ([12, 6, 3] as const).map((k) => {
    const then = win(k + 3, k);
    if (nowXs.length < MIN_N || then.length < MIN_N) return { k, pct: null, lo: null, hi: null, nNow: nowXs.length, nThen: then.length, verdict: '' };
    const pct = (median(nowXs) / median(then) - 1) * 100;
    const r = rng(nowXs.length * 7919 + then.length * 104729 + k);
    const pick = (xs: number[]) => xs.map(() => xs[Math.floor(r() * xs.length)]);
    const sims = Array.from({ length: 500 }, () => (median(pick(nowXs)) / median(pick(then)) - 1) * 100).sort((a, b) => a - b);
    const lo = sims[Math.floor(sims.length * 0.1)]; const hi = sims[Math.floor(sims.length * 0.9)];
    return { k, pct, lo, hi, nNow: nowXs.length, nThen: then.length, verdict: lo > 0 ? '상승' : hi < 0 ? '하락' : '판단어려움' };
  });
  const months: TrendMonth[] = Array.from({ length: 12 }, (_, i) => {
    const d = monthsBack(today, 11 - i); const key = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const xs = broker.filter((r) => r.ymd.startsWith(key)).map((r) => r.perPy);
    return { label: `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}`, med: xs.length ? median(xs) : null, n: xs.length };
  });
  const yAgo = ymdOf(monthsBack(today, 12));
  const yr = ok.filter((r) => r.ymd > yAgo);
  const dXs = yr.filter((r) => r.direct).map((r) => r.perPy); const bXs = yr.filter((r) => !r.direct).map((r) => r.perPy);
  return {
    months, cmp,
    now: { med: nowXs.length ? median(nowXs) : null, n: nowXs.length },
    direct: { n: dXs.length, share: yr.length ? (dXs.length / yr.length) * 100 : 0, gap: dXs.length >= MIN_N && bXs.length >= MIN_N ? (1 - median(dXs) / median(bXs)) * 100 : null },
  };
};
