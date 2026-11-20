// 저가매수 — '1회 유찰 최저가로 낙찰받으면 얼마 남나'(2026-11-20 사용자 최종 시안).
// 예상 매도가 1(계산) · 2(사람이 넣음) 중 고른 값 − 지금 최저가 = 최저가 낙찰 차익, 응찰 확률은 낙찰가예측 회차 모델.
// 화면(Vue) · DB 를 모르는 순수 계산 — 저가매수 · 관심물건 표(CaseJudgeList)가 쓴다.
import { fitRoundModel, predictRound, roundsOf, type HitLike, type Round } from './bidPredict';

export const LB_PY = 3.305785;
/** 끝난 사건 — 진행 중 비교 무리에서 뺀다 */
export const LB_DONE = /낙찰|매각|취하|기각|종결|정지/;
/** 비슷한 물건 = 같은 동 · 같은 종류 · 전용면적 ±5%(시세분석 유사도 90% 와 같은 폭). 연식 · 층 · 엘베로는 거르지 않는다 — 영상처럼 면적만, 꼬이지 않게(2026-11-20 사용자) */
export const LB_AREA_PCT = 5;
/** 비슷한 물건이 이만큼 있어야 기준값을 낸다(모자라면 '비교 부족') */
export const LB_MIN_PEERS = 5;
/** 비교 무리 종류 — 빌라(다세대 · 연립 · 도시형생활주택)는 하나로, 아파트는 아파트끼리, 그 밖은 그 밖끼리(2026-11-20 사용자) */
export const lbKindGroup = (kind: string): 'villa' | 'apt' | 'etc' => (/아파트/.test(kind) ? 'apt' : /다세대|연립|도시형|도생|빌라/.test(kind) ? 'villa' : 'etc');
/** 가격매력 — 최저가 낙찰 차익률(차익 ÷ 최저가)이 30% 이상 + 매도가 근거가 단단할 때(매도가 2를 넣었거나 매도가 1 근거 2건 이상), 2026-11-20 사용자 */
export const LB_HOT_RATE = 0.3;
/** 실거래가 감정가의 90% 아래면 경고 */
export const LB_WARN = 0.9;
/** 실거래가와 감정가 — 높음(감정이 싸게 잡힘, 좋음) · 낮음(감정이 비싸게 잡힘) · 같음. 정확히 견준다(2026-11-20 사용자) */
/** 방향 표시 — 빨강 ▲ 높음 · 파랑 ▼ 낮음(시세표처럼, 2026-11-20 사용자) */
export const LB_REL_MARK: Record<string, string> = { 높음: '▲ ', 낮음: '▼ ', 같음: '', '': '' };
export const lbMktRel = (r: { appr: number; mkt: { price: number } | null }): '' | '높음' | '낮음' | '같음' =>
  !r.mkt ? '' : r.mkt.price > r.appr ? '높음' : r.mkt.price < r.appr ? '낮음' : '같음';

/** 주소에서 층(지하는 음수, 못 읽으면 null) */
export const lbFloorOf = (addr: string): number | null => { const m = /(지하|B)?\s*(\d+)층/.exec(addr); return m ? (m[1] ? -Number(m[2]) : Number(m[2])) : null; };
/** 지하 · 반지하(지층 · B1 포함) */
export const lbBasement = (addr: string): boolean => /반지하|지하|지층|\bB\d+\b|비\d+층/.test(addr.replace(/지하철|지하주차/g, '')) || (lbFloorOf(addr) ?? 0) < 0;
/** 저가매수에서 빼는 까닭 — 지하 · 반지하, 엘베 없는 5층 이상(사지 않음). 후보에서도 비교 무리에서도 뺀다(2026-11-20 사용자). '' = 안 뺌.
 *  엘베 있는 건물은 빼지 않는다 — 칸에 엘베 있음으로 보이고 판단은 사람이(같은 날 사용자) */
export const lbSkipWhy = (c: Pick<LowBuyCase, 'addr' | 'elev'>): '' | '지하 · 반지하' | '엘베 없는 5층 이상' =>
  lbBasement(c.addr) ? '지하 · 반지하' : c.elev === false && (lbFloorOf(c.addr) ?? 0) >= 5 ? '엘베 없는 5층 이상' : '';
export const lbSkip = (c: Pick<LowBuyCase, 'addr' | 'elev'>): boolean => lbSkipWhy(c) !== '';

export type LowBuyCase = {
  key: string; addr: string; kind: string; area: number; appr: number; min: number; fails: number; next: string; state: string;
  /** 신건일(1차 매각기일, 없으면 최초진행일) — '' 면 모름 */
  first: string;
  year: number | null; elev: boolean | null;
  /** 지번 열쇠 '검암동 676-1' — 실거래를 같은 건물로 묶는다 */
  lot: string;
};
/** 매매 실거래 한 줄(직거래 · 계약해제 뺀 것). year = 건축년도(없으면 undefined), group = 빌라 · 아파트(받은 자료 종류) */
export type LowBuyTrade = { date: string; price: number; area: number; lot: string; year?: number; group?: 'villa' | 'apt' | 'etc' };
/** 예상 매도가 1 — 계산값과 근거 */
export type LbEst = { price: number; how: '같은평형' | '같은건물' | '유사물건'; n: number; last: string };
/** 예상 매도가 2 — 사람이 알아본 값 · 고른 칸(1 · 2) */
export type LbSale2 = { p: number; use: 1 | 2 };
export type LowBuyMkt = { price: number; n: number; last: string };
export type LowBuyRow = LowBuyCase & {
  py: number; ppy: number; peerN: number; peerPpy: number | null;
  /** 평당 감정가 ÷ 비슷한 물건 가운데값 − 1 */
  vs: number | null;
  /** 비슷한 물건 평당 감정가 × 이 물건 평수 − 이 물건 감정가 */
  gain: number | null;
  /** 비슷한 물건 평당 감정가 × 이 물건 평수 − 지금 최저가 — 최저가로 사면 비슷한 물건 감정 수준보다 얼마 싼가(2026-11-20 사용자) */
  gainMin: number | null;
  /** 예상 매도가 1(계산값) 기준 가격매력 — 매도가 2를 넣으면 화면이 lbJudge 로 다시 본다 */
  hot: boolean;
  mkt: LowBuyMkt | null;
  /** 예상 매도가 1 — 같은 건물 같은 평형 → 같은 건물 다른 평형 → 같은 동 비슷한 물건 */
  est: LbEst | null;
  /** 응찰 확률(누가 한 명이라도 들어올 확률) — 낙찰가예측 회차 모델, 모르면 null */
  pBid: number | null;
};

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const monthsAdd = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };

/** 진행 중 — 끝나지 않았고 다음 기일이 오늘 이후, 전용 · 감정가가 있는 사건 */
export const isLiveCase = (c: { state: string; next: string; area: number | null; appr: number }, today: string) =>
  !LB_DONE.test(c.state) && c.next >= today && (c.area ?? 0) > 0 && c.appr > 0;

/** 같은 건물(지번) 같은 평형(전용 ±1㎡) 매매 — 신건일 앞 12개월 ~ 오늘. 가운데값 · 건수 · 마지막 날 */
export const sameUnitMkt = (trades: LowBuyTrade[], c: Pick<LowBuyCase, 'lot' | 'area' | 'first' | 'next'>, today: string): LowBuyMkt | null => {
  if (!c.lot) return null;
  const lo = monthsAdd(c.first || c.next, -12);
  const xs = trades.filter((t) => t.lot === c.lot && Math.abs(t.area - c.area) <= 1 && t.date >= lo && t.date <= today);
  if (!xs.length) return null;
  return { price: median(xs.map((t) => t.price)), n: xs.length, last: xs.map((t) => t.date).sort().pop()! };
};

/** 예상 매도가 1 — 메모리 '경매지번 실거래가' 순서(2026-11-20 사용자 시안):
 *  ① 같은 건물(지번) 같은 평형(전용 ±1㎡) 매매 중앙값 ② 같은 건물 다른 평형 평당 중앙값 × 이 물건 평수
 *  ③ 같은 동 같은 종류 최근 1년 · 전용 ±10% · 연식 ±5년(모르면 안 봄) 평당 평균 × 평수. 셋 다 없으면 null */
export const estSale = (trades: LowBuyTrade[] | null, c: Pick<LowBuyCase, 'lot' | 'area' | 'kind' | 'year'>, today: string): LbEst | null => {
  if (!trades || !(c.area > 0)) return null;
  const py = c.area / LB_PY;
  const lastOf = (xs: LowBuyTrade[]) => xs.map((t) => t.date).sort().pop() ?? '';
  const bt = c.lot ? trades.filter((t) => t.lot === c.lot && t.date <= today) : [];
  const same = bt.filter((t) => Math.abs(t.area - c.area) <= 1);
  if (same.length) return { price: median(same.map((t) => t.price)), how: '같은평형', n: same.length, last: lastOf(same) };
  if (bt.length) return { price: median(bt.map((t) => t.price / (t.area / LB_PY))) * py, how: '같은건물', n: bt.length, last: lastOf(bt) };
  const g = lbKindGroup(c.kind); const lo = monthsAdd(today, -12);
  const sim = trades.filter((t) => (!t.group || t.group === g) && t.date >= lo && t.date <= today && Math.abs(t.area - c.area) <= c.area * 0.1
    && (c.year == null || t.year == null || Math.abs(t.year - c.year) <= 5));
  if (!sim.length) return null;
  return { price: (sim.reduce((a, t) => a + t.price / (t.area / LB_PY), 0) / sim.length) * py, how: '유사물건', n: sim.length, last: '' };
};

/** 판단 — 고른 매도가(2를 골랐고 값이 있으면 2, 아니면 1) − 지금 최저가. 가격매력은 차익률 30% 이상 + (매도가 2 · 매도가 1 근거 2건 이상) */
export const lbJudge = (est: LbEst | null, min: number, s2?: LbSale2 | null) => {
  const use2 = !!s2 && s2.use === 2 && s2.p > 0;
  const sale = use2 ? s2!.p : est?.price ?? null;
  const gap = sale != null && min > 0 ? sale - min : null;
  const rate = gap != null ? gap / min : null;
  const firm = use2 || (!!est && est.n >= 2);
  return { use2, sale, gap, rate, weak: !use2 && !!est && est.n < 2, hot: rate != null && rate >= LB_HOT_RATE && firm };
};

/** 진행 중 사건 전부 → 줄마다 비슷한 물건 비교 · 예상 매도가 1 · 응찰 확률. trades 가 null 이면 실거래 칸만 비운다 */
export const lowBuyRows = (live: LowBuyCase[], trades: LowBuyTrade[] | null, today: string, pBids?: Map<string, number>): LowBuyRow[] => {
  const base = live.filter((c) => !lbSkip(c)).map((c) => { const py = c.area / LB_PY; return { ...c, py, ppy: c.appr / py }; });
  return base.map((r) => {
    const g = lbKindGroup(r.kind);
    const peers = base.filter((x) => x !== r && lbKindGroup(x.kind) === g && Math.abs(x.area - r.area) <= r.area * LB_AREA_PCT / 100);
    const peerPpy = peers.length >= LB_MIN_PEERS ? median(peers.map((x) => x.ppy)) : null;
    const vs = peerPpy ? r.ppy / peerPpy - 1 : null;
    const est = estSale(trades, r, today);
    return { ...r, peerN: peers.length, peerPpy, vs, gain: peerPpy ? peerPpy * r.py - r.appr : null, gainMin: peerPpy && r.min > 0 ? peerPpy * r.py - r.min : null,
      hot: lbJudge(est, r.min).hot, mkt: trades ? sameUnitMkt(trades, r, today) : null, est, pBid: pBids?.get(r.key) ?? null };
  });
};

/** 응찰 확률 — 낙찰가예측과 같은 회차 모델(유효조회수 · 덧붙임 없이, BidPredictTest sellMap 과 같은 길).
 *  다가오는 기일은 조회수를 기일 며칠 앞까지만 모았으므로(lead) 배울 때도 같은 날수 앞 값으로 맞춘다 — 같은 lead 끼리 한 번만 배운다.
 *  모델을 못 배우면(회차 30 · 매각 10 미만) 그 사건은 빠진다 */
export const lbSellProb = (hits: HitLike[], keys: Set<string>, today: string): Map<string, number> => {
  const out = new Map<string, number>();
  const eff = hits.map((h) => ({ ...h, hc: h.he }));
  const dayGap = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
  const upcoming = (rs: Round[]) => rs.find((r) => r.result === 'none' && r.date >= today);
  const byLead = new Map<number, typeof eff>();
  eff.forEach((h) => {
    if (!keys.has(h.key)) return;
    const r0 = upcoming(roundsOf(h)); if (!r0) return;
    const lead = r0.upTo ? Math.max(0, dayGap(r0.upTo, r0.date) - 1) : 0;
    const g = byLead.get(lead); if (g) g.push(h); else byLead.set(lead, [h]);
  });
  byLead.forEach((hs, lead) => {
    const m = fitRoundModel(eff.flatMap((h) => roundsOf(h, undefined, lead)), today); if (!m) return;
    hs.forEach((h) => { const r = upcoming(roundsOf(h, undefined, lead)); if (r) out.set(h.key, predictRound(m, r).pSold); });
  });
  return out;
};
