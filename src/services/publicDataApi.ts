import {
  mapMolitRentToAuction,
  mapMolitTradeToAuction,
  mapOnbidItemToAuction,
  mapStandardLandPriceToAuction,
} from './auctionMapper';
import { apiPath } from './apiBase';
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

const RETRYABLE_STATUS = new Set([502, 503, 504, 408, 429]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const requestJson = async (url: URL) => {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json, text/plain, */*' },
      });
      if (!response.ok) {
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
      // Network failures (no response) — retry
      if (err instanceof TypeError && attempt < 2) {
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

  const response = await fetch(url.toString(), {
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
  const url = buildApiUrl(path);
  url.searchParams.set('serviceKey', API_KEY);
  url.searchParams.set('LAWD_CD', lawdCd5);
  url.searchParams.set('DEAL_YMD', dealYmd);
  url.searchParams.set('numOfRows', '500');
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('_type', 'json');
  try {
    const json = await requestJson(url);
    const rawRows = asArray(json?.response?.body?.items?.item);
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

export const fetchRealTradeAverage = async (
  params: RealTradeAverageParams,
): Promise<RealTradeAverageResult> => {
  const months = Math.max(1, params.months ?? 3);
  const dealYmds = recentDealYmds(months);
  const paths = pathsForPropertyType(params.propertyType);
  const periodTo = dealYmds[0];
  const periodFrom = dealYmds[dealYmds.length - 1];

  const tasks: Array<Promise<MonthFetchResult>> = [];
  for (const path of paths) {
    for (const dealYmd of dealYmds) {
      tasks.push(fetchRealTradeRowsForMonth(path, params.lawdCd5, dealYmd));
    }
  }

  const settled = await Promise.all(tasks);
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
    { pool: dongFiltered.filter(inArea), fallback: false },
    { pool: dongFiltered, fallback: true },
    { pool: allRows.filter(inArea), fallback: true },
    { pool: allRows, fallback: true },
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
    return { contractDate, price: priceWon, areaM2, floor, umdNm, propertyTypeLabel, apartmentName, buildYear, roadName, jibun };
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

// === 주간추이 / 지역별 시세를 위한 raw 거래 fetch ===
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
