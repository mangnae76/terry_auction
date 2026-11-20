// 저가매수 — 1회 유찰 물건을 같은 동 진행 중 물건끼리 평당 감정가로 견준다(2026-11-20 사용자).
// 영상(6:23~) '19평이 감정가 1억 4천인데 16평이 1억 5,500 — 감정이 싸게 잡힌 걸 한 번 유찰됐을 때 노려라'를 숫자로.
// 검암동 시험(25.01~ 매각, 실거래 붙은 142건): 1회 유찰 중 감정가가 실거래보다 낮은 무리는 실거래 − 낙찰가 4,778만,
// 감정가 ≥ 115% 무리는 1,664만. 화면(Vue) · DB 를 모르는 순수 계산 — 웹 저가매수 탭이 쓴다.

export const LB_PY = 3.305785;
/** 끝난 사건 — 진행 중 비교 무리에서 뺀다 */
export const LB_DONE = /낙찰|매각|취하|기각|종결|정지/;
/** 비슷한 물건 = 같은 동 · 같은 종류 · 전용면적 ±5%(시세분석 유사도 90% 와 같은 폭). 연식 · 층 · 엘베로는 거르지 않는다 — 영상처럼 면적만, 꼬이지 않게(2026-11-20 사용자) */
export const LB_AREA_PCT = 5;
/** 비슷한 물건이 이만큼 있어야 기준값을 낸다(모자라면 '비교 부족') */
export const LB_MIN_PEERS = 5;
/** 비교 무리 종류 — 빌라(다세대 · 연립 · 도시형생활주택)는 하나로, 아파트는 아파트끼리, 그 밖은 그 밖끼리(2026-11-20 사용자) */
export const lbKindGroup = (kind: string): 'villa' | 'apt' | 'etc' => (/아파트/.test(kind) ? 'apt' : /다세대|연립|도시형|도생|빌라/.test(kind) ? 'villa' : 'etc');
/** 가격매력 — 평당 감정가가 비슷한 물건보다 10% 이상 낮음 */
export const LB_HOT = -0.1;
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
/** 매매 실거래 한 줄(직거래 · 계약해제 뺀 것) */
export type LowBuyTrade = { date: string; price: number; area: number; lot: string };
export type LowBuyMkt = { price: number; n: number; last: string };
export type LowBuyRow = LowBuyCase & {
  py: number; ppy: number; peerN: number; peerPpy: number | null;
  /** 평당 감정가 ÷ 비슷한 물건 가운데값 − 1 */
  vs: number | null;
  /** 비슷한 물건 평당 감정가 × 이 물건 평수 − 이 물건 감정가 */
  gain: number | null;
  /** 비슷한 물건 평당 감정가 × 이 물건 평수 − 지금 최저가 — 최저가로 사면 비슷한 물건 감정 수준보다 얼마 싼가(2026-11-20 사용자) */
  gainMin: number | null;
  hot: boolean;
  mkt: LowBuyMkt | null;
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

/** 진행 중 사건 전부 → 줄마다 비슷한 물건 비교. trades 가 null 이면 실거래 칸만 비운다 */
export const lowBuyRows = (live: LowBuyCase[], trades: LowBuyTrade[] | null, today: string): LowBuyRow[] => {
  const base = live.filter((c) => !lbSkip(c)).map((c) => { const py = c.area / LB_PY; return { ...c, py, ppy: c.appr / py }; });
  return base.map((r) => {
    const g = lbKindGroup(r.kind);
    const peers = base.filter((x) => x !== r && lbKindGroup(x.kind) === g && Math.abs(x.area - r.area) <= r.area * LB_AREA_PCT / 100);
    const peerPpy = peers.length >= LB_MIN_PEERS ? median(peers.map((x) => x.ppy)) : null;
    const vs = peerPpy ? r.ppy / peerPpy - 1 : null;
    return { ...r, peerN: peers.length, peerPpy, vs, gain: peerPpy ? peerPpy * r.py - r.appr : null, gainMin: peerPpy && r.min > 0 ? peerPpy * r.py - r.min : null, hot: vs != null && vs <= LB_HOT, mkt: trades ? sameUnitMkt(trades, r, today) : null };
  });
};
