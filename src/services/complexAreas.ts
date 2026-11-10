// 아파트 단지의 평형별 세대수 · 공급면적과 내 호실 공급면적 — 물건정보 단지정보 · 정보요약 · 건축물정보(앱 · 웹 같이).
//  · 세대수 — 공동주택가격(올해) 호실 목록을 전용면적끼리 센다
//  · 공급면적 — 전용면적마다 호실 하나만 건축물대장 전유공용면적으로 계산(전용 + 주건축물 공용). 단지 전체는 1만 줄이 넘어 다 받지 않는다
//  둘 다 우리 DB 단지 문서(aptComplexes — 단지 · 올해 하나)에 묶어 두고 모두가 같이 쓴다
//  2026타경50132 안산파크푸르지오 — 59.99㎡ 123세대 · 공급 83.18㎡, 리치고 평형표와 같다(2026-11-10)
import { cachedEntryOrStale, cacheKey } from './marketCache';
import { fetchUnitSupply, type UnitArea } from './publicDataApi';
import { aptComplexIdOf, fetchApartUnits, PRICE_YEAR, readAptComplex, writeAptComplex } from './vworldApi';
import { resolveRegionFromAddress } from './regionResolver';
import { parseAddressParts } from './addressLookup';

export type AreaGroup = { exclusive: number; supply: number; count: number };
export type ComplexAreas = { groups: AreaGroup[]; total: number; mine: UnitArea | null };

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
/** 한 호실의 전용 · 공급 — 건물이 서면 바뀌지 않아 한 해 둔다 */
const unitSupply = async (bCode10: string, jibun: string, dong: string, ho: string): Promise<UnitArea | null> => {
  const got = await cachedEntryOrStale('cacheBldFacts', cacheKey('sup', bCode10, jibun, dong || '-', ho), YEAR_MS,
    () => fetchUnitSupply(bCode10, jibun, dong, ho), (v) => v !== null);
  return got.value ?? null;
};

/** 주소(동 · 호까지) → 단지의 전용면적별 세대수 · 공급면적, 내 호실 공급면적. 못 찾으면 null */
export const getComplexAreas = async (address: string): Promise<ComplexAreas | null> => {
  try {
    const region = await resolveRegionFromAddress(address);
    if (!region?.bCode10 || !region.jibun) return null;
    const parts = parseAddressParts(address);
    const id = aptComplexIdOf(region.bCode10, region.jibun);
    const saved = id ? await readAptComplex(id) : null;
    const units = saved?.units?.length ? saved.units : await fetchApartUnits(region.bCode10, region.jibun);
    const mine = parts.ho ? await unitSupply(region.bCode10, region.jibun, parts.buildingDong, parts.ho).catch(() => null) : null;
    // 평형표가 이미 단지 문서에 있으면(공급까지 다 찬 것) 그대로 쓴다
    if (saved?.groups?.length && saved.groups.every((g) => g.supply > 0)) return { groups: saved.groups, total: units.length, mine };
    const byArea = new Map<string, { exclusive: number; count: number; dong: string; ho: string }>();
    units.forEach((u) => {
      if (!(u.areaM2 > 0)) return;
      const k = u.areaM2.toFixed(2);
      const g = byArea.get(k) ?? { exclusive: u.areaM2, count: 0, dong: u.dong, ho: u.ho };
      g.count += 1;
      byArea.set(k, g);
    });
    const groups: AreaGroup[] = [];
    for (const g of [...byArea.values()].sort((a, b) => a.exclusive - b.exclusive)) {
      const s = await unitSupply(region.bCode10, region.jibun, g.dong, g.ho).catch(() => null);
      groups.push({ exclusive: g.exclusive, supply: s?.supply ?? 0, count: g.count });
    }
    if (!groups.length && !mine) return null;
    // 공급까지 다 찼을 때만 단지 문서에 평형표를 더해 둔다 — 덜 찬 표를 남기면 다음 사람이 빈 공급을 그대로 받는다
    if (id && units.length && groups.length && groups.every((g) => g.supply > 0)) {
      void writeAptComplex(id, { pnu: id.split('_')[0], year: PRICE_YEAR, units, groups });
    }
    return { groups, total: units.length, mine };
  } catch {
    return null;
  }
};

/** 내 호실이 속한 전용면적 무리 — 건축물대장 전용이 없으면 물건 전용면적으로 */
export const myGroupOf = (areas: ComplexAreas | null | undefined, exclusiveM2: number): AreaGroup | null => {
  if (!areas) return null;
  const ex = areas.mine?.exclusive || exclusiveM2;
  if (!(ex > 0)) return null;
  const near = areas.groups.filter((g) => Math.abs(g.exclusive - ex) < 0.05);
  return near.length === 1 ? near[0] : null;
};

/** 단지정보 면적 종류 — PDF 평형 이름(83㎡ · 115A㎡ …)마다 세대수를 붙이고 내 평형을 표시한다.
 *  평형 이름의 숫자 = 공급면적의 정수부(83.18 → 83). 같은 숫자 평형이 둘 이상(115A · 115B)이면 하나로 묶어 세대수를 합친다
 *  — 같은 전용면적 안에서 공급이 갈려 호실마다 다 받지 않으면 나눌 수 없다 */
export const areaTypeRowsOf = (areaTypes: string, areas: ComplexAreas | null | undefined, exclusiveM2: number): Array<{ text: string; count: number; mine: boolean }> => {
  const tokens = String(areaTypes ?? '').split(/\s*,\s*/).map((t) => t.trim()).filter(Boolean);
  const numOf = (t: string) => Number(t.match(/\d+/)?.[0]) || 0;
  const mineGroup = myGroupOf(areas, exclusiveM2);
  const mineSupply = areas?.mine?.supply || 0;   // 이 호실 건축물대장 값만(추정값 금지)
  const out: Array<{ text: string; count: number; mine: boolean }> = [];
  const seen = new Set<number>();
  tokens.forEach((t) => {
    const n = numOf(t);
    if (seen.has(n)) return;
    seen.add(n);
    const same = tokens.filter((x) => numOf(x) === n);
    // 평형 이름이 공급면적이면 공급 정수부로, 아니면(59A · 84B 같은 전용 표기) 전용 정수부로 맞춘다
    const bySupply = (areas?.groups ?? []).filter((g) => g.supply > 0 && Math.floor(g.supply) === n);
    const groups = bySupply.length ? bySupply : (areas?.groups ?? []).filter((g) => Math.floor(g.exclusive) === n);
    out.push({
      text: same.join('·'),
      count: groups.reduce((sum, g) => sum + g.count, 0),
      mine: bySupply.length ? mineSupply > 0 && Math.floor(mineSupply) === n : !!mineGroup && groups.includes(mineGroup),
    });
  });
  return out;
};
