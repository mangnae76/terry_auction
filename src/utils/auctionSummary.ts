// 한 물건의 돈을 세는 규칙 — 자금관리와 세금신고가 같은 셈을 쓰도록 여기 한곳에 둔다.
// (전에는 화면마다 베껴 적어 두어, 한쪽만 고치면 숫자가 갈라졌다)
import type { AuctionDetail } from '../types/auction';

/** 입찰가산정에 적어 둔 비용 합계 — 대출은 빌린 돈이라 뺀다 */
export const costsOf = (a: AuctionDetail): number => {
  const c = a.bidCost;
  if (!c) return 0;
  return (c.acquisitionTaxAmount ?? 0)
    + (c.legalCostAmount ?? 0)
    + (c.interestAmount ?? 0)
    + (c.midRepaymentAmount ?? 0)
    + (c.brokerageAmount ?? 0)
    + (c.arrearsFee ?? 0)
    + (c.repairCost ?? 0)
    + (c.evictionCost ?? 0)
    + (c.advertisingCost ?? 0);
};

/** 낙찰가 — 입찰가산정에 적어 둔 내 입찰가 */
export const bidPriceOf = (a: AuctionDetail): number => a.metrics?.myBidValue ?? 0;

/** 들어간 돈 = 낙찰가 + 비용 */
export const buyCostOf = (a: AuctionDetail): number => bidPriceOf(a) + costsOf(a);

/** 수익 = 매도가(예상) − 낙찰가 − 비용 */
export const incomeOf = (a: AuctionDetail): number =>
  (a.expectedSaleValue ?? 0) - bidPriceOf(a) - costsOf(a);

/** 사건번호를 짧게 — '2025타경00001' → '2025-00001' */
export const shortCase = (a: Pick<AuctionDetail, 'caseNumber'>): string => {
  const raw = (a.caseNumber ?? '').trim();
  const m = raw.match(/(\d{4})\s*타경\s*(\d+)/);
  return m ? `${m[1]}-${m[2]}` : raw;
};

/** 관할법원 — 정보요약에 적어 둔 값이 먼저, 없으면 원본에서 가져온다.
 *  (정보요약에서 고친 법원·경매계·전화를 다른 화면도 같이 본다) */
export const courtInfoOf = (a: AuctionDetail): { name: string; dept: string; phone: string } => {
  const sum = a.basicSummary ?? {};
  const name = (sum['sum.court'] || shortCourt(a.courtName) || '').trim();
  const dept = (sum['sum.courtDept'] || a.courtDept || '').trim();
  const phone = (sum['sum.courtPhone'] || a.courtPhone || '').trim();
  return { name, dept, phone };
};

/** '인천지방법원 부천지원' → '부천법원' */
export const shortCourt = (raw?: string): string => {
  const name = (raw ?? '').trim();
  if (!name) return '';
  const branch = name.match(/([가-힣]+)\s*지원\s*$/);
  if (branch) return `${branch[1]}법원`;
  const m = name.match(/^(.*?)(?:지방|가정|행정|회생)?법원/);
  return m?.[1] ? `${m[1]}법원` : name;
};
