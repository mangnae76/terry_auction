import { describe, expect, it } from 'vitest';
import { floorOfHo, pickCaseTrade, type CaseTradeRow } from './caseTradeAnalysis';

const row = (kind: CaseTradeRow['kind'], contractDate: string, areaM2: number, floor: string, price = 200_000_000): CaseTradeRow =>
  ({ kind, contractDate, amount: '', price, areaM2, floor, umdNm: '', name: '', jibun: '' }) as CaseTradeRow;

describe('caseTradeAnalysis', () => {
  it('floorOfHo — 호수 앞자리가 층', () => {
    expect(floorOfHo('402')).toBe(4);
    expect(floorOfHo('1203')).toBe(12);
    expect(floorOfHo('01')).toBe(0);
    expect(floorOfHo('')).toBe(0);
  });
  it('1순위 같은 평형 · 같은 층 → 2순위 같은 평형 최근 → 3순위 가까운 평형 최근', () => {
    const sameFloorOld = row('매매', '2024.03.10', 49.74, '4');
    const otherFloorNew = row('매매', '2026.05.01', 49.76, '2');
    const nearArea = row('매매', '2026.09.01', 52.1, '4');
    expect(pickCaseTrade([sameFloorOld, otherFloorNew, nearArea], ['매매'], 49.74, 4)).toBe(sameFloorOld);
    expect(pickCaseTrade([otherFloorNew, nearArea], ['매매'], 49.74, 4)).toBe(otherFloorNew);
    expect(pickCaseTrade([nearArea, row('매매', '2025.01.01', 60, '4')], ['매매'], 49.74, 4)).toBe(nearArea);
  });
  it('같은 평형 · 같은 층이 여럿이면 가장 최근', () => {
    const a = row('전세', '2025.02.01', 49.74, '4');
    const b = row('전세', '2026.02.01', 49.74, '4');
    expect(pickCaseTrade([a, b, row('전세', '2026.10.01', 49.74, '3')], ['전세'], 49.74, 4)).toBe(b);
  });
  it('층을 안 넘기면(앱) 예전처럼 같은 평형 최근', () => {
    const sameFloorOld = row('매매', '2024.03.10', 49.74, '4');
    const otherFloorNew = row('매매', '2026.05.01', 49.74, '2');
    expect(pickCaseTrade([sameFloorOld, otherFloorNew], ['매매'], 49.74)).toBe(otherFloorNew);
  });
});
