// 건물명 저절로 채우기 — PDF 주소에 건물명이 없고 사용자도 적지 않은 물건은
// 그 필지의 건축물대장(표제부) 건물명으로 정보요약의 건물명 칸(sum.buildingName)을 채운다.
// 사용자가 적은 이름은 덮지 않는다. 한 물건에 한 번만 해 본다(sum.buildingNameAuto 표시 — 이름을 못 찾아도 남겨 다시 부르지 않는다).
// 화면은 utils/addressName 의 shownAddressOf 로 이 칸을 주소에 끼워 보여 준다.
import type { AuctionDetail } from '../types/auction';
import { hasBuildingName } from '../utils/addressName';
import { getBuildingFacts } from './buildingFacts';

const AUTO_KEY = 'sum.buildingNameAuto';

/** 건물명을 찾아봐야 하는 물건인가 */
export const needsBuildingName = (a: Pick<AuctionDetail, 'address' | 'basicSummary'>): boolean =>
  !!String(a.address ?? '').trim()
  && !hasBuildingName(a.address)
  && !String(a.basicSummary?.['sum.buildingName'] ?? '').trim()
  && !a.basicSummary?.[AUTO_KEY];

const tried = new Set<string>();
let running = false;

/** 채울 물건을 하나씩(건축물대장 하루 한도 · 화면 막힘을 피해) — save 는 그 물건에 이름을 적어 저장한다 */
export const fillMissingBuildingNames = async (
  items: AuctionDetail[],
  save: (id: string, name: string) => Promise<void>,
): Promise<void> => {
  if (running) return;
  running = true;
  try {
    for (const a of items) {
      if (tried.has(a.id) || !needsBuildingName(a)) continue;
      tried.add(a.id);
      const facts = await getBuildingFacts(a.address);
      if (!facts) continue;   // 주소 · 네트워크 탓으로 못 찾음 — 다음 접속 때 다시 해 본다
      try { await save(a.id, String(facts.name ?? '').trim()); } catch { /* 다음 접속 때 다시 */ }
    }
  } finally {
    running = false;
  }
};

export { AUTO_KEY as BUILDING_NAME_AUTO_KEY };
