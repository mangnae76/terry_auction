// 동 하나의 세대수 — 건축물대장(건축HUB) 표제부를 훑어 종류별로 더한 값. 수요분석 · 거래랭킹이 같이 쓴다.
// 한 번 받으면 세 종류(연립·다세대 · 아파트 · 오피스텔)가 다 나와 동 하나에 한 벌로 30일 저장(cacheDongUnitsAll).
// 하루 한도로 못 받으면 앱 물건상세가 받아 둔 연립·다세대 값(cacheDongUnits)이라도 쓴다.
import { cachedEntryOrStale, cacheKey, CACHE_TTL, readCacheEntry } from './marketCache';
import { fetchDongUnits, type DongUnits } from './publicDataApi';
import { resolveRegionFromAddress } from './regionResolver';

export type UnitKind = 'villa' | 'apt' | 'officetel';
const YEAR = 365 * 24 * 60 * 60 * 1000;

/** 이 창에서 받은(받는 중인) 동 — 같은 동을 두 번 부르지 않는다. 종류(연립 · 아파트 · 오피스텔)를 바꿔도
 *  한 번 받은 세 종류를 그대로 쓴다(로그인 전이라 저장본을 못 읽을 때도). 못 받은 동은 지워 다시 부를 수 있게 */
const inFlight = new Map<string, Promise<DongUnits | null>>();
/** 다 받은 동 — 저장본을 다시 읽지 않고 바로 꺼낸다 */
const received = new Map<string, DongUnits>();
const unitsOnce = (bCode10: string): Promise<DongUnits | null> => {
  const had = inFlight.get(bCode10);
  if (had) return had;
  const job = cachedEntryOrStale('cacheDongUnitsAll', cacheKey(bCode10), CACHE_TTL.units,
    () => fetchDongUnits(bCode10), (u) => u.villa + u.apt + u.officetel > 0, YEAR)
    .then((got) => got.value)
    .catch(() => null);
  inFlight.set(bCode10, job);
  void job.then((v) => { if (v === null) inFlight.delete(bCode10); else received.set(bCode10, v); });
  return job;
};

/** '시도 시군구 동' → 그 종류 세대수. 0 = 받았는데 없음 · -1 = 못 받음(한도 · 오류) */
export const fetchDongUnitCount = async (address: string, kind: UnitKind): Promise<number> => {
  try {
    const region = await resolveRegionFromAddress(address);
    if (!region?.bCode10) return -1;
    const got = await unitsOnce(region.bCode10);
    if (got !== null) return got[kind];
    if (kind === 'villa') {
      const old = await readCacheEntry<number>('cacheDongUnits', cacheKey(region.bCode10), YEAR);
      if (old && old.value > 0) return old.value;
    }
  } catch { /* 못 받음 */ }
  return -1;
};

/** 저장된 값만 본다(건축물대장은 부르지 않는다) — 화면을 다시 열 때 한꺼번에 읽어 '받는 중'을 짧게. 없으면 undefined */
export const peekDongUnitCount = async (address: string, kind: UnitKind): Promise<number | undefined> => {
  try {
    const region = await resolveRegionFromAddress(address);
    if (!region?.bCode10) return undefined;
    // 이 창에서 이미 받은 동이면 저장본을 읽지 않고 그 값을(받는 중인 동은 기다리지 않는다)
    const mem = received.get(region.bCode10);
    if (mem) return mem[kind];
    const hit = await readCacheEntry<{ villa: number; apt: number; officetel: number }>('cacheDongUnitsAll', cacheKey(region.bCode10), YEAR);
    if (hit) return hit.value[kind];
    if (kind === 'villa') {
      const old = await readCacheEntry<number>('cacheDongUnits', cacheKey(region.bCode10), YEAR);
      if (old && old.value > 0) return old.value;
    }
  } catch { /* 저장본 없음 */ }
  return undefined;
};
