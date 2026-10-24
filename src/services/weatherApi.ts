// 머리글의 지금 기온 — 기상청 초단기실황(공공데이터포털).
//
// 키는 실거래가와 같은 공공데이터포털 서비스키를 쓴다(계정에 기상청 단기예보를 활용신청해 두었다).
// 머리글은 모든 화면에 서므로, 부를 때마다 조회하면 하루 한도를 금방 쓴다 —
// 받은 값을 30분 동안 이 기기에 적어 두고 그 안에서는 다시 부르지 않는다.
import { ref } from 'vue';
import { apiPath } from './apiBase';

const API_KEY = import.meta.env.VITE_PUBLIC_DATA_API_KEY ?? '';
const NOW_PATH = '/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst';

/** 머리글이 보는 곳 — 지금은 인천시청 한 곳이다 */
export const DEFAULT_PLACE = { name: '인천', lat: 37.4563, lng: 126.7052 };

/** 30분 안에 받은 값은 그대로 쓴다 */
const FRESH_MS = 30 * 60 * 1000;
/** 못 받았을 때 꺼내 쓸 옛 값의 나이 한도 — 세 시간 넘은 기온은 지금 기온이라 할 수 없다 */
const STALE_MAX_MS = 3 * 60 * 60 * 1000;

/** 위경도 → 기상청 격자(nx, ny). 기상청이 공개한 람베르트 정각원추 변환 그대로다 */
export const latLngToGrid = (lat: number, lng: number): { nx: number; ny: number } => {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;
  const D = Math.PI / 180;
  const re = RE / GRID;
  const s1 = SLAT1 * D;
  const s2 = SLAT2 * D;
  const olon = OLON * D;
  const olat = OLAT * D;
  const sn = Math.log(Math.cos(s1) / Math.cos(s2))
    / Math.log(Math.tan(Math.PI * 0.25 + s2 * 0.5) / Math.tan(Math.PI * 0.25 + s1 * 0.5));
  const sf = (Math.tan(Math.PI * 0.25 + s1 * 0.5) ** sn * Math.cos(s1)) / sn;
  const ro = (re * sf) / Math.tan(Math.PI * 0.25 + olat * 0.5) ** sn;
  const ra = (re * sf) / Math.tan(Math.PI * 0.25 + lat * D * 0.5) ** sn;
  let theta = lng * D - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;
  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
};

/** 초단기실황은 매시 정각 자료가 40분쯤 나온다 — 40분 전이면 한 시간 앞 자료를 부른다 */
export const nowcastBase = (now: Date = new Date()): { date: string; time: string } => {
  // 한국 시각으로 센다 (기기 시간대가 달라도 기상청 기준은 한국 시각이다)
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  if (kst.getUTCMinutes() < 40) kst.setUTCHours(kst.getUTCHours() - 1);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${kst.getUTCFullYear()}${p2(kst.getUTCMonth() + 1)}${p2(kst.getUTCDate())}`,
    time: `${p2(kst.getUTCHours())}00`,
  };
};

export type NowWeather = {
  /** 기온 (℃) */
  temp: number;
  /** 강수형태 — 0 없음, 1 비, 2 비/눈, 3 눈, 5 빗방울, 6 빗방울눈날림, 7 눈날림 */
  rain: number;
  /** 받아 온 시각 (ms) */
  savedAt: number;
  /** 못 받아서 옛 값을 꺼내 쓴 것인가 */
  stale: boolean;
};

type Stored = { temp: number; rain: number; savedAt: number };

const cacheKeyOf = (nx: number, ny: number) => `myturn.weather.${nx}_${ny}`;

const readStored = (key: string): Stored | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Stored;
    return Number.isFinite(v.temp) && Number.isFinite(v.savedAt) ? v : null;
  } catch {
    return null;
  }
};

const writeStored = (key: string, v: Stored) => {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 못 적어도 화면은 그대로 간다 */ }
};

const fetchNowcast = async (nx: number, ny: number): Promise<Stored> => {
  const base = nowcastBase();
  const url = new URL(`${apiPath('/api-data')}${NOW_PATH}`, window.location.origin);
  url.searchParams.set('serviceKey', API_KEY);
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '10');
  url.searchParams.set('dataType', 'JSON');
  url.searchParams.set('base_date', base.date);
  url.searchParams.set('base_time', base.time);
  url.searchParams.set('nx', String(nx));
  url.searchParams.set('ny', String(ny));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`기상청 응답 ${res.status}`);
  const data = await res.json() as {
    response?: {
      header?: { resultCode?: string; resultMsg?: string };
      body?: { items?: { item?: Array<{ category: string; obsrValue: string }> } };
    };
  };
  const code = data.response?.header?.resultCode;
  if (code !== '00') throw new Error(`기상청 ${code ?? '?'} ${data.response?.header?.resultMsg ?? ''}`);
  const items = data.response?.body?.items?.item ?? [];
  const pick = (cat: string) => Number(items.find((it) => it.category === cat)?.obsrValue);
  const temp = pick('T1H');
  if (!Number.isFinite(temp)) throw new Error('기온 값이 없습니다');
  const rain = pick('PTY');
  return { temp, rain: Number.isFinite(rain) ? rain : 0, savedAt: Date.now() };
};

/**
 * 지금 기온. 30분 안에 받은 값이 있으면 그것을 쓰고, 없으면 받아 온다.
 * 받다가 실패하면 세 시간 안의 옛 값을 꺼내 쓰고(stale), 그것도 없으면 null —
 * 모르는 기온을 지어내지 않는다.
 */
export const getNowWeather = async (
  lat = DEFAULT_PLACE.lat,
  lng = DEFAULT_PLACE.lng,
): Promise<NowWeather | null> => {
  const { nx, ny } = latLngToGrid(lat, lng);
  const key = cacheKeyOf(nx, ny);
  const stored = readStored(key);
  if (stored && Date.now() - stored.savedAt < FRESH_MS) return { ...stored, stale: false };
  if (!API_KEY) return stored && Date.now() - stored.savedAt < STALE_MAX_MS ? { ...stored, stale: true } : null;
  try {
    const fresh = await fetchNowcast(nx, ny);
    writeStored(key, fresh);
    return { ...fresh, stale: false };
  } catch {
    return stored && Date.now() - stored.savedAt < STALE_MAX_MS ? { ...stored, stale: true } : null;
  }
};

// === 머리글이 같이 쓰는 값 ===
// 머리글은 화면마다 새로 그려진다 — 기온은 앱 전체에 하나만 들고, 30분에 한 번만 다시 받는다.

const shared = ref<NowWeather | null>(null);
let inFlight: Promise<void> | null = null;
let lastTry = 0;

export const useNowWeather = () => {
  const due = Date.now() - lastTry > FRESH_MS || !shared.value;
  if (due && !inFlight) {
    lastTry = Date.now();
    inFlight = getNowWeather()
      .then((w) => { shared.value = w; })
      .finally(() => { inFlight = null; });
  }
  return shared;
};
