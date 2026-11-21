// 건물명 저절로 채우기 — PDF 주소에 건물명이 없고 사용자도 적지 않은 물건은
// 그 필지의 건축물대장(표제부) 건물명으로 정보요약의 건물명 칸(sum.buildingName)을 채운다.
// 대장에 이름이 없으면 카카오 주소 검색 → 공동주택가격 단지명 → 같은 지번 다른 물건 이름 순(2026-11-21).
// 사용자가 적은 이름은 덮지 않는다. 한 물건에 한 번만 해 본다(sum.buildingNameAuto 표시 — 이름을 못 찾아도 'none2' 로 남겨 다시 부르지 않는다).
// 화면은 utils/addressName 의 shownAddressOf 로 이 칸을 주소에 끼워 보여 준다.
import type { AuctionDetail } from '../types/auction';
import { buildingNameOf, hasBuildingName } from '../utils/addressName';
import { getBuildingFacts } from './buildingFacts';
import { kakaoBuildingName } from './addressSearch';
import { lookupAddress } from './addressLookup';
import { lotOf } from './bidPredict';

const AUTO_KEY = 'sum.buildingNameAuto';

/** 건물명을 찾아봐야 하는 물건인가 */
export const needsBuildingName = (a: Pick<AuctionDetail, 'address' | 'basicSummary'>): boolean =>
  !!String(a.address ?? '').trim()
  && !hasBuildingName(a.address)
  && !String(a.basicSummary?.['sum.buildingName'] ?? '').trim()
  && (!a.basicSummary?.[AUTO_KEY] || a.basicSummary[AUTO_KEY] === 'none');   // 'none' = 대장만 보고 못 찾은 옛 표시 — 아래 길로 한 번 더(2026-11-21)

const lotStr = (addr: string) => addr.replace(/\s*\(.*$/, '').replace(/\s*외\s*\d+필지.*$/, '').match(/^(.*?(?:동|가|읍|면|리)\s+(?:산\s*)?\d+(?:-\d+)?)/)?.[1]?.replace(/\s+/g, ' ') ?? '';
const lotKey = (addr: string) => { const l = lotOf(addr); return l.dong ? `${l.dong} ${l.jibun}` : ''; };
/** 같은 지번 다른 물건(내 목록)의 이름 — 주소에 적힌 이름 또는 정보요약 건물명 */
const siblingName = (a: AuctionDetail, items: AuctionDetail[]): string => {
  const k = lotKey(a.address ?? ''); if (!k) return '';
  for (const b of items) {
    if (b.id === a.id || lotKey(b.address ?? '') !== k) continue;
    const n = buildingNameOf(b.address ?? '') || String(b.basicSummary?.['sum.buildingName'] ?? '').trim();
    if (n) return n;
  }
  return '';
};

const tried = new Set<string>();
let running = false;

/** 채울 물건을 하나씩(건축물대장 하루 한도 · 화면 막힘을 피해) — save 는 그 물건에 이름을 적어 저장한다 */
export const fillMissingBuildingNames = async (
  items: AuctionDetail[],
  save: (id: string, name: string, mark: string) => Promise<void>,
): Promise<void> => {
  if (running) return;
  running = true;
  try {
    for (const a of items) {
      if (tried.has(a.id) || !needsBuildingName(a)) continue;
      tried.add(a.id);
      const facts = await getBuildingFacts(a.address).catch(() => null);
      // 이름 출처 순서 — 대장 → 카카오 주소 검색 → 공동주택가격 단지명 → 같은 지번 다른 물건(낙찰가예측 · 저가매수와 같은 길).
      // 대장을 못 받아도(623-4 '2동' 주소 등) 다음 출처는 본다
      let name = String(facts?.name ?? '').trim(); let mark = 'bld';
      if (!name) { const lot = lotStr(a.address); name = lot ? await kakaoBuildingName(lot).catch(() => '') : ''; mark = 'kakao'; }
      if (!name) { name = await lookupAddress(a.address, { areaM2: undefined }).then((r) => String(r.price?.name ?? '').trim()).catch(() => ''); mark = 'price'; }
      if (!name) { name = siblingName(a, items); mark = 'case'; }
      if (!name && !facts) continue;   // 대장도 못 받고 이름도 없음 — 주소 · 네트워크 탓일 수 있어 다음 접속 때 다시
      try { await save(a.id, name, name ? mark : 'none2'); } catch { /* 다음 접속 때 다시 */ }
    }
  } finally {
    running = false;
  }
};

export { AUTO_KEY as BUILDING_NAME_AUTO_KEY };
