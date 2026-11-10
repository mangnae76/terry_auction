import { fetchCommercialZone } from './zoning';
const KAKAO_REST_API_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY ?? '';
// In dev: use vite proxy. In prod (mobile): call Kakao directly with auth header.
const KAKAO_BASE =
  (import.meta.env.VITE_KAKAO_GEOCODE_BASE_URL as string | undefined)
  ?? (import.meta.env.DEV ? '/api-kakao' : 'https://dapi.kakao.com');

export interface NearbyPlace {
  name: string;
  distance: string; // "352m" 또는 "1.2km"
  distanceMeters: number;
  category: string;
  phone?: string;
  address?: string;
  /** 좌표 — 지도에 시설을 찍을 때(단지 입지비교). 예전에 저장해 둔 값엔 없을 수 있다 */
  lat?: number;
  lng?: number;
}

const buildHeaders = (): HeadersInit | undefined => {
  if (!import.meta.env.DEV && KAKAO_REST_API_KEY) {
    return { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` };
  }
  return undefined;
};

const formatDistance = (m: number): string => {
  if (m >= 1000) return `${(m / 1000).toFixed(2)}km`;
  return `${Math.round(m)}m`;
};

interface KakaoDoc {
  id: string;
  place_name: string;
  category_name: string;
  category_group_code?: string;
  phone?: string;
  address_name?: string;
  road_address_name?: string;
  x: string; // lng
  y: string; // lat
  distance?: string; // 미터 (string)
}

const dedupe = (items: NearbyPlace[]): NearbyPlace[] => {
  const seen = new Set<string>();
  return items.filter((p) => {
    const key = `${p.name}|${p.distanceMeters}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const searchByCategory = async (
  lng: number,
  lat: number,
  categoryCode: string,
  radius = 1000,
  size = 15,
  page = 1,
): Promise<NearbyPlace[]> => {
  const params = new URLSearchParams({
    category_group_code: categoryCode,
    x: String(lng),
    y: String(lat),
    radius: String(radius),
    size: String(size),
    page: String(page),
    sort: 'distance',
  });
  try {
    const res = await fetch(`${KAKAO_BASE}/v2/local/search/category.json?${params.toString()}`, {
      headers: buildHeaders(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { documents?: KakaoDoc[] };
    return (data.documents ?? []).map((d) => ({
      name: d.place_name,
      distanceMeters: Number(d.distance ?? 0),
      distance: formatDistance(Number(d.distance ?? 0)),
      category: d.category_name,
      phone: d.phone,
      address: d.road_address_name || d.address_name,
      lat: Number(d.y) || undefined,
      lng: Number(d.x) || undefined,
    }));
  } catch {
    return [];
  }
};

const searchByKeyword = async (
  lng: number,
  lat: number,
  query: string,
  radius = 1000,
  size = 15,
): Promise<NearbyPlace[]> => {
  const params = new URLSearchParams({
    query,
    x: String(lng),
    y: String(lat),
    radius: String(radius),
    size: String(size),
    sort: 'distance',
  });
  try {
    const res = await fetch(`${KAKAO_BASE}/v2/local/search/keyword.json?${params.toString()}`, {
      headers: buildHeaders(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { documents?: KakaoDoc[] };
    return (data.documents ?? []).map((d) => ({
      name: d.place_name,
      distanceMeters: Number(d.distance ?? 0),
      distance: formatDistance(Number(d.distance ?? 0)),
      category: d.category_name,
      phone: d.phone,
      address: d.road_address_name || d.address_name,
      lat: Number(d.y) || undefined,
      lng: Number(d.x) || undefined,
    }));
  } catch {
    return [];
  }
};

export interface NearbyEnvironment {
  busStop: NearbyPlace[];
  hospital: NearbyPlace[]; // 종합병원
  clinic: NearbyPlace[]; // 의원
  pharmacy: NearbyPlace[];
  mart: NearbyPlace[];
  convStore: NearbyPlace[];
  publicCenter: NearbyPlace[];
  park: NearbyPlace[];
  realtor: NearbyPlace[];
  subway: NearbyPlace[];
  academy: NearbyPlace[];
  daycare: NearbyPlace[];
  /** 초등학교 (SC4 학교 중 이름으로 거른다) */
  school: NearbyPlace[];
  /** 상권 — 음식점이 모인 곳을 상권으로 본다 */
  commerce: NearbyPlace[];
  /** 큰 공원 — 어린이공원 · 소공원 · 쌈지공원은 뺀 공원(입지조건 인프라, 2026-11-10). 예전에 저장한 값엔 없을 수 있다 */
  bigPark?: NearbyPlace[];
  /** 가까운 상업지역(도시계획 용도지역, 브이월드) — 하나. 안에 있으면 1m */
  commercialZone?: NearbyPlace[];
  /** 학원가 — 200m 안 학원 10곳 이상 모인 곳의 가운데(하나). 없으면 빈 배열 */
  academyCluster?: NearbyPlace[];
}

/** 학원가 — 반경 200m 안에 학원이 10곳 이상 모인 곳(2026-11-10 사용자 기준). 학원 하나로는 학원가로 보지 않는다.
 *  1km 안 학원(카카오 학원 업종, 최대 45곳)마다 200m 안 학원 수를 세고, 10곳 이상인 무리의 가운데(그 무리 좌표 평균) 중
 *  이 점에서 가장 가까운 곳 하나. 없으면 빈 배열 */
export const ACADEMY_CLUSTER_RADIUS = 200;
export const ACADEMY_CLUSTER_MIN = 10;
const meterBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const kx = 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((a.lng - b.lng) * kx, (a.lat - b.lat) * 110540);
};
export const academyClusterOf = (lat: number, lng: number, academies: NearbyPlace[]): NearbyPlace[] => {
  const pts = academies.filter((p) => p.lat && p.lng) as Array<NearbyPlace & { lat: number; lng: number }>;
  let best: NearbyPlace | null = null;
  pts.forEach((seed) => {
    const near = pts.filter((p) => meterBetween(seed, p) <= ACADEMY_CLUSTER_RADIUS);
    if (near.length < ACADEMY_CLUSTER_MIN) return;
    const c = { lat: near.reduce((a, p) => a + p.lat, 0) / near.length, lng: near.reduce((a, p) => a + p.lng, 0) / near.length };
    const m = Math.max(1, Math.round(meterBetween({ lat, lng }, c)));
    if (!best || m < best.distanceMeters) {
      best = { name: `학원가 · 학원 ${near.length}곳`, distanceMeters: m, distance: m >= 1000 ? `${(m / 1000).toFixed(2)}km` : `${m}m`, category: '교육 > 학원가', lat: c.lat, lng: c.lng };
    }
  });
  return best ? [best] : [];
};

export const fetchNearbyEnvironment = async (
  lat: number,
  lng: number,
  radius = 1000,
): Promise<NearbyEnvironment> => {
  const [
    busStop,
    hospital,
    pharmacy,
    mart,
    convStore,
    publicCenter,
    park,
    realtor,
    subway,
    academy,
    daycare,
    clinic,
    school,
    commerce,
  ] = await Promise.all([
    searchByKeyword(lng, lat, '버스정류장', radius, 15),
    searchByCategory(lng, lat, 'HP8', radius, 15).then((items) =>
      items.filter((p) => /종합병원|대학병원/.test(p.category)),
    ),
    searchByCategory(lng, lat, 'PM9', radius, 15),
    searchByCategory(lng, lat, 'MT1', radius, 15),
    searchByCategory(lng, lat, 'CS2', radius, 15),
    searchByKeyword(lng, lat, '행정복지센터', radius, 10),
    searchByKeyword(lng, lat, '공원', radius, 15),
    searchByCategory(lng, lat, 'AG2', radius, 15),
    searchByCategory(lng, lat, 'SW8', Math.max(radius, 1500), 10),
    searchByCategory(lng, lat, 'AC5', radius, 15),
    searchByKeyword(lng, lat, '어린이집', radius, 15),
    searchByCategory(lng, lat, 'HP8', radius, 15).then((items) =>
      items.filter((p) => !/종합병원|대학병원/.test(p.category)),
    ),
    searchByCategory(lng, lat, 'SC4', radius, 15).then((items) =>
      items.filter((p) => /초등학교/.test(p.name)),
    ),
    searchByCategory(lng, lat, 'FD6', radius, 15),
  ]);
  // 인프라 — 큰 병원 · 큰 공원 · 상업지역(2026-11-10). 병원 업종 15곳은 의원이 먼저 차서 종합병원이 밀린다 — '종합병원'으로 한 번 더 찾는다
  // 학원가 — 학원을 세 쪽(45곳)까지 받아 200m 안 10곳 이상 모인 곳을 찾는다
  const [bigHospital, commercialZone, academy2, academy3] = await Promise.all([
    searchByKeyword(lng, lat, '종합병원', radius, 15).then((items) => items.filter((p) => /종합병원|대학병원/.test(p.category))),
    fetchCommercialZone(lat, lng),
    academy.length >= 15 ? searchByCategory(lng, lat, 'AC5', radius, 15, 2) : Promise.resolve([] as NearbyPlace[]),
    academy.length >= 15 ? searchByCategory(lng, lat, 'AC5', radius, 15, 3) : Promise.resolve([] as NearbyPlace[]),
  ]);
  const allAcademy = dedupe([...academy, ...academy2, ...academy3]);
  const bigPark = park.filter((p) => /공원$|공원\s|수목원|숲$/.test(p.name) && !/어린이|소공원|쌈지|놀이터|주차장|화장실|입구|정류장/.test(p.name));
  return {
    busStop: dedupe(busStop),
    hospital: dedupe([...hospital, ...bigHospital]),
    clinic: dedupe(clinic),
    pharmacy: dedupe(pharmacy),
    mart: dedupe(mart),
    convStore: dedupe(convStore),
    publicCenter: dedupe(publicCenter),
    park: dedupe(park),
    realtor: dedupe(realtor),
    subway: dedupe(subway),
    academy: dedupe(academy),
    daycare: dedupe(daycare),
    school: dedupe(school),
    commerce: dedupe(commerce),
    bigPark: dedupe(bigPark),
    commercialZone,
    academyCluster: academyClusterOf(lat, lng, allAcademy),
  };
};
