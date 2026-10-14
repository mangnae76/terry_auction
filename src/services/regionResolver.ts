import { apiPath } from './apiBase';

const KAKAO_GEOCODE_BASE_URL = import.meta.env.VITE_KAKAO_GEOCODE_BASE_URL ?? apiPath('/api-kakao');
const KAKAO_REST_API_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY ?? '';
// 기기에 저장해 둔 지역코드. 행정구역이 개편되면(예: 인천 서구 → 서해구·검단구)
// 예전 코드로는 국토부 실거래가 한 건도 안 잡힌다. 그래서
//  (1) 키에 버전을 달아 한 번 비우고,
//  (2) 저장한 지 오래된 값은 다시 물어보게 한다.
// v3 — 지번(jibun)을 같이 들고 있게 되어 한 번 비운다
const CACHE_KEY = 'region-resolver-cache-v3';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface ResolvedRegion {
  sido: string;
  sigungu: string;
  dong: string;
  lawdCd5: string;
  bCode10: string;
  /** 지번 — '670-4' (산번지는 '산 12-3').
   *  카카오는 도로명으로 물어도 지번 쪽 정보를 같이 준다. 그래서 이 값을
   *  들고 있으면 도로명 주소를 쳐도 PNU와 실거래 맞추기가 똑같이 돌아간다. */
  jibun: string;
  lng: number;
  lat: number;
}

type CacheEntry = ResolvedRegion & { savedAt?: number };
type CacheShape = Record<string, CacheEntry>;

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
    localStorage.removeItem('region-resolver-cache-v1');
    localStorage.removeItem('region-resolver-cache-v2');
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
  /** 산 여부 — 'N' 대지, 'Y' 산 */
  mountain_yn?: string;
  main_address_no?: string;
  sub_address_no?: string;
  address_name?: string;
};

type KakaoDoc = {
  x?: string;
  y?: string;
  address?: KakaoAddress;
  road_address?: KakaoAddress;
};

/** 카카오가 준 지번을 '670-4' 꼴로 맞춘다 (산번지는 '산 12-3') */
const jibunOf = (addr?: KakaoAddress): string => {
  if (!addr) return '';
  const main = String(addr.main_address_no ?? '').replace(/[^\d]/g, '');
  if (!main) return '';
  const sub = String(addr.sub_address_no ?? '').replace(/[^\d]/g, '');
  const lot = Number(sub) > 0 ? `${Number(main)}-${Number(sub)}` : String(Number(main));
  const mountain = String(addr.mountain_yn ?? '').toUpperCase();
  return mountain === 'Y' || mountain === '1' ? `산 ${lot}` : lot;
};

const pickFromDoc = (doc: KakaoDoc): ResolvedRegion | null => {
  // 지번 쪽을 먼저 본다 — 도로명으로 물어도 카카오가 지번 주소를 같이 준다
  const addr = doc.address ?? doc.road_address;
  const bCode10 = addr?.b_code?.replace(/[^\d]/g, '') ?? '';
  if (bCode10.length < 10) return null;
  return {
    sido: addr?.region_1depth_name ?? '',
    sigungu: addr?.region_2depth_name ?? '',
    dong: addr?.region_3depth_name ?? '',
    lawdCd5: bCode10.slice(0, 5),
    bCode10,
    jibun: jibunOf(doc.address) || jibunOf(addr),
    lng: Number(doc.x ?? 0),
    lat: Number(doc.y ?? 0),
  };
};

// 주소 변환이 매달리면 뒤의 실거래가 조회가 통째로 멈춘다 — 10초면 끊는다
const GEOCODE_TIMEOUT_MS = 10000;

const queryKakao = async (query: string): Promise<ResolvedRegion | null> => {
  if (!KAKAO_REST_API_KEY && !import.meta.env.DEV) return null;
  const url = new URL(`${KAKAO_GEOCODE_BASE_URL}/v2/local/search/address.json`, window.location.origin);
  url.searchParams.set('query', query);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GEOCODE_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      signal: ctrl.signal,
      headers: KAKAO_REST_API_KEY && !import.meta.env.DEV
        ? { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` }
        : undefined,
    });
  } finally {
    clearTimeout(timer);
  }
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
  const hit = cache[key];
  if (hit && Date.now() - Number(hit.savedAt ?? 0) < CACHE_TTL_MS) return hit;
  const variants = buildQueryVariants(key);
  for (const variant of variants) {
    try {
      const resolved = await queryKakao(variant);
      if (resolved) {
        cache[key] = { ...resolved, savedAt: Date.now() };
        writeCache(cache);
        return resolved;
      }
    } catch {
      /* continue to next variant */
    }
  }
  return null;
};

/** 시군구 후보 — 이름만으로는 하나로 못 좁히는 때가 있다.
 *  '인천광역시 서구' 는 서해구·검단구로 갈라져 더는 없고, 카카오는 둘 다 준다.
 *  그때 첫 번째를 말없이 고르면 엉뚱한 구를 분석하게 되므로 골라 쓰게 한다. */
export interface SigunguCandidate {
  label: string;     // '인천 검단구'
  sido: string;
  sigungu: string;
  lawdCd5: string;
  bCode10: string;
}

export const searchSigungu = async (query: string): Promise<SigunguCandidate[]> => {
  const key = normalizeQuery(query);
  if (!key) return [];
  const url = new URL(`${KAKAO_GEOCODE_BASE_URL}/v2/local/search/address.json`, window.location.origin);
  url.searchParams.set('query', key);
  url.searchParams.set('size', '20');
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: KAKAO_REST_API_KEY && !import.meta.env.DEV
        ? { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` }
        : undefined,
    });
  } catch {
    return [];
  }
  if (!response.ok) return [];
  const json = (await response.json()) as { documents?: KakaoDoc[] };
  const seen = new Set<string>();
  const out: SigunguCandidate[] = [];
  (json.documents ?? []).forEach((doc) => {
    const addr = doc.address;
    if (!addr) return;
    const bCode10 = String(addr.b_code ?? '').replace(/[^\d]/g, '');
    const lawdCd5 = bCode10.slice(0, 5);
    if (lawdCd5.length < 5 || seen.has(lawdCd5)) return;
    const sido = String(addr.region_1depth_name ?? '').trim();
    const sigungu = String(addr.region_2depth_name ?? '').trim();
    if (!sigungu) return;
    seen.add(lawdCd5);
    out.push({ label: `${sido} ${sigungu}`.trim(), sido, sigungu, lawdCd5, bCode10 });
  });
  return out;
};
