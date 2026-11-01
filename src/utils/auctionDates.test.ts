import { describe, expect, it } from 'vitest';
import { balanceDueError, balanceDueOf, koreanYmd, stageBeforeSaleError, wonDateError, wonDateWarning, balanceDueNotice } from './auctionDates';

describe('auctionDates', () => {
  it('koreanYmd — 26년 11월 10일', () => {
    expect(koreanYmd('2026-11-10')).toBe('26년 11월 10일');
    expect(koreanYmd('2026-01-05 10:00')).toBe('26년 1월 5일');
    expect(koreanYmd('')).toBe('');
  });
  it('낙찰일은 매각기일과 같아야 한다', () => {
    const a = { eventDate: '2026-11-10' };
    expect(wonDateError(a, '2026-11-10', true)).toBe('');
    expect(wonDateError(a, '2026-11-09', true)).toContain('26년 11월 10일');
    expect(wonDateError(a, '2026-11-21', true).split('\n')[1]).toBe('26년 11월 21일은 입력할 수 없습니다.');
    expect(wonDateError(a, '2026-11-11', true)).not.toBe('');
    expect(wonDateError(a, '2026-11-11')).toBe('');   // 스위치를 끈 지금은 막지 않는다
    expect(wonDateError({}, '2026-11-11', true)).toBe('');   // 매각기일을 모르면 막지 않는다
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
  it('기일 전엔 낙찰 · 유찰 · 취소 · 매도를 고를 수 없다(당일은 된다)', () => {
    const a = { eventDate: '2026-11-17' };
    expect(stageBeforeSaleError(a, '낙찰', '2026-11-16', true)).toContain('26년 11월 17일');
    expect(stageBeforeSaleError(a, '매도', '2026-11-16', true)).not.toBe('');
    expect(stageBeforeSaleError(a, '낙찰', '2026-11-17', true)).toBe('');
    expect(stageBeforeSaleError(a, '낙찰', '2026-11-16')).toBe('');   // 스위치를 끈 지금은 막지 않는다
    expect(stageBeforeSaleError(a, '진행', '2026-11-16')).toBe('');
    expect(stageBeforeSaleError({}, '낙찰', '2026-11-16')).toBe('');
  });
  it('막지 않을 때 — 매각기일과 다른 낙찰일은 경고 글', () => {
    expect(wonDateWarning({ eventDate: '2026-11-10' }, '2026-11-12')).toContain('확인을 누르면 26년 11월 12일로 바뀝니다');
    expect(wonDateWarning({ eventDate: '2026-11-10' }, '2026-11-10')).toBe('');
  });
  it('잔금기한이 추정 예정일일 때만 묻는다', () => {
    expect(balanceDueNotice({ wonDate: '2026-11-10' }, '2026-12-20')).toContain('26년 12월 25일은');
    expect(balanceDueNotice({ wonDate: '2026-11-10', balanceDueDate: '2026-12-18' }, '2026-12-20')).toBe('');
  });
});
