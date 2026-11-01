import { describe, it, expect } from 'vitest';
import { buildingAgeOf, buildingAgeText } from './buildingAge';

describe('건물 연차 — 햇수식', () => {
  const now = new Date(2026, 10, 1);
  it('2016년 사용승인은 2026년에 11년차 (월과 상관없이)', () => {
    expect(buildingAgeOf('2016-06-27', now)).toBe(11);
    expect(buildingAgeOf(2016, now)).toBe(11);
    expect(buildingAgeText('2016.06', now)).toBe('11년차');
  });
  it('올해 사용승인은 1년차, 못 읽으면 빈값', () => {
    expect(buildingAgeText(2026, now)).toBe('1년차');
    expect(buildingAgeText('', now)).toBe('');
    expect(buildingAgeOf(null, now)).toBe(0);
  });
});
