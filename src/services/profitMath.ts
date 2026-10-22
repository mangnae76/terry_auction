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
