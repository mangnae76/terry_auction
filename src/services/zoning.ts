// 용도지역 — 브이월드 2D 데이터(LT_C_UQ111 도시지역 용도지역)에서 가까운 상업지역까지의 거리.
// 입지조건 '인프라'의 상업지 — 가게 하나가 아니라 도시계획상 상업지역(중심 · 일반 · 근린 · 유통상업지역) 구역 경계까지 잰다(2026-11-10).
// 브이월드는 CORS 를 막고 키를 query 로 받아 중계 서버(/api-vworld)가 키를 붙인다
import { apiPath } from './apiBase';
import type { NearbyPlace } from './kakaoNearby';

const VWORLD_BASE = apiPath('/api-vworld');
type Ring = number[][];
type Feature = { properties?: { uname?: string }; geometry?: { type?: string; coordinates?: unknown } };

/** 위경도 → 이 점 둘레의 평면 m(가까운 거리만 재므로 평면으로 충분) */
const toXY = (lat0: number, lng0: number) => {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180); const ky = 110540;
  return { xy: (lng: number, lat: number) => [(lng - lng0) * kx, (lat - lat0) * ky] as const, back: (x: number, y: number) => ({ lat: lat0 + y / ky, lng: lng0 + x / kx }) };
};
/** 점(0,0)이 다각형 안인가 — 반직선 세기 */
const inside = (ring: Array<readonly [number, number]>) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > 0) !== (yj > 0) && 0 < ((xj - xi) * (0 - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
/** 점(0,0)에서 선분까지 가장 가까운 점 */
const nearestOnSeg = (a: readonly [number, number], b: readonly [number, number]) => {
  const dx = b[0] - a[0]; const dy = b[1] - a[1]; const L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / L)) : 0;
  return [a[0] + t * dx, a[1] + t * dy] as const;
};
const polygonsOf = (g: Feature['geometry']): Ring[][] => {
  if (!g?.coordinates) return [];
  if (g.type === 'Polygon') return [g.coordinates as Ring[]];
  if (g.type === 'MultiPolygon') return g.coordinates as Ring[][];
  return [];
};

/** 이 점이 들어 있는 법정 읍면동 경계(가장 큰 다각형의 바깥 고리) — 브이월드 LT_C_ADEMD_INFO. 단지 입지비교 범위 '읍면동'을 지도에(2026-11-11) */
const dongMemo = new Map<string, Promise<Array<{ lat: number; lng: number }> | null>>();
export const dongShapeOf = (lat: number, lng: number) => {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (!dongMemo.has(key)) dongMemo.set(key, (async () => {
    const q = new URLSearchParams({ service: 'data', request: 'GetFeature', data: 'LT_C_ADEMD_INFO', geomFilter: `POINT(${lng} ${lat})`, format: 'json', size: '5', crs: 'EPSG:4326', geometry: 'true', attribute: 'true' });
    try {
      const res = await fetch(`${VWORLD_BASE}/req/data?${q.toString()}`);
      if (!res.ok) return null;
      const json = (await res.json()) as { response?: { result?: { featureCollection?: { features?: Feature[] } } } };
      const f = json.response?.result?.featureCollection?.features?.[0];
      const rings = polygonsOf(f?.geometry).map((poly) => poly[0] ?? []).sort((a, b) => b.length - a.length);
      const ring = rings[0] ?? [];
      return ring.length >= 3 ? ring.map((p) => ({ lat: p[1], lng: p[0] })) : null;
    } catch { return null; }
  })());
  return dongMemo.get(key)!;
};

/** 이 점이 들어 있는 필지의 경계(바깥 고리, 위경도) — 브이월드 연속지적도(LP_PA_CBND_BUBUN). 아파트 단지 테두리를 그린다(2026-11-11).
 *  같은 점은 이 창에서 한 번만 받는다. 못 받으면 null */
const parcelMemo = new Map<string, Promise<Array<{ lat: number; lng: number }> | null>>();
export const parcelShapeOf = (lat: number, lng: number) => {
  const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  if (!parcelMemo.has(key)) parcelMemo.set(key, (async () => {
    const q = new URLSearchParams({ service: 'data', request: 'GetFeature', data: 'LP_PA_CBND_BUBUN', geomFilter: `POINT(${lng} ${lat})`, format: 'json', size: '5', crs: 'EPSG:4326', geometry: 'true', attribute: 'true' });
    try {
      const res = await fetch(`${VWORLD_BASE}/req/data?${q.toString()}`);
      if (!res.ok) return null;
      const json = (await res.json()) as { response?: { result?: { featureCollection?: { features?: Feature[] } } } };
      const f = json.response?.result?.featureCollection?.features?.[0];
      const ring = polygonsOf(f?.geometry)[0]?.[0] ?? [];
      return ring.length >= 3 ? ring.map((p) => ({ lat: p[1], lng: p[0] })) : null;
    } catch { return null; }
  })());
  return parcelMemo.get(key)!;
};

/** 이 점에서 가장 가까운 상업지역 — 안에 있으면 1m, 1.3km 안에 없거나 못 받으면 빈 배열 */
export const fetchCommercialZone = async (lat: number, lng: number): Promise<NearbyPlace[]> => {
  const d = 0.012;
  const q = new URLSearchParams({ service: 'data', request: 'GetFeature', data: 'LT_C_UQ111', geomFilter: `BOX(${lng - d},${lat - d},${lng + d},${lat + d})`, format: 'json', size: '1000', crs: 'EPSG:4326', geometry: 'true', attribute: 'true' });
  try {
    const res = await fetch(`${VWORLD_BASE}/req/data?${q.toString()}`);
    if (!res.ok) return [];
    const json = (await res.json()) as { response?: { result?: { featureCollection?: { features?: Feature[] } } } };
    const feats = (json.response?.result?.featureCollection?.features ?? []).filter((f) => /상업지역/.test(f.properties?.uname ?? ''));
    const { xy, back } = toXY(lat, lng);
    let best: { m: number; x: number; y: number; name: string } | null = null;
    feats.forEach((f) => polygonsOf(f.geometry).forEach((poly) => {
      const outer = (poly[0] ?? []).map((p) => xy(p[0], p[1]));
      if (outer.length < 3) return;
      const name = f.properties?.uname ?? '상업지역';
      if (inside(outer)) { best = { m: 1, x: 0, y: 0, name }; return; }
      for (let i = 0; i < outer.length; i += 1) {
        const [x, y] = nearestOnSeg(outer[i], outer[(i + 1) % outer.length]);
        const m = Math.hypot(x, y);
        if (!best || m < best.m) best = { m, x, y, name };
      }
    }));
    const b = best as { m: number; x: number; y: number; name: string } | null;
    if (!b || b.m > 1300) return [];
    const at = back(b.x, b.y); const m = Math.max(1, Math.round(b.m));
    return [{ name: b.name, distanceMeters: m, distance: m >= 1000 ? `${(m / 1000).toFixed(2)}km` : `${m}m`, category: '용도지역 > 상업지역', lat: at.lat, lng: at.lng }];
  } catch {
    return [];
  }
};
