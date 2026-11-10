import { describe, expect, it } from 'vitest';
import { complexNameOf, totalParkingOf } from './aptComplex';
import { buildingNameFromAddress } from './addressLookup';

describe('aptComplex', () => {
  const unitLocation = '경기도 안산시 상록구 성포동 747 안산파크푸르지오 101동 23층2301호';
  it('단지명 — PDF 에 없으면 전유부 소재지의 건물명', () => {
    expect(buildingNameFromAddress(unitLocation)).toBe('안산파크푸르지오');
    expect(complexNameOf({ buildingHeader: { unitLocation } as never, aptComplexInfo: { name: '' } as never })).toBe('안산파크푸르지오');
    expect(complexNameOf({ aptComplexInfo: { name: '파크푸르지오' } as never })).toBe('파크푸르지오');
  });
  it('총 주차수 — 전유부 · 표제부에 없으면 단지정보', () => {
    expect(totalParkingOf({ buildingHeader: { unitTotalParking: '', parking: '' } as never, aptComplexInfo: { parkingTotal: '1,628대' } as never })).toBe('1,628대');
  });
});
