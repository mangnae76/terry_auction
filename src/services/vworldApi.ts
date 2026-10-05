// 브이월드(국가공간정보) 공동주택 공시가격 조회.
//
// 왜 프록시를 거치나 — api.vworld.kr 은 CORS 헤더를 주지 않아 브라우저에서 바로 못 부른다.
// 인증키도 query 로 받기 때문에 그대로 쓰면 키가 화면에 노출된다. 둘 다 워커가 처리한다.
import { apiPath } from './apiBase';
import { cacheKey, readCache, writeCache } from './marketCache';

const VWORLD_BASE = apiPath('/api-vworld');
/** 공시가격은 한 해에 한 번(1월 1일 기준) 나온다 — 한 호실을 평생 한 번만 물어보면 된다 */
const PRICE_TTL = 365 * 24 * 60 * 60 * 1000;

/** 브이월드가 돌려주는 한 줄 */
interface PriceRow {
  stdrYear?: string;
  pblntfPc?: string;
  prvuseAr?: string;
  dongNm?: string;
  hoNm?: string;
  aphusNm?: string;
  lastUpdtDt?: string;
}

export interface ApartPrice {
  /** 공시가격 (원) */
  price: number;
  /** 기준연도 */
  year: string;
  /** 전용면적 (㎡) */
  areaM2: number;
  dong: string;
  ho: string;
}

/** 행정구역이 개편되면 한동안 옛 코드로만 자료가 들어 있다.
 *  (인천 서구 → 서해구·검단구) 새 코드로 비면 옛 코드로 한 번 더 물어본다.
 *  구 번호만 바뀌는 게 아니라 법정동 순번까지 바뀌어서 계산으로는 못 구한다. */
const LEGACY_LD_CODES: Record<string, string> = {
  '2827510100': '2826010300', // 인천 서해구 검암동 ← 인천 서구 검암동
};

/** 지번에서 PNU 19자리를 만든다. 법정동코드10 + 산여부1 + 본번4 + 부번4 */
export const buildPnu = (bCode10: string, lotText: string): string => {
  const code = String(bCode10 ?? '').replace(/\D/g, '');
  if (code.length !== 10) return '';
  const mountain = /산\s*\d/.test(lotText) ? '2' : '1';
  const m = lotText.replace(/산\s*/, '').match(/(\d+)(?:\s*-\s*(\d+))?/);
  if (!m) return '';
  const main = String(Number(m[1])).padStart(4, '0');
  const sub = String(Number(m[2] ?? 0)).padStart(4, '0');
  return `${code}${mountain}${main}${sub}`;
};

const num = (v: unknown) => Number(String(v ?? '').replace(/[^\d.]/g, '')) || 0;

const callOnce = async (pnu: string): Promise<PriceRow[]> => {
  const qs = new URLSearchParams({ pnu, format: 'json', numOfRows: '1000', pageNo: '1' });
  const res = await fetch(`${VWORLD_BASE}/ned/data/getApartHousingPriceAttr?${qs.toString()}`);
  if (!res.ok) return [];
  const json = (await res.json()) as { apartHousingPrices?: { field?: PriceRow[] } };
  return json.apartHousingPrices?.field ?? [];
};

/**
 * 그 호실의 최신 공시가격.
 * 전용면적이 같은 줄 중에서 호가 맞는 것, 그중 기준연도가 가장 늦은 것을 고른다.
 * 호를 못 찾으면 면적만 맞는 줄로, 그것도 없으면 그 지번의 아무 줄로 떨어진다.
 */
export const fetchApartHousingPrice = async (params: {
  bCode10: string;
  /** '670-4' 같은 지번 */
  lotText: string;
  /** '203' 같은 호수 (없으면 면적으로만 맞춘다) */
  ho?: string;
  /** 전용면적 ㎡ */
  areaM2?: number;
}): Promise<ApartPrice | null> => {
  const pnu = buildPnu(params.bCode10, params.lotText);
  if (!pnu) return null;

  const id = cacheKey(pnu, params.ho ?? '-', Math.round((params.areaM2 ?? 0) * 100));
  const hit = await readCache<ApartPrice | null>('cacheAptPrice', id, PRICE_TTL);
  if (hit) return hit;

  let rows = await callOnce(pnu);
  if (rows.length === 0) {
    const legacy = LEGACY_LD_CODES[params.bCode10];
    if (legacy) rows = await callOnce(buildPnu(legacy, params.lotText));
  }
  if (rows.length === 0) return null;

  const wantHo = String(params.ho ?? '').replace(/\D/g, '');
  const wantArea = params.areaM2 ?? 0;
  const sameArea = (r: PriceRow) => wantArea <= 0 || Math.abs(num(r.prvuseAr) - wantArea) < 0.05;
  const sameHo = (r: PriceRow) => !!wantHo && String(r.hoNm ?? '').replace(/\D/g, '') === wantHo;

  const pick = rows.filter((r) => sameHo(r) && sameArea(r));
  const fallback = pick.length > 0 ? pick : rows.filter(sameArea);
  const list = fallback.length > 0 ? fallback : rows;

  // 기준연도가 가장 늦은 것, 같은 해가 여러 줄이면 갱신일이 가장 늦은 것
  const best = list
    .filter((r) => num(r.pblntfPc) > 0)
    .sort((a, b) => (
      (b.stdrYear ?? '').localeCompare(a.stdrYear ?? '')
      || (b.lastUpdtDt ?? '').localeCompare(a.lastUpdtDt ?? '')
    ))[0];
  if (!best) return null;

  const out: ApartPrice = {
    price: num(best.pblntfPc),
    year: String(best.stdrYear ?? ''),
    areaM2: num(best.prvuseAr),
    dong: String(best.dongNm ?? ''),
    ho: String(best.hoNm ?? ''),
  };
  void writeCache('cacheAptPrice', id, out);
  return out;
};
