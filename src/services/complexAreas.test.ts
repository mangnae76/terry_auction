import { describe, expect, it } from 'vitest';
import { groupBySupply, myGroupOf, supplyRowsOf, type ComplexAreas } from './complexAreas';

// 2026타경50132 안산파크푸르지오 — 건축물대장 전유공용면적(2026-11-10). 같은 전용 59.99 안에서도 공급이 83.18 · 83.21 로 갈린다
const supplies = [
  ...Array.from({ length: 122 }, (_, i) => ({ dong: '101동', ho: String(2301 + i), exclusive: 59.99, supply: 83.18 })),
  { dong: '102동', ho: '101', exclusive: 59.99, supply: 83.21 },
  ...Array.from({ length: 407 }, (_, i) => ({ dong: '103동', ho: String(100 + i), exclusive: 84.67, supply: 115.77 })),
  ...Array.from({ length: 132 }, (_, i) => ({ dong: '104동', ho: String(100 + i), exclusive: 84.67, supply: 115.96 })),
];
const areas: ComplexAreas = { groups: groupBySupply(supplies), total: supplies.length, mine: { exclusive: 59.99, supply: 83.18 } };

describe('complexAreas', () => {
  it('공급면적이 같은 호실끼리만 센다 — 타입 · 평형으로 묶지 않는다', () => {
    expect(areas.groups.map((g) => `${g.supply.toFixed(2)}:${g.count}`)).toEqual(['83.18:122', '83.21:1', '115.77:407', '115.96:132']);
  });
  it('해당면적 세대수 — 내 호실과 공급이 같은 호실 수', () => {
    expect(myGroupOf(areas)?.count).toBe(122);
    expect(myGroupOf({ ...areas, mine: null })).toBeNull();
  });
  it('면적종류 줄 — 공급㎡(평) · 내 호실', () => {
    expect(supplyRowsOf(areas).map((r) => `${r.text} ${r.count}${r.mine ? '*' : ''}`)).toEqual([
      '83.18㎡(25.16평) 122*', '83.21㎡(25.17평) 1', '115.77㎡(35.02평) 407', '115.96㎡(35.08평) 132',
    ]);
  });
});
