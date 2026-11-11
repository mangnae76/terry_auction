import { describe, expect, it } from 'vitest';
import { complexesOf, rankFromMeters } from './complexCompare';
import type { CaseTradeRow } from './caseTradeAnalysis';

const row = (o: Partial<CaseTradeRow>): CaseTradeRow => ({ kind: '매매', contractDate: '2026.10.01', amount: '', price: 0, areaM2: 59.98, floor: '1', umdNm: '성포동', name: '', jibun: '747', ...o });

describe('complexCompare', () => {
  it('입지등수 — 도보 5분(400m) 1등 · 10분(800m) 2등 · 그 밖 3등', () => {
    // 직선 × 1.5 를 걷는 거리로 — 5분(400m) = 직선 266.7m, 10분 = 직선 533.3m
    expect([rankFromMeters(266), rankFromMeters(268), rankFromMeters(533), rankFromMeters(534)]).toEqual([1, 2, 2, 3]);
  });
  it('단지마다 내 전용과 가장 가까운 평형 하나 · 그 평형만으로 평균 전세 · 매매, 12개월 밖은 뺀다', () => {
    const rows = [
      row({ name: '파크', jibun: '747', kind: '전세', price: 300_000_000, areaM2: 59.9883, buildYear: 2018 }),
      row({ name: '파크', jibun: '747', kind: '전세', price: 400_000_000, areaM2: 59.98 }),
      row({ name: '파크', jibun: '747', kind: '매매', price: 600_000_000, areaM2: 84.5 }),
      row({ name: '예술인', jibun: '700', kind: '전세', price: 180_000_000, areaM2: 61.38 }),
      row({ name: '예술인', jibun: '700', kind: '전세', price: 999_000_000, areaM2: 61.38, contractDate: '2025.01.01' }),
      row({ name: '큰평', jibun: '800', kind: '전세', price: 500_000_000, areaM2: 84.9 }),
    ];
    const out = complexesOf(rows, 59.99, '747', '20251110');
    expect(out.map((c) => `${c.name}:${c.area}:${c.jeonseAvg}:${c.saleAvg}:${c.mine}:${c.buildYear}`)).toEqual(['파크:59.98:350000000:0:true:2018', '예술인:61.38:180000000:0:false:0']);
  });
});

import { academyClusterOf } from './kakaoNearby';
describe('학원가', () => {
  const at = (dLatM: number, dLngM: number, i: number) => ({ name: `학원${i}`, distance: '', distanceMeters: 1, category: '', lat: 37.3 + dLatM / 110540, lng: 126.8 + dLngM / (111320 * Math.cos((37.3 * Math.PI) / 180)) });
  it('200m 안 10곳 이상 모인 곳만 — 그 가운데까지 거리', () => {
    const cluster = Array.from({ length: 10 }, (_, i) => at(300 + (i % 3) * 20, 0 + i * 10, i));
    const lone = [at(50, 0, 99)];
    const out = academyClusterOf(37.3, 126.8, [...lone, ...cluster]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('학원가 · 학원 10곳');
    expect(out[0].distanceMeters).toBeGreaterThan(300);
    expect(academyClusterOf(37.3, 126.8, [...lone, ...cluster.slice(0, 9)])).toEqual([]);
  });
});
