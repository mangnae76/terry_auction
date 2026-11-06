import { describe, expect, it } from 'vitest';
import { distM, estStats, inRange, jeonseEstimate, matchUnit, PY, r4, simCond, simDefText, visitOrder, type PriceRow } from './priceAnalysis';

const row = (p: Partial<PriceRow>): PriceRow => ({
  id: String(Math.random()), kind: '매매', group: '매매', contractDate: '2026.10.01', amount: '', price: 200_000_000, areaM2: 66, floor: '4',
  umdNm: '검암동', name: '', jibun: '1', buildYear: 2018, dist: 100, same: false, pub: 0, ho: '', perPy: 10_000_000, floorNo: 4, ...p,
});

describe('priceAnalysis', () => {
  it('유사도 80% = 면적 ±10% · 건축 ±5년 · 층 ±1', () => {
    expect(simCond(80, { areaM2: 66.99, year: 2018, floor: 5 })).toEqual({ mMin: 60, mMax: 74, yMin: 2013, yMax: 2023, floor: 1 });
    expect(simDefText(80)).toBe('면적 ±10% · 건축 ±5년 · 층 ±1');
    expect(simDefText(60)).toBe('면적 ±20% · 건축 ±10년 · 층 안 봄');
  });
  it('같은 건물은 반경 · 조건과 상관없이 넣고 맨 앞', () => {
    const c = simCond(80, { areaM2: 66, year: 2018, floor: 4 });
    const same = row({ same: true, dist: null, areaM2: 40, buildYear: 1990, floorNo: 9 });
    const near = row({ dist: 50 });
    const far = row({ dist: 900 });
    const odd = row({ dist: 50, areaM2: 90 });
    expect(inRange([far, near, odd, same], 500, c, 4)).toEqual([same, near]);
  });
  it('실거래가 예상 = 평당가 평균 × 선정물건 평, 만원 단위는 셈한 뒤에', () => {
    const myPy = 66.99 / PY;
    const s = estStats([row({ perPy: 10_645_574 }), row({ perPy: 10_645_574 })], myPy)!;
    expect(s.est).toBe(r4(10_645_574 * myPy));
    expect(s.avgPy).toBe(10_650_000);
    expect(estStats([], myPy)).toBeNull();
  });
  it('전세 예상은 보증보험 한도를 넘지 않는다', () => {
    const j = { n: 2, est: 180_000_000, med: 0, min: 0, max: 0, avgPy: 0 };
    expect(jeonseEstimate(j, 131_000_000)).toMatchObject({ est: 165_060_000, capped: true, market: 180_000_000 });
    expect(jeonseEstimate(null, 100_000_000)).toMatchObject({ est: 126_000_000, n: 0 });
    expect(jeonseEstimate(null, 0)).toBeNull();
  });
  it('공시가 호실 — 같은 층 · 같은 면적, 하나뿐일 때만 호수', () => {
    const u = (ho: string, areaM2: number, price: number) => ({ dong: '', ho, areaM2, price, year: '2026' });
    expect(matchUnit([u('402', 66.99, 131e6), u('302', 66.99, 129e6)], 66.99, 4)).toEqual({ pub: 131e6, ho: '402호' });
    expect(matchUnit([u('401', 66.99, 130e6), u('402', 66.99, 132e6)], 66.99, 4)).toEqual({ pub: 131e6, ho: '' });
    expect(matchUnit([u('402', 70, 131e6)], 66.99, 4)).toEqual({ pub: 0, ho: '' });
  });
  it('임장 순서 — 현장에서 가까운 곳부터, 꼬인 길은 풀어 전체 거리가 짧다', () => {
    const at = (x: number, y: number, id: string) => ({ id, lat: 37.5 + y / 111000, lng: 126.7 + x / 88000 });
    const start = at(0, 0, 's');
    const pts = [at(300, 0, 'c'), at(100, 0, 'a'), at(200, 10, 'b'), at(-50, 0, 'z')];
    const order = visitOrder(start, pts).map((p) => p.id);
    expect(order[0]).toBe('z');
    expect(order.slice(1)).toEqual(['a', 'b', 'c']);
    const len = (ps: typeof pts) => ps.reduce((t, p, i) => t + distM(i ? ps[i - 1] : start, p), 0);
    expect(len(visitOrder(start, pts))).toBeLessThanOrEqual(len(pts));
  });
});
