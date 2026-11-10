import { describe, expect, it } from 'vitest';
import { areaUnitsOf, groupBySupply, myGroupOf, sameExclusiveCountOf, supplyRowsOf, type ComplexAreas } from './complexAreas';

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
  it('해당 세대수 — 내 호실과 전용면적이 같은 세대(네이버 25평 123세대와 같다)', () => {
    expect(myGroupOf(areas)?.count).toBe(122);
    expect(sameExclusiveCountOf(areas)).toBe(123);
    expect(sameExclusiveCountOf({ ...areas, mine: null })).toBe(0);
  });
  it('정보요약 — 예전 자동값(122)은 바꾸고, 사람이 적은 값은 지킨다', () => {
    expect(areaUnitsOf(areas, '122', '')).toBe('123');
    expect(areaUnitsOf(areas, '', '')).toBe('123');
    expect(areaUnitsOf(areas, '100', '')).toBe('100');
  });
  it('면적종류 줄 — 전용면적으로 묶고 공급은 범위로, 내 호실 표시', () => {
    expect(supplyRowsOf(areas).map((r) => `${r.text} ${r.count}${r.mine ? '*' : ''}`)).toEqual([
      '전용 59.99㎡ · 공급 83.18~83.21㎡ 123*', '전용 84.67㎡ · 공급 115.77~115.96㎡ 539',
    ]);
  });
});
