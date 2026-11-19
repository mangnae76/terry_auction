// 주소 찾기 — '정자동' 처럼 동 이름 · 도로명 · 건물 이름 일부만 적어도 후보를 띄운다.
// 카카오 주소 검색(행정구역 · 도로명 · 지번)을 먼저 보고, 모자라면 장소 검색(건물 · 아파트 이름)으로 채운다.
import { apiPath } from './apiBase';

const KEY = import.meta.env.VITE_KAKAO_REST_API_KEY ?? '';
const BASE = import.meta.env.VITE_KAKAO_GEOCODE_BASE_URL ?? apiPath('/api-kakao');
const headers = () => (!import.meta.env.DEV && KEY ? { Authorization: `KakaoAK ${KEY}` } : undefined);

export type AddressHit = {
  /** 고르면 칸에 들어갈 주소 — 도로명이 있으면 도로명, 없으면 지번 · 행정구역 */
  address: string;
  /** 아래 작은 글 — 지번 주소나 건물 이름 */
  sub: string;
};

const get = async (path: string, query: string, size: number) => {
  const params = new URLSearchParams({ query, size: String(size) });
  const res = await fetch(`${BASE}${path}?${params.toString()}`, { headers: headers() });
  if (!res.ok) return [];
  const json = (await res.json()) as { documents?: Array<Record<string, unknown>> };
  return json.documents ?? [];
};

export const searchAddress = async (q: string): Promise<AddressHit[]> => {
  const query = q.trim();
  if (query.length < 2) return [];
  const out: AddressHit[] = [];
  const seen = new Set<string>();
  const push = (h: AddressHit) => { if (h.address && !seen.has(h.address)) { seen.add(h.address); out.push(h); } };
  try {
    for (const d of await get('/v2/local/search/address.json', query, 10)) {
      const road = (d.road_address as { address_name?: string; building_name?: string } | null) ?? null;
      const jibun = String(d.address_name ?? '');
      push({ address: road?.address_name || jibun, sub: road?.address_name ? `${jibun}${road.building_name ? ` · ${road.building_name}` : ''}` : '' });
    }
    if (out.length < 5) {
      for (const d of await get('/v2/local/search/keyword.json', query, 10)) {
        const road = String(d.road_address_name ?? ''); const jibun = String(d.address_name ?? '');
        push({ address: road || jibun, sub: `${String(d.place_name ?? '')}${road && jibun ? ` · ${jibun}` : ''}` });
      }
    }
  } catch { /* 찾기가 막혀도 손으로 적을 수 있다 */ }
  return out.slice(0, 10);
};

/** 지번 주소 → 카카오 주소 검색이 아는 건물명(도로명 주소의 building_name). 없으면 ''.
 *  건축물대장에 이름이 비어 있는 작은 빌라(검암동 614-3 '디자인' 등)를 채운다(2026-11-19). 지번마다 한 번만 묻고 이 브라우저에 기억한다 */
const NAME_KEY = 'ta.kakaoBldName';
const nameMemo = new Map<string, Promise<string>>();
const nameStore = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(NAME_KEY) || '{}'); } catch { return {}; } };
export const kakaoBuildingName = (lot: string): Promise<string> => {
  const q = lot.replace(/\s*\(.*$/, '').replace(/\s+/g, ' ').trim();
  if (!q) return Promise.resolve('');
  const saved = nameStore()[q];
  if (saved !== undefined) return Promise.resolve(saved);
  if (!nameMemo.has(q)) {
    nameMemo.set(q, (async () => {
      try {
        const d = (await get('/v2/local/search/address.json', q, 1))[0];
        const name = String(((d?.road_address as { building_name?: string } | null) ?? null)?.building_name ?? '').trim();
        if (d) { try { const all = nameStore(); all[q] = name; localStorage.setItem(NAME_KEY, JSON.stringify(all)); } catch { /* 기억만 못 한다 */ } }
        return name;
      } catch { return ''; }
    })());
  }
  return nameMemo.get(q)!;
};
