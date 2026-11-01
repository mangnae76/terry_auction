import { describe, expect, it } from 'vitest';
import { demandGradeOf, tallyDongUnits } from './demandGrade';

describe('수요분석 세대수 받기 상태', () => {
  it('받는 중인 동이 있으면 합은 일부 — ready 가 아니다(BUG-0014)', () => {
    const t = tallyDongUnits([1475, undefined, 0, undefined]);
    expect(t).toEqual({ total: 1475, count: 4, done: 2, pending: 2, failed: 0, ready: false });
  });
  it('못 받은 동(-1)이 있어도 ready 가 아니고, 합에 넣지 않는다', () => {
    const t = tallyDongUnits([100, -1, 200]);
    expect(t.total).toBe(300);
    expect(t.failed).toBe(1);
    expect(t.ready).toBe(false);
  });
  it('다 받으면 ready — 0(없음)도 받은 값', () => {
    const t = tallyDongUnits([100, 0, 50]);
    expect(t).toEqual({ total: 150, count: 3, done: 3, pending: 0, failed: 0, ready: true });
    expect(tallyDongUnits([]).ready).toBe(true);
  });
  it('세대수가 준비되지 않으면 회전율 등급은 매기지 않는다', () => {
    expect(demandGradeOf('turnover', false, 5.8)).toBe('-');
    expect(demandGradeOf('turnover', true, 5.8)).toBe('A');
  });
});
