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
