import type { GeoPoint } from './routeOptimizer';
import { apiPath } from './apiBase';

export type RouteMode = 'car' | 'walk';

export interface RouteLeg {
  distanceKm: number;
  durationMinutes: number;
  geometry: Array<[number, number]>;
}

const KAKAO_NAVI_BASE = import.meta.env.VITE_KAKAO_NAVI_BASE_URL ?? apiPath('/api-kakao-navi');
const OSRM_BASE = import.meta.env.VITE_OSRM_BASE_URL ?? apiPath('/api-osrm');
const KAKAO_REST_API_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY ?? '';
const ROUTE_CACHE_KEY = 'trip-road-route-cache-v1';

const buildUrl = (base: string, path: string) =>
  new URL(`${base}${path}`, window.location.origin);

const legCacheKey = (mode: RouteMode, from: GeoPoint, to: GeoPoint) =>
  `${mode}|${from.lat.toFixed(5)},${from.lng.toFixed(5)}->${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;

const loadCache = (): Record<string, RouteLeg> => {
  try {
    const raw = localStorage.getItem(ROUTE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, RouteLeg>) : {};
  } catch {
    return {};
  }
};

const saveCache = (cache: Record<string, RouteLeg>) => {
  try {
    localStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // quota errors ignored
  }
};

const fetchKakaoCarLeg = async (from: GeoPoint, to: GeoPoint): Promise<RouteLeg | null> => {
  const url = buildUrl(KAKAO_NAVI_BASE, '/v1/directions');
  url.searchParams.set('origin', `${from.lng},${from.lat}`);
  url.searchParams.set('destination', `${to.lng},${to.lat}`);
  url.searchParams.set('priority', 'RECOMMEND');

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (!import.meta.env.DEV && KAKAO_REST_API_KEY) {
    headers.Authorization = `KakaoAK ${KAKAO_REST_API_KEY}`;
  }

  const res = await fetch(url.toString(), { headers });
  const bodyText = await res.text();
  if (!res.ok) {
    let detail = '';
    try {
      const parsed = JSON.parse(bodyText) as { msg?: string; message?: string };
      detail = parsed.msg ?? parsed.message ?? '';
    } catch {
      detail = bodyText.slice(0, 120);
    }
    throw new Error(`Kakao Mobility ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  let json: {
    routes?: Array<{
      result_code?: number;
      result_msg?: string;
      summary?: { distance?: number; duration?: number };
      sections?: Array<{ roads?: Array<{ vertexes?: number[] }> }>;
    }>;
  };
  try {
    json = JSON.parse(bodyText);
  } catch {
    throw new Error('Kakao Mobility 응답 파싱 실패');
  }
  const route = json.routes?.[0];
  if (!route) {
    throw new Error('Kakao Mobility 응답에 routes 없음');
  }
  if (route.result_code !== undefined && route.result_code !== 0) {
    throw new Error(
      `Kakao Mobility result_code=${route.result_code}${route.result_msg ? `: ${route.result_msg}` : ''}`,
    );
  }
  const distanceM = route.summary?.distance ?? 0;
  const durationS = route.summary?.duration ?? 0;
  const geometry: Array<[number, number]> = [];
  route.sections?.forEach((section) => {
    section.roads?.forEach((road) => {
      const vx = road.vertexes ?? [];
      for (let i = 0; i + 1 < vx.length; i += 2) {
        geometry.push([vx[i + 1], vx[i]]);
      }
    });
  });
  if (geometry.length === 0) {
    geometry.push([from.lat, from.lng], [to.lat, to.lng]);
  }
  return {
    distanceKm: distanceM / 1000,
    durationMinutes: durationS / 60,
    geometry,
  };
};

const fetchOsrmLeg = async (
  from: GeoPoint,
  to: GeoPoint,
  profile: 'foot' | 'driving',
): Promise<RouteLeg | null> => {
  const url = buildUrl(
    OSRM_BASE,
    `/route/v1/${profile}/${from.lng},${from.lat};${to.lng},${to.lat}`,
  );
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`OSRM ${res.status}`);
  }
  const json = (await res.json()) as {
    code?: string;
    routes?: Array<{
      distance?: number;
      duration?: number;
      geometry?: { coordinates?: number[][] };
    }>;
  };
  if (json.code !== 'Ok' || !json.routes?.[0]) {
    return null;
  }
  const route = json.routes[0];
  const geometry: Array<[number, number]> =
    route.geometry?.coordinates?.map((c) => [c[1], c[0]] as [number, number]) ?? [
      [from.lat, from.lng],
      [to.lat, to.lng],
    ];
  return {
    distanceKm: (route.distance ?? 0) / 1000,
    durationMinutes: (route.duration ?? 0) / 60,
    geometry,
  };
};

export const fetchRouteLeg = async (
  from: GeoPoint,
  to: GeoPoint,
  mode: RouteMode,
): Promise<RouteLeg | null> => {
  const cache = loadCache();
  const key = legCacheKey(mode, from, to);
  if (cache[key]) {
    return cache[key];
  }
  let leg: RouteLeg | null = null;
  const errors: string[] = [];
  if (mode === 'car') {
    if (KAKAO_REST_API_KEY) {
      try {
        leg = await fetchKakaoCarLeg(from, to);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    } else {
      errors.push('Kakao REST API 키 없음');
    }
    if (!leg) {
      // Fallback: OSRM driving profile (free public server)
      try {
        leg = await fetchOsrmLeg(from, to, 'driving');
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  } else {
    try {
      leg = await fetchOsrmLeg(from, to, 'foot');
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (leg) {
    cache[key] = leg;
    saveCache(cache);
    return leg;
  }
  if (errors.length > 0) {
    throw new Error(errors.join(' | '));
  }
  return null;
};

export interface FullRoute {
  legs: RouteLeg[];
  totalDistanceKm: number;
  totalDurationMinutes: number;
  geometry: Array<[number, number]>;
  failedLegs: Array<{ from: string; to: string; reason: string }>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchRouteForPath = async (
  path: GeoPoint[],
  mode: RouteMode,
  onProgress?: (done: number, total: number) => void,
): Promise<FullRoute> => {
  const legs: RouteLeg[] = [];
  const failedLegs: Array<{ from: string; to: string; reason: string }> = [];
  const geometry: Array<[number, number]> = [];
  let totalKm = 0;
  let totalMin = 0;
  const total = Math.max(0, path.length - 1);
  for (let i = 0; i < total; i += 1) {
    const from = path[i];
    const to = path[i + 1];
    let reason = '경로 없음';
    let leg: RouteLeg | null = null;
    try {
      leg = await fetchRouteLeg(from, to, mode);
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
    if (leg) {
      legs.push(leg);
      totalKm += leg.distanceKm;
      totalMin += leg.durationMinutes;
      leg.geometry.forEach((pt, idx) => {
        if (geometry.length === 0 || idx > 0) geometry.push(pt);
      });
    } else {
      failedLegs.push({ from: from.address, to: to.address, reason });
      legs.push({
        distanceKm: 0,
        durationMinutes: 0,
        geometry: [
          [from.lat, from.lng],
          [to.lat, to.lng],
        ],
      });
      if (geometry.length === 0) geometry.push([from.lat, from.lng]);
      geometry.push([to.lat, to.lng]);
    }
    onProgress?.(i + 1, total);
    if (i < total - 1) {
      await sleep(mode === 'walk' ? 250 : 100);
    }
  }
  return { legs, totalDistanceKm: totalKm, totalDurationMinutes: totalMin, geometry, failedLegs };
};
