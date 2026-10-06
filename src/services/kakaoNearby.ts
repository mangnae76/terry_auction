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
): Promise<NearbyPlace[]> => {
  const params = new URLSearchParams({
    category_group_code: categoryCode,
    x: String(lng),
    y: String(lat),
    radius: String(radius),
    size: String(size),
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
}

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
  return {
    busStop: dedupe(busStop),
    hospital: dedupe(hospital),
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
  };
};
