// 단지 입지비교 — 같은 동의 다른 아파트 단지를 내 물건과 같은 입지조건 · 같은 규칙으로 등수를 매기고,
// 같은 평형(전용면적)의 최근 12개월 평균 전세가 · 매매가를 옆에 둔다(2026-11-10 시안 그대로, 웹 손품조사 · 아파트만).
//  · 입지등수 — 조건마다 가장 가까운 시설까지 거리: 도보 5분(400m) 안 1등 · 10분(800m) 안 2등 · 그 밖 3등. 물건상세 '실사용자 + 입지등수'와 같은 규칙
//  · 주변시설 — 카카오 장소검색(단지 좌표에서 1km). 단지마다 한 번 받아 이 브라우저(30일)와 DB(cacheNearby)에 둔다
//  · 전세 · 매매 — DB 에 받아 둔 국토부 실거래. 단지마다 내 전용면적과 가장 가까운 평형 하나(±5㎡ 안)만, 짐작한 값은 넣지 않는다
import type { CaseTradeRow } from './caseTradeAnalysis';
import { fetchNearbyEnvironment, type NearbyEnvironment, type NearbyPlace } from './kakaoNearby';
import { geocodeAddress } from './routeOptimizer';
import { browserCacheGet, browserCachePut } from './browserCache';
import { cacheKey, readCache, writeCache } from './marketCache';

/** 입지조건별로 어느 주변시설을 보는지 — 물건상세 입지등수와 이 비교가 같이 쓴다(여기 한 줄만 고치면 기준이 바뀐다).
 *  입지조건에서 '일자리'는 뺐다 — 교통이 편하면 일자리 접근성도 좋다(2026-11-10). 남은 조건은 모두 거리로 잰다 */
export const LOCATION_SOURCES: Record<string, Array<keyof NearbyEnvironment>> = {
  교통: ['subway', 'busStop'],
  // 인프라 = 큰 병원 · 큰 공원 · 상업지역(도시계획 용도지역). 마트 · 음식점 · 학원 같은 작은 가게는 뺐다(2026-11-10 사용자 기준)
  인프라: ['hospital', 'bigPark', 'commercialZone', 'market'],   // 전통시장 — 중장년 · 노년층(2026-11-11)
  공원: ['park'],
  유치원: ['daycare'],
  초등학교: ['school'],
  // 학원가 — 학원 하나가 아니라 200m 안 10곳 이상 모인 곳(kakaoNearby academyClusterOf, 2026-11-10)
  학원가: ['academyCluster'],
};
/** 도보 1분 ≈ 80m. 5분 안쪽 1등, 10분 안쪽 2등, 그 밖 3등 */
export const WALK_M_PER_MIN = 80;
/** 길 따라 돌아가는 몫 — 직선거리 × 1.5 를 걷는 거리로 본다(2026-11-11 사용자가 지도 거리재기로 잰 값: 안산파크푸르지오→중앙역 769m → 1.15km(1.50), 예술인→중앙역 808m → 1.12km(1.39)).
 *  TMAP 보행자 경로를 붙이면 이 배수 대신 실제 거리로 바꾼다 */
export const WALK_DETOUR = 1.5;
/** 직선거리(m) → 걸어서 몇 분(길 따라) */
export const walkMinOf = (m: number) => (m * WALK_DETOUR) / WALK_M_PER_MIN;
export const rankFromMeters = (m: number) => { const min = walkMinOf(m); return min <= 5 ? 1 : min <= 10 ? 2 : 3; };

/** 그 조건에서 가장 가까운 한 곳 — 없으면 null(1km 안에 없음). src 는 어느 시설 묶음에서 왔는지(지도 그림 · 색) */
export const nearestPlaceOf = (env: NearbyEnvironment | null | undefined, cond: string): (NearbyPlace & { src: keyof NearbyEnvironment }) | null => {
  const keys = LOCATION_SOURCES[cond];
  if (!env || !keys) return null;
  const all = keys.flatMap((k) => (env[k] ?? []).map((p) => ({ ...p, src: k }))).filter((p) => Number(p.distanceMeters) > 0);
  return all.length ? all.reduce((a, b) => (b.distanceMeters < a.distanceMeters ? b : a)) : null;
};
/** 시설 묶음마다 그림 · 색 — 지도 도구 막대 '주변'(components/KakaoMapTools NEAR_KINDS)과 같은 그림 · 색 */
export const PLACE_ICON: Partial<Record<keyof NearbyEnvironment, { ic: string; color: string; label: string }>> = {
  school: { ic: '🏫', color: '#7c3aed', label: '초등학교' },
  daycare: { ic: '🧒', color: '#a855f7', label: '어린이집' },
  academy: { ic: '📚', color: '#6d28d9', label: '학원' },
  academyCluster: { ic: '📚', color: '#6d28d9', label: '학원가' },
  subway: { ic: '🚇', color: '#2563eb', label: '지하철' },
  busStop: { ic: '🚌', color: '#0891b2', label: '버스정류장' },
  mart: { ic: '🛒', color: '#ea580c', label: '마트' },
  hospital: { ic: '🏥', color: '#dc2626', label: '병원' },
  commerce: { ic: '🍽', color: '#d97706', label: '상권' },
  park: { ic: '🌳', color: '#15803d', label: '공원' },
  bigPark: { ic: '🌳', color: '#15803d', label: '공원' },
  commercialZone: { ic: '🏬', color: '#ea580c', label: '상업지역' },
  market: { ic: '🧺', color: '#c2410c', label: '전통시장' },
};

export type ComplexNearby = { lat: number; lng: number; env: NearbyEnvironment };
const NEARBY_TTL = 30 * 24 * 60 * 60 * 1000;
/** 주소 하나의 좌표만 — 반경 범위로 단지를 고를 때(주변시설은 범위 안 단지만 받는다). 이 브라우저 → DB → 카카오 순 */
export const complexPointOf = async (address: string): Promise<{ lat: number; lng: number } | null> => {
  const key = cacheKey('pt', address);
  const local = await browserCacheGet<{ lat: number; lng: number }>(key, NEARBY_TTL);
  if (local) return local;
  const shared = await readCache<{ lat: number; lng: number }>('cacheNearby', key, NEARBY_TTL);
  if (shared) { void browserCachePut(key, shared); return shared; }
  const p = await geocodeAddress(address, { quick: true }).catch(() => null);
  if (!p) return null;
  const out = { lat: p.lat, lng: p.lng };
  void browserCachePut(key, out); void writeCache('cacheNearby', key, out);
  return out;
};
/** 두 점 사이 직선거리(m) */
export const metersBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const kx = 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((a.lng - b.lng) * kx, (a.lat - b.lat) * 110540);
};
/** 주소 하나의 좌표 + 주변시설 — 이 브라우저 → DB → 카카오 순. 못 찾으면 null */
export const complexNearbyOf = async (address: string): Promise<ComplexNearby | null> => {
  const key = cacheKey('nb4', address);   // nb4 — 인프라에 전통시장을 더한 뒤(2026-11-11)   // nb3 — 인프라(큰 공원 · 상업지역) · 학원가(밀집)를 더한 뒤
  const local = await browserCacheGet<ComplexNearby>(key, NEARBY_TTL);
  if (local) return local;
  const shared = await readCache<ComplexNearby>('cacheNearby', key, NEARBY_TTL);
  if (shared) { void browserCachePut(key, shared); return shared; }
  const p = await geocodeAddress(address, { quick: true }).catch(() => null);
  if (!p) return null;
  const env = await fetchNearbyEnvironment(p.lat, p.lng, 1000);
  const out = { lat: p.lat, lng: p.lng, env };
  void browserCachePut(key, out);
  void writeCache('cacheNearby', key, out);
  return out;
};

export type CompareComplex = {
  /** 같은 동 안의 지번 — 단지 하나 */
  jibun: string;
  name: string;
  umdNm: string;
  /** 이 단지에서 고른 평형(전용면적) */
  area: number;
  /** 최근 12개월 평균(원) — 거래가 없으면 0 */
  jeonseAvg: number;
  saleAvg: number;
  /** 그 평형의 최근 12개월 전세 · 매매 줄(새것부터) */
  deals: CaseTradeRow[];
  /** 건축년도(국토부 실거래의 건축년도 — 사용승인 해). 모르면 0 */
  buildYear: number;
  mine: boolean;
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const t2 = (n: number) => Math.floor(n * 100 + 1e-6) / 100;
const modeOf = (xs: number[]) => { const c = new Map<number, number>(); xs.forEach((x) => c.set(x, (c.get(x) ?? 0) + 1)); return [...c.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0; };
const squash = (s: string) => String(s ?? '').replace(/\s+/g, '');

/** 실거래 → 단지 목록. 단지마다 내 전용면적과 가장 가까운 평형(±tol㎡ 안, 기본 5) 하나, 그 평형의 전세 · 매매가 한 건이라도 있어야 넣는다.
 *  fromYmd8 — 이 날짜(YYYYMMDD)부터의 거래만(조회일부터 12개월) */
export const complexesOf = (rows: CaseTradeRow[], myArea: number, myJibun: string, fromYmd8: string, tol = 5, myUmd = ''): CompareComplex[] => {
  const by = new Map<string, CaseTradeRow[]>();
  rows.forEach((r) => {
    if (!r.jibun || !['매매', '직거래', '전세'].includes(r.kind)) return;
    if (r.contractDate.replace(/\D/g, '') < fromYmd8) return;
    const k = `${squash(r.umdNm)}|${r.jibun}`;
    by.set(k, [...(by.get(k) ?? []), r]);
  });
  const out: CompareComplex[] = [];
  by.forEach((list) => {
    // 평형은 전용면적 소수 둘째 자리까지(버림 — 화면 trunc2 와 같게) 같은 것끼리
    const areas = [...new Set(list.map((r) => t2(r.areaM2)))];
    const near = areas.filter((a) => Math.abs(a - myArea) <= tol).sort((a, b) => Math.abs(a - myArea) - Math.abs(b - myArea))[0];
    if (near === undefined) return;
    const same = list.filter((r) => t2(r.areaM2) === near).sort((a, b) => b.contractDate.localeCompare(a.contractDate));
    out.push({
      jibun: list[0].jibun, name: list.find((r) => r.name)?.name ?? '', umdNm: list[0].umdNm, area: near,
      jeonseAvg: avg(same.filter((r) => r.kind === '전세').map((r) => r.price)),
      saleAvg: avg(same.filter((r) => r.kind !== '전세').map((r) => r.price)),
      // 선정물건 — 지번이 같고(동까지 주면 동도 같아야 — 반경 범위에선 다른 동의 같은 지번이 섞인다)
      deals: same, mine: squash(list[0].jibun) === squash(myJibun) && (!myUmd || squash(list[0].umdNm) === squash(myUmd)),
      // 단지 안에서 가장 많이 적힌 건축년도(동마다 다를 수 있다 — 가장 흔한 해)
      buildYear: modeOf(list.map((r) => r.buildYear ?? 0).filter((y) => y > 1900)),
    });
  });
  return out;
};
