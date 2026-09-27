import { apiPath } from './apiBase';

export interface GeoPoint {
  address: string;
  lat: number;
  lng: number;
  kind?: 'start' | 'stop' | 'end';
}

export interface RoutePlanResult {
  orderedStops: GeoPoint[];
  fullPath: GeoPoint[];
  failedAddresses: string[];
  totalDistanceKm: number;
  driveMinutes: number;
  stayMinutes: number;
  totalMinutes: number;
  startPoint?: GeoPoint;
  endPoint?: GeoPoint;
}

export interface RoutePlanOptions {
  stopAddresses: string[];
  startAddress?: string;
  endAddress?: string;
  avgSpeedKmh: number;
  stayMinutesPerStop: number;
}

const toRad = (value: number) => (value * Math.PI) / 180;

const haversineKm = (a: GeoPoint, b: GeoPoint) => {
  const earthRadius = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const aa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
};

const twoOptSwap = (route: GeoPoint[], i: number, k: number) => [
  ...route.slice(0, i),
  ...route.slice(i, k + 1).reverse(),
  ...route.slice(k + 1),
];

const routeDistance = (route: GeoPoint[]) => {
  let distance = 0;
  for (let i = 0; i < route.length - 1; i += 1) {
    distance += haversineKm(route[i], route[i + 1]);
  }
  return distance;
};

const routeDistanceWithFixedEnds = (route: GeoPoint[], start?: GeoPoint, end?: GeoPoint) => {
  const full = [...(start ? [start] : []), ...route, ...(end ? [end] : [])];
  return routeDistance(full);
};

const optimizeTwoOpt = (route: GeoPoint[], start?: GeoPoint, end?: GeoPoint) => {
  let best = [...route];
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length; i += 1) {
      for (let k = i + 1; k < best.length; k += 1) {
        const candidate = twoOptSwap(best, i, k);
        if (
          routeDistanceWithFixedEnds(candidate, start, end) + 0.0001 <
          routeDistanceWithFixedEnds(best, start, end)
        ) {
          best = candidate;
          improved = true;
        }
      }
    }
  }
  return best;
};

// Or-opt: relocate a short consecutive segment to a different position
const optimizeOrOpt = (route: GeoPoint[], start?: GeoPoint, end?: GeoPoint) => {
  let best = [...route];
  let improved = true;
  while (improved) {
    improved = false;
    for (let segLen = 1; segLen <= 3; segLen += 1) {
      for (let i = 0; i + segLen <= best.length; i += 1) {
        const without = [...best.slice(0, i), ...best.slice(i + segLen)];
        const segment = best.slice(i, i + segLen);
        for (let j = 0; j <= without.length; j += 1) {
          if (j === i) continue;
          const candidate = [...without.slice(0, j), ...segment, ...without.slice(j)];
          if (candidate.length !== best.length) continue;
          if (
            routeDistanceWithFixedEnds(candidate, start, end) + 0.0001 <
            routeDistanceWithFixedEnds(best, start, end)
          ) {
            best = candidate;
            improved = true;
          }
        }
      }
    }
  }
  return best;
};

const nearestNeighborFrom = (
  stops: GeoPoint[],
  seedIndex: number,
  anchor: GeoPoint | undefined,
) => {
  const remaining = [...stops];
  const route: GeoPoint[] = [];
  const firstIdx = anchor ? -1 : seedIndex;
  if (firstIdx >= 0) {
    route.push(remaining.splice(firstIdx, 1)[0]);
  }
  while (remaining.length > 0) {
    const last = route.length > 0 ? route[route.length - 1] : (anchor as GeoPoint);
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    remaining.forEach((candidate, index) => {
      const dist = haversineKm(last, candidate);
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestIndex = index;
      }
    });
    route.push(remaining.splice(nearestIndex, 1)[0]);
  }
  return route;
};

// Multi-start nearest-neighbor + 2-opt + or-opt, iterated until stable
const optimizeMultiStart = (stops: GeoPoint[], start?: GeoPoint, end?: GeoPoint) => {
  if (stops.length <= 1) return [...stops];
  const seedCount = start ? 1 : Math.min(stops.length, 8);
  let bestRoute: GeoPoint[] = [];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let seed = 0; seed < seedCount; seed += 1) {
    let route = nearestNeighborFrom(stops, seed, start);
    // Iterate 2-opt and or-opt until neither improves
    for (let pass = 0; pass < 4; pass += 1) {
      const before = routeDistanceWithFixedEnds(route, start, end);
      route = optimizeTwoOpt(route, start, end);
      route = optimizeOrOpt(route, start, end);
      const after = routeDistanceWithFixedEnds(route, start, end);
      if (after + 0.0001 >= before) break;
    }
    const dist = routeDistanceWithFixedEnds(route, start, end);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestRoute = route;
    }
  }
  return bestRoute;
};

const cleanAddress = (raw: string) =>
  raw
    .replace(/^\s*[\-\*\u2022]\s*/g, '')
    .replace(/^\s*\d+\s*[\.\)\-]?\s*/g, '')
    .trim();

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const GEOCODE_BASE_URL = import.meta.env.VITE_GEOCODE_BASE_URL ?? apiPath('/api-geo');
const KAKAO_GEOCODE_BASE_URL = import.meta.env.VITE_KAKAO_GEOCODE_BASE_URL ?? apiPath('/api-kakao');
const GEOCODE_CACHE_KEY = 'trip-geocode-cache-v1';
const GEOCODE_BLOCK_UNTIL_KEY = 'trip-geocode-block-until';
const KAKAO_REST_API_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY ?? '';
let nominatimBlockedUntil = 0;
const NOMINATIM_BLOCK_MS = 10 * 60 * 1000;

const buildGeocodeUrl = (path: string) =>
  new URL(`${GEOCODE_BASE_URL}${path}`, window.location.origin);
const buildKakaoUrl = (path: string) =>
  new URL(`${KAKAO_GEOCODE_BASE_URL}${path}`, window.location.origin);

const createAddressVariants = (address: string) => {
  const base = normalizeWhitespace(address);
  const variants = new Set<string>([base]);

  // 괄호/쉼표 정보 제거
  variants.add(normalizeWhitespace(base.replace(/\([^)]*\)/g, ' ').replace(/,/g, ' ')));

  // 동/층/호 정보 제거
  const noUnit = normalizeWhitespace(
    base
      .replace(/\d+\s*동/g, ' ')
      .replace(/\d+\s*층/g, ' ')
      .replace(/\d+\s*호/g, ' ')
      .replace(/[A-Za-z]\s*동/g, ' '),
  );
  variants.add(noUnit);

  // 건물명 제거 시도: 지번까지만 남김 (예: 검암동 668-4)
  const lotMatch = noUnit.match(/^(.+?\s\d+-\d+)\b/);
  if (lotMatch?.[1]) {
    variants.add(normalizeWhitespace(lotMatch[1]));
  }

  // 축약 행정구역 표기 시도
  variants.add(
    normalizeWhitespace(
      noUnit
        .replace('인천광역시', '인천')
        .replace('경기도', '경기')
        .replace('서울특별시', '서울'),
    ),
  );

  return [...variants].filter((item) => item.length > 0);
};

const loadGeocodeCache = () => {
  try {
    const raw = localStorage.getItem(GEOCODE_CACHE_KEY);
    if (!raw) {
      return {} as Record<string, GeoPoint>;
    }
    return JSON.parse(raw) as Record<string, GeoPoint>;
  } catch {
    return {} as Record<string, GeoPoint>;
  }
};

const saveGeocodeCache = (cache: Record<string, GeoPoint>) => {
  try {
    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore quota/storage errors.
  }
};

const getCachedGeoPoint = (address: string) => {
  const cache = loadGeocodeCache();
  return cache[address] ?? null;
};

const setCachedGeoPoint = (address: string, point: GeoPoint) => {
  const cache = loadGeocodeCache();
  cache[address] = point;
  saveGeocodeCache(cache);
};

const getBlockedUntil = () => {
  if (nominatimBlockedUntil > Date.now()) {
    return nominatimBlockedUntil;
  }
  const raw = localStorage.getItem(GEOCODE_BLOCK_UNTIL_KEY);
  if (!raw) {
    return 0;
  }
  const value = Number(raw);
  if (Number.isFinite(value) && value > Date.now()) {
    nominatimBlockedUntil = value;
    return value;
  }
  return 0;
};

const setBlockedUntil = (until: number) => {
  nominatimBlockedUntil = until;
  localStorage.setItem(GEOCODE_BLOCK_UNTIL_KEY, String(until));
};

export const parseAddressLines = (input: string) =>
  input
    .split('\n')
    .map((line) => cleanAddress(line))
    .filter((line, idx, arr) => line.length >= 6 && arr.indexOf(line) === idx);

const geocodeByKakao = async (query: string): Promise<GeoPoint | null> => {
  if (!KAKAO_REST_API_KEY) {
    return null;
  }
  const url = buildKakaoUrl('/v2/local/search/address.json');
  url.searchParams.set('query', query);
  const response = await fetch(url.toString(), {
    headers: !import.meta.env.DEV
      ? { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` }
      : undefined,
  });
  if (!response.ok) {
    let detail = '';
    try {
      const json = (await response.json()) as { message?: string };
      detail = json.message ?? '';
    } catch {
      detail = '';
    }
    if (response.status === 401 && detail.includes('ip mismatched')) {
      throw new Error(
        '카카오 지오코딩 401: 허용 IP 불일치(ip mismatched)입니다. 공인 IP가 변경되었을 수 있습니다. Kakao Developers > 내 애플리케이션 > 보안에서 현재 공인 IP를 허용 목록에 추가/갱신한 뒤 dev 서버를 재시작하세요.',
      );
    }
    if (response.status === 401) {
      throw new Error(
        '카카오 지오코딩 401: REST API 키 또는 앱 보안 설정을 확인해 주세요. (키 오타, 비활성 앱, 허용 IP 누락 여부 확인)',
      );
    }
    if (response.status === 403 && detail.includes('disabled OPEN_MAP_AND_LOCAL service')) {
      throw new Error(
        '카카오 지오코딩 403: OPEN_MAP_AND_LOCAL 서비스가 비활성화되어 있습니다. Kakao Developers에서 Local API 사용 설정을 켜 주세요.',
      );
    }
    if (response.status === 403) {
      throw new Error(`카카오 지오코딩 403: ${detail || '앱 권한/사용 설정을 확인해 주세요.'}`);
    }
    return null;
  }
  const json = (await response.json()) as {
    documents?: Array<{ x: string; y: string }>;
  };
  if (!json.documents || json.documents.length === 0) {
    return null;
  }
  const first = json.documents[0];
  return {
    address: query,
    lat: Number(first.y),
    lng: Number(first.x),
  };
};

const geocodeByNominatim = async (query: string): Promise<GeoPoint | null> => {
  if (Date.now() < getBlockedUntil()) {
    return null;
  }
  const url = buildGeocodeUrl('/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'kr');
  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  });
  if (response.status === 429) {
    // Avoid hammering; pause next requests for a while.
    setBlockedUntil(Date.now() + NOMINATIM_BLOCK_MS);
    return null;
  }
  if (!response.ok) {
    return null;
  }
  const rows = (await response.json()) as Array<{ lat: string; lon: string }>;
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  return {
    address: query,
    lat: Number(rows[0].lat),
    lng: Number(rows[0].lon),
  };
};

export const geocodeAddress = async (address: string): Promise<GeoPoint | null> => {
  const cached = getCachedGeoPoint(address);
  if (cached) {
    return { ...cached, address };
  }

  const variants = createAddressVariants(address);
  for (const query of variants) {
    const kakaoPoint = await geocodeByKakao(query);
    if (kakaoPoint) {
      const normalized = { ...kakaoPoint, address };
      setCachedGeoPoint(address, normalized);
      return normalized;
    }

    const osmPoint = await geocodeByNominatim(query);
    if (osmPoint) {
      const normalized = { ...osmPoint, address };
      setCachedGeoPoint(address, normalized);
      return normalized;
    }
    // If blocked, stop early to reduce additional 429 calls.
    if (Date.now() < nominatimBlockedUntil) {
      break;
    }
  }
  return null;
};

const geocodeWithCache = async (addresses: string[]) => {
  const blockedUntil = getBlockedUntil();
  if (Date.now() < blockedUntil && !KAKAO_REST_API_KEY) {
    const availableAt = new Date(blockedUntil).toLocaleTimeString('ko-KR');
    throw new Error(
      `지오코딩 요청이 일시 제한되었습니다(429). ${availableAt} 이후 재시도하거나 VITE_KAKAO_REST_API_KEY를 설정해 주세요.`,
    );
  }

  const cache = new Map<string, GeoPoint | null>();
  for (let index = 0; index < addresses.length; index += 1) {
    const address = addresses[index];
    if (cache.has(address)) {
      continue;
    }
    // Nominatim 호출 제한을 고려해 순차 요청
    cache.set(address, await geocodeAddress(address));
    if (index < addresses.length - 1) {
      await sleep(1200);
    }
  }
  return cache;
};

export const buildOptimizedRoute = async (options: RoutePlanOptions): Promise<RoutePlanResult> => {
  const geocodedStops: GeoPoint[] = [];
  const failedAddresses: string[] = [];
  const cleanStops = options.stopAddresses;
  const allAddresses = [...cleanStops];
  if (options.startAddress?.trim()) {
    allAddresses.push(cleanAddress(options.startAddress));
  }
  if (options.endAddress?.trim()) {
    allAddresses.push(cleanAddress(options.endAddress));
  }
  const cache = await geocodeWithCache(allAddresses);

  for (const address of cleanStops) {
    const point = cache.get(address) ?? null;
    if (point) {
      geocodedStops.push({ ...point, kind: 'stop' });
    } else {
      failedAddresses.push(address);
    }
  }

  const startAddress = options.startAddress?.trim() ? cleanAddress(options.startAddress) : '';
  const endAddress = options.endAddress?.trim() ? cleanAddress(options.endAddress) : '';
  const startPointRaw = startAddress ? cache.get(startAddress) ?? null : null;
  const endPointRaw = endAddress ? cache.get(endAddress) ?? null : null;

  if (startAddress && !startPointRaw) {
    failedAddresses.push(startAddress);
  }
  if (endAddress && !endPointRaw) {
    failedAddresses.push(endAddress);
  }

  const startPoint = startPointRaw ? { ...startPointRaw, kind: 'start' as const } : undefined;
  const endPoint = endPointRaw ? { ...endPointRaw, kind: 'end' as const } : undefined;

  if (geocodedStops.length === 0) {
    const fullPath = [...(startPoint ? [startPoint] : []), ...(endPoint ? [endPoint] : [])];
    const distanceKm = routeDistance(fullPath);
    const driveMinutes = (distanceKm / Math.max(options.avgSpeedKmh, 1)) * 60;
    return {
      orderedStops: [],
      fullPath,
      failedAddresses,
      totalDistanceKm: distanceKm,
      driveMinutes,
      stayMinutes: 0,
      totalMinutes: driveMinutes,
      startPoint,
      endPoint,
    };
  }

  const optimized = optimizeMultiStart(geocodedStops, startPoint, endPoint);
  const fullPath = [...(startPoint ? [startPoint] : []), ...optimized, ...(endPoint ? [endPoint] : [])];
  const totalDistanceKm = routeDistance(fullPath);
  const driveMinutes = (totalDistanceKm / Math.max(options.avgSpeedKmh, 1)) * 60;
  const stayMinutes = optimized.length * Math.max(options.stayMinutesPerStop, 0);
  const totalMinutes = driveMinutes + stayMinutes;

  return {
    orderedStops: optimized,
    fullPath,
    failedAddresses,
    totalDistanceKm,
    driveMinutes,
    stayMinutes,
    totalMinutes,
    startPoint,
    endPoint,
  };
};


// 현재 위치(위경도)를 주소 문자열로 되돌린다.
// 출발지는 주소 문자열로 다뤄지므로(동선 계산·저장·즐겨찾기 모두) 좌표만으로는 쓸 수 없다.
// 도로명 주소를 우선 쓰고, 없으면 지번 주소로 대체한다.
export const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
  if (!KAKAO_REST_API_KEY) return null;
  const url = buildKakaoUrl('/v2/local/geo/coord2address.json');
  url.searchParams.set('x', String(lng));
  url.searchParams.set('y', String(lat));
  const response = await fetch(url.toString(), {
    headers: !import.meta.env.DEV ? { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } : undefined,
  });
  if (!response.ok) return null;
  const json = (await response.json()) as {
    documents?: Array<{
      road_address?: { address_name?: string } | null;
      address?: { address_name?: string } | null;
    }>;
  };
  const doc = json.documents?.[0];
  return doc?.road_address?.address_name ?? doc?.address?.address_name ?? null;
};
