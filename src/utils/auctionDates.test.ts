import { describe, expect, it } from 'vitest';
import { balanceDueError, balanceDueOf, koreanYmd, wonDateError } from './auctionDates';

describe('auctionDates', () => {
  it('koreanYmd — 26년 11월 10일', () => {
    expect(koreanYmd('2026-11-10')).toBe('26년 11월 10일');
    expect(koreanYmd('2026-01-05 10:00')).toBe('26년 1월 5일');
    expect(koreanYmd('')).toBe('');
  });
  it('낙찰일은 매각기일과 같아야 한다', () => {
    const a = { eventDate: '2026-11-10' };
    expect(wonDateError(a, '2026-11-10')).toBe('');
    expect(wonDateError(a, '2026-11-09')).toContain('26년 11월 10일');
    expect(wonDateError(a, '2026-11-11')).not.toBe('');
    expect(wonDateError({}, '2026-11-11')).toBe('');   // 매각기일을 모르면 막지 않는다
  });
  it('잔금기한 — 적은 날짜가 먼저, 없으면 낙찰일 + 45일 예정', () => {
    expect(balanceDueOf({ balanceDueDate: '2026-12-20', wonDate: '2026-11-10' })).toEqual({ date: '2026-12-20', expected: false });
    expect(balanceDueOf({ wonDate: '2026-11-10' })).toEqual({ date: '2026-12-25', expected: true });
    expect(balanceDueOf({ eventDate: '2026-11-10' })).toEqual({ date: '2026-12-25', expected: true });
    expect(balanceDueOf({})).toEqual({ date: '', expected: false });
  });
  it('잔금기한은 낙찰일 뒤여야 한다', () => {
    expect(balanceDueError({ wonDate: '2026-11-10' }, '2026-11-10')).not.toBe('');
    expect(balanceDueError({ wonDate: '2026-11-10' }, '2026-12-01')).toBe('');
  });
});
