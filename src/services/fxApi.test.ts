// 환율 날짜와 숫자 읽기 — 틀리면 엉뚱한 날을 부르거나 1,385 를 1 로 읽는다.
import { describe, it, expect } from 'vitest';
import { kstYmd, parseRate } from './fxApi';

describe('한국 시각 날짜', () => {
  it('한국은 이미 다음 날이면 다음 날로 센다', () => {
    // UTC 10/23 16:00 = 한국 10/24 01:00
    expect(kstYmd(new Date(Date.UTC(2026, 9, 23, 16, 0)))).toBe('20261024');
  });
  it('며칠 전을 센다', () => {
    expect(kstYmd(new Date(Date.UTC(2026, 9, 24, 3, 0)), 3)).toBe('20261021');
  });
  it('달이 넘어가도 맞다', () => {
    expect(kstYmd(new Date(Date.UTC(2026, 10, 1, 3, 0)), 1)).toBe('20261031');
  });
});

describe('매매기준율 읽기', () => {
  it('쉼표가 든 값을 숫자로', () => {
    expect(parseRate('1,385.20')).toBe(1385.2);
  });
  it('빈 값·0 은 모름(null)', () => {
    expect(parseRate(null)).toBeNull();
    expect(parseRate('')).toBeNull();
    expect(parseRate('0')).toBeNull();
  });
});
