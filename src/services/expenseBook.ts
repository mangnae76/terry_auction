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
  biz: '5월 종합소득세에서 빼는 돈 — 수익적지출 · 수리 · 명도 · 이자 · 관리비 · 유류 · 물품',   // 필요경비의 '자본적지출'과 짝 — 세법 이름을 맨 앞에
};
const NEED_CATS = NEED_GROUPS.map(([g]) => g);

/** 두 장부의 한 줄 */
export interface LedgerRow {
  key: string;
  /** be — 사업지출 기록(필요경비) · in — 인테리어 기록(사업경비) · plan — 입찰가산정 A안 기본 줄(저장 안 됨) */
  src: 'be' | 'in' | 'plan';
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
  /** 물품구매 · 대출이자 · 관리비 — 수(개 · 개월) · 단가(없으면 0) */
  qty: number;
  unit: number;
  note: string;
}

export const ledgerRows = (src: { be: BusinessExpenseRecord[]; interior: InteriorExpenseRecord[] }): LedgerRow[] => [
  ...src.be.filter((r) => NEED_CATS.includes(r.profitCategory)).map((r): LedgerRow => ({
    key: `be-${r.id}`, src: 'be', id: r.id, book: 'need', auctionId: r.auctionId || '', auctionLabel: r.auctionLabel || '',
    date: r.date || '', category: r.profitCategory, detail: r.detail || '', amount: r.amountWithVat || 0, vendor: '', phone: '', status: '', qty: 0, unit: 0, note: r.note || '',
  })),
  ...src.interior.filter((r) => (r.kind ?? 'cost') === 'cost').map((r): LedgerRow => ({
    key: `in-${r.id}`, src: 'in', id: r.id, book: 'biz', auctionId: r.auctionId || '', auctionLabel: r.auctionLabel || '',
    date: r.startDate || r.date || '', category: r.category || '수리·인테리어', detail: r.work || '', amount: r.amountWithVat || 0,
    vendor: r.vendor || '', phone: r.phone || '', status: r.status || '', qty: r.quantity || 0, unit: r.unitPrice || 0, note: r.note || '',
  })),
];

/** 입찰가산정 A안의 비용 칸 */
export interface PlanCost {
  acquisitionTaxAmount?: number; legalCostAmount?: number; brokerageAmount?: number;
  interestAmount?: number; midRepaymentAmount?: number; arrearsFee?: number; repairCost?: number; evictionCost?: number; advertisingCost?: number;
  acquisitionTaxRate?: number; legalCostRate?: number; brokerageRate?: number; interestRate3m?: number; midRepaymentRate?: number; loanAmount?: number;
}
export interface PlanAuction {
  id: string; wonDate?: string; caseNumber?: string; address?: string; expectedSaleValue?: number;
  bidCost?: PlanCost | null; metrics?: { myBidValue?: number; minimumBidValue?: number };
}

/** 입찰가산정 A안 금액 — 화면(물건상세 입찰가산정)과 같은 규칙으로 비율에서 다시 계산한다.
 *  (화면은 비율로 금액을 그 자리에서 계산해 보여 주고, 저장된 금액이 비어 있을 수 있다) */
export const planAmountsOf = (a: PlanAuction) => {
  const c = a.bidCost ?? {};
  const bid = a.metrics?.myBidValue || a.metrics?.minimumBidValue || 0;
  const sale = a.expectedSaleValue || 0;
  const loan = c.loanAmount || 0;
  const byRate = (base: number, rate: number | undefined, amount: number | undefined, divisor = 1) =>
    (rate && rate > 0 && base > 0 ? Math.round((base * rate) / 100 / divisor) : amount || 0);
  const legalRate = c.legalCostRate ?? 0.5;
  return {
    acq: Math.round((bid * (c.acquisitionTaxRate && c.acquisitionTaxRate > 0 ? c.acquisitionTaxRate : 1.1)) / 100),
    legal: c.legalCostAmount || (legalRate > 0 ? Math.round((bid * legalRate) / 100) : 0),
    brokerage: byRate(sale, c.brokerageRate, c.brokerageAmount),
    interest: byRate(loan, c.interestRate3m, c.interestAmount, 4),
    midRepay: byRate(loan, c.midRepaymentRate, c.midRepaymentAmount),
    arrears: c.arrearsFee || 0,
    repair: c.repairCost || 0,
    evict: c.evictionCost || 0,
    ad: c.advertisingCost || 0,
  };
};

/** A안 기본 줄 — 장부를 빈칸으로 두지 않고 입찰가산정 값을 먼저 깔아 둔다.
 *  같은 물건 · 같은 구분 · 같은 명세의 실제 기록을 적으면 그 줄은 실제 기록으로 바뀐다(A안 줄은 숨는다) */
export const planRowsOf = (a: PlanAuction): LedgerRow[] => {
  const m = planAmountsOf(a);
  const lines: Array<[Book, string, string, number, number?, number?]> = [
    ['need', '취득비용', '취득세·지방교육세·농특세', m.acq],
    ['need', '취득비용', '법무사 수수료(등기)', m.legal],
    ['need', '양도비용', '매도 중개수수료', m.brokerage],
    // A안 이자는 3개월 몫 — 3개월 × 한 달 이자로 적어 둔다
    ['biz', '대출이자', '대출이자', m.interest, m.interest ? 3 : 0, m.interest ? Math.round(m.interest / 3) : 0],
    ['biz', '대출이자', '중도상환수수료', m.midRepay],
    ['biz', '관리비·공과금', '미납 관리비', m.arrears],
    ['biz', '수리·인테리어', '기타 수리', m.repair],
    ['biz', '명도비', '이사비(합의)', m.evict],
    ['biz', '기타', '광고비', m.ad],
  ];
  return lines.filter(([, , , amt]) => amt > 0).map(([book, category, detail, amount, qty, unit]): LedgerRow => ({
    key: `plan-${a.id}-${detail}`, src: 'plan', id: '', book, auctionId: a.id, auctionLabel: '',
    date: a.wonDate || '', category, detail, amount, vendor: '', phone: '', status: '', qty: qty || 0, unit: unit || 0, note: '',
  }));
};
// A안 수리비 · 명도비는 한 덩어리 견적 — 그 구분의 실제 기록을 하나라도 적으면 숨는다. 나머지는 같은 명세끼리 바뀐다
const LUMP = ['수리·인테리어', '명도비'];
const sameLine = (x: LedgerRow, p: LedgerRow) => x.book === p.book && x.auctionId === p.auctionId && x.category === p.category
  && (LUMP.includes(p.category) || x.detail === p.detail);
/** 실제 기록 + 아직 실제로 적지 않은 A안 줄 */
export const withPlan = (actual: LedgerRow[], auctions: PlanAuction[]): LedgerRow[] => [
  ...actual,
  ...auctions.flatMap(planRowsOf).filter((p) => !actual.some((r) => sameLine(r, p))),
];

export const sumOf = (rows: LedgerRow[], book: Book, auctionId: string) =>
  rows.filter((r) => r.book === book && r.auctionId === auctionId).reduce((s, r) => s + r.amount, 0);

/** 물건 하나의 두 갈래 비용 — 실제 기록 + 남은 A안 줄 */
export const costSplitOf = (a: PlanAuction, actual: LedgerRow[]) => {
  const rows = withPlan(actual.filter((r) => r.auctionId === a.id), [a]);
  const part = (book: Book, src: 'plan' | 'real') => rows
    .filter((r) => r.book === book && (src === 'plan' ? r.src === 'plan' : r.src !== 'plan'))
    .reduce((s, r) => s + r.amount, 0);
  const needActual = part('need', 'real'); const needPlan = part('need', 'plan');
  const bizActual = part('biz', 'real'); const bizPlan = part('biz', 'plan');
  return { needActual, needPlan, bizActual, bizPlan, need: needActual + needPlan, biz: bizActual + bizPlan };
};
