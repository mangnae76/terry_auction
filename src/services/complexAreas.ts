// 아파트 단지의 공급면적별 세대수와 내 호실 공급면적 — 물건정보 단지정보 · 정보요약 · 건축물정보 · 실사용자 표(앱 · 웹 같이).
//  · 단지 전체 호실의 건축물대장 전유공용면적을 받아 호실마다 공급(전용 + 주건축물 공용)을 계산하고, 공급면적이 같은 호실끼리 센다
//  · 타입 글자(115A · 115B)나 평형 숫자로 묶지 않는다 — 건축물대장 · 공시가격엔 타입이 없어 붙이면 추정이 된다(2026-11-10 사용자 결정)
//  · 받은 값은 우리 DB 단지 문서(aptComplexes — 단지 · 올해 하나)에 두고 모두가 같이 쓴다
//  2026타경50132 안산파크푸르지오 — 1,129세대, 공급 83.18㎡ 122세대 · 83.21㎡ 1세대 …, 101동 2301호 83.18㎡
import { cachedEntryOrStale, cacheKey } from './marketCache';
import { fetchComplexSupplies, fetchUnitSupply, type ComplexUnitArea, type UnitArea } from './publicDataApi';
import { aptComplexIdOf, fetchApartUnits, PRICE_YEAR, readAptComplex, writeAptComplex } from './vworldApi';
import { resolveRegionFromAddress } from './regionResolver';
import { parseAddressParts } from './addressLookup';

export type AreaGroup = { exclusive: number; supply: number; count: number };
export type ComplexAreas = { groups: AreaGroup[]; total: number; mine: UnitArea | null };

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
/** 한 호실의 전용 · 공급 — 단지 전체를 못 받았을 때 내 호실만이라도(한 해 둔다) */
const unitSupply = async (bCode10: string, jibun: string, dong: string, ho: string): Promise<UnitArea | null> => {
  const got = await cachedEntryOrStale('cacheBldFacts', cacheKey('sup', bCode10, jibun, dong || '-', ho), YEAR_MS,
    () => fetchUnitSupply(bCode10, jibun, dong, ho), (v) => v !== null);
  return got.value ?? null;
};

const dongKey = (v: string) => v.trim().replace(/동$/, '');
const hoKey = (v: string) => v.replace(/\D/g, '');

/** 공급면적이 같은 호실끼리 센다(소수 둘째 자리까지 같은 값만 한 무리) */
export const groupBySupply = (supplies: ComplexUnitArea[]): AreaGroup[] => {
  const by = new Map<string, AreaGroup>();
  supplies.forEach((u) => {
    const k = u.supply.toFixed(2);
    const g = by.get(k) ?? { exclusive: u.exclusive, supply: u.supply, count: 0 };
    g.count += 1;
    by.set(k, g);
  });
  return [...by.values()].sort((a, b) => a.supply - b.supply || a.exclusive - b.exclusive);
};

/** 주소(동 · 호까지) → 단지의 공급면적별 세대수, 내 호실 공급면적. 못 찾으면 null */
/** deferMs — 단지 전체를 새로 받아야 할 때만 이만큼 쉬었다 받는다(처음 여는 화면의 다른 조회가 먼저 끝나게) */
export const getComplexAreas = async (address: string, opts: { deferMs?: number } = {}): Promise<ComplexAreas | null> => {
  try {
    const region = await resolveRegionFromAddress(address);
    if (!region?.bCode10 || !region.jibun) return null;
    const parts = parseAddressParts(address);
    const id = aptComplexIdOf(region.bCode10, region.jibun);
    const saved = id ? await readAptComplex(id) : null;
    let supplies = saved?.supplies ?? [];
    if (!supplies.length) {
      if (opts.deferMs) await new Promise((ok) => { window.setTimeout(ok, opts.deferMs); });
      supplies = await fetchComplexSupplies(region.bCode10, region.jibun).catch(() => []);
      if (id && supplies.length) {
        // 단지 문서에 더해 둔다 — 공시가격 호실 목록(units)도 같이 지킨다
        const units = saved?.units?.length ? saved.units : await fetchApartUnits(region.bCode10, region.jibun).catch(() => []);
        void writeAptComplex(id, { pnu: id.split('_')[0], year: PRICE_YEAR, units, supplies });
      }
    }
    const mineRow = parts.ho
      ? supplies.find((u) => hoKey(u.ho) === hoKey(parts.ho) && (!parts.buildingDong || dongKey(u.dong) === dongKey(parts.buildingDong)))
      : undefined;
    const mine = mineRow
      ? { exclusive: mineRow.exclusive, supply: mineRow.supply }
      : parts.ho ? await unitSupply(region.bCode10, region.jibun, parts.buildingDong, parts.ho).catch(() => null) : null;
    if (!supplies.length && !mine) return null;
    return { groups: groupBySupply(supplies), total: supplies.length, mine };
  } catch {
    return null;
  }
};

/** 내 호실과 공급면적이 같은 무리 — 내 호실 공급을 모르면 null(짐작하지 않는다) */
export const myGroupOf = (areas: ComplexAreas | null | undefined): AreaGroup | null => {
  const s = areas?.mine?.supply;
  if (!areas || !s) return null;
  return areas.groups.find((g) => g.supply.toFixed(2) === s.toFixed(2)) ?? null;
};

/** 단지정보 면적종류 — 공급면적마다 '83.18㎡(25.16평) 122세대', 내 호실 무리에 표시 */
export const supplyRowsOf = (areas: ComplexAreas | null | undefined): Array<{ text: string; count: number; mine: boolean }> => {
  const mine = myGroupOf(areas);
  return (areas?.groups ?? []).map((g) => ({
    text: `${g.supply.toFixed(2)}㎡(${(g.supply / 3.305785).toFixed(2)}평)`,
    count: g.count,
    mine: g === mine,
  }));
};

/** 해당 세대수 — 이 호실과 전용면적(건축물대장)이 같은 세대 수. 실거래가 전용면적으로만 갈리고 네이버 평형(25평 123세대)도
 *  같은 전용을 한 평형으로 묶어, 공급면적이 0.03㎡ 다른 세대(83.21㎡)도 넣는다(2026-11-10 사용자 확인). 내 호실을 모르면 0 */
export const sameExclusiveCountOf = (areas: ComplexAreas | null | undefined): number => {
  const mine = areas?.mine;
  if (!areas || !mine) return 0;
  return areas.groups.filter((x) => x.exclusive.toFixed(2) === mine.exclusive.toFixed(2)).reduce((n, x) => n + x.count, 0);
};

/** 정보요약 해당면적 세대수 — 사람이 적은 값이 먼저, 아니면 전용면적이 같은 호실 수(sameExclusiveCountOf).
 *  자동 표('sum.areaUnitsAuto')가 있거나, 예전 자동값(공급면적이 같은 호실 수 · 122)과 같으면 자동값으로 본다 */
export const areaUnitsOf = (areas: ComplexAreas | null | undefined, stored: string, autoFlag: string): string => {
  const n = sameExclusiveCountOf(areas);
  const oldSupply = myGroupOf(areas)?.count ?? 0;
  const auto = autoFlag === '1' || !stored || (oldSupply > 0 && stored === String(oldSupply));
  return auto && n ? String(n) : stored;
};
