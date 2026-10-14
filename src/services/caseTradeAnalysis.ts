// 주소 한 줄로 그 지번의 공동주택가와 실거래를 한꺼번에 모은다.
//
// 주소에서 나오는 열쇠가 둘이다 — 법정동코드 앞 5자리는 국토부 실거래,
// 10자리+지번은 브이월드 공동주택가격. 그래서 사람이 지역을 따로 고르지
// 않아도 한 번에 끝난다.
//
// 화면이 아니라 여기에 둔 까닭: 분석 도구가 앱과 갈라져도 이 함수는 그대로
// 따라간다. Vue·스토어·물건 객체를 모르고, 주소를 받아 값을 돌려줄 뿐이다.
import { fetchPlaceHistory } from './publicDataApi';
import { cacheKey, readCache, writeCache, CACHE_TTL } from './marketCache';
import { lookupAddress, type AddressParts } from './addressLookup';
import type { ResolvedRegion } from './regionResolver';
import type { ApartPrice } from './vworldApi';

export type CasePropertyType = 'villa' | 'apt' | 'officetel';

/** 실거래 한 줄 — 매매·직거래·전세·월세를 한 칸에 담는다 */
export interface CaseTradeRow {
  kind: '매매' | '직거래' | '계약해제' | '전세' | '월세';
  contractDate: string;
  /** 화면에 적는 금액 글 — 월세는 '보 n / 월 n' */
  amount: string;
  /** 견주는 데 쓰는 값 (원). 전월세는 보증금 */
  price: number;
  areaM2: number;
  floor: string;
  umdNm: string;
  name: string;
  jibun: string;
}

export interface CaseTradeResult {
  /** 카카오가 푼 지역 — 못 풀면 null */
  region: ResolvedRegion | null;
  parts: AddressParts;
  /** 그 호실의 공동주택가격 — 공동주택이 아니거나 자료가 없으면 null */
  price: ApartPrice | null;
  /** 공부상 전용면적 (㎡) — 공시가격 자료의 그 호실 줄에서 온다.
   *  실거래를 같은 평형으로 좁히는 잣대다. 0이면 모른다는 뜻. */
  baseAreaM2: number;
  /** 그 지번(또는 단지)의 거래만 */
  rows: CaseTradeRow[];
  /** 시군구 전체로 받아 둔 거래 수 — 얼마나 큰 자료에서 추렸는지 */
  scanned: number;
  /** 세 번 눌러도 못 받은 달 수 */
  missedMonths: number;
  error?: string;
}

const squash = (v: string) => String(v ?? '').replace(/\s+/g, '').toLowerCase();
const won = (n: number) => (n > 0 ? Math.round(n).toLocaleString('ko-KR') : '-');

/** 시군구 한 곳의 매매·전월세를 통째로 받는다 (받아 둔 것이 있으면 그걸 쓴다) */
const loadDistrict = async (lawdCd5: string, propertyType: CasePropertyType, years: number) => {
  const key = cacheKey(lawdCd5, propertyType, `y${years}`);
  type Payload = Awaited<ReturnType<typeof fetchPlaceHistory>>;
  const hit = await readCache<Payload>('cachePlaceHistory', key, CACHE_TTL.place);
  if (hit) return hit;
  const fresh = await fetchPlaceHistory({ lawdCd5, propertyType, years });
  void writeCache('cachePlaceHistory', key, fresh);
  return fresh;
};

/** 국토부 자료를 화면이 쓰는 한 줄 꼴로 편다 */
const toRows = (data: Awaited<ReturnType<typeof fetchPlaceHistory>>): CaseTradeRow[] => [
  ...data.trades.map((r) => ({
    // 해제가 직거래보다 세다 — 해제된 계약은 거래유형과 상관없이 없던 거래다
    kind: (r.cancelled ? '계약해제' : (r.dealType === '직거래' ? '직거래' : '매매')) as CaseTradeRow['kind'],
    contractDate: r.contractDate,
    amount: won(r.price),
    price: r.price,
    areaM2: r.areaM2,
    floor: r.floor,
    umdNm: r.umdNm,
    name: r.apartmentName ?? '',
    jibun: r.jibun ?? '',
  })),
  // 전월세는 국토부가 '만원'으로 준다 — 매매(원)와 한 칸에 서니 원으로 맞춰 적는다
  ...data.rents.map((r) => ({
    kind: r.kind as CaseTradeRow['kind'],
    contractDate: r.contractDate,
    amount: r.monthlyRent > 0
      ? `보 ${won(r.deposit * 10000)} / 월 ${won(r.monthlyRent * 10000)}`
      : `보 ${won(r.deposit * 10000)}`,
    price: r.deposit * 10000,
    areaM2: r.areaM2,
    floor: r.floor,
    umdNm: r.umdNm,
    name: r.apartmentName ?? '',
    jibun: r.jibun ?? '',
  })),
].sort((a, b) => b.contractDate.localeCompare(a.contractDate));

/**
 * 그 자리의 거래만 고른다 — 물건 상세(손품+현장)와 같은 규칙.
 * 단지명이 들어 있거나, 동+지번이 맞으면 이 자리의 거래다.
 * 호수는 쓰지 않는다 — 국토부 거래 자료에는 동·호가 아예 없다.
 */
export const pickHere = (
  rows: CaseTradeRow[],
  where: { umdNm?: string; lot?: string; name?: string },
): CaseTradeRow[] => {
  const lot = squash(where.lot ?? '');
  const dong = squash(where.umdNm ?? '');
  const name = squash(where.name ?? '');
  if (!lot && !name) return [];
  return rows.filter((r) => {
    if (dong && squash(r.umdNm) !== dong) return false;
    if (lot && squash(r.jibun) === lot) return true;
    const n = squash(r.name);
    return !!name && n.length > 1 && n.includes(name);
  });
};

export interface AnalyzeOverrides {
  /** 카카오가 엉뚱한 구를 집었을 때 손으로 고른 값 */
  lawdCd5?: string;
  umdNm?: string;
  lot?: string;
  /** 지번 대신 단지명으로 찾을 때 */
  name?: string;
}

/**
 * 주소 한 줄 → 지역 · 공동주택가 · 그 지번의 실거래.
 * 고친 값(overrides)이 있으면 그쪽이 이긴다 — 주소 해석이 틀렸을 때 쓴다.
 */
export const analyzeAddress = async (
  input: { address: string; propertyType: CasePropertyType; years: number },
  overrides: AnalyzeOverrides = {},
): Promise<CaseTradeResult> => {
  const hit = await lookupAddress(input.address, { withPrice: true });
  const empty: CaseTradeResult = {
    region: hit.region, parts: hit.parts, price: hit.price,
    baseAreaM2: hit.price?.areaM2 ?? 0,
    rows: [], scanned: 0, missedMonths: 0,
  };
  const lawdCd5 = overrides.lawdCd5 || hit.region?.lawdCd5 || '';
  if (!/^\d{5}$/.test(lawdCd5)) {
    return { ...empty, error: '주소에서 지역을 찾지 못했습니다 — 직접 고르기로 지역을 골라 주세요.' };
  }
  const lot = overrides.lot ?? hit.parts.lot;
  const name = overrides.name ?? '';
  if (!lot && !name) {
    return { ...empty, error: '주소에 지번이 없습니다 — 지번이나 단지명을 적어 주세요.' };
  }
  try {
    const data = await loadDistrict(lawdCd5, input.propertyType, input.years);
    const rows = toRows(data);
    return {
      ...empty,
      rows: pickHere(rows, { umdNm: overrides.umdNm ?? hit.region?.dong, lot, name }),
      scanned: rows.length,
      missedMonths: data.missedMonths,
    };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }
};
