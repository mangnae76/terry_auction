// 머리글의 동네 이름 — 휴대폰 위치를 받아 카카오로 행정동 이름을 찾는다.
//
// 위치 권한은 처음 한 번 묻는다. 거절하면 다시 묻지 않고 기본 자리(인천)로 둔다.
// 머리글은 모든 화면에 서므로 받은 자리를 30분 동안 이 기기에 적어 두고 다시 묻지 않는다.
// 카카오 키는 임장경로의 주소 찾기(reverseGeocode)와 같은 길로 붙인다 — 개발 땐 vite 가,
// 운영에선 앱이 붙인다(중계 서버에 아직 카카오 비밀값이 없다).
import { apiPath } from './apiBase';

const KAKAO_REST_API_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY ?? '';

export type HerePlace = {
  /** 머리글에 적을 이름 — '부평1동' 같은 행정동 */
  name: string;
  lat: number;
  lng: number;
  /** 기기 위치에서 온 자리인가 (아니면 기본 자리) */
  fromDevice: boolean;
};

/** 위치를 못 받을 때 쓰는 자리 — 인천시청 */
export const DEFAULT_PLACE: HerePlace = { name: '인천', lat: 37.4563, lng: 126.7052, fromDevice: false };

const PLACE_KEY = 'myturn.place';
const DENIED_KEY = 'myturn.place.denied';
/** 30분 안에 받은 자리는 그대로 쓴다 */
const FRESH_MS = 30 * 60 * 1000;
/** 위치를 잠깐 못 받았을 때 꺼내 쓸 자리의 나이 한도 */
const STALE_MAX_MS = 24 * 60 * 60 * 1000;

type Stored = HerePlace & { savedAt: number };

const readStored = (): Stored | null => {
  try {
    const raw = localStorage.getItem(PLACE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Stored;
    return v && Number.isFinite(v.lat) && Number.isFinite(v.lng) && v.name ? v : null;
  } catch {
    return null;
  }
};
const writeStored = (v: Stored) => {
  try { localStorage.setItem(PLACE_KEY, JSON.stringify(v)); } catch { /* 못 적어도 그만 */ }
};
const wasDenied = () => {
  try { return localStorage.getItem(DENIED_KEY) === '1'; } catch { return false; }
};
const markDenied = () => {
  try { localStorage.setItem(DENIED_KEY, '1'); } catch { /* 못 적어도 그만 */ }
};

/** 기기 위치 — 동네 이름만 알면 되므로 정밀 위치는 쓰지 않는다(빠르고 배터리를 덜 쓴다) */
const devicePosition = (): Promise<GeolocationPosition> => new Promise((resolve, reject) => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    reject(new Error('위치 기능이 없습니다'));
    return;
  }
  navigator.geolocation.getCurrentPosition(resolve, reject, {
    enableHighAccuracy: false,
    timeout: 8000,
    maximumAge: FRESH_MS,
  });
});

/** 좌표 → 행정동 이름. 행정동이 없으면 법정동, 그것도 없으면 구 이름 */
export const regionNameAt = async (lat: number, lng: number): Promise<string | null> => {
  const url = new URL(`${apiPath('/api-kakao')}/v2/local/geo/coord2regioncode.json`, window.location.origin);
  url.searchParams.set('x', String(lng));
  url.searchParams.set('y', String(lat));
  const res = await fetch(url.toString(), {
    headers: !import.meta.env.DEV && KAKAO_REST_API_KEY ? { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } : undefined,
  });
  if (!res.ok) return null;
  const json = await res.json() as {
    documents?: Array<{ region_type?: string; region_2depth_name?: string; region_3depth_name?: string }>;
  };
  const docs = json.documents ?? [];
  const pick = (type: string) => docs.find((d) => d.region_type === type)?.region_3depth_name?.trim();
  return pick('H') || pick('B') || docs[0]?.region_2depth_name?.trim() || null;
};

/** 적어 둔 자리를 바로 꺼낸다 (부르지 않는다) — 화면을 열자마자 그릴 때 쓴다 */
export const peekHerePlace = (): HerePlace => {
  const stored = readStored();
  return stored && Date.now() - stored.savedAt < STALE_MAX_MS ? stored : DEFAULT_PLACE;
};

/**
 * 지금 자리. 30분 안에 받은 자리가 있으면 그것을 쓰고, 없으면 기기 위치를 묻는다.
 * 거절하면 기본 자리로 두고 다시 묻지 않는다. 위치를 잠깐 못 받으면 하루 안의 옛 자리를 쓴다.
 */
export const getHerePlace = async (): Promise<HerePlace> => {
  const stored = readStored();
  if (stored && Date.now() - stored.savedAt < FRESH_MS) return stored;
  if (wasDenied()) return DEFAULT_PLACE;
  try {
    const pos = await devicePosition();
    const { latitude: lat, longitude: lng } = pos.coords;
    let name: string | null = null;
    try { name = await regionNameAt(lat, lng); } catch { name = null; }
    // 이름을 못 찾았으면 전에 적어 둔 이름이라도 — 그것도 없으면 '내 위치'
    const place: Stored = { name: name ?? stored?.name ?? '내 위치', lat, lng, fromDevice: true, savedAt: Date.now() };
    writeStored(place);
    return place;
  } catch (err) {
    // 1 = 사용자가 거절함 — 다시 묻지 않는다
    if ((err as GeolocationPositionError | undefined)?.code === 1) markDenied();
    if (stored && Date.now() - stored.savedAt < STALE_MAX_MS) return stored;
    return DEFAULT_PLACE;
  }
};
