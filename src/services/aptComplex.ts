// 물건정보 단지정보 · 건축물정보에서 PDF 칸이 비었을 때 채우는 규칙 — 앱(AuctionDetailPage)과 웹(selected.src.html)이 같이 쓴다.
import { buildingNameFromAddress } from './addressLookup';
import type { AuctionDetail } from '../types/auction';

type Src = Pick<AuctionDetail, 'address' | 'buildingAreaM2' | 'buildingHeader' | 'aptComplexInfo'>;

/** 단지명 — PDF 단지정보에 없으면 전유부 소재지(없으면 주소)의 건물명 */
export const complexNameOf = (a: Partial<Src>): string =>
  a.aptComplexInfo?.name || buildingNameFromAddress(a.buildingHeader?.unitLocation || a.address);

/** 총 주차수 — 전유부 · 표제부에 없으면 단지정보 주차 수 */
export const totalParkingOf = (a: Partial<Src>): string =>
  a.buildingHeader?.unitTotalParking || a.buildingHeader?.parking || a.aptComplexInfo?.parkingTotal || '';

/** 단지정보 면적 종류(공급면적) 중 내 물건 평형 — 공급 ÷ 전용이 1.15~1.55 인 것이 하나뿐일 때만 고른다.
 *  PDF 공용면적은 지하주차장까지 든 계약면적이라 공급면적과 맞춰 보지 않는다. */
export const areaTypePartsOf = (a: Partial<Src>): Array<{ text: string; mine: boolean }> => {
  const list = String(a.aptComplexInfo?.areaTypes ?? '').split(/\s*,\s*/).filter(Boolean);
  const ex = Number(String(a.buildingHeader?.unitExclusiveArea ?? '').match(/[\d.]+/)?.[0]) || Number(a.buildingAreaM2) || 0;
  const fits = list.map((t) => {
    const supply = Number(t.match(/[\d.]+/)?.[0]) || 0;
    const r = ex > 0 ? supply / ex : 0;
    return r >= 1.15 && r <= 1.55;
  });
  const one = fits.filter(Boolean).length === 1;
  return list.map((text, i) => ({ text, mine: one && fits[i] }));
};
