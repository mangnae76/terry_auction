import { apiPath } from './apiBase';

const KAKAO_GEOCODE_BASE_URL = import.meta.env.VITE_KAKAO_GEOCODE_BASE_URL ?? apiPath('/api-kakao');
const KAKAO_REST_API_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY ?? '';
const CACHE_KEY = 'region-resolver-cache-v1';

export interface ResolvedRegion {
  sido: string;
  sigungu: string;
  dong: string;
  lawdCd5: string;
  bCode10: string;
  lng: number;
  lat: number;
}

type CacheShape = Record<string, ResolvedRegion>;

const readCache = (): CacheShape => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CacheShape) : {};
  } catch {
    return {};
  }
};

const writeCache = (next: CacheShape) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
};

const normalizeQuery = (address: string) => address.replace(/\s+/g, ' ').trim();

const buildQueryVariants = (address: string): string[] => {
  const base = normalizeQuery(address);
  const variants = new Set<string>([base]);
  variants.add(base.replace(/\([^)]*\)/g, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim());
  variants.add(
    base
      .replace(/\d+\s*동/g, ' ')
      .replace(/\d+\s*층/g, ' ')
      .replace(/\d+\s*호/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  return Array.from(variants).filter((v) => v.length >= 4);
};

type KakaoAddress = {
  b_code?: string;
  region_1depth_name?: string;
  region_2depth_name?: string;
  region_3depth_name?: string;
};

type KakaoDoc = {
  x?: string;
  y?: string;
  address?: KakaoAddress;
  road_address?: KakaoAddress;
};

const pickFromDoc = (doc: KakaoDoc): ResolvedRegion | null => {
  const addr = doc.address ?? doc.road_address;
  const bCode10 = addr?.b_code?.replace(/[^\d]/g, '') ?? '';
  if (bCode10.length < 10) return null;
  return {
    sido: addr?.region_1depth_name ?? '',
    sigungu: addr?.region_2depth_name ?? '',
    dong: addr?.region_3depth_name ?? '',
    lawdCd5: bCode10.slice(0, 5),
    bCode10,
    lng: Number(doc.x ?? 0),
    lat: Number(doc.y ?? 0),
  };
};

const queryKakao = async (query: string): Promise<ResolvedRegion | null> => {
  if (!KAKAO_REST_API_KEY && !import.meta.env.DEV) return null;
  const url = new URL(`${KAKAO_GEOCODE_BASE_URL}/v2/local/search/address.json`, window.location.origin);
  url.searchParams.set('query', query);
  const response = await fetch(url.toString(), {
    headers: KAKAO_REST_API_KEY && !import.meta.env.DEV
      ? { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` }
      : undefined,
  });
  if (!response.ok) return null;
  const json = (await response.json()) as { documents?: KakaoDoc[] };
  const docs = json.documents ?? [];
  for (const doc of docs) {
    const picked = pickFromDoc(doc);
    if (picked) return picked;
  }
  return null;
};

export const resolveRegionFromAddress = async (
  address: string | undefined | null,
): Promise<ResolvedRegion | null> => {
  if (!address) return null;
  const key = normalizeQuery(address);
  if (!key) return null;
  const cache = readCache();
  if (cache[key]) return cache[key];
  const variants = buildQueryVariants(key);
  for (const variant of variants) {
    try {
      const resolved = await queryKakao(variant);
      if (resolved) {
        cache[key] = resolved;
        writeCache(cache);
        return resolved;
      }
    } catch {
      /* continue to next variant */
    }
  }
  return null;
};
