// 물건 한 채의 건축물대장(표제부) 사실 — 주차대수 · 승강기 수. 개별성 분석의 주차수 · 엘베를 PDF에 없을 때 채운다.
// 필지마다 30일 저장(cacheBldFacts) — 건물은 잘 바뀌지 않고, 건축물대장 하루 한도를 아낀다.
import { cachedEntryOrStale, cacheKey, CACHE_TTL } from './marketCache';
import { fetchBuildingFacts, type BuildingFacts } from './publicDataApi';
import { resolveRegionFromAddress } from './regionResolver';

/** 주소 → 그 필지의 주차대수 · 승강기 수. 못 찾으면 null */
export const getBuildingFacts = async (address: string): Promise<BuildingFacts | null> => {
  try {
    const region = await resolveRegionFromAddress(address);
    if (!region?.bCode10 || !region.jibun) return null;
    const got = await cachedEntryOrStale('cacheBldFacts', cacheKey(region.bCode10, region.jibun), CACHE_TTL.units,
      () => fetchBuildingFacts(region.bCode10, region.jibun), (v) => v !== null, 365 * 24 * 60 * 60 * 1000);
    return got.value ?? null;
  } catch {
    return null;
  }
};
