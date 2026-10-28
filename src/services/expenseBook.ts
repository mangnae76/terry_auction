// 물건별 비용 장부(웹) — 필요경비 · 사업경비 두 갈래. 화면과 떼어 둔 셈.
//
// 매매사업자는 팔 때 '토지등 매매차익 예정신고'를 종합소득세 기본세율로 먼저 한다.
// 그때 빼는 돈이 필요경비(양도세 필요경비 — 소득세법 제97조): 취득비용 · 자본적지출 · 양도비용.
// 나머지(수리 · 명도 · 이자 · 관리비 · 유류 · 물품 …)는 이듬해 5월 종합소득세 확정신고에서 빼는 사업경비.
//
// 저장 자리는 예전 그대로 쓴다 — 필요경비는 사업지출(businessExpense), 사업경비는 인테리어(interior) 기록.
// 예전 사업지출의 다른 항목 · 유류&식대 · 물품구매는 시험용 덤이라 읽지 않는다.
import type { BusinessExpenseRecord, InteriorExpenseRecord } from '../types/finance';

export type Book = 'need' | 'biz';

/** 필요경비 — 사용구분과 흔한 명세 */
export const NEED_GROUPS: Array<[string, string[]]> = [
  ['취득비용', ['취득세·지방교육세·농특세', '법무사 수수료(등기)', '국민주택채권 매각차손', '인지세', '취득 관련 소송비용']],
  ['자본적지출', ['샷시·발코니 확장', '보일러·난방 교체', '배관·설비 교체', '시스템에어컨']],
  ['양도비용', ['매도 중개수수료', '세무·신고 수수료', '계약서 작성·공증비']],
];
/** 사업경비 — 사용구분과 흔한 명세 */
export const BIZ_GROUPS: Array<[string, string[]]> = [
  ['수리·인테리어', ['도배', '장판·바닥', '싱크대·주방', '페인트', '욕실·타일', '조명·전기', '청소', '기타 수리']],
  ['명도비', ['이사비(합의)', '강제집행 비용', '내용증명·송달료']],
  ['대출이자', ['대출이자', '중도상환수수료']],
  ['관리비·공과금', ['관리비', '미납 관리비', '전기·가스·수도']],
  ['유류·식대', ['유류비', '식대']],
  ['물품구매', ['소모품', '공구', '가전']],
  ['기타', ['광고비', '세무 기장료', '통신비']],
];
export const groupsOf = (book: Book) => (book === 'need' ? NEED_GROUPS : BIZ_GROUPS);
export const BOOK_NAME: Record<Book, string> = { need: '필요경비', biz: '사업경비' };
export const BOOK_HINT: Record<Book, string> = {
  need: '팔 때 예정신고에서 빼는 돈 — 취득비용 · 자본적지출 · 양도비용',
  biz: '5월 종합소득세에서 빼는 돈 — 수리 · 명도 · 이자 · 관리비 · 유류 · 물품',
};
const NEED_CATS = NEED_GROUPS.map(([g]) => g);
/** 자본적지출 명세 — 수리·인테리어를 적다가 이것을 고르면 필요경비(자본적지출)로 간다 */
export const CAPITAL_ITEMS = NEED_GROUPS.find(([g]) => g === '자본적지출')?.[1] ?? [];
/** 직접 쓴 명세가 자본적지출로 보이는가 — 표에 '필요경비 대상' 표시 */
export const looksCapital = (detail: string) => /샷시|섀시|발코니|확장|보일러|난방|배관|설비 교체|시스템에어컨/.test(detail);

/** 두 장부의 한 줄 */
export interface LedgerRow {
  key: string;
  /** be — 사업지출 기록(필요경비) · in — 인테리어 기록(사업경비) */
  src: 'be' | 'in';
  id: string;
  book: Book;
  auctionId: string;
  auctionLabel: string;
  date: string;
  category: string;
  detail: string;
  amount: number;
  vendor: string;
  phone: string;
  status: string;
  note: string;
}

export const ledgerRows = (src: { be: BusinessExpenseRecord[]; interior: InteriorExpenseRecord[] }): LedgerRow[] => [
  ...src.be.filter((r) => NEED_CATS.includes(r.profitCategory)).map((r): LedgerRow => ({
    key: `be-${r.id}`, src: 'be', id: r.id, book: 'need', auctionId: r.auctionId || '', auctionLabel: r.auctionLabel || '',
    date: r.date || '', category: r.profitCategory, detail: r.detail || '', amount: r.amountWithVat || 0, vendor: '', phone: '', status: '', note: r.note || '',
  })),
  ...src.interior.filter((r) => (r.kind ?? 'cost') === 'cost').map((r): LedgerRow => ({
    key: `in-${r.id}`, src: 'in', id: r.id, book: 'biz', auctionId: r.auctionId || '', auctionLabel: r.auctionLabel || '',
    date: r.startDate || r.date || '', category: r.category || '수리·인테리어', detail: r.work || '', amount: r.amountWithVat || 0,
    vendor: r.vendor || '', phone: r.phone || '', status: r.status || '', note: r.note || '',
  })),
];

export const sumOf = (rows: LedgerRow[], book: Book, auctionId: string) =>
  rows.filter((r) => r.book === book && r.auctionId === auctionId).reduce((s, r) => s + r.amount, 0);

/** 입찰가산정 A안을 두 갈래로 — 실제 기록이 없을 때 대신 쓴다 */
export interface PlanCost {
  acquisitionTaxAmount?: number; legalCostAmount?: number; brokerageAmount?: number;
  interestAmount?: number; midRepaymentAmount?: number; arrearsFee?: number; repairCost?: number; evictionCost?: number; advertisingCost?: number;
}
export const planNeedOf = (c?: PlanCost | null) => (c?.acquisitionTaxAmount || 0) + (c?.legalCostAmount || 0) + (c?.brokerageAmount || 0);
/** 명도비는 빼고 셈한다 — 명도분석 값을 따로 더할 수 있게 */
export const planBizOf = (c?: PlanCost | null) => (c?.interestAmount || 0) + (c?.midRepaymentAmount || 0) + (c?.arrearsFee || 0)
  + (c?.repairCost || 0) + (c?.advertisingCost || 0);

/** 물건 하나의 두 갈래 비용 — 실제 기록이 있으면 그 값, 없으면 입찰가산정 A안.
 *  evict — 명도비를 따로 넣을 때(명도분석 값). 비우면 A안 명도비 */
export const costSplitOf = (
  a: { id: string; bidCost?: (PlanCost & { acquisitionTaxAmount?: number }) | null; metrics?: { myBidValue?: number; minimumBidValue?: number } },
  rows: LedgerRow[], evict?: number,
) => {
  const c = a.bidCost;
  const bid = a.metrics?.myBidValue || a.metrics?.minimumBidValue || 0;
  const acq = c?.acquisitionTaxAmount || Math.round(bid * 0.011);
  const needActual = sumOf(rows, 'need', a.id);
  const bizActual = sumOf(rows, 'biz', a.id);
  const needPlan = acq + (c?.legalCostAmount || 0) + (c?.brokerageAmount || 0);
  const evictPlan = evict ?? (c?.evictionCost || 0);
  const bizPlan = planBizOf(c) + evictPlan;
  return { acq, needActual, bizActual, needPlan, bizPlan, evictPlan, need: needActual || needPlan, biz: bizActual || bizPlan };
};
