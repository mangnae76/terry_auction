// 머리글의 원/달러 — 한국수출입은행 현재환율(매매기준율).
//
// 인증키는 앱에 넣지 않는다 — 중계 서버(운영, 비밀값 EXIM_API_KEY)와 개발 서버(.env 의 EXIM_API_KEY)가
// authkey 로 붙여서 보낸다. 키가 없으면 수출입은행이 result 3 을 돌려주고, 머리글은 'USD –' 로 둔다.
//
// 고시는 영업일 하루 한 번(대략 11시 무렵)이다. 그 전이거나 주말·공휴일이면 그날 자료가 비어 있어
// 하루씩 거슬러 가며 가장 가까운 고시일을 찾는다. 등락은 그 앞 고시일과의 차이다.
import { apiPath } from './apiBase';

const PATH = '/site/program/financial/exchangeJSON';
/** 하루 안에도 한 번은 바뀐다(아침에 비었다가 고시) — 받은 값은 세 시간만 그대로 쓴다 */
const FRESH_MS = 3 * 60 * 60 * 1000;
/** 못 받았을 때 꺼내 쓸 옛 값의 나이 한도 */
const STALE_MAX_MS = 3 * 24 * 60 * 60 * 1000;
/** 이만큼 거슬러 가도 고시가 없으면 포기한다 (연휴 포함) */
const LOOKBACK_DAYS = 10;

export type UsdRate = {
  /** 매매기준율 (원) */
  rate: number;
  /** 앞 고시일 대비 (원) */
  change: number;
  /** 고시일 YYYYMMDD */
  date: string;
  savedAt: number;
  /** 못 받아서 옛 값을 꺼내 쓴 것인가 */
  stale: boolean;
};

type Stored = Omit<UsdRate, 'stale'>;
const CACHE_KEY = 'myturn.fx.usd';
/** 지난 날의 고시값은 바뀌지 않는다 — 날짜별로 적어 두고 다시 부르지 않는다 */
const DAY_KEY = 'myturn.fx.usd.days';

const readJson = <T>(key: string): T | null => {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : null; } catch { return null; }
};
const writeJson = (key: string, v: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 못 적어도 그만 */ }
};

/** 한국 시각 기준 날짜 — 오늘에서 n 일 전 */
export const kstYmd = (now: Date, daysBack = 0): string => {
  const d = new Date(now.getTime() + 9 * 60 * 60 * 1000 - daysBack * 24 * 60 * 60 * 1000);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`;
};

/** '1,385.20' → 1385.2 */
export const parseRate = (raw: string | null | undefined): number | null => {
  const n = Number(String(raw ?? '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

class FxAuthError extends Error {}

/** 그날의 USD 매매기준율. 고시가 없는 날이면 null */
const usdOn = async (ymd: string): Promise<number | null> => {
  const days = readJson<Record<string, number>>(DAY_KEY) ?? {};
  if (days[ymd]) return days[ymd];
  const url = new URL(`${apiPath('/api-exim')}${PATH}`, window.location.origin);
  url.searchParams.set('searchdate', ymd);
  url.searchParams.set('data', 'AP01');
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`수출입은행 응답 ${res.status}`);
  const rows = await res.json() as Array<{ result?: number; cur_unit?: string | null; deal_bas_r?: string | null }>;
  if (!Array.isArray(rows) || rows.length === 0) return null; // 고시 없는 날
  // 3 = 인증키 오류, 4 = 하루 호출 한도 마감 — 거슬러 가도 소용없다
  if (rows[0]?.result === 3 || rows[0]?.result === 4) throw new FxAuthError(`수출입은행 result ${rows[0].result}`);
  const rate = parseRate(rows.find((r) => r.cur_unit === 'USD')?.deal_bas_r);
  if (rate && ymd !== kstYmd(new Date())) {
    // 오늘 값은 아직 바뀔 수 있어 적어 두지 않는다
    days[ymd] = rate;
    // 오래된 날은 지운다 — 열흘 치만 남긴다
    const keep = Object.keys(days).sort().slice(-LOOKBACK_DAYS);
    writeJson(DAY_KEY, Object.fromEntries(keep.map((k) => [k, days[k]])));
  }
  return rate;
};

const fetchUsd = async (): Promise<Stored> => {
  const now = new Date();
  const found: Array<{ ymd: string; rate: number }> = [];
  for (let back = 0; back <= LOOKBACK_DAYS && found.length < 2; back += 1) {
    const ymd = kstYmd(now, back);
    const rate = await usdOn(ymd);
    if (rate) found.push({ ymd, rate });
  }
  if (found.length === 0) throw new Error('최근 고시가 없습니다');
  const [latest, prev] = found;
  const change = prev ? Math.round((latest.rate - prev.rate) * 100) / 100 : 0;
  return { rate: latest.rate, change, date: latest.ymd, savedAt: Date.now() };
};

/**
 * 지금 원/달러. 세 시간 안에 받은 값이 있으면 그것을 쓰고, 없으면 받아 온다.
 * 못 받으면 사흘 안의 옛 값을 쓰고, 그것도 없으면 null — 환율을 지어내지 않는다.
 */
export const getUsdRate = async (): Promise<UsdRate | null> => {
  const stored = readJson<Stored>(CACHE_KEY);
  if (stored && Date.now() - stored.savedAt < FRESH_MS) return { ...stored, stale: false };
  try {
    const fresh = await fetchUsd();
    writeJson(CACHE_KEY, fresh);
    return { ...fresh, stale: false };
  } catch {
    return stored && Date.now() - stored.savedAt < STALE_MAX_MS ? { ...stored, stale: true } : null;
  }
};
