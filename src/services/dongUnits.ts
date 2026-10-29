// 동 하나의 세대수 — 건축물대장(건축HUB) 표제부를 훑어 종류별로 더한 값. 수요분석 · 거래랭킹이 같이 쓴다.
// 한 번 받으면 세 종류(연립·다세대 · 아파트 · 오피스텔)가 다 나와 동 하나에 한 벌로 30일 저장(cacheDongUnitsAll).
// 하루 한도로 못 받으면 앱 물건상세가 받아 둔 연립·다세대 값(cacheDongUnits)이라도 쓴다.
import { cachedEntryOrStale, cacheKey, CACHE_TTL, readCacheEntry } from './marketCache';
import { fetchDongUnits } from './publicDataApi';
import { resolveRegionFromAddress } from './regionResolver';

export type UnitKind = 'villa' | 'apt' | 'officetel';
const YEAR = 365 * 24 * 60 * 60 * 1000;

/** '시도 시군구 동' → 그 종류 세대수. 0 = 받았는데 없음 · -1 = 못 받음(한도 · 오류) */
export const fetchDongUnitCount = async (address: string, kind: UnitKind): Promise<number> => {
  try {
    const region = await resolveRegionFromAddress(address);
    if (!region?.bCode10) return -1;
    const got = await cachedEntryOrStale('cacheDongUnitsAll', cacheKey(region.bCode10), CACHE_TTL.units,
      () => fetchDongUnits(region.bCode10), (u) => u.villa + u.apt + u.officetel > 0, YEAR);
    if (got.value !== null) return got.value[kind];
    if (kind === 'villa') {
      const old = await readCacheEntry<number>('cacheDongUnits', cacheKey(region.bCode10), YEAR);
      if (old && old.value > 0) return old.value;
    }
  } catch { /* 못 받음 */ }
  return -1;
};
