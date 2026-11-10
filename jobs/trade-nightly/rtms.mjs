// 국토부 실거래(RTMS) 한 달치 받기 · 저장 문서 이름 — 새벽 적재 작업이 쓰는 순수 함수들.
// 화면(src/services/publicDataApi.ts · marketCache.ts)과 똑같은 모양으로 적어야 화면이 그대로 읽는다.
// 그래서 문서 이름(cacheKey) · 종류 이름(typeLabel) · 받아 온 줄 모양을 앱 코드와 같게 둔다 — rtms.test.mjs 가 앱 코드와 맞는지 본다.

/** 화면이 쓰는 국토부 주소 — publicDataApi.ts 의 *_API_PATH 와 같다 */
export const PATHS = {
  aptTrade: '/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev',
  aptRent: '/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent',
  offiTrade: '/1613000/RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade',
  offiRent: '/1613000/RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent',
  villaTrade: '/1613000/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade',
  villaRent: '/1613000/RTMSDataSvcRHRent/getRTMSDataSvcRHRent',
  singleTrade: '/1613000/RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade',
  singleRent: '/1613000/RTMSDataSvcSHRent/getRTMSDataSvcSHRent',
  nrgTrade: '/1613000/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade',
};
/** 손으로 지역을 더할 때 쓰는 이름 — 'apt' 면 아파트 매매 · 전월세 둘 다 */
export const KIND_PATHS = {
  apt: [PATHS.aptTrade, PATHS.aptRent],
  villa: [PATHS.villaTrade, PATHS.villaRent],
  officetel: [PATHS.offiTrade, PATHS.offiRent],
  single: [PATHS.singleTrade, PATHS.singleRent],
  commercial: [PATHS.nrgTrade],
};

export const COLLECTION = 'cacheTradeMonth';

/** 지역 표(src/services/regionCodes.ts 글자) → { 시도: [시군구 5자리 …] }. 화면과 같은 표를 읽어 둘이 어긋나지 않게 */
export const regionTable = (src) => {
  const out = {};
  for (const m of String(src).matchAll(/sido: '([^']+)',\s*districts: \[([\s\S]*?)\]/g)) {
    out[m[1]] = [...m[2].matchAll(/lawdCode: '(\d{5})'/g)].map((x) => x[1]);
  }
  return out;
};

/** 지역 표 → { 시군구 5자리: '인천 부평구' } — 적재 결과 요약에 이름으로 적는다(2026-11-10) */
const SIDO_SHORT = (sido) => sido.replace(/특별자치시$|특별자치도$|특별시$|광역시$/, '').replace(/^(경기|강원|충청북|충청남|전라북|전라남|경상북|경상남)도$/, (_, a) => ({ 충청북: '충북', 충청남: '충남', 전라북: '전북', 전라남: '전남', 경상북: '경북', 경상남: '경남' }[a] ?? a));
export const regionNames = (src) => {
  const out = {};
  for (const m of String(src).matchAll(/sido: '([^']+)',\s*districts: \[([\s\S]*?)\]/g)) {
    for (const x of m[2].matchAll(/label: '([^']+)', lawdCode: '(\d{5})'/g)) out[x[2]] = `${SIDO_SHORT(m[1])} ${x[1]}`;
  }
  return out;
};
/** 주소 → 종류 이름(요약 표) */
export const KIND_NAMES = {
  aptTrade: '아파트 매매', aptRent: '아파트 전월세', villaTrade: '연립·다세대 매매', villaRent: '연립·다세대 전월세',
  offiTrade: '오피스텔 매매', offiRent: '오피스텔 전월세', singleTrade: '단독 매매', singleRent: '단독 전월세', nrgTrade: '상업업무 매매',
};
export const kindNameOf = (path) => KIND_NAMES[Object.keys(PATHS).find((k) => PATHS[k] === path)] ?? path;

/** marketCache.ts 의 cacheKey 와 같다 */
export const cacheKey = (...parts) =>
  parts.map((p) => String(p).replace(/\s+/g, '').replace(/[/\\.#$[\]]/g, '-')).join('_');
export const docId = (lawdCd5, path, ymd) => cacheKey(lawdCd5, path, ymd);

/** 문서 이름 → 지역 · 주소 · 달. 모르는 주소면 null */
export const parseDocId = (id) => {
  const m = /^(\d{5})_(.+)_(\d{6})$/.exec(id);
  if (!m) return null;
  const path = Object.values(PATHS).find((p) => cacheKey(p) === m[2]);
  return path ? { lawdCd5: m[1], path, ymd: m[3] } : null;
};

/** publicDataApi.ts 의 propertyTypeLabel 과 같다 (전월세 주소는 주소 그대로) */
export const typeLabelOf = (path) => {
  if (path === PATHS.villaTrade) return '연립다세대';
  if (path === PATHS.offiTrade) return '오피스텔';
  if (path === PATHS.aptTrade) return '아파트';
  return path;
};

/** 확정 — 그 달이 끝나고(한국 시각 다음 달 1일 0시) 60일 지난 때(ms).
 *  실거래는 계약 30일 안에 신고되고 계약해제가 늦게 붙어, 그때까지는 그 달 자료가 바뀐다.
 *  그 뒤에 받아 둔 달은 다시 받지 않는다 */
export const FINAL_AFTER_DAYS = 60;
export const monthFinalAt = (ymd) => {
  const y = Number(String(ymd).slice(0, 4)); const m = Number(String(ymd).slice(4, 6));
  return Date.UTC(y, m, 1) - 9 * 3600 * 1000 + FINAL_AFTER_DAYS * 24 * 3600 * 1000;
};

/** 한국 시각 기준 n 달 전의 'YYYYMM' (0 = 이번 달) */
export const ymdAgo = (n, now = Date.now()) => {
  const k = new Date(now + 9 * 3600 * 1000);
  const d = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth() - n, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const asArray = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []);
const sleep = (ms) => new Promise((ok) => { setTimeout(ok, ms); });

/** 하루 한도에 걸렸거나 이 키로 신청 안 된 API — 이 주소는 오늘 더 부르지 않는다 */
export class QuotaError extends Error {}

/** 한 쪽 받기 — 잠깐 막힘(429 · 5xx · 끊김)은 두 번 더 */
const getPage = async (url, fetchImpl) => {
  let last = null;
  for (let i = 0; i < 3; i += 1) {
    try {
      const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
      const text = await res.text();
      if (/LIMITED_NUMBER_OF_SERVICE_REQUESTS/i.test(text)) throw new QuotaError('하루 호출 한도 초과');
      if (/SERVICE_KEY_IS_NOT_REGISTERED|SERVICE_ACCESS_DENIED/i.test(text)) throw new QuotaError('이 키로 신청 안 된 API');
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 120)}`);
      try { return JSON.parse(text); } catch { throw new Error(`JSON 아님 ${text.slice(0, 120)}`); }
    } catch (err) {
      if (err instanceof QuotaError) throw err;
      last = err;
      await sleep(1500 * (i + 1));
    }
  }
  throw last;
};

/** 한 달치 — publicDataApi.ts 의 fetchRealTradeRowsForMonth 와 같은 모양 { rows, typeLabel } 을 돌려준다.
 *  rows 는 국토부 줄 그대로에 __typeLabel 을 붙인 것. 몇 쪽이든 다 받는다(한 쪽 1,000줄 · 10쪽까지) */
export const fetchMonth = async ({ path, lawdCd5, ymd, serviceKey, fetchImpl = fetch }) => {
  const typeLabel = typeLabelOf(path);
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 10;
  const pageUrl = (pageNo) => {
    const u = new URL(`https://apis.data.go.kr${path}`);
    u.searchParams.set('serviceKey', serviceKey);
    u.searchParams.set('LAWD_CD', lawdCd5);
    u.searchParams.set('DEAL_YMD', ymd);
    u.searchParams.set('numOfRows', String(PAGE_SIZE));
    u.searchParams.set('pageNo', String(pageNo));
    u.searchParams.set('_type', 'json');
    return u.toString();
  };
  let calls = 1;
  const first = await getPage(pageUrl(1), fetchImpl);
  const code = String(first?.response?.header?.resultCode ?? '000');
  if (!/^0+$/.test(code)) {
    const msg = `${code} ${String(first?.response?.header?.resultMsg ?? '')}`.trim();
    if (code === '22') throw new QuotaError(msg);
    throw new Error(msg);
  }
  const raw = asArray(first?.response?.body?.items?.item);
  const total = Number(first?.response?.body?.totalCount ?? raw.length) || raw.length;
  const pages = Math.min(MAX_PAGES, Math.ceil(total / PAGE_SIZE));
  for (let p = 2; p <= pages; p += 1) {
    calls += 1;
    raw.push(...asArray((await getPage(pageUrl(p), fetchImpl))?.response?.body?.items?.item));
  }
  // checked — 정상 응답(000)으로 받은 달. 앱은 이 표가 있으면 0건도 믿고 다시 부르지 않는다(publicDataApi fetchMonthWithRetry)
  return { result: { rows: raw.map((r) => ({ ...r, __typeLabel: typeLabel })), typeLabel, checked: 1 }, calls };
};

/** 대문 숫자 셈 — 문서(지역 × 종류 × 달)마다 불러 더한다. 같은 지역 · 같은 달은 문서 한 장이라 겹치지 않는다.
 *  trades: 모든 줄(매매 + 전월세, 모든 종류) · complexes: 아파트 · 빌라 · 오피스텔에서 '시군구 · 동 · 지번(없으면 이름)'이 다른 건물
 *  (여러 달 · 매매/전월세에 같은 단지가 나와도 하나로 센다) · districts: 시군구 수 */
const COMPLEX_PATHS = new Set([PATHS.aptTrade, PATHS.aptRent, PATHS.offiTrade, PATHS.offiRent, PATHS.villaTrade, PATHS.villaRent]);
export const newLandingCount = () => ({ trades: 0, complexKeys: new Set(), lawds: new Set() });
export const addLandingDoc = (acc, id, rows) => {
  const p = parseDocId(id); if (!p || !Array.isArray(rows)) return acc;
  acc.trades += rows.length;
  if (rows.length) acc.lawds.add(p.lawdCd5);
  if (COMPLEX_PATHS.has(p.path)) {
    for (const r of rows) {
      const where = String(r.jibun || r.aptNm || r.offiNm || r.mhouseNm || '').trim();
      if (where) acc.complexKeys.add(`${p.lawdCd5}|${String(r.umdNm || '').trim()}|${where}`);
    }
  }
  return acc;
};

