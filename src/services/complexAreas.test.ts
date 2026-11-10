import { describe, expect, it } from 'vitest';
import { areaTypeRowsOf, myGroupOf, type ComplexAreas } from './complexAreas';

// 2026타경50132 안산파크푸르지오 — 공동주택가격(2026) 전용별 호실 수 + 건축물대장 공급(전용 + 주건축물 공용)
const areas: ComplexAreas = {
  total: 1129,
  mine: { exclusive: 59.99, supply: 83.18 },
  groups: [
    { exclusive: 59.99, supply: 83.18, count: 123 },
    { exclusive: 73.94, supply: 102.47, count: 246 },
    { exclusive: 84.53, supply: 116.23, count: 132 },
    { exclusive: 84.56, supply: 114.84, count: 56 },
    { exclusive: 84.67, supply: 115.77, count: 539 },
    { exclusive: 101.98, supply: 138.8, count: 33 },
  ],
};

describe('complexAreas', () => {
  it('내 평형 세대수', () => {
    expect(myGroupOf(areas, 59.98)?.count).toBe(123);
  });
  it('면적 종류 — 평형마다 세대수, 같은 숫자 평형은 묶는다', () => {
    const rows = areaTypeRowsOf('83㎡, 102㎡, 114D㎡, 115A㎡, 115B㎡, 116C㎡, 138㎡', areas, 59.98);
    expect(rows.map((r) => `${r.text}:${r.count}${r.mine ? '*' : ''}`)).toEqual([
      '83㎡:123*', '102㎡:246', '114D㎡:56', '115A㎡·115B㎡:539', '116C㎡:132', '138㎡:33',
    ]);
  });
});
