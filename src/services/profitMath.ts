// 입찰가산정의 셈 — 화면과 떼어 놓는다.
//
// 왜 따로 두나 — 여기서 틀리면 입찰가가 틀어진다. 화면 안에 섞여 있으면
// 눈으로 훑는 것 말고는 맞는지 볼 방법이 없다. 순수한 셈만 모아 두면
// 표(profitMath.test.ts)로 매번 확인할 수 있다.

/** 사업소득 금액이 걸리는 누진세율 구간 (%) */
export const taxRateOf = (taxable: number): number => {
  if (taxable <= 0) return 0;
  if (taxable <= 14_000_000) return 6;
  if (taxable <= 50_000_000) return 15;
  if (taxable <= 88_000_000) return 24;
  if (taxable <= 150_000_000) return 35;
  if (taxable <= 300_000_000) return 38;
  if (taxable <= 500_000_000) return 40;
  if (taxable <= 1_000_000_000) return 42;
  return 45;
};

/** 그 구간에서 빼 주는 누진공제 (원) */
export const taxDeductOf = (taxable: number): number => {
  if (taxable <= 14_000_000) return 0;
  if (taxable <= 50_000_000) return 1_260_000;
  if (taxable <= 88_000_000) return 5_760_000;
  if (taxable <= 150_000_000) return 15_440_000;
  if (taxable <= 300_000_000) return 19_940_000;
  if (taxable <= 500_000_000) return 25_940_000;
  if (taxable <= 1_000_000_000) return 35_940_000;
  return 65_940_000;
};

/** 사업소득세 — 과세표준 × 세율 − 누진공제. 밑지는 해는 0 이다 */
export const incomeTaxOf = (taxable: number, ratePct: number, deduct: number): number => {
  if (taxable <= 0) return 0;
  return Math.max(0, (taxable * ratePct) / 100 - deduct);
};

/** 지방소득세 — 사업소득세의 10% (기본).
 *  먼저 나누면(7/100) 소수 오차가 붙어 700,000 이 700,000.0000000001 로 나온다.
 *  곱하고 나서 나눈다. */
export const localTaxOf = (incomeTax: number, ratePct = 10): number => (incomeTax * ratePct) / 100;

/** 세후 순이익 — 과세표준에서 두 세금을 뺀다 */
export const afterTaxProfitOf = (taxable: number, incomeTax: number, localTax: number): number =>
  taxable - incomeTax - localTax;

/** 세율·공제를 따로 정하지 않았을 때의 한 번에 셈 — 화면이 쓰는 기본 길 */
export const taxChainOf = (
  taxable: number,
  opt: { ratePct?: number; deduct?: number; localRatePct?: number } = {},
) => {
  const ratePct = opt.ratePct || taxRateOf(taxable);
  const deduct = opt.deduct || taxDeductOf(taxable);
  const incomeTax = incomeTaxOf(taxable, ratePct, deduct);
  const localTax = localTaxOf(incomeTax, opt.localRatePct ?? 10);
  return {
    ratePct,
    deduct,
    incomeTax,
    localTax,
    afterTaxProfit: afterTaxProfitOf(taxable, incomeTax, localTax),
  };
};

/** 수익 요약에 쓰는 비용 칸 — 물건의 bidCost(또는 B~D안의 bidCost)와 같은 이름 */
export interface PlanCostLike {
  acquisitionTaxAmount?: number; legalCostAmount?: number; interestAmount?: number; midRepaymentAmount?: number;
  brokerageAmount?: number; arrearsFee?: number; repairCost?: number; evictionCost?: number; advertisingCost?: number;
  loanAmount?: number; incomeTaxRateManual?: number; incomeTaxDeduct?: number; localTaxRate?: number;
}

/** 수익 요약 — 물건 상세 수익분석(sc* 셈)과 같은 식. 웹 카드 · 목록이 이걸 써서 두 화면 숫자가 같게 한다 (BUG-0002)
 *  필요경비 = 취득세 + 법무 + 이자 + 중도상환 + 중개 + 미납관리비 + 수리 + 명도 + 광고 (대출 제외)
 *  실투자금 = 입찰가 − 대출 + 필요경비, 수익률 = 세후 순이익 ÷ 실투자금 */
export const planSummaryOf = (bid: number, sale: number, c: PlanCostLike = {}) => {
  const cost = (c.acquisitionTaxAmount ?? 0) + (c.legalCostAmount ?? 0) + (c.interestAmount ?? 0) + (c.midRepaymentAmount ?? 0)
    + (c.brokerageAmount ?? 0) + (c.arrearsFee ?? 0) + (c.repairCost ?? 0) + (c.evictionCost ?? 0) + (c.advertisingCost ?? 0);
  const gain = sale - bid - cost;
  const ratePct = c.incomeTaxRateManual || taxRateOf(gain);
  const deduct = c.incomeTaxDeduct || taxDeductOf(gain);
  const incomeTax = incomeTaxOf(gain, ratePct, deduct);
  const localTax = localTaxOf(incomeTax, c.localTaxRate ?? 10);
  const after = afterTaxProfitOf(gain, incomeTax, localTax);
  const loan = c.loanAmount ?? 0;
  const net = bid - loan + cost;
  return { bid, sale, loan, cost, gain, incomeTax, localTax, after, net, rate: net > 0 ? (after / net) * 100 : 0 };
};
