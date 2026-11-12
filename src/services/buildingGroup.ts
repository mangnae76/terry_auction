// 실거래를 건물(동 + 지번)로 묶고, 건물마다 건축물대장(엘베 · 세대수)을 받는 한 벌 — 손품조사 입지비교(complexCompare)가 쓴다(2026-11-12).
// 시장분석 건물랭킹(AdminDongTradePage)도 같은 일을 하지만 그 화면은 건드리지 않는다(사용자). 건축물대장은 getBuildingFacts 저장소(DB · 1년) 하나라 건물랭킹에서 받은 건물은 여기서 바로 나온다.
import { getBuildingFacts } from './buildingFacts';
import type { BuildingFacts } from './publicDataApi';

const squash = (s: string) => String(s ?? '').replace(/\s+/g, '');

/** 건물 열쇠 — 동 + 지번(띄어쓰기 무시). 반경 범위에선 다른 동의 같은 지번이 있어 동까지 본다 */
export const buildingKeyOf = (umdNm: string, jibun: string) => `${squash(umdNm)}|${squash(jibun)}`;

/** 거래를 건물마다 묶는다 — keep 이 거짓인 줄 · 지번 없는 줄은 뺀다. keyOf 를 주면 그 열쇠로(기본 buildingKeyOf) */
export const groupByBuilding = <T extends { umdNm: string; jibun: string }>(rows: T[], keep?: (r: T) => boolean, keyOf: (r: T) => string = (r) => buildingKeyOf(r.umdNm, r.jibun)): Map<string, T[]> => {
  const m = new Map<string, T[]>();
  rows.forEach((r) => {
    if (!r.jibun || (keep && !keep(r))) return;
    const k = keyOf(r);
    const l = m.get(k); if (l) l.push(r); else m.set(k, [r]);
  });
  return m;
};

/** 건물 이름 — 거래마다 비거나 표기가 달라 가장 많이 적힌 것 */
export const buildingNameOf = (list: Array<{ name?: string }>) => {
  const c = new Map<string, number>();
  list.forEach((r) => { const t = String(r.name ?? '').trim(); if (t) c.set(t, (c.get(t) ?? 0) + 1); });
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
};

/** 건물 연식 — 거래에 적힌 건축년도 중 가장 흔한 해(동마다 다를 수 있다) */
export const buildingYearOf = (list: Array<{ buildYear?: number }>) => {
  const c = new Map<number, number>();
  list.forEach((r) => { const y = Number(r.buildYear ?? 0); if (y > 1900) c.set(y, (c.get(y) ?? 0) + 1); });
  return [...c.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0;
};

/** 건물마다 건축물대장 — n곳씩 동시에, 받는 대로 onGot(못 찾으면 null). alive 가 거짓이 되면(조건이 바뀌면) 멈춘다 */
export const loadBuildingFacts = async <T,>(items: T[], addrOf: (x: T) => string, n: number, alive: () => boolean, onGot: (x: T, f: BuildingFacts | null) => void) => {
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => {
    while (i < items.length && alive()) {
      const x = items[i]; i += 1;
      const f = await getBuildingFacts(addrOf(x)).catch(() => null);
      if (alive()) onGot(x, f);
    }
  }));
};
