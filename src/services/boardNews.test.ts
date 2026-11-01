import { describe, expect, it } from 'vitest';
import { periodEndDay, periodEnded } from './boardNews';

describe('periodEndDay — 기간 글의 끝날', () => {
  it('끝에 해가 없으면 시작 해를 쓴다', () => {
    expect(periodEndDay('2026.10.01 ~ 10.31')).toBe('2026-10-31');
  });
  it('해를 넘기는 기간', () => {
    expect(periodEndDay('2026.12.20 ~ 01.10')).toBe('2027-01-10');
    expect(periodEndDay('2026.12.20 ~ 2027.01.10')).toBe('2027-01-10');
  });
  it('까지 · 부터 · 상시', () => {
    expect(periodEndDay('2026.10.31 까지')).toBe('2026-10-31');
    expect(periodEndDay('2026.10.01 부터')).toBe('');
    expect(periodEndDay('상시')).toBe('');
  });
});

describe('periodEnded — 끝난 이벤트 배너 내리기(BUG-0031)', () => {
  it('끝날 당일까지는 보이고 다음 날부터 내린다', () => {
    expect(periodEnded('2026.10.01 ~ 10.31', '2026-10-31T23:59')).toBe(false);
    expect(periodEnded('2026.10.01 ~ 10.31', '2026-11-01T00:00')).toBe(true);
  });
  it('끝을 모르면 내리지 않는다', () => {
    expect(periodEnded('상시', '2030-01-01T00:00')).toBe(false);
    expect(periodEnded(undefined, '2030-01-01T00:00')).toBe(false);
  });
});
