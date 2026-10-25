// 물건상세 머리·정보요약·기본정보의 셈 — 앱 물건상세(AuctionDetailPage)에 있던 코드를 그대로 옮겨 왔다.
// 앱 화면과 웹(web/)이 이 파일을 같이 쓴다. 한쪽만 고쳐지는 일이 없게 규칙은 여기 한곳에 둔다.
import type { AuctionDetail, AuctionHistoryRow } from '../types/auction';
import { pickCurrentRound } from '../utils/auctionSchedule';

/** 소수점 두 자리에서 '자른다'(반올림하지 않는다). 자릿수는 항상 두 자리로 채워 줄을 맞춘다 */
export const trunc2 = (v: number) => {
  // v * 100 은 부동소수 오차가 나서(66.1 → 6609.99…) 자릿수를 문자열에서 자른다
  const [whole, frac = ''] = v.toFixed(4).split('.');
  return `${whole}.${(frac + '00').slice(0, 2)}`;
};

// === 상단 고정 카드 ===

export const saleKindOf = (a: Pick<AuctionDetail, 'saleClassification'> | null | undefined): string => {
  const raw = a?.saleClassification || '토지건물 일괄매각';
  const m = raw.match(/(토지[·.]?\s*건물\s*일괄매각)/);
  // 한 줄에 년식까지 담아야 해서 '토지·건물 일괄매각' 을 '토건일괄매각' 으로 줄인다.
  // 띄어쓰기도 뺀다 — 좁은 화면에서 '16년차' 가 잘려 나갔다.
  return (m?.[1] ?? raw.split(/[·,/]/)[0])
    .replace(/토지[·.]?\s*건물\s*일괄매각/, '토건일괄매각')
    .replace(/\s+/g, '')
    .trim();
};

/** 사건번호 줄에 붙는 한 줄 기준값 — '66.11㎡ · 2008년' */
export const headMetaLineOf = (
  a: Pick<AuctionDetail, 'buildingAreaM2' | 'approvalDate' | 'buildingHeader'> | null | undefined,
  thisYear: number,
): string => {
  const m2 = Number(a?.buildingAreaM2) || 0;
  const area = m2 > 0 ? `${trunc2(m2)}㎡/${(m2 / 3.305785).toFixed(1)}평` : '';
  const raw = String(a?.buildingHeader?.approvalDate || a?.approvalDate || '').trim();
  const ym = raw.match(/(\d{4})\D?(\d{2})?/);
  const y = Number(ym?.[1] ?? 0);
  // 연도만 쓰면 같은 해 물건끼리 구분이 안 된다 — 월까지 적는다 ('2015-08')
  const head = ym?.[2] ? `${y}-${ym[2]}` : String(y);
  const year = y && y >= 1800 ? `${head}(${Math.max(0, thisYear - y)}년차)` : '';
  return [area, year].filter(Boolean).join(' · ');
};

// === 정보요약 ===

/** PDF에서 읽을 수 있는 값 — 정보요약 칸이 비어 있을 때만 이 값으로 채운다 */
export const summarySeedOf = (a: AuctionDetail): Record<string, string> => {
  const v: Record<string, string> = {};
  const fill = (id: string, value: string) => { if (!v[id] && value) v[id] = value; };
  const num = (raw: string | undefined) => (raw ?? '').replace(/[^\d.]/g, '');

  const courtRaw = (a.courtName || '').trim();
  const courtParts = /^(.*?법원)\s*(.*)$/.exec(courtRaw);
  fill('sum.court', courtParts ? courtParts[1] : courtRaw);
  fill('sum.courtDept', a.courtDept || courtParts?.[2] || '');
  fill('sum.courtPhone', a.courtPhone || '');
  fill('sum.far', (a.buildingHeader?.floorAreaRatio ?? '').match(/[\d.]+/)?.[0] ?? '');
  fill('sum.landArea', a.landAreaM2 ? String(a.landAreaM2) : '');
  fill('sum.approval', a.buildingHeader?.approvalDate || a.approvalDate || '');
  // 세대수 — 단지정보 세대수가 우선, 없으면 표제부 '가구/세대/호'의 세대 칸
  const headerHouseholds = (raw: string | undefined) => {
    const parts = (raw ?? '').split('/').map((part) => Number(part.replace(/[^\d]/g, '')) || 0);
    if (parts.length >= 2 && parts[1] > 0) return String(parts[1]);
    const found = parts.find((n) => n > 0);
    return found ? String(found) : '';
  };
  const firstNumOf = (raw: string | undefined) => (raw ?? '').replace(/,/g, '').match(/\d+/)?.[0] ?? '';
  fill(
    'sum.units',
    firstNumOf(a.aptComplexInfo?.households)
      || headerHouseholds(a.buildingHeader?.unitHouseholds)
      || headerHouseholds(a.buildingHeader?.households),
  );
  fill('sum.exclusiveArea', a.buildingAreaM2 ? String(a.buildingAreaM2) : num(a.buildingHeader?.unitExclusiveArea));
  // 공급면적 = 전용 + 공용 (둘 다 읽혔을 때만)
  const ex = Number(num(a.buildingHeader?.unitExclusiveArea)) || Number(a.buildingAreaM2) || 0;
  const common = Number(num(a.buildingHeader?.unitCommonArea)) || 0;
  if (ex > 0 && common > 0) fill('sum.supplyArea', (ex + common).toFixed(2));
  // 전체 층수 — '0층 / 4층'처럼 지하/지상으로 오면 지상 층수를 쓴다
  fill('sum.floorTotal', num((a.buildingHeader?.floors ?? '').split('/').pop() ?? ''));
  // 해당 물건 층 — 전유부 층, 없으면 소재지의 'N층'
  const raw = a.buildingHeader?.unitLocation || a.address || '';
  const floorFromAddr = raw.match(/(\d+)\s*층/);
  fill('sum.floorCurrent', num(a.buildingHeader?.unitFloor) || (floorFromAddr ? floorFromAddr[1] : ''));
  // '101동'·'A동'·'가동'은 잡고 '검암동'·'역삼동' 같은 행정동은 거른다
  // (행정동은 동 앞 글자가 한글이라, 숫자이거나 '앞이 띄어쓰기인 한 글자'일 때만 본다)
  const pickDong = (text: string) =>
    text.match(/제?\s*(\d{1,4}[A-Za-z]?)\s*동(?![가-힣])/)?.[1]
    ?? text.match(/(?:^|[\s,·])([A-Za-z가-힣])\s*동(?![가-힣])/)?.[1]
    ?? '';
  const pickHo = (text: string) => text.match(/제?\s*(\d{1,5})\s*호(?![가-힣])/)?.[1] ?? '';
  // 전유부에 없으면 주소에서 찾는다 (한쪽만 보면 비는 경우가 생긴다)
  const dong = pickDong(a.buildingHeader?.unitLocation ?? '') || pickDong(a.address ?? '');
  const ho = pickHo(a.buildingHeader?.unitLocation ?? '') || pickHo(a.address ?? '');
  if (dong) fill('sum.dong', dong);
  if (ho) fill('sum.ho', ho);
  return v;
};

/** '66.11 / 20.00' — 단위는 항목 이름에 적고 값에는 숫자만 둔다 */
export const summaryAreaText = (raw: string) => {
  const n = Number(String(raw).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return '-';
  return `${trunc2(n)}㎡ / ${(n / 3.305785).toFixed(2)}평`;
};

export const summaryApprovalAgeOf = (approval: string) => {
  const m = approval.match(/^(\d{4})/);
  if (!m) return '';
  const years = new Date().getFullYear() - Number(m[1]) + 1;
  return years > 0 ? `${years}년차` : '';
};

// 앞이 해당 물건의 층, 뒤가 그 동의 전체 층수
export const summaryFloorPairOf = (cur: string, total: string) => {
  if (!total && !cur) return '-';
  return `${cur || '-'}층 / ${total || '-'}층`;
};

// === 기본정보 ===

// 회차 비율의 기준값 = 감정가. 1차 최저매각가격은 감정가와 같으므로,
// 감정가가 비어 있는 예전 임포트 데이터도 기일내역 1차 금액으로 비율을 낼 수 있다.
export const bidBaseValueOf = (a: AuctionDetail | null | undefined) => {
  if (!a) return 0;
  return a.metrics.appraisalValue || a.auctionHistory?.[0]?.minPrice || 0;
};

// 이번 회차 최저매각가격 — 저장된 값이 비면 기일내역에서 찾는다 (구 파서 임포트 데이터 대비)
export const currentMinBidOf = (a: AuctionDetail | null | undefined) => {
  if (!a) return 0;
  if (a.metrics.minimumBidValue) return a.metrics.minimumBidValue;
  return pickCurrentRound(a.auctionHistory ?? [], a.eventDate)?.minPrice || bidBaseValueOf(a);
};

// PDF에 적힌 보증금이 있으면 그대로, 없으면 이번 회차 최저가의 10%
export const depositAmountOf = (a: AuctionDetail | null | undefined) =>
  a?.metrics.depositValue || Math.round(currentMinBidOf(a) * 0.1);

// 지난 회차는 결과값으로, 이번 회차는 in_progress, 남은 회차는 pending
// 배지 색만 결정한다 — 문구는 PDF '결과' 칸 표기를 그대로 쓴다
const ROUND_STATUS_TONE: Record<string, string> = {
  진행: 'now', 유찰: 'failed', 매각: 'sold', 낙찰: 'sold',
};
export type BidRoundRow = { label: string; date: string; price: number; rate: string; status: string; current: boolean };
export const bidRoundsOf = (a: AuctionDetail | null | undefined): BidRoundRow[] => {
  if (!a) return [];
  const rows: AuctionHistoryRow[] = (a.auctionHistory ?? []).length > 0
    ? a.auctionHistory
    : [{ round: a.auctionRound || '1차', date: a.eventDate, minPrice: currentMinBidOf(a), result: '' }];
  const current = pickCurrentRound(rows, a.eventDate);
  const currentIdx = current ? rows.indexOf(current) : -1;
  const base = bidBaseValueOf(a);
  return rows.map((row, i) => ({
    label: `${row.round || `${i + 1}차`} 최저가`,
    date: row.date,
    price: row.minPrice,
    rate: base > 0 && row.minPrice > 0 ? `${Math.round((row.minPrice / base) * 100)}%` : '',
    // PDF 결과 칸이 비어 있으면 진행 중인 회차는 '진행', 그 뒤는 '예정'
    status: row.result || (i === currentIdx ? '진행' : i > currentIdx ? '예정' : ''),
    current: i === currentIdx,
  }));
};

export const roundToneOf = (status: string) => `st-${ROUND_STATUS_TONE[status] ?? 'plain'}`;

// 차수 배지 — '신건'(비율로 추정한 값) 대신 기일내역상 진행 중인 회차를 쓴다
export const currentRoundLabelOf = (a: AuctionDetail | null | undefined) => {
  if (!a) return '';
  const rows = a.auctionHistory ?? [];
  return pickCurrentRound(rows, a.eventDate)?.round || a.auctionRound || '1차';
};
