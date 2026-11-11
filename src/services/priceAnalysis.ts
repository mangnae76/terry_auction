// 손품조사 › 가격분석 — 반경 · 유사도로 고른 근처 거래로 「실거래가 예상」을 낸다.
//
// 실거래가 예상 = 유사 매매 평당가 평균 × 선정물건 전용평. 중간값 · 최저 · 최고도 거래마다 선정물건 크기로 바꾼 값.
// 같은 건물(경매지번) 거래는 반경 · 유사 조건과 상관없이 늘 넣는다.
// 화면이 아니라 여기에 둔 까닭: 셈은 시험으로 지키고, 화면(SonpumPricePage)은 그리기만 한다.
import type { CaseTradeRow } from './caseTradeAnalysis';
import type { ApartUnit } from './vworldApi';

export const PY = 3.305785;
/** 보증보험 전세 한도 — 공동주택가 × 126% */
export const HUG_RATE = 1.26;
/** 시세분석 → 선정물건 호실 예상가(손품조사, 2026-11-11 사용자 시안) — 표에서 고른 거래로 낸 예상가와 그 거래들 */
export type SonPriceOut = {
  kind: '매매' | '전세' | '월세';
  est: number;
  n: number;
  /** 층 단추 '같은 층' — 층은 이미 기준가에 담겨 단지 내 개별성의 층 보정을 0 으로 */
  sameFloor: boolean;
  /** 다른 단지 거래가 섞였나 — 섞이면 구역 내 개별성을 열어 보정 */
  other: boolean;
  rows: Array<{ same: boolean; name: string; dong?: string; floorNo: number; price: number; areaM2: number }>;
};
export const RADII = [100, 300, 500, 1000] as const;
export const PERIODS = [3, 6, 12, 24] as const;   // 3년은 뺐다(2026-11-02)
export const radText = (m: number) => (m >= 1000 ? `${m / 1000}km` : `${m}m`);
export const periodText = (m: number) => (m % 12 === 0 ? `${m / 12}년` : `${m}개월`);

/** 유사도 단계 — 면적 ±% · 건축 ±년 · 층 ±(0 = 일치, null = 안 봄). 참고 웹에서 확인한 값, 75 · 65 는 사이값 */
export const SIM_TABLE: Record<number, [number, number, number | null]> = {
  95: [2, 1, 0], 90: [5, 2, 0], 85: [8, 3, 1], 80: [10, 5, 1], 75: [12, 6, 1], 70: [15, 8, 2], 65: [18, 9, 2], 60: [20, 10, null],
};
export const SIM_STEPS = [60, 65, 70, 75, 80, 85, 90, 95];

/** 유사 조건 — 면적(㎡) 범위 · 건축년 범위 · 층(null = 안 봄, n = ±n층) */
/** elev — 웹 직접범위의 엘베 고르기(있음 · 없음). 엘베를 아직 모르는 줄은 거르지 않는다 */
export type PriceCond = { mMin: number; mMax: number; yMin: number; yMax: number; floor: number | null; elev?: 'yes' | 'no' | null };
export type Subject = { areaM2: number; year: number; floor: number };

export const simCond = (sim: number, me: Subject): PriceCond => {
  const [a, y, f] = SIM_TABLE[sim] ?? SIM_TABLE[80];
  return {
    mMin: Math.round(me.areaM2 * (1 - a / 100)), mMax: Math.round(me.areaM2 * (1 + a / 100)),
    yMin: me.year - y, yMax: me.year + y, floor: f,
  };
};
export const simDefText = (sim: number) => {
  const [a, y, f] = SIM_TABLE[sim] ?? SIM_TABLE[80];
  return `면적 ±${a}% · 건축 ±${y}년 · ${f === null ? '층 안 봄' : f === 0 ? '층 일치' : `층 ±${f}`}`;
};

/** 화면 한 줄 — 국토부 거래 + 거리 · 공시가 · 호수 · 엘베 */
export interface PriceRow extends CaseTradeRow {
  id: string;
  /** 거래 종류 묶음 — 직거래도 매매 */
  group: '매매' | '전세' | '월세';
  /** 선정물건에서 m. 좌표를 못 찾으면 null */
  dist: number | null;
  /** 같은 건물(경매지번) */
  same: boolean;
  /** 같은 층 · 같은 면적 호실의 공동주택가 — 못 찾으면 0 */
  pub: number;
  /** 같은 층 · 같은 면적 호실이 하나뿐일 때만 */
  ho: string;
  /** 승강기 수 — undefined 아직 모름, null 대장 조회 실패 */
  elev?: number | null;
  /** 매매 · 전세는 금액 ÷ 평, 월세는 월세 ÷ 평 */
  perPy: number;
  floorNo: number;
}

export const groupOf = (k: CaseTradeRow['kind']): PriceRow['group'] | null => (
  k === '매매' || k === '직거래' ? '매매' : k === '전세' ? '전세' : k === '월세' ? '월세' : null
);
export const floorNum = (f: string) => Number(String(f ?? '').replace(/[^\d-]/g, '')) || 0;
export const r4 = (w: number) => Math.round(w / 1e4) * 1e4;
export const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y); const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

/** 공시가 · 호수 — 그 지번 호실 중 같은 층 · 같은 면적(±0.05㎡). 호수는 하나뿐일 때만, 공시가는 여럿이면 가운데 값 */
export const matchUnit = (units: ApartUnit[], areaM2: number, floor: number): { pub: number; ho: string } => {
  const hit = units.filter((u) => Math.abs(u.areaM2 - areaM2) < 0.05 && Math.floor(Number(u.ho.replace(/\D/g, '')) / 100) === floor);
  if (!hit.length) return { pub: 0, ho: '' };
  return { pub: Math.round(median(hit.map((u) => u.price))), ho: hit.length === 1 ? `${hit[0].ho.replace(/\D/g, '')}호` : '' };
};

export const matchCond = (r: PriceRow, c: PriceCond, myFloor: number) => (
  r.areaM2 >= c.mMin && r.areaM2 <= c.mMax
  && (r.buildYear ?? 0) >= c.yMin && (r.buildYear ?? 0) <= c.yMax
  && (c.floor === null || !myFloor || Math.abs(r.floorNo - myFloor) <= c.floor)
  && (!c.elev || r.elev == null || (c.elev === 'yes' ? r.elev > 0 : r.elev === 0))
);

/** 반경 · 유사 조건에 드는 줄 — 같은 건물은 늘. 같은 건물 → 가까운 순 → 최근 순 */
export const inRange = (rows: PriceRow[], radius: number, c: PriceCond, myFloor: number) => rows
  .filter((r) => r.same || (r.dist !== null && r.dist <= radius && matchCond(r, c, myFloor)))
  .sort((a, b) => (Number(b.same) - Number(a.same)) || ((a.dist ?? 0) - (b.dist ?? 0)) || b.contractDate.localeCompare(a.contractDate));

export type EstStats = { n: number; est: number; med: number; min: number; max: number; avgPy: number };
/** 띠의 숫자 — 모두 선정물건 크기라면. 반올림(만원)은 다 셈한 뒤에 */
export const estStats = (rows: PriceRow[], myPy: number): EstStats | null => {
  if (!rows.length || myPy <= 0) return null;
  const mine = rows.map((r) => r.perPy * myPy);
  const avgPy = rows.reduce((t, r) => t + r.perPy, 0) / rows.length;
  return { n: rows.length, est: r4(avgPy * myPy), med: r4(median(mine)), min: r4(Math.min(...mine)), max: r4(Math.max(...mine)), avgPy: r4(avgPy) };
};

/** 실거래가 예상(전세) = min(유사 전세 예상, 보증보험 한도). 전세 거래가 없으면 한도만 */
export const jeonseEstimate = (j: EstStats | null, pub: number) => {
  const hug = pub * HUG_RATE;
  if (!j && !hug) return null;
  if (!j) return { est: hug, capped: true, n: 0, market: 0, avgPy: 0 };
  return { est: hug ? Math.min(j.est, hug) : j.est, capped: !!hug && j.est > hug, n: j.n, market: j.est, avgPy: j.avgPy };
};

/** 두 점 사이 m (구면 근사) */
export const distM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000; const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad; const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
};

/**
 * 현장(선정물건)에서 출발해 유사물건을 도는 순서 — 임장 동선. 가까운 곳부터 고른 뒤(가장 가까운 이웃),
 * 길이 꼬인 곳을 풀어(2-opt) 전체 거리를 줄인다. 직선거리 기준. 돌아오는 길은 셈하지 않는다.
 */
export const visitOrder = <T extends { lat: number; lng: number }>(start: { lat: number; lng: number }, points: T[]): T[] => {
  const left = [...points];
  const path: T[] = [];
  let at: { lat: number; lng: number } = start;
  while (left.length) {
    let bi = 0;
    left.forEach((p, i) => { if (distM(at, p) < distM(at, left[bi])) bi = i; });
    at = left[bi]; path.push(left[bi]); left.splice(bi, 1);
  }
  const node = (i: number) => (i < 0 ? start : path[i]);
  for (let improved = true, guard = 0; improved && guard < 50; guard += 1) {
    improved = false;
    for (let i = 0; i < path.length - 1; i += 1) {
      for (let k = i + 1; k < path.length; k += 1) {
        // i..k 구간을 뒤집으면 짧아지나 — 앞 연결(i-1→i)과 뒤 연결(k→k+1)만 바뀐다
        const before = distM(node(i - 1), path[i]) + (k + 1 < path.length ? distM(path[k], path[k + 1]) : 0);
        const after = distM(node(i - 1), path[k]) + (k + 1 < path.length ? distM(path[i], path[k + 1]) : 0);
        if (after + 0.5 < before) { path.splice(i, k - i + 1, ...path.slice(i, k + 1).reverse()); improved = true; }
      }
    }
  }
  return path;
};
