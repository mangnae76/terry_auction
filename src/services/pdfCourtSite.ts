// 법원경매정보(courtauction.go.kr) '물건상세검색' 인쇄본 — 기본 규칙(탱크옥션 양식)이 놓치는 칸을 이 양식 자리에서 다시 읽는다.
//
// 이 인쇄본은
//  - 소재지가 '(다세대주택) 인천광역시 서해구 …' 처럼 용도 괄호로 시작하는 줄에 있다('목록1 소재지' 라벨은 다음 줄로 떨어진다)
//  - 감정가는 '감정평가액', 경매계는 '담당 인천지방법원 | 경매19계'
//  - 기일내역이 '2026.11.19 (10:00) 매각기일 제219호 법정 142,000,000원 [결과]'
//  - 목록내역에 전유면적('구 조 : 철근콘크리트구조 37.83㎡') · 대지권 비율('687.2 분의 21.91')
// 소유자 · 채권자 · 임차인 · 등기부는 이 인쇄본에 없다(현황조사서 · 감정평가서는 따로 연다).
import type { AuctionHistoryRow } from '../types/auction';
import type { ParsedPdfAuction } from './pdfAuctionImport';

/** 법원경매정보 물건상세검색 인쇄본인가 */
export const isCourtSitePdf = (text: string): boolean => /물건상세검색/.test(text) && /물건기본정보/.test(text) && /기일내역/.test(text);

const iso = (s: string): string => {
  const m = /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/.exec(s);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
};
const num = (s: string): number => Number(String(s).replace(/[^\d.]/g, '')) || 0;
const pick = (text: string, re: RegExp): string => (re.exec(text)?.[1] ?? '').trim();
const pyeong = (m2: number) => Math.round(m2 * 0.3025 * 100) / 100;
const SIDO = '(?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|강원도|충청북도|충청남도|전북특별자치도|전라북도|전라남도|경상북도|경상남도|제주특별자치도)';

export const applyCourtSite = (text: string, base: ParsedPdfAuction): ParsedPdfAuction => {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const r: ParsedPdfAuction = { ...base, buildingHeader: { ...base.buildingHeader } };

  // 소재지 — '(다세대주택) 인천광역시 …' 줄. 없으면 목록내역 '1동의 건물의 표시' 다음 줄 + 건물명 + 건물의 번호
  const addrLine = lines.find((l) => new RegExp(`^\\([^)]{1,20}\\)\\s*${SIDO}\\s`).test(l)) ?? '';
  let address = addrLine.replace(/^\([^)]*\)\s*/, '').trim();
  if (!address) {
    const i = lines.findIndex((l) => /^1동의 건물의 표시/.test(l));
    const lot = i >= 0 ? lines[i + 1] ?? '' : '';
    const bld = i >= 0 ? lines[i + 2] ?? '' : '';
    const unitNo = pick(text, /건물의 번호\s*:\s*([^\n]+)/);
    if (new RegExp(`^${SIDO}\\s`).test(lot)) address = [lot, /층|㎡|구조/.test(bld) ? '' : bld, unitNo].filter(Boolean).join(' ');
  }
  if (address) r.address = address;

  const kind = pick(text, /물건종류\s+(\S+)/);
  if (kind) r.propertyType = kind;
  const dept = pick(text, /담당\s+\S+법원\s*\|\s*(경매\d+계)/);
  if (dept) r.courtDept = dept;
  const court = pick(text, /담당\s+(\S+법원)/);
  if (court) r.courtName = court;

  const appraisal = num(pick(text, /감정평가액\s+([\d,]+)원/));
  if (appraisal) r.appraisalValue = appraisal;
  const caseStart = iso(pick(text, /경매개시일\s+(\d{4}\.\d{2}\.\d{2})/));
  if (caseStart) r.caseStartDate = caseStart;
  const eventDate = iso(pick(text, /매각기일\s+(\d{4}\.\d{2}\.\d{2})/)) || r.eventDate;
  r.eventDate = eventDate;

  // 기일내역 — 매각기일 줄만 회차로 센다(매각결정기일은 빼고)
  const history: AuctionHistoryRow[] = [...text.matchAll(/(\d{4}\.\d{2}\.\d{2})\s*\(\d{1,2}:\d{2}\)\s*매각기일\s+[^\n]*?([\d,]{5,})원(?:[ \t]+(유찰|매각|낙찰|변경|취하|기각|정지|연기|불허|허가|납부|취소))?/g)]
    .map((m, i) => {
      const date = iso(m[1]);
      return { round: `${i + 1}차`, date, minPrice: num(m[2]), result: m[3] ?? (eventDate && date >= eventDate ? '예정' : '') };
    });
  if (history.length) {
    r.auctionHistory = history;
    const cur = history.find((h) => h.date === eventDate) ?? history[history.length - 1];
    r.auctionRound = cur.round;
    r.minimumBidValue = cur.minPrice || r.minimumBidValue;
  }
  if (r.appraisalValue > 0 && r.minimumBidValue > 0) r.minimumBidRate = Math.round((r.minimumBidValue / r.appraisalValue) * 100);

  // 목록내역 — 전유면적 · 대지권
  const unit = /구\s*조\s*:\s*(\S+구조)\s+([\d.]+)㎡/.exec(text);
  if (unit) {
    r.structureType = unit[1];
    r.buildingAreaM2 = num(unit[2]);
    r.buildingAreaPyeong = pyeong(r.buildingAreaM2);
  }
  const share = /대지권의 비율\s*:\s*\d*\.?\s*([\d.]+)\s*분의\s*([\d.]+)/.exec(text);
  if (share) { r.landAreaM2 = num(share[2]); r.landAreaPyeong = pyeong(r.landAreaM2); }

  const bh = r.buildingHeader;
  bh.unitLocation ||= r.address;
  if (r.buildingAreaM2) bh.unitExclusiveArea ||= `${r.buildingAreaM2}㎡ (${r.buildingAreaPyeong}평)`;
  if (unit) bh.unitStructure ||= unit[1];
  const floorOf = /(\d+)층\s*\d+호/.exec(pick(text, /건물의 번호\s*:\s*([^\n]+)/));
  if (floorOf) bh.unitFloor ||= `지상 ${floorOf[1]}층`;
  const top = /지붕\s*(\d+)층/.exec(text);
  if (top) bh.floors ||= `0층 / ${top[1]}층`;
  const use = pick(text, /^(공동주택\([^\n]+\)|[가-힣]+주택\([^\n]+\))$/m);
  if (use) bh.mainUse ||= use.replace(/^공동주택\((.+)\)$/, '$1').replace(/-.*/, '');
  const landTotal = pick(text, /^대\s+([\d.]+㎡)/m);
  if (landTotal) bh.landAreaTotal ||= landTotal;

  // 비고 · 감정평가요항(위치 · 교통) — 메모 칸에 남긴다
  const remark = pick(text, /물건비고\s*-?\s*([^\n]+)/);
  const claim = pick(text, /청구금액\s+([\d,]+원)/);
  const station = pick(text, /전철역\(([^)]+)\)/);
  if (station) r.nearestStation ||= station;
  const loc = (() => { const i = lines.findIndex((l) => /^1\) 위치 및 주위환경/.test(l)); return i >= 0 ? lines[i + 1] ?? '' : ''; })();
  r.notes = [remark ? `물건비고 ${remark}` : '', claim ? `청구금액 ${claim}` : '', station ? `인근역 ${station}` : '', loc]
    .filter(Boolean).join(' / ').slice(0, 700) || r.notes;
  return r;
};
