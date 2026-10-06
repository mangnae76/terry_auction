import {
  mapMolitRentToAuction,
  mapMolitTradeToAuction,
  mapOnbidItemToAuction,
  mapStandardLandPriceToAuction,
} from './auctionMapper';
import { apiPath } from './apiBase';
import { cacheKey, readCache, writeCache } from './marketCache';
import type { AuctionDetail, AuctionSearchParams } from '../types/auction';

interface ApiResult {
  source: string;
  items: AuctionDetail[];
}

export interface ApiSourceError {
  source: string;
  message: string;
}

export interface ApiSourceStatus {
  source: string;
  status: 'success' | 'error';
  itemCount: number;
  message?: string;
}

export interface PublicDataSearchResult {
  items: AuctionDetail[];
  sources: string[];
  warning?: string;
  errors: ApiSourceError[];
  sourceStatuses: ApiSourceStatus[];
}

export interface TradeVolumeStat {
  region: string;
  count: number;
  sources: string[];
}

export interface TradeVolumeStatsResult {
  rows: TradeVolumeStat[];
  totalCount: number;
  sources: string[];
  warning?: string;
  errors: ApiSourceError[];
  sourceStatuses: ApiSourceStatus[];
}

const API_KEY = import.meta.env.VITE_PUBLIC_DATA_API_KEY ?? '';
const ENABLE_LIVE_API = import.meta.env.VITE_ENABLE_LIVE_API !== 'false';
const ENABLE_MOLIT_API = import.meta.env.VITE_ENABLE_MOLIT_API !== 'false';
const ENABLE_ONBID_API = import.meta.env.VITE_ENABLE_ONBID_API === 'true';
const ENABLE_LAND_PRICE_API = import.meta.env.VITE_ENABLE_LAND_PRICE_API === 'true';
const ENABLE_MOLIT_RENT_API = import.meta.env.VITE_ENABLE_MOLIT_RENT_API === 'true';
const ENABLE_OFFICETEL_TRADE_API = import.meta.env.VITE_ENABLE_OFFICETEL_TRADE_API === 'true';
const ENABLE_OFFICETEL_RENT_API = import.meta.env.VITE_ENABLE_OFFICETEL_RENT_API === 'true';
const ENABLE_VILLA_TRADE_API = import.meta.env.VITE_ENABLE_VILLA_TRADE_API === 'true';
const ENABLE_VILLA_RENT_API = import.meta.env.VITE_ENABLE_VILLA_RENT_API === 'true';
const ENABLE_SINGLE_TRADE_API = import.meta.env.VITE_ENABLE_SINGLE_TRADE_API === 'true';
const ENABLE_SINGLE_RENT_API = import.meta.env.VITE_ENABLE_SINGLE_RENT_API === 'true';
const ENABLE_COMMERCIAL_TRADE_API = import.meta.env.VITE_ENABLE_COMMERCIAL_TRADE_API === 'true';
const API_BASE = apiPath('/api-data');
const ONBID_BASE = apiPath('/api-onbid');
const ONBID_API_PATH = import.meta.env.VITE_ONBID_API_PATH ?? '/1160100/service/GetBondInfoService/getBondResultInfo';
const ONBID_FALLBACK_PATH = import.meta.env.VITE_ONBID_FALLBACK_PATH ?? '/openapi/services/ThingInfoInquireSvc/getUnifyUsageCltr';
const APT_TRADE_API_PATH =
  import.meta.env.VITE_MOLIT_APT_API_PATH ?? '/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev';
const APT_RENT_API_PATH =
  import.meta.env.VITE_MOLIT_APT_RENT_API_PATH ?? '/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent';
const OFFICETEL_TRADE_API_PATH =
  import.meta.env.VITE_MOLIT_OFFICETEL_TRADE_API_PATH ?? '/1613000/RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade';
const OFFICETEL_RENT_API_PATH =
  import.meta.env.VITE_MOLIT_OFFICETEL_RENT_API_PATH ?? '/1613000/RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent';
const VILLA_TRADE_API_PATH =
  import.meta.env.VITE_MOLIT_VILLA_TRADE_API_PATH ?? '/1613000/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade';
const VILLA_RENT_API_PATH =
  import.meta.env.VITE_MOLIT_VILLA_RENT_API_PATH ?? '/1613000/RTMSDataSvcRHRent/getRTMSDataSvcRHRent';
const SINGLE_TRADE_API_PATH =
  import.meta.env.VITE_MOLIT_SINGLE_TRADE_API_PATH ?? '/1613000/RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade';
const SINGLE_RENT_API_PATH =
  import.meta.env.VITE_MOLIT_SINGLE_RENT_API_PATH ?? '/1613000/RTMSDataSvcSHRent/getRTMSDataSvcSHRent';
const COMMERCIAL_TRADE_API_PATH =
  import.meta.env.VITE_MOLIT_COMMERCIAL_TRADE_API_PATH ?? '/1613000/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade';
const LAND_PRICE_API_PATH =
  import.meta.env.VITE_MOLIT_LAND_API_PATH ?? '/1611000/nsdi/ReferLandPriceService/attr/getReferLandPriceAttr';

const buildApiUrl = (path: string) => new URL(`${API_BASE}${path}`, window.location.origin);
const buildOnbidUrl = (path: string, fallback = false) =>
  new URL(`${fallback ? ONBID_BASE : API_BASE}${path}`, window.location.origin);
const toLandLdCode = (value?: string) => {
  const raw = (value ?? '').replace(/[^\d]/g, '');
  if (raw.length >= 10) {
    return raw.slice(0, 10);
  }
  if (raw.length === 5) {
    return `${raw}00000`;
  }
  if (raw.length > 0) {
    return raw.padEnd(10, '0');
  }
  return '2823700000';
};

// 429는 재시도 대상이 아니다 — data.go.kr의 429는 '일일 요청제한 초과'라
// 다시 걸수록 한도만 더 깎인다. 끊김(502/503/504/408)만 다시 걸어 본다.
const RETRYABLE_STATUS = new Set([502, 503, 504, 408]);

/** 일일 한도를 다 쓰면 자정까지 아무리 불러도 429다 — 한 번 겪으면 그날은 더 안 부른다 */
export const QUOTA_EXCEEDED_MSG = '국토부 API 일일 요청 한도를 다 썼습니다 — 자정이 지나면 다시 됩니다.';
let quotaBlockedAt = 0;
const quotaResetAt = (at: number) => {
  const d = new Date(at);
  d.setHours(24, 0, 0, 0); // 다음 자정
  return d.getTime();
};
export const isQuotaBlocked = () => {
  if (!quotaBlockedAt) return false;
  if (Date.now() >= quotaResetAt(quotaBlockedAt)) {
    quotaBlockedAt = 0;
    return false;
  }
  return true;
};
const markQuotaBlocked = () => { quotaBlockedAt = Date.now(); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// data.go.kr이 응답을 안 주고 매달리는 날이 있다. 그러면 프록시가 522를 뱉기 전까지
// fetch가 영영 끝나지 않아 화면이 '조회 중…'에 멈춘다 — 직접 끊는다.
const REQUEST_TIMEOUT_MS = 15000;
const fetchWithTimeout = async (url: string, init: RequestInit = {}, ms = REQUEST_TIMEOUT_MS) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
};
/** 끊긴 것·못 붙은 것은 다시 걸어 볼 값어치가 있다 */
const isRetryableError = (err: unknown) =>
  err instanceof TypeError || (err instanceof DOMException && err.name === 'AbortError');

const requestJson = async (url: URL) => {
  // 한도를 넘긴 날은 더 부르지 않는다 — 괜히 수십 번 더 던져 봐야 전부 429다
  if (isQuotaBlocked()) throw new Error(QUOTA_EXCEEDED_MSG);
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url.toString(), {
        headers: { Accept: 'application/json, text/plain, */*' },
      });
      if (!response.ok) {
        if (response.status === 429) {
          markQuotaBlocked();
          throw new Error(QUOTA_EXCEEDED_MSG);
        }
        if (RETRYABLE_STATUS.has(response.status) && attempt < 2) {
          await sleep(400 * (attempt + 1));
          continue;
        }
        throw new Error(`API 요청 실패: ${response.status}`);
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        return await response.json();
      }
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`JSON 변환 실패: ${text.slice(0, 120)}`);
      }
    } catch (err) {
      lastErr = err;
      // Network failures (no response) and timeouts — retry
      if (isRetryableError(err) && attempt < 2) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      // Re-throw on the last attempt or non-retryable errors
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('API 요청 실패');
};

const asArray = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) {
    return value as Record<string, unknown>[];
  }
  if (value && typeof value === 'object') {
    return [value as Record<string, unknown>];
  }
  return [];
};

const pickRegionName = (row: Record<string, unknown>, fallback = '기타') => {
  const candidates = [
    row.umdNm,
    row.umdNm1,
    row.umdNm2,
    row.aptNm,
    row.offiNm,
    row.mhouseNm,
    row.sggNm,
    row.estateAgentSggNm,
    row.법정동,
    row.법정동명,
    row.지역명,
    row.시군구,
    row.아파트,
    row.건물명,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return fallback;
};

const parseOnbidXmlItems = (xmlText: string) => {
  try {
    const xml = new DOMParser().parseFromString(xmlText, 'text/xml');
    const itemNodes = Array.from(xml.getElementsByTagName('item'));
    return itemNodes.map((node) => {
      const row: Record<string, unknown> = {};
      Array.from(node.children).forEach((child) => {
        row[child.tagName] = child.textContent?.trim() ?? '';
      });
      return row;
    });
  } catch {
    return [] as Record<string, unknown>[];
  }
};

const fetchOnbidRows = async (keyword: string, path: string, fallback = false) => {
  const url = buildOnbidUrl(path, fallback);
  url.searchParams.set('serviceKey', API_KEY);
  url.searchParams.set('numOfRows', '20');
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('resultType', 'json');
  url.searchParams.set('_type', 'json');
  url.searchParams.set('itmsNm', keyword);
  url.searchParams.set('cltrNm', keyword);
  url.searchParams.set('keyword', keyword);

  const response = await fetchWithTimeout(url.toString(), {
    headers: {
      Accept: 'application/json, text/xml, application/xml, text/plain, */*',
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.status} (${text.slice(0, 120)})`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const json = JSON.parse(text) as Record<string, unknown>;
    return asArray((json as { response?: { body?: { items?: { item?: unknown } } } }).response?.body?.items?.item);
  }
  if (text.trim().startsWith('{')) {
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      return asArray((json as { response?: { body?: { items?: { item?: unknown } } } }).response?.body?.items?.item);
    } catch {
      return [];
    }
  }
  return parseOnbidXmlItems(text);
};

const fetchOnbidAuctions = async (keyword: string): Promise<ApiResult> => {
  let rows: Record<string, unknown>[] = [];
  try {
    rows = await fetchOnbidRows(keyword, ONBID_API_PATH, false);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('404')) {
      throw error;
    }
    rows = await fetchOnbidRows(keyword, ONBID_FALLBACK_PATH, true);
  }
  return {
    source: '온비드/유사 공공자산 API',
    items: rows.map((row, index) => mapOnbidItemToAuction(row, index)),
  };
};

const fetchMolitTrades = async (params: AuctionSearchParams): Promise<ApiResult> => {
  return fetchMolitTradeByPath(params, APT_TRADE_API_PATH, '국토교통부 실거래가');
};

const fetchMolitTradeByPath = async (
  params: AuctionSearchParams,
  path: string,
  source: string,
): Promise<ApiResult> => {
  const lawdCode = params.lawdCode ?? '28237';
  const dealYmd = params.dealYmd ?? new Date().toISOString().slice(0, 7).replace('-', '');
  const url = buildApiUrl(path);
  url.searchParams.set('serviceKey', API_KEY);
  url.searchParams.set('LAWD_CD', lawdCode);
  url.searchParams.set('DEAL_YMD', dealYmd);
  url.searchParams.set('numOfRows', '20');
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('_type', 'json');

  const json = await requestJson(url);
  const rows = asArray(json?.response?.body?.items?.item);
  return {
    source,
    items: rows.map((row, index) => mapMolitTradeToAuction(row, index, params.keyword)),
  };
};

const fetchTradeVolumeByPath = async (
  params: AuctionSearchParams,
  path: string,
  source: string,
): Promise<{ source: string; counts: Map<string, number>; itemCount: number }> => {
  const lawdCode = params.lawdCode ?? '28237';
  const dealYmd = params.dealYmd ?? new Date().toISOString().slice(0, 7).replace('-', '');
  const url = buildApiUrl(path);
  url.searchParams.set('serviceKey', API_KEY);
  url.searchParams.set('LAWD_CD', lawdCode);
  url.searchParams.set('DEAL_YMD', dealYmd);
  url.searchParams.set('numOfRows', '200');
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('_type', 'json');

  const json = await requestJson(url);
  const rows = asArray(json?.response?.body?.items?.item);
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const region = pickRegionName(row, params.keyword || '기타');
    counts.set(region, (counts.get(region) ?? 0) + 1);
  });

  return {
    source,
    counts,
    itemCount: rows.length,
  };
};

const fetchMolitRentByPath = async (
  params: AuctionSearchParams,
  path: string,
  source: string,
): Promise<ApiResult> => {
  const lawdCode = params.lawdCode ?? '28237';
  const dealYmd = params.dealYmd ?? new Date().toISOString().slice(0, 7).replace('-', '');
  const url = buildApiUrl(path);
  url.searchParams.set('serviceKey', API_KEY);
  url.searchParams.set('LAWD_CD', lawdCode);
  url.searchParams.set('DEAL_YMD', dealYmd);
  url.searchParams.set('numOfRows', '20');
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('_type', 'json');

  const json = await requestJson(url);
  const rows = asArray(json?.response?.body?.items?.item);
  return {
    source,
    items: rows.map((row, index) => mapMolitRentToAuction(row, index, params.keyword, source)),
  };
};

const fetchStandardLandPrice = async (params: AuctionSearchParams): Promise<ApiResult> => {
  const ldCode = toLandLdCode(params.lawdCode);
  const currentYear = new Date().getFullYear();
  const candidateYears = [currentYear, currentYear - 1, currentYear - 2];
  let lastError: unknown;

  for (const year of candidateYears) {
    try {
      const url = buildApiUrl(LAND_PRICE_API_PATH);
      url.searchParams.set('serviceKey', API_KEY);
      url.searchParams.set('ldCode', ldCode);
      url.searchParams.set('stdrYear', String(year));
      url.searchParams.set('numOfRows', '20');
      url.searchParams.set('pageNo', '1');
      url.searchParams.set('_type', 'json');

      const json = await requestJson(url);
      const rows = asArray(json?.response?.body?.items?.item ?? json?.response?.result?.featureCollection?.features);
      return {
        source: '국토교통부 표준지공시지가',
        items: rows.map((row, index) => mapStandardLandPriceToAuction(row, index, params.keyword)),
      };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('500')) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('표준지공시지가 API 호출 실패');
};

export const searchAuctionsFromPublicData = async (
  params: AuctionSearchParams,
): Promise<PublicDataSearchResult> => {
  if (!ENABLE_LIVE_API || !API_KEY) {
    return {
      items: [],
      sources: [],
      warning: 'API 키가 없거나 실 API 사용이 비활성화되어 샘플 데이터로 동작합니다.',
      errors: [],
      sourceStatuses: [],
    };
  }

  const tasks: Array<{ source: string; run: () => Promise<ApiResult> }> = [];
  if (params.onbidOnly) {
    tasks.push({
      source: '온비드/유사 공공자산 API',
      run: () => fetchOnbidAuctions(params.keyword),
    });
  }
  if (!params.onbidOnly && ENABLE_MOLIT_API) {
    tasks.push({ source: '국토교통부 실거래가', run: () => fetchMolitTrades(params) });
  }
  if (!params.onbidOnly && ENABLE_MOLIT_RENT_API) {
    tasks.push({ source: '국토교통부 아파트 전월세', run: () => fetchMolitRentByPath(params, APT_RENT_API_PATH, '국토교통부 아파트 전월세') });
  }
  if (!params.onbidOnly && ENABLE_OFFICETEL_TRADE_API) {
    tasks.push({
      source: '국토교통부 오피스텔 매매',
      run: () => fetchMolitTradeByPath(params, OFFICETEL_TRADE_API_PATH, '국토교통부 오피스텔 매매'),
    });
  }
  if (!params.onbidOnly && ENABLE_OFFICETEL_RENT_API) {
    tasks.push({
      source: '국토교통부 오피스텔 전월세',
      run: () => fetchMolitRentByPath(params, OFFICETEL_RENT_API_PATH, '국토교통부 오피스텔 전월세'),
    });
  }
  if (!params.onbidOnly && ENABLE_VILLA_TRADE_API) {
    tasks.push({
      source: '국토교통부 연립다세대 매매',
      run: () => fetchMolitTradeByPath(params, VILLA_TRADE_API_PATH, '국토교통부 연립다세대 매매'),
    });
  }
  if (!params.onbidOnly && ENABLE_VILLA_RENT_API) {
    tasks.push({
      source: '국토교통부 연립다세대 전월세',
      run: () => fetchMolitRentByPath(params, VILLA_RENT_API_PATH, '국토교통부 연립다세대 전월세'),
    });
  }
  if (!params.onbidOnly && ENABLE_SINGLE_TRADE_API) {
    tasks.push({
      source: '국토교통부 단독다가구 매매',
      run: () => fetchMolitTradeByPath(params, SINGLE_TRADE_API_PATH, '국토교통부 단독다가구 매매'),
    });
  }
  if (!params.onbidOnly && ENABLE_SINGLE_RENT_API) {
    tasks.push({
      source: '국토교통부 단독다가구 전월세',
      run: () => fetchMolitRentByPath(params, SINGLE_RENT_API_PATH, '국토교통부 단독다가구 전월세'),
    });
  }
  if (!params.onbidOnly && ENABLE_COMMERCIAL_TRADE_API) {
    tasks.push({
      source: '국토교통부 상업업무용 매매',
      run: () => fetchMolitTradeByPath(params, COMMERCIAL_TRADE_API_PATH, '국토교통부 상업업무용 매매'),
    });
  }
  if (!params.onbidOnly && ENABLE_ONBID_API) {
    tasks.push({ source: '온비드/유사 공공자산 API', run: () => fetchOnbidAuctions(params.keyword) });
  }
  if (!params.onbidOnly && ENABLE_LAND_PRICE_API) {
    tasks.push({ source: '국토교통부 표준지공시지가', run: () => fetchStandardLandPrice(params) });
  }
  if (tasks.length === 0) {
    return {
      items: [],
      sources: [],
      warning: '활성화된 API 소스가 없습니다. .env에서 API 토글 설정을 확인하세요.',
      errors: [],
      sourceStatuses: [],
    };
  }

  const settled = await Promise.allSettled(tasks.map((task) => task.run()));
  const items: AuctionDetail[] = [];
  const sources: string[] = [];
  const errors: string[] = [];
  const sourceErrors: ApiSourceError[] = [];
  const sourceStatuses: ApiSourceStatus[] = [];

  settled.forEach((result, index) => {
    const sourceName = tasks[index]?.source ?? '알 수 없는 API';
    if (result.status === 'fulfilled') {
      items.push(...result.value.items);
      sources.push(result.value.source);
      sourceStatuses.push({
        source: result.value.source,
        status: 'success',
        itemCount: result.value.items.length,
      });
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : '알 수 없는 API 오류';
      let mappedReason = reason;
      if (reason.includes('403')) {
        mappedReason = `${reason} (해당 데이터셋 활용신청/승인 필요)`;
      } else if (reason.toLowerCase().includes('fetch')) {
        mappedReason = `${reason} (네트워크/CORS 가능성. dev 서버 재시작 후 재시도)`;
      }
      errors.push(mappedReason);
      sourceErrors.push({
        source: sourceName,
        message: mappedReason,
      });
      sourceStatuses.push({
        source: sourceName,
        status: 'error',
        itemCount: 0,
        message: mappedReason,
      });
    }
  });

  return {
    items,
    sources,
    warning: errors.length > 0 ? `일부 API 호출 실패: ${errors.join(', ')}` : undefined,
    errors: sourceErrors,
    sourceStatuses,
  };
};

export type PropertyType = 'apt' | 'villa' | 'officetel' | 'all';

export interface TradeVolumeStatsParams extends AuctionSearchParams {
  propertyType?: PropertyType;
  dealYmdList?: string[];
}

export const fetchTradeVolumeStats = async (params: TradeVolumeStatsParams): Promise<TradeVolumeStatsResult> => {
  if (!ENABLE_LIVE_API || !API_KEY) {
    return {
      rows: [],
      totalCount: 0,
      sources: [],
      warning: 'API 키가 없거나 실 API 사용이 비활성화되어 통계를 불러올 수 없습니다.',
      errors: [],
      sourceStatuses: [],
    };
  }

  const propertyType = params.propertyType ?? 'all';
  const includeApt = propertyType === 'all' || propertyType === 'apt';
  const includeVilla = propertyType === 'all' || propertyType === 'villa';
  const includeOfficetel = propertyType === 'all' || propertyType === 'officetel';

  const months = params.dealYmdList && params.dealYmdList.length > 0
    ? params.dealYmdList
    : [params.dealYmd ?? new Date().toISOString().slice(0, 7).replace('-', '')];

  type Task = { source: string; run: () => Promise<{ source: string; counts: Map<string, number>; itemCount: number }> };
  const tasks: Task[] = [];

  // 사용자가 특정 거래유형을 명시적으로 고른 경우 env 토글을 우회.
  // 'all' 모드일 때만 활성화 토글을 존중해 기본 아파트만 집계.
  const explicit = propertyType !== 'all';
  months.forEach((dealYmd) => {
    const monthSuffix = months.length > 1 ? ` ${dealYmd}` : '';
    const subParams: AuctionSearchParams = { ...params, dealYmd };
    if (includeApt && (explicit || ENABLE_MOLIT_API)) {
      tasks.push({
        source: `아파트 매매${monthSuffix}`,
        run: () => fetchTradeVolumeByPath(subParams, APT_TRADE_API_PATH, `아파트 매매${monthSuffix}`),
      });
    }
    if (includeOfficetel && (explicit || ENABLE_OFFICETEL_TRADE_API)) {
      tasks.push({
        source: `오피스텔 매매${monthSuffix}`,
        run: () => fetchTradeVolumeByPath(subParams, OFFICETEL_TRADE_API_PATH, `오피스텔 매매${monthSuffix}`),
      });
    }
    if (includeVilla && (explicit || ENABLE_VILLA_TRADE_API)) {
      tasks.push({
        source: `연립다세대 매매${monthSuffix}`,
        run: () => fetchTradeVolumeByPath(subParams, VILLA_TRADE_API_PATH, `연립다세대 매매${monthSuffix}`),
      });
    }
  });

  if (tasks.length === 0) {
    return {
      rows: [],
      totalCount: 0,
      sources: [],
      warning: '선택한 거래유형 API가 비활성화되어 있습니다. .env 설정을 확인하세요.',
      errors: [],
      sourceStatuses: [],
    };
  }

  const settled = await Promise.allSettled(tasks.map((task) => task.run()));
  const merged = new Map<string, TradeVolumeStat>();
  const errors: ApiSourceError[] = [];
  const sourceStatuses: ApiSourceStatus[] = [];
  const sources: string[] = [];
  let totalCount = 0;

  settled.forEach((result, index) => {
    const { source } = tasks[index];
    if (result.status === 'fulfilled') {
      sources.push(source);
      totalCount += result.value.itemCount;
      sourceStatuses.push({
        source,
        status: 'success',
        itemCount: result.value.itemCount,
      });
      result.value.counts.forEach((count, region) => {
        const current = merged.get(region);
        if (current) {
          current.count += count;
          if (!current.sources.includes(source)) {
            current.sources.push(source);
          }
          return;
        }
        merged.set(region, {
          region,
          count,
          sources: [source],
        });
      });
      return;
    }

    const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
    errors.push({ source, message });
    sourceStatuses.push({
      source,
      status: 'error',
      itemCount: 0,
      message,
    });
  });

  return {
    rows: [...merged.values()].sort((a, b) => b.count - a.count || a.region.localeCompare(b.region, 'ko')),
    totalCount,
    sources,
    warning: sources.length === 0 ? '거래건수 통계를 불러오지 못했습니다.' : undefined,
    errors,
    sourceStatuses,
  };
};

// 주변 실거래가 평균 조회
export interface RealTradeAverageParams {
  lawdCd5: string;
  dong: string;
  areaM2?: number;
  propertyType: 'apt' | 'villa' | 'officetel' | 'all';
  months?: number;
}

export interface RealTradeMatchRow {
  contractDate: string;
  price: number;
  areaM2: number;
  floor: string;
  umdNm: string;
  propertyTypeLabel: string;
  apartmentName?: string;
  buildYear?: number;
  /** 도로명 주소 (도로명 + 본번-부번) */
  roadName?: string;
  /** 지번 (도로명이 없는 자료 대비) */
  jibun?: string;
  /** 거래유형 — '중개거래' / '직거래' */
  dealType?: string;
  /** 주택유형 — 국토부 houseType ('다세대' / '연립' / '연립다세대') */
  houseType?: string;
}

export interface RealTradeAverageResult {
  average: number;
  sampleCount: number;
  fallbackUsed: boolean;
  periodFrom: string;
  periodTo: string;
  error?: string;
  matchedRows?: RealTradeMatchRow[];
  dongLabel?: string;
  /** 그 동에서 제외한 직거래 건수 */
  directCount?: number;
  /** 제외한 직거래 목록 — 화면에서 따로 펼쳐 볼 수 있게 같이 넘긴다 */
  directRows?: RealTradeMatchRow[];
  /** 그 동에서 제외한 계약해제 건수 */
  cancelledCount?: number;
  /** 계약해제된 거래 — 직거래와 같은 방식으로 따로 보여 준다 */
  cancelledRows?: RealTradeMatchRow[];
}

const pathsForPropertyType = (type: RealTradeAverageParams['propertyType']): string[] => {
  if (type === 'villa') return [VILLA_TRADE_API_PATH];
  if (type === 'officetel') return [OFFICETEL_TRADE_API_PATH];
  if (type === 'apt') return [APT_TRADE_API_PATH];
  return [APT_TRADE_API_PATH, VILLA_TRADE_API_PATH, OFFICETEL_TRADE_API_PATH];
};

const recentDealYmds = (months: number): string[] => {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < months; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    result.push(`${y}${m}`);
  }
  return result;
};

const normalizeDongName = (name: string) => name.replace(/\s+/g, '').trim();

const propertyTypeLabel = (path: string): string => {
  if (path === VILLA_TRADE_API_PATH) return '연립다세대';
  if (path === OFFICETEL_TRADE_API_PATH) return '오피스텔';
  if (path === APT_TRADE_API_PATH) return '아파트';
  return path;
};

interface MonthFetchResult {
  rows: Record<string, unknown>[];
  error?: string;
  typeLabel: string;
}

const fetchRealTradeRowsForMonth = async (
  path: string,
  lawdCd5: string,
  dealYmd: string,
): Promise<MonthFetchResult> => {
  const typeLabel = propertyTypeLabel(path);
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 10; // 한 달 1만 건이면 충분하다 — 무한 루프 방지
  const buildPageUrl = (pageNo: number) => {
    const url = buildApiUrl(path);
    url.searchParams.set('serviceKey', API_KEY);
    url.searchParams.set('LAWD_CD', lawdCd5);
    url.searchParams.set('DEAL_YMD', dealYmd);
    url.searchParams.set('numOfRows', String(PAGE_SIZE));
    url.searchParams.set('pageNo', String(pageNo));
    url.searchParams.set('_type', 'json');
    return url;
  };
  try {
    // 한 페이지(기존 500건)만 받으면 거래가 많은 시군구에서 조용히 잘린다.
    // totalCount를 보고 남은 페이지까지 모두 받는다.
    const first = await requestJson(buildPageUrl(1));
    const rawRows = asArray(first?.response?.body?.items?.item);
    const totalCount = Number(first?.response?.body?.totalCount ?? rawRows.length) || rawRows.length;
    const pages = Math.min(MAX_PAGES, Math.ceil(totalCount / PAGE_SIZE));
    if (pages > 1) {
      const rest = await Promise.all(
        Array.from({ length: pages - 1 }, (_, i) => requestJson(buildPageUrl(i + 2))),
      );
      rest.forEach((json) => rawRows.push(...asArray(json?.response?.body?.items?.item)));
    }
    const tagged = rawRows.map((r) => ({ ...r, __typeLabel: typeLabel }));
    return { rows: tagged, typeLabel };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    let hint = msg;
    if (/403/.test(msg)) {
      hint = `${typeLabel} 403 (data.go.kr 해당 데이터셋 활용신청/승인 필요)`;
    } else if (/401/.test(msg)) {
      hint = `${typeLabel} 401 (서비스키 확인)`;
    }
    return { rows: [], error: hint, typeLabel };
  }
};

/** 전월세 한 줄 — 매매와 달리 보증금·월세가 따로 있다 */
export interface RealRentRow {
  contractDate: string;
  kind: '전세' | '월세';
  deposit: number;        // 만원
  monthlyRent: number;    // 만원
  areaM2: number;
  floor: string;
  umdNm: string;
  apartmentName?: string;
  buildYear?: number;
  jibun?: string;
}

const rentPathForType = (type: RealTradeAverageParams['propertyType']) => {
  if (type === 'officetel') return OFFICETEL_RENT_API_PATH;
  if (type === 'apt') return APT_RENT_API_PATH;
  return VILLA_RENT_API_PATH;
};

/** 그 시군구의 전월세를 최근 N개월치 받아 온다 (단지 추리기는 호출한 쪽에서) */
export const fetchRealRentRows = async (params: {
  lawdCd5: string;
  propertyType: RealTradeAverageParams['propertyType'];
  months: number;
}): Promise<RealRentRow[]> => {
  const path = rentPathForType(params.propertyType);
  const dealYmds = recentDealYmds(Math.max(1, params.months));
  const settled = await Promise.allSettled(
    dealYmds.map((ymd) => fetchRealTradeRowsForMonth(path, params.lawdCd5, ymd)),
  );
  const rows: Record<string, unknown>[] = [];
  settled.forEach((r) => { if (r.status === 'fulfilled') rows.push(...r.value.rows); });
  const num = (raw: unknown) => Number(String(raw ?? '').replace(/[^\d.]/g, '')) || 0;
  return rows.map((row) => {
    const year = String(row.dealYear ?? '').padStart(4, '0');
    const month = String(row.dealMonth ?? '').padStart(2, '0');
    const day = String(row.dealDay ?? '').padStart(2, '0');
    const monthlyRent = num(row.monthlyRent);
    const buildYearRaw = num(row.buildYear);
    return {
      contractDate: year && month && day ? `${year}.${month}.${day}` : '',
      kind: monthlyRent > 0 ? '월세' : '전세',
      deposit: num(row.deposit),
      monthlyRent,
      areaM2: num(row.excluUseAr),
      floor: String(row.floor ?? '').trim(),
      umdNm: String(row.umdNm ?? '').trim(),
      apartmentName: String(row.mhouseNm ?? row.aptNm ?? row.offiNm ?? '').trim() || undefined,
      buildYear: buildYearRaw > 1800 ? buildYearRaw : undefined,
      jibun: String(row.jibun ?? '').trim() || undefined,
    } as RealRentRow;
  }).filter((r) => r.contractDate);
};

/** 주어진 연·월부터 이번 달까지의 YYYYMM 목록 */
const monthsFrom = (fromYear: number, fromMonth: number): string[] => {
  const out: string[] = [];
  const now = new Date();
  const end = now.getFullYear() * 12 + now.getMonth();
  for (let t = fromYear * 12 + (fromMonth - 1); t <= end; t += 1) {
    out.push(`${Math.floor(t / 12)}${String((t % 12) + 1).padStart(2, '0')}`);
  }
  return out;
};

/** 오늘로부터 n년 전 날짜 — 'YYYY.MM.DD' (계약일과 같은 꼴이라 문자열끼리 비교하면 된다) */
const yearsAgoDate = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())}`;
};

const napMs = (ms: number) => new Promise((r) => { setTimeout(r, ms); });

/** 막히거나 끊겨서 빈손으로 오면 조용히 넘기지 않고 다시 부른다.
 *  (한 달이라도 빠지면 그 달 거래가 통째로 사라져, 볼 때마다 건수가 달라진다) */
/** 한 달치를 얼마나 오래 두고 쓸 것인가.
 *  지난 달 거래는 더 바뀌지 않는다. 다만 신고 기한(30일)과 계약해제 때문에
 *  최근 석 달은 뒤늦게 채워지므로 그 구간만 날마다 다시 받는다. */
const monthCacheTtl = (dealYmd: string) => {
  const now = new Date();
  const year = Number(dealYmd.slice(0, 4));
  const month = Number(dealYmd.slice(4, 6));
  if (!(year > 1900) || !(month >= 1 && month <= 12)) return 24 * 60 * 60 * 1000;
  const age = (now.getFullYear() * 12 + now.getMonth()) - (year * 12 + (month - 1));
  return age <= 2 ? 24 * 60 * 60 * 1000 : 365 * 24 * 60 * 60 * 1000;
};

/** 한 달치 실거래 — 지역·종류·달이 같으면 누가 묻든 결과가 같다.
 *  그래서 물건이 아니라 '달' 단위로 모아 두고 다 같이 읽는다.
 *  (제대로 받은 달만 적어 둔다 — 실패한 달이 굳어 버리면 영영 비어 보인다) */
const fetchMonthWithRetry = async (
  path: string,
  lawdCd5: string,
  dealYmd: string,
  tries = 2,
): Promise<MonthFetchResult> => {
  const id = cacheKey(lawdCd5, path, dealYmd);
  const hit = await readCache<MonthFetchResult>('cacheTradeMonth', id, monthCacheTtl(dealYmd));
  if (hit && !hit.error) return hit;
  let last: MonthFetchResult = { rows: [], error: '미조회', typeLabel: '' };
  for (let i = 0; i < tries; i += 1) {
    if (isQuotaBlocked()) return { rows: [], error: QUOTA_EXCEEDED_MSG, typeLabel: '' };
    last = await fetchRealTradeRowsForMonth(path, lawdCd5, dealYmd);
    if (!last.error) {
      void writeCache('cacheTradeMonth', id, last);
      return last;
    }
    await napMs(300 * (i + 1));
  }
  return last;
};

/** 한 번에 다 던지면 data.go.kr이 막는다 — 12개씩 끊어 보낸다 */
const inBatches = async <T>(jobs: Array<() => Promise<T>>, size = 5): Promise<T[]> => {
  const out: T[] = [];
  for (let i = 0; i < jobs.length; i += size) {
    if (isQuotaBlocked()) break; // 한도를 넘겼으면 남은 달은 더 던지지 않는다
    const chunk = await Promise.allSettled(jobs.slice(i, i + size).map((fn) => fn()));
    chunk.forEach((r) => { if (r.status === 'fulfilled') out.push(r.value); });
    if (i + size < jobs.length) await napMs(120); // 숨 고르기
  }
  return out;
};

export interface PlaceHistoryResult {
  trades: RealTradeMatchRow[];
  rents: RealRentRow[];
  /** 세 번 눌러도 못 받은 달 수 — 0이 아니면 결과가 모자란다는 뜻 */
  missedMonths: number;
}

/** 한 단지의 실거래 이력 — 매매와 전월세를 최근 n년치만 받아 온다 */
const BLD_TITLE_API_PATH =
  import.meta.env.VITE_BLD_TITLE_API_PATH ?? '/1613000/BldRgstHubService/getBrTitleInfo';

/** 그 법정동의 다세대·연립 세대수 합 — 건축물대장 표제부를 모두 훑어 더한다.
 *  주용도가 '공동주택'인 건물 중 아파트를 뺀 것이 다세대·연립(+도시형생활주택)이다. */
export const fetchDongHouseholds = async (bCode10: string): Promise<number> => {
  const sigunguCd = bCode10.slice(0, 5);
  const bjdongCd = bCode10.slice(5, 10);
  if (sigunguCd.length < 5 || bjdongCd.length < 5) return 0;
  const PAGE = 100; // 이 API는 한 번에 100건까지만 준다
  const call = async (pageNo: number) => {
    const url = buildApiUrl(BLD_TITLE_API_PATH);
    url.searchParams.set('serviceKey', API_KEY);
    url.searchParams.set('sigunguCd', sigunguCd);
    url.searchParams.set('bjdongCd', bjdongCd);
    url.searchParams.set('numOfRows', String(PAGE));
    url.searchParams.set('pageNo', String(pageNo));
    url.searchParams.set('_type', 'json');
    return requestJson(url);
  };
  const first = await call(1);
  const total = Number(first?.response?.body?.totalCount ?? 0) || 0;
  if (total === 0) return 0;
  const pages = Math.min(40, Math.ceil(total / PAGE));
  const rest = await inBatches(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) => () => call(i + 2)),
  );
  const rows: Record<string, unknown>[] = [];
  [first, ...rest].forEach((json) => rows.push(...asArray(json?.response?.body?.items?.item)));
  // 같은 건물이 여러 번 올 수 있다 — 대장 고유번호로 한 번만 센다
  const seen = new Map<string, Record<string, unknown>>();
  rows.forEach((r) => seen.set(String(r.mgmBldrgstPk ?? `${r.platPlc}|${r.bldNm}|${r.dongNm}`), r));
  let sum = 0;
  seen.forEach((r) => {
    if (String(r.mainPurpsCdNm ?? '') !== '공동주택') return;
    if (/아파트/.test(String(r.etcPurps ?? ''))) return;
    sum += Number(String(r.hhldCnt ?? '').replace(/[^\d]/g, '')) || 0;
  });
  return sum;
};

/** 단지 이력을 몇 년치 볼 것인가 — 그보다 오래된 거래는 시세로 쓰기 어렵다 */
export const PLACE_HISTORY_YEARS = 2;

export const fetchPlaceHistory = async (params: {
  lawdCd5: string;
  propertyType: RealTradeAverageParams['propertyType'];
  /** 몇 년치를 받을지 (기본 2년) */
  years?: number;
}): Promise<PlaceHistoryResult> => {
  const years = params.years ?? PLACE_HISTORY_YEARS;
  const cutoff = yearsAgoDate(years);
  const start = new Date();
  start.setFullYear(start.getFullYear() - years);
  const ymds = monthsFrom(start.getFullYear(), start.getMonth() + 1);
  const tradePath = pathsForPropertyType(params.propertyType)[0];
  const rentPath = rentPathForType(params.propertyType);
  const num = (raw: unknown) => Number(String(raw ?? '').replace(/[^\d.]/g, '')) || 0;
  const dateOf = (row: Record<string, unknown>) => {
    const y = String(row.dealYear ?? '').padStart(4, '0');
    const m = String(row.dealMonth ?? '').padStart(2, '0');
    const d = String(row.dealDay ?? '').padStart(2, '0');
    return y && m && d ? `${y}.${m}.${d}` : '';
  };
  // 매매를 다 받고 전월세를 받으면 두 배로 걸린다 — 한 줄로 섞어 보낸다
  type MonthJob = { kind: 'trade' | 'rent'; res: MonthFetchResult };
  const jobs: Array<() => Promise<MonthJob>> = [
    ...ymds.map((ymd) => async (): Promise<MonthJob> => ({ kind: 'trade', res: await fetchMonthWithRetry(tradePath, params.lawdCd5, ymd) })),
    ...ymds.map((ymd) => async (): Promise<MonthJob> => ({ kind: 'rent', res: await fetchMonthWithRetry(rentPath, params.lawdCd5, ymd) })),
  ];
  const all = await inBatches(jobs);
  const tradeChunks = all.filter((r) => r.kind === 'trade').map((r) => r.res);
  const rentChunks = all.filter((r) => r.kind === 'rent').map((r) => r.res);
  const trades: RealTradeMatchRow[] = [];
  tradeChunks.forEach((c) => c.rows.forEach((row) => {
    const contractDate = dateOf(row);
    if (!contractDate || contractDate < cutoff) return;
    trades.push({
      contractDate,
      price: num(row.dealAmount) * 10000,
      areaM2: num(row.excluUseAr),
      floor: String(row.floor ?? '').trim(),
      umdNm: String(row.umdNm ?? '').trim(),
      propertyTypeLabel: '',
      apartmentName: String(row.mhouseNm ?? row.aptNm ?? row.offiNm ?? '').trim() || undefined,
      buildYear: num(row.buildYear) > 1800 ? num(row.buildYear) : undefined,
      jibun: String(row.jibun ?? '').trim() || undefined,
      dealType: String(row.dealingGbn ?? '').trim() || undefined,
      houseType: String(row.houseType ?? '').trim() || undefined,
    });
  }));
  const rents: RealRentRow[] = [];
  rentChunks.forEach((c) => c.rows.forEach((row) => {
    const contractDate = dateOf(row);
    if (!contractDate || contractDate < cutoff) return;
    const monthlyRent = num(row.monthlyRent);
    rents.push({
      contractDate,
      kind: monthlyRent > 0 ? '월세' : '전세',
      deposit: num(row.deposit),
      monthlyRent,
      areaM2: num(row.excluUseAr),
      floor: String(row.floor ?? '').trim(),
      umdNm: String(row.umdNm ?? '').trim(),
      apartmentName: String(row.mhouseNm ?? row.aptNm ?? row.offiNm ?? '').trim() || undefined,
      buildYear: num(row.buildYear) > 1800 ? num(row.buildYear) : undefined,
      jibun: String(row.jibun ?? '').trim() || undefined,
    });
  }));
  const missedMonths = all.filter((r) => r.res.error).length;
  return { trades, rents, missedMonths };
};

export const fetchRealTradeAverage = async (
  params: RealTradeAverageParams,
): Promise<RealTradeAverageResult> => {
  const months = Math.max(1, params.months ?? 3);
  const dealYmds = recentDealYmds(months);
  const paths = pathsForPropertyType(params.propertyType);
  const periodTo = dealYmds[0];
  const periodFrom = dealYmds[dealYmds.length - 1];

  const tasks: Array<() => Promise<MonthFetchResult>> = [];
  for (const path of paths) {
    for (const dealYmd of dealYmds) {
      tasks.push(() => fetchMonthWithRetry(path, params.lawdCd5, dealYmd));
    }
  }

  const settled = await inBatches(tasks, 5);
  const allRows = settled.flatMap((r) => r.rows);
  const errSet = new Set(settled.map((r) => r.error).filter((v): v is string => !!v));
  const errorSummary = errSet.size > 0 ? Array.from(errSet).join(' / ') : undefined;

  if (allRows.length === 0) {
    return {
      average: NaN,
      sampleCount: 0,
      fallbackUsed: false,
      periodFrom,
      periodTo,
      error: errorSummary ?? '시군구 내 실거래 조회 결과가 없습니다.',
    };
  }

  const targetDong = normalizeDongName(params.dong);
  const dongFiltered = targetDong
    ? allRows.filter((row) => {
        const umd = normalizeDongName(String(row.umdNm ?? row['법정동'] ?? ''));
        return umd === targetDong;
      })
    : allRows;

  // 직거래는 시세와 동떨어진 경우가 많아 건수·평균에서 모두 뺀다 (국토부 엑셀의 '거래유형' 칸)
  const isDirect = (row: Record<string, unknown>) =>
    /직거래/.test(String(row.dealingGbn ?? row['거래유형'] ?? ''));
  // 계약이 해제된 건도 뺀다 (엑셀의 '해제사유발생일' 칸 — cdealType이 'O'면 해제)
  const isCancelled = (row: Record<string, unknown>) =>
    String(row.cdealType ?? '').trim().toUpperCase() === 'O' ||
    String(row.cdealDay ?? row['해제사유발생일'] ?? '').replace(/[^\d]/g, '').length >= 6;
  const usable = (row: Record<string, unknown>) => !isDirect(row) && !isCancelled(row);
  const brokeredOnly = dongFiltered.filter(usable);
  const allBrokered = allRows.filter(usable);
  const directCount = dongFiltered.filter(isDirect).length;
  const cancelledCount = dongFiltered.filter((row) => !isDirect(row) && isCancelled(row)).length;

  const area = params.areaM2 ?? 0;
  const inArea = (row: Record<string, unknown>) => {
    if (!area || area <= 0) return true;
    const rowArea = Number(String(row.excluUseAr ?? row['전용면적'] ?? '').replace(/[^\d.]/g, ''));
    if (!Number.isFinite(rowArea) || rowArea <= 0) return false;
    return rowArea >= area * 0.9 && rowArea <= area * 1.1;
  };

  const priceOf = (row: Record<string, unknown>): number => {
    const raw = row.dealAmount ?? row['거래금액'];
    const digits = String(raw ?? '').replace(/[^\d.]/g, '');
    const manWon = Number(digits);
    return Number.isFinite(manWon) && manWon > 0 ? manWon * 10_000 : 0;
  };

  // 단계적 완화: 동+면적 → 동만 → 시군구 전체+면적 → 시군구 전체
  const tryPools: Array<{ pool: Record<string, unknown>[]; fallback: boolean }> = [
    { pool: brokeredOnly.filter(inArea), fallback: false },
    { pool: brokeredOnly, fallback: true },
    { pool: allBrokered.filter(inArea), fallback: true },
    { pool: allBrokered, fallback: true },
  ];

  const toMatchedRow = (row: Record<string, unknown>): RealTradeMatchRow => {
    const priceWon = priceOf(row);
    const year = String(row.dealYear ?? row['년'] ?? '').padStart(4, '0');
    const month = String(row.dealMonth ?? row['월'] ?? '').padStart(2, '0');
    const day = String(row.dealDay ?? row['일'] ?? '').padStart(2, '0');
    const contractDate = year && month && day ? `${year}.${month}.${day}` : '';
    const areaM2 = Number(String(row.excluUseAr ?? row['전용면적'] ?? '').replace(/[^\d.]/g, '')) || 0;
    const floor = String(row.floor ?? row['층'] ?? '').trim();
    const umdNm = String(row.umdNm ?? row['법정동'] ?? '').trim();
    const propertyTypeLabel = String((row as { __typeLabel?: string }).__typeLabel ?? '');
    const apartmentName = String(row.aptNm ?? row.offiNm ?? row.mhouseNm ?? row['아파트'] ?? '').trim() || undefined;
    const buildYearRaw = Number(String(row.buildYear ?? row['건축년도'] ?? '').replace(/[^\d]/g, ''));
    const buildYear = Number.isFinite(buildYearRaw) && buildYearRaw > 1800 ? buildYearRaw : undefined;
    // 도로명 주소 — '승학로402번길 29-11' 형태로 합친다 (본번만 있으면 부번 생략)
    const roadNm = String(row.roadNm ?? row['도로명'] ?? '').trim();
    const bon = Number(String(row.roadNmBonbun ?? row['도로명건물본번호코드'] ?? '').replace(/[^\d]/g, ''));
    const bu = Number(String(row.roadNmBubun ?? row['도로명건물부번호코드'] ?? '').replace(/[^\d]/g, ''));
    const houseNo = bon > 0 ? (bu > 0 ? `${bon}-${bu}` : String(bon)) : '';
    const roadName = [roadNm, houseNo].filter(Boolean).join(' ') || undefined;
    const jibun = String(row.jibun ?? row['지번'] ?? '').trim() || undefined;
    const dealType = String(row.dealingGbn ?? row['거래유형'] ?? '').trim() || undefined;
    const houseType = String(row.houseType ?? row['주택유형'] ?? '').trim() || undefined;
    return { contractDate, price: priceWon, areaM2, floor, umdNm, propertyTypeLabel, apartmentName, buildYear, roadName, jibun, dealType, houseType };
  };

  for (const { pool, fallback } of tryPools) {
    if (pool.length === 0) continue;
    const withPrice = pool.filter((row) => priceOf(row) > 0);
    if (withPrice.length === 0) continue;
    const prices = withPrice.map(priceOf);
    const average = Math.round(prices.reduce((s, n) => s + n, 0) / prices.length);
    const matchedRows = withPrice
      .map(toMatchedRow)
      .sort((a, b) => b.contractDate.localeCompare(a.contractDate));
    return {
      average,
      sampleCount: prices.length,
      fallbackUsed: fallback,
      directCount,
      directRows: dongFiltered
        .filter(isDirect)
        .map(toMatchedRow)
        .sort((a, b) => b.contractDate.localeCompare(a.contractDate)),
      cancelledCount,
      cancelledRows: dongFiltered
        .filter((row) => !isDirect(row) && isCancelled(row))
        .map(toMatchedRow)
        .sort((a, b) => b.contractDate.localeCompare(a.contractDate)),
      periodFrom,
      periodTo,
      matchedRows,
      dongLabel: targetDong ? params.dong : undefined,
    };
  }

  return {
    average: NaN,
    sampleCount: 0,
    fallbackUsed: false,
    periodFrom,
    periodTo,
  };
};

// === 거래랭킹 TOP 을 위한 raw 거래 fetch ===
export interface RawAptTrade {
  date: string;          // YYYY-MM-DD
  pricePerM2: number;    // 만원/m² (반올림)
  dealAmount: number;    // 만원
  areaM2: number;
  region: string;        // 법정동(umdNm)
  apartment: string;
  lawdCd: string;
}

export interface RawAptTradesResult {
  trades: RawAptTrade[];
  errors: string[];
}

export type RealEstateType = 'apt' | 'villa' | 'single';
const PATH_BY_TYPE: Record<RealEstateType, string> = {
  apt: APT_TRADE_API_PATH,
  villa: VILLA_TRADE_API_PATH,
  single: SINGLE_TRADE_API_PATH,
};

const monthYmd = (offset: number): string => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const fetchRawAptTrades = async (
  lawdCodes: string[],
  monthsBack = 4,
  type: RealEstateType = 'apt',
): Promise<RawAptTradesResult> => {
  const path = PATH_BY_TYPE[type];
  const ymds: string[] = [];
  for (let i = 0; i < monthsBack; i += 1) ymds.push(monthYmd(i));

  const tasks: Array<Promise<{ rows: Record<string, unknown>[]; lawdCd: string; error?: string }>> = [];
  for (const lawdCd of lawdCodes) {
    for (const ymd of ymds) {
      tasks.push(
        fetchRealTradeRowsForMonth(path, lawdCd, ymd).then((r) => ({
          rows: r.rows,
          lawdCd,
          error: r.error,
        })),
      );
    }
  }

  const settled = await Promise.all(tasks);
  const trades: RawAptTrade[] = [];
  const errSet = new Set<string>();
  for (const { rows, lawdCd, error } of settled) {
    if (error) errSet.add(error);
    for (const r of rows) {
      const y = Number(r.dealYear);
      const m = Number(r.dealMonth);
      const d = Number(r.dealDay);
      if (!y || !m || !d) continue;
      const amount = Number(String(r.dealAmount ?? '').replace(/[^\d]/g, ''));
      // 타입별 면적 필드: excluUseAr (APT/RH) | totalFloorAr (SH 단독·다가구는 연면적)
      const area = Number(r.excluUseAr ?? r.totalFloorAr ?? 0);
      if (!amount || !area) continue;
      trades.push({
        date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        pricePerM2: Math.round(amount / area),
        dealAmount: amount,
        areaM2: area,
        region: String(r.umdNm ?? ''),
        // 타입별 단지/주택명 필드: aptNm (APT) | mhouseNm (RH 다세대) | houseType (SH 단독·다가구)
        apartment: String(r.aptNm ?? r.mhouseNm ?? r.shouseNm ?? r.houseType ?? ''),
        lawdCd,
      });
    }
  }
  return { trades, errors: Array.from(errSet) };
};
