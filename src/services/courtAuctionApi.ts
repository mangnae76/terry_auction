import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { CourtOffice, ScheduleEntry } from '../types/courtAuction';

const COURT_ORIGIN = 'https://www.courtauction.go.kr';
const COURT_BASE = import.meta.env.DEV ? '/api-court' : COURT_ORIGIN;

const DEFAULT_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json;charset=UTF-8',
  Accept: 'application/json, text/plain, */*',
  Referer: `${COURT_ORIGIN}/pgj/index.on`,
  Origin: COURT_ORIGIN,
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'X-Requested-With': 'XMLHttpRequest',
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isNative = () => Capacitor.isNativePlatform();

let sessionReady = false;

const nativeRequest = async (path: string, method: 'GET' | 'POST', body?: unknown): Promise<unknown> => {
  const url = `${COURT_ORIGIN}${path}`;
  const res = await CapacitorHttp.request({
    url,
    method,
    headers: DEFAULT_HEADERS,
    data: body,
  });
  if (res.status >= 400) {
    throw { code: String(res.status), message: `Court API ${path} failed: ${res.status}` };
  }
  if (typeof res.data === 'string') {
    try {
      return JSON.parse(res.data);
    } catch {
      return res.data;
    }
  }
  return res.data;
};

const webRequest = async (path: string, method: 'GET' | 'POST', body?: unknown): Promise<unknown> => {
  const url = `${COURT_BASE}${path}`;
  const init: RequestInit = {
    method,
    credentials: 'include',
    headers: method === 'POST' ? DEFAULT_HEADERS : { Accept: 'text/html,application/json' },
  };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(url, init);
  if (!res.ok) {
    throw { code: String(res.status), message: `Court API ${path} failed: ${res.status}` };
  }
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const request = async (path: string, method: 'GET' | 'POST', body?: unknown): Promise<unknown> => {
  return isNative() ? nativeRequest(path, method, body) : webRequest(path, method, body);
};

export const ensureCourtSession = async (force = false): Promise<void> => {
  if (sessionReady && !force) return;
  try {
    await request('/pgj/index.on', 'GET');
    sessionReady = true;
  } catch (err) {
    sessionReady = false;
    throw err;
  }
};

const DEFAULT_COURT_OFFICES: CourtOffice[] = [
  { code: '', name: '전체 법원' },
  { code: 'B000210', name: '서울중앙지방법원' },
  { code: 'B000211', name: '서울동부지방법원' },
  { code: 'B000212', name: '서울남부지방법원' },
  { code: 'B000213', name: '서울북부지방법원' },
  { code: 'B000215', name: '서울서부지방법원' },
  { code: 'B000214', name: '의정부지방법원' },
  { code: 'B000240', name: '수원지방법원' },
  { code: 'B000270', name: '인천지방법원' },
  { code: 'B000220', name: '부산지방법원' },
  { code: 'B000221', name: '부산동부지원' },
  { code: 'B000222', name: '부산서부지원' },
  { code: 'B000230', name: '대전지방법원' },
  { code: 'B000260', name: '대구지방법원' },
  { code: 'B000280', name: '광주지방법원' },
  { code: 'B000290', name: '울산지방법원' },
  { code: 'B000310', name: '춘천지방법원' },
  { code: 'B000320', name: '청주지방법원' },
  { code: 'B000340', name: '전주지방법원' },
  { code: 'B000360', name: '창원지방법원' },
  { code: 'B000380', name: '제주지방법원' },
];

export const fetchCourtOffices = async (): Promise<CourtOffice[]> => {
  await ensureCourtSession();
  try {
    const res = (await request('/pgj/cmm/selectCortOfcList.on', 'POST', {})) as {
      dlt_searchList?: Array<{ cortOfcCd?: string; cortOfcNm?: string }>;
    };
    const list = Array.isArray(res?.dlt_searchList) ? res.dlt_searchList : [];
    if (list.length === 0) return DEFAULT_COURT_OFFICES;
    const offices: CourtOffice[] = [{ code: '', name: '전체 법원' }];
    list.forEach((row) => {
      if (row?.cortOfcCd && row?.cortOfcNm) {
        offices.push({ code: String(row.cortOfcCd), name: String(row.cortOfcNm) });
      }
    });
    return offices;
  } catch {
    return DEFAULT_COURT_OFFICES;
  }
};

const toYmd = (iso: string): string => iso.replace(/-/g, '');

const fromYmd = (ymd: string): string => {
  if (!ymd || ymd.length !== 8) return '';
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
};

const formatBidTime = (raw?: string | number | null): string => {
  if (raw === null || raw === undefined) return '';
  const str = String(raw).trim();
  if (!str) return '';
  if (/^\d{4}$/.test(str)) return `${str.slice(0, 2)}:${str.slice(2, 4)}`;
  if (/^\d{2}:\d{2}$/.test(str)) return str;
  return str;
};

const toNumber = (raw: unknown): number => {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const n = Number(raw.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

interface CourtRow {
  userCsNo?: string;
  csNo?: string;
  printSz?: string | number;
  aeeEvlAmt?: string | number;
  rprsPrnmPrcAmt?: string | number;
  rprsMnbmPrcAmt?: string | number;
  bidBgngYmd?: string;
  bidBgngHm?: string;
  bidHm?: string;
  bidCnt?: number | string;
  cortOfcCd?: string;
  cortOfcNm?: string;
  jdbnNm?: string;
  gdsDspslKndNm?: string;
  adongSidoNm?: string;
  adongSggNm?: string;
  adongEmdNm?: string;
  csBaseAdr?: string;
  rprsBidMddcNm?: string;
  usgNm?: string;
}

const mapRow = (row: CourtRow): ScheduleEntry => {
  const rawCase = row.userCsNo || row.csNo || '';
  const bidDate = fromYmd(String(row.bidBgngYmd || ''));
  const address = [row.csBaseAdr, row.adongSidoNm, row.adongSggNm, row.adongEmdNm]
    .filter((s) => typeof s === 'string' && (s as string).trim().length > 0)
    .join(' ')
    .trim();
  return {
    caseNo: String(rawCase).trim(),
    itemNo: String(row.printSz ?? '').trim(),
    courtCode: String(row.cortOfcCd ?? '').trim(),
    courtName: String(row.cortOfcNm ?? '').trim(),
    deptName: String(row.jdbnNm ?? '').trim(),
    bidDate,
    bidTime: formatBidTime(row.bidHm ?? row.bidBgngHm),
    minPrice: toNumber(row.rprsMnbmPrcAmt ?? row.rprsPrnmPrcAmt),
    round: toNumber(row.bidCnt),
    propertyType: String(row.gdsDspslKndNm ?? row.usgNm ?? '').trim() || undefined,
    address: address || undefined,
    usage: String(row.usgNm ?? '').trim() || undefined,
    appraisedPrice: toNumber(row.aeeEvlAmt) || undefined,
  };
};

const unwrap = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  if (obj.data && typeof obj.data === 'object') return obj.data as Record<string, unknown>;
  if (obj.body && typeof obj.body === 'object') return obj.body as Record<string, unknown>;
  if (obj.result && typeof obj.result === 'object') return obj.result as Record<string, unknown>;
  return obj;
};

const extractRows = (raw: unknown): CourtRow[] => {
  const payload = unwrap(raw);
  const candidates = [
    payload.dlt_searchList,
    payload.dltSearchList,
    payload.searchList,
    payload.list,
    payload.dlt_result,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as CourtRow[];
  }
  return [];
};

const extractTotalPages = (raw: unknown): number => {
  const payload = unwrap(raw);
  const info = (payload.dma_pageInfo || payload.pageInfo || payload.dmaPageInfo) as
    | { totPageNum?: number | string; totalPage?: number | string }
    | undefined;
  if (info) {
    const n = Number(info.totPageNum ?? info.totalPage ?? 1);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
};

export const fetchWeekSchedule = async (params: {
  startDate: string;
  endDate: string;
  courtCode?: string;
}): Promise<ScheduleEntry[]> => {
  await ensureCourtSession();
  const pageSize = 500;
  const entries: ScheduleEntry[] = [];
  let pageNum = 1;
  const maxPages = 20;
  while (pageNum <= maxPages) {
    const body = {
      dma_srchGdsDtlSrch: {
        bidBgngYmd: toYmd(params.startDate),
        bidEndYmd: toYmd(params.endDate),
        cortOfcCd: params.courtCode ?? '',
        pageSize,
        pageNum,
      },
    };
    let res: unknown;
    try {
      res = await request('/pgj/retrieveDmaCurrentDateRealEstMulList.on', 'POST', body);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (pageNum === 1 && (e?.code === '401' || e?.code === '302')) {
        await ensureCourtSession(true);
        res = await request('/pgj/retrieveDmaCurrentDateRealEstMulList.on', 'POST', body);
      } else {
        throw err;
      }
    }
    if (pageNum === 1) {
      // eslint-disable-next-line no-console
      console.log('[courtAuction] raw response', res);
    }
    const list = extractRows(res);
    if (pageNum === 1 && list.length === 0) {
      // eslint-disable-next-line no-console
      console.warn('[courtAuction] no rows found, keys=', res && typeof res === 'object' ? Object.keys(res as object) : typeof res);
    }
    list.forEach((row) => entries.push(mapRow(row)));
    const totalPages = extractTotalPages(res);
    if (pageNum >= totalPages || list.length === 0) break;
    pageNum += 1;
    await sleep(250);
  }
  return entries;
};
