import { apiPath } from './apiBase';

const NAVER_LAND_BASE_URL = apiPath('/api-naver-land');

export type NaverPropertyType = 'apt' | 'villa' | 'officetel';

export interface NaverOfferAverageParams {
  cortarNo: string; // 법정동 10자리
  areaM2?: number;
  propertyType: NaverPropertyType;
  months?: number;
}

export interface NaverOfferAverageResult {
  average: number;
  sampleCount: number;
  fallbackUsed: boolean;
  error?: string;
}

interface NaverArticle {
  dealOrWarrantPrc?: string;
  area1?: number | string;
  area2?: number | string;
  articleConfirmYmd?: string;
  tradeTypeCode?: string;
  realEstateTypeCode?: string;
}

interface NaverArticleListResponse {
  articleList?: NaverArticle[];
  isMoreData?: boolean;
}

const realEstateTypeFor = (type: NaverPropertyType): string => {
  if (type === 'villa') return 'VL:YR:DDDGG';
  if (type === 'officetel') return 'OPST';
  return 'APT';
};

// "3억 5,000" | "7억" | "9,500" (만원 단위) → 원 단위 숫자
const parseKoreanPrice = (value: string | undefined | null): number => {
  if (!value) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  // split on 억
  const eokMatch = raw.match(/([\d,]+)\s*억/);
  const eok = eokMatch ? Number(eokMatch[1].replace(/,/g, '')) : 0;
  const afterEok = eokMatch ? raw.slice(eokMatch.index! + eokMatch[0].length) : raw;
  const rest = Number(afterEok.replace(/[^\d]/g, ''));
  const manWon = eok * 10_000 + (Number.isFinite(rest) ? rest : 0);
  return manWon * 10_000;
};

const toAreaNumber = (value: number | string | undefined): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const isWithinMonths = (ymd: string | undefined, months: number): boolean => {
  if (!ymd) return true;
  const digits = ymd.replace(/[^\d]/g, '');
  if (digits.length < 8) return true;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const confirmed = new Date(year, month - 1, day).getTime();
  const cutoff = Date.now() - months * 30 * 24 * 60 * 60 * 1000;
  return confirmed >= cutoff;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchArticlePage = async (
  cortarNo: string,
  propertyType: NaverPropertyType,
  page: number,
): Promise<NaverArticleListResponse> => {
  const url = new URL(`${NAVER_LAND_BASE_URL}/api/articles`, window.location.origin);
  url.searchParams.set('cortarNo', cortarNo);
  url.searchParams.set('order', 'rank');
  url.searchParams.set('realEstateType', realEstateTypeFor(propertyType));
  url.searchParams.set('tradeType', 'A1');
  url.searchParams.set('page', String(page));

  const delays = [0, 1500, 3500];
  let lastStatus = 0;
  for (const delay of delays) {
    if (delay > 0) await sleep(delay);
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json, text/plain, */*' },
    });
    if (response.ok) {
      return (await response.json()) as NaverArticleListResponse;
    }
    lastStatus = response.status;
    if (response.status !== 429 && response.status !== 503) {
      break;
    }
  }
  throw new Error(`Naver articles 실패: ${lastStatus}`);
};

const collectArticles = async (
  cortarNo: string,
  propertyType: NaverPropertyType,
  maxPages: number,
): Promise<NaverArticle[]> => {
  const collected: NaverArticle[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await fetchArticlePage(cortarNo, propertyType, page);
    const list = data.articleList ?? [];
    collected.push(...list);
    if (!data.isMoreData || list.length === 0) break;
  }
  return collected;
};

export const fetchNaverOfferAverage = async (
  params: NaverOfferAverageParams,
): Promise<NaverOfferAverageResult> => {
  try {
    const months = Math.max(1, params.months ?? 3);
    const maxPages = 2;

    const typesToTry: NaverPropertyType[] =
      params.propertyType === 'villa'
        ? ['villa', 'apt', 'officetel']
        : params.propertyType === 'officetel'
        ? ['officetel', 'apt', 'villa']
        : ['apt', 'villa', 'officetel'];

    let collected: NaverArticle[] = [];
    let lastError: string | undefined;
    for (const type of typesToTry) {
      try {
        const rows = await collectArticles(params.cortarNo, type, maxPages);
        if (rows.length > 0) {
          collected = rows;
          break;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    if (collected.length === 0) {
      return {
        average: NaN,
        sampleCount: 0,
        fallbackUsed: false,
        error: lastError,
      };
    }

    const recent = collected.filter((a) => isWithinMonths(a.articleConfirmYmd, months));
    const usablePool = recent.length > 0 ? recent : collected;

    const targetArea = params.areaM2 ?? 0;
    const inArea = (a: NaverArticle) => {
      if (!targetArea || targetArea <= 0) return true;
      const area = toAreaNumber(a.area2) || toAreaNumber(a.area1);
      if (!area) return false;
      return area >= targetArea * 0.9 && area <= targetArea * 1.1;
    };
    const areaFiltered = usablePool.filter(inArea);
    const fallbackUsed = areaFiltered.length === 0 && usablePool.length > 0;
    const finalPool = areaFiltered.length > 0 ? areaFiltered : usablePool;

    const prices = finalPool
      .map((a) => parseKoreanPrice(a.dealOrWarrantPrc))
      .filter((p) => p > 0);
    if (prices.length === 0) {
      return { average: NaN, sampleCount: 0, fallbackUsed };
    }
    const average = Math.round(prices.reduce((s, n) => s + n, 0) / prices.length);
    return { average, sampleCount: prices.length, fallbackUsed };
  } catch (error) {
    return {
      average: NaN,
      sampleCount: 0,
      fallbackUsed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
