// 브이월드(국가공간정보) 공동주택 공시가격 조회.
//
// 왜 프록시를 거치나 — api.vworld.kr 은 CORS 헤더를 주지 않아 브라우저에서 바로 못 부른다.
// 인증키도 query 로 받기 때문에 그대로 쓰면 키가 화면에 노출된다. 둘 다 워커가 처리한다.
import { apiPath } from './apiBase';
import { cacheKey, readCache, writeCache } from './marketCache';
import { browserCacheGet, browserCachePut } from './browserCache';

const VWORLD_BASE = apiPath('/api-vworld');
/** 브이월드 인증키 만료일 — 지나면 공시가격이 들어오지 않는다.
 *  (개발키는 6개월, 최대 3회 연장. 길게 쓰려면 운영키 2년으로 바꾼다) */
export const VWORLD_KEY_EXPIRES = '2027-04-06';

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
  /** 단지 이름 — 브이월드 표기 ('프리스틴(105 106)') */
  name: string;
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

const callPage = async (pnu: string, pageNo: number, stdrYear?: string): Promise<PriceRow[]> => {
  const qs = new URLSearchParams({ pnu, format: 'json', numOfRows: '1000', pageNo: String(pageNo), ...(stdrYear ? { stdrYear } : {}) });
  const res = await fetch(`${VWORLD_BASE}/ned/data/getApartHousingPriceAttr?${qs.toString()}`);
  if (!res.ok) return [];
  const json = (await res.json()) as { apartHousingPrices?: { field?: PriceRow[] } };
  return json.apartHousingPrices?.field ?? [];
};

/** 공시가격은 무조건 올해(그해 1월 1일 기준) 값만 쓴다 — 지난해 값으로 메우지 않는다(사용자 결정, 2026-11-10).
 *  연도 없이 부르면 오래된 해부터 1,000줄씩 와서, 큰 단지(1,129세대 × 10년 = 11,290줄)는 첫 쪽에 2020년만 담겼다
 *  (2026타경50132 — 2026년 3억 4,500만 원 대신 2020년 2억 9,300만 원). 올해 연도를 붙이고 쪽을 넘겨 다 받는다 */
export const PRICE_YEAR = String(new Date().getFullYear());
const callOnce = async (pnu: string): Promise<PriceRow[]> => {
  const rows: PriceRow[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const got = await callPage(pnu, page, PRICE_YEAR);
    rows.push(...got);
    if (got.length < 1000) break;
  }
  return rows.filter((r) => String(r.stdrYear ?? '') === PRICE_YEAR);
};

/** 한 지번의 호실 한 줄 — 가장 늦은 기준연도 값 */
export interface ApartUnit { dong: string; ho: string; areaM2: number; price: number; year: string }

/** 우리 DB 의 아파트 단지 문서 — 단지(지번 PNU) · 올해 하나. 호실별 전용 · 공동주택가격과 평형별 전용 · 공급 · 세대수를 묶어
 *  모든 사용자가 같이 쓴다(2026-11-10). 해가 바뀌면 새 문서를 만든다 */
export const APT_COMPLEX_COLLECTION = 'aptComplexes';
export type AptComplexGroup = { exclusive: number; supply: number; count: number };
/** supplies — 단지 전체 호실의 전용 · 공급(건축물대장 전유공용면적). 공급면적별 세대수는 여기서 센다 */
export type AptComplexDoc = { pnu: string; year: string; units: ApartUnit[]; groups?: AptComplexGroup[]; supplies?: Array<{ dong: string; ho: string; exclusive: number; supply: number }> };
export const aptComplexIdOf = (bCode10: string, lotText: string): string => {
  const pnu = buildPnu(bCode10, lotText);
  return pnu ? `${pnu}_${PRICE_YEAR}` : '';
};
export const readAptComplex = (id: string) => readCache<AptComplexDoc>(APT_COMPLEX_COLLECTION, id, PRICE_TTL);
export const writeAptComplex = (id: string, value: AptComplexDoc) => writeCache(APT_COMPLEX_COLLECTION, id, value);

/**
 * 한 지번의 호실 목록(호실마다 올해 공시가격) — 가격분석 표가 거래마다 같은 층 · 같은 면적 호실을 찾는다.
 * 우리 DB 단지 문서(aptComplexes)에 두고 같이 쓴다 — 예전엔 이 브라우저에만 두었다.
 */
export const fetchApartUnits = async (bCode10: string, lotText: string): Promise<ApartUnit[]> => {
  const pnu = buildPnu(bCode10, lotText);
  if (!pnu) return [];
  const id = aptComplexIdOf(bCode10, lotText);
  // 이 브라우저에 둔 값이 먼저 — 지번이 많은 시세분석에서 지번마다 DB 를 부르지 않게(2026-11-10)
  const localKey = `aptUnits${PRICE_YEAR}_${pnu}`;
  const local = await browserCacheGet<ApartUnit[]>(localKey, PRICE_TTL);
  if (local?.length) return local;
  const hit = await readAptComplex(id);
  if (hit?.units?.length) { void browserCachePut(localKey, hit.units); return hit.units; }
  let rows = await callOnce(pnu);
  if (rows.length === 0) {
    const legacy = LEGACY_LD_CODES[bCode10];
    if (legacy) rows = await callOnce(buildPnu(legacy, lotText));
  }
  const best = new Map<string, PriceRow>();
  rows.filter((r) => num(r.pblntfPc) > 0).forEach((r) => {
    const k = `${r.dongNm ?? ''}|${r.hoNm ?? ''}`;
    const was = best.get(k);
    if (!was || (r.stdrYear ?? '') > (was.stdrYear ?? '')) best.set(k, r);
  });
  const out = [...best.values()].map((r) => ({
    dong: String(r.dongNm ?? ''), ho: String(r.hoNm ?? ''), areaM2: num(r.prvuseAr), price: num(r.pblntfPc), year: String(r.stdrYear ?? ''),
  }));
  if (out.length > 0) { void browserCachePut(localKey, out); void writeAptComplex(id, { pnu, year: PRICE_YEAR, units: out }); }
  return out;
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
  /** '106' 같은 동 — 한 지번에 동이 여럿이면 호수만으로는 못 가린다 */
  dong?: string;
  /** 전용면적 ㎡ */
  areaM2?: number;
}): Promise<ApartPrice | null> => {
  const pnu = buildPnu(params.bCode10, params.lotText);
  if (!pnu) return null;

  // 열쇠에 올해를 넣는다 — 해가 바뀌면 새로 받는다(예전 판은 큰 단지에서 2020년 값을 담았다, 2026-11-10)
  const id = cacheKey(pnu, params.dong ?? '-', params.ho ?? '-', Math.round((params.areaM2 ?? 0) * 100), `y${PRICE_YEAR}`);
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
  // '106동' · '가동' 둘 다 받는다 — 끝의 '동' 만 떼고 견준다
  const dongKey = (v: unknown) => String(v ?? '').trim().replace(/동$/, '').trim();
  const wantDong = dongKey(params.dong);
  const sameArea = (r: PriceRow) => wantArea <= 0 || Math.abs(num(r.prvuseAr) - wantArea) < 0.05;
  const sameHo = (r: PriceRow) => !!wantHo && String(r.hoNm ?? '').replace(/\D/g, '') === wantHo;
  const sameDong = (r: PriceRow) => !wantDong || dongKey(r.dongNm) === wantDong;

  // 동+호가 맞는 줄 → 호만 맞는 줄 → 면적만 맞는 줄 → 그 지번의 아무 줄
  const byDongHo = rows.filter((r) => sameDong(r) && sameHo(r) && sameArea(r));
  const byHo = byDongHo.length > 0 ? byDongHo : rows.filter((r) => sameHo(r) && sameArea(r));
  const fallback = byHo.length > 0 ? byHo : rows.filter(sameArea);
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
    name: String(best.aphusNm ?? ''),
  };
  void writeCache('cacheAptPrice', id, out);
  return out;
};
