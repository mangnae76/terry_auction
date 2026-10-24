// 기상청 격자와 자료 시각 — 틀리면 엉뚱한 동네, 없는 시각의 기온을 부른다.
import { describe, it, expect } from 'vitest';
import { latLngToGrid, nowcastBase } from './weatherApi';

describe('위경도 → 기상청 격자', () => {
  it('인천시청은 55, 124', () => {
    expect(latLngToGrid(37.4563, 126.7052)).toEqual({ nx: 55, ny: 124 });
  });
  it('서울시청은 60, 127', () => {
    expect(latLngToGrid(37.5665, 126.978)).toEqual({ nx: 60, ny: 127 });
  });
});

describe('초단기실황 자료 시각', () => {
  // 한국 시각을 UTC 로 바꿔 넘긴다 (KST = UTC + 9)
  const kst = (y: number, mo: number, d: number, h: number, mi: number) =>
    new Date(Date.UTC(y, mo - 1, d, h - 9, mi));

  it('40분이 지났으면 그 시각 자료', () => {
    expect(nowcastBase(kst(2026, 10, 24, 10, 40))).toEqual({ date: '20261024', time: '1000' });
  });
  it('40분 전이면 한 시간 앞 자료', () => {
    expect(nowcastBase(kst(2026, 10, 24, 10, 39))).toEqual({ date: '20261024', time: '0900' });
  });
  it('자정 직후면 전날 23시 자료', () => {
    expect(nowcastBase(kst(2026, 10, 24, 0, 10))).toEqual({ date: '20261023', time: '2300' });
  });
});
