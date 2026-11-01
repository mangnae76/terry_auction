import { describe, expect, it } from 'vitest';
import { avgUnitPriceOf, clampCircle, dongQuadrantModel, medianOf, PYEONG_M2, unitPriceOf } from './dongQuadrant';

type K = '정상거래' | '직거래' | '계약해제';
const row = (umdNm: string, priceWon: number, areaM2: number, kind: K = '정상거래') => ({ umdNm, priceWon, areaM2, kind });

describe('지역분석 평당가 · 동 사분면 한 셈', () => {
  it('평당가 = 금액 ÷ 전용㎡ × 3.305785, 값 없는 거래는 0', () => {
    expect(unitPriceOf({ priceWon: 100_000_000, areaM2: PYEONG_M2 * 20 })).toBeCloseTo(5_000_000);
    expect(unitPriceOf({ priceWon: 0, areaM2: 30 })).toBe(0);
    expect(unitPriceOf({ priceWon: 1, areaM2: 0 })).toBe(0);
  });

  it('평균 평당가는 정상거래만 — 직거래 · 해제가 섞여도 요약 평 단가와 같은 값(BUG-0028)', () => {
    const rows = [
      row('가동', 100_000_000, PYEONG_M2 * 20),    // 500만
      row('가동', 120_000_000, PYEONG_M2 * 20),    // 600만
      row('나동', 40_000_000, PYEONG_M2 * 20, '직거래'),  // 200만 — 빠져야 한다
      row('나동', 300_000_000, PYEONG_M2 * 20, '계약해제'),
    ];
    expect(avgUnitPriceOf(rows)).toBeCloseTo(5_500_000);
    expect(dongQuadrantModel(rows).guUnit).toBeCloseTo(avgUnitPriceOf(rows));
  });

  it('직거래만 있는 동은 찍지 않고, 건수는 정상 + 직거래(해제 제외)(BUG-0017)', () => {
    const m = dongQuadrantModel([
      row('가동', 100_000_000, PYEONG_M2 * 20),
      row('가동', 100_000_000, PYEONG_M2 * 20, '직거래'),
      row('가동', 100_000_000, PYEONG_M2 * 20, '계약해제'),
      row('북성동1가', 90_000_000, PYEONG_M2 * 20, '직거래'),
      row('북성동1가', 80_000_000, PYEONG_M2 * 20, '직거래'),
    ]);
    expect(m.dongs.map((d) => d.name)).toEqual(['가동']);
    expect(m.dongs[0].n).toBe(2);
    expect(m.avgN).toBe(2);
  });

  it('사분면 칸 — 건수 · 평당가를 평균과 견준다', () => {
    const m = dongQuadrantModel([
      row('가', 200_000_000, PYEONG_M2 * 20), row('가', 200_000_000, PYEONG_M2 * 20), row('가', 200_000_000, PYEONG_M2 * 20),
      row('나', 100_000_000, PYEONG_M2 * 20),
    ]);
    const q = Object.fromEntries(m.dongs.map((d) => [d.name, d.q]));
    expect(q).toEqual({ 가: 1, 나: 4 });
  });

  it('중간값 — 짝수면 가운데 둘의 평균(동별 표 중간가와 같다)', () => {
    expect(medianOf([3, 1, 2])).toBe(2);
    expect(medianOf([4, 1, 3, 2])).toBe(2.5);
    expect(medianOf([])).toBe(0);
  });

  it('원은 그림 칸 안으로 — 왼쪽 끝 원이 세로축 글자 쪽으로 나가지 않는다(BUG-0019)', () => {
    const box = { l: 72, r: 600, t: 30, b: 470 };
    expect(clampCircle(60, 200, 30, box)).toEqual({ x: 102, y: 200 });
    expect(clampCircle(590, 20, 30, box)).toEqual({ x: 570, y: 60 });
    expect(clampCircle(300, 480, 30, box)).toEqual({ x: 300, y: 440 });
    // 위에 이름을 다는 작은 원은 이름 줄만큼 더 아래로
    expect(clampCircle(300, 30, 12, box, 18)).toEqual({ x: 300, y: 60 });
  });
});
