import { describe, expect, it } from 'vitest';
import { straightDistanceKm } from './routeOptimizer';

/** 번호 말풍선의 '앞 지점에서 얼마나' 는 도로 경로가 없을 때 이 직선거리로 어림한다 */
describe('straightDistanceKm', () => {
  it('같은 자리는 0', () => {
    expect(straightDistanceKm({ lat: 37.5, lng: 127 }, { lat: 37.5, lng: 127 })).toBe(0);
  });

  it('인천 검암동 → 인천시청 은 약 11km', () => {
    const km = straightDistanceKm({ lat: 37.5549, lng: 126.6712 }, { lat: 37.4563, lng: 126.7052 });
    expect(km).toBeGreaterThan(10);
    expect(km).toBeLessThan(13);
  });

  it('서울시청 → 부산시청 은 약 325km', () => {
    const km = straightDistanceKm({ lat: 37.5665, lng: 126.978 }, { lat: 35.1796, lng: 129.0756 });
    expect(Math.round(km)).toBeGreaterThan(315);
    expect(Math.round(km)).toBeLessThan(335);
  });
});
