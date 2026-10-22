// 입찰가산정의 셈이 맞는지 — 여기가 틀리면 입찰가가 틀어진다.
// 기준: 종합소득세 누진세율표 (6·15·24·35·38·40·42·45%) 와 그 누진공제.
import { describe, it, expect } from 'vitest';
import {
  taxRateOf, taxDeductOf, incomeTaxOf, localTaxOf, afterTaxProfitOf, taxChainOf,
} from './profitMath';

describe('세율 구간', () => {
  it('구간마다 정해진 세율이 선다', () => {
    expect(taxRateOf(14_000_000)).toBe(6);
    expect(taxRateOf(50_000_000)).toBe(15);
    expect(taxRateOf(88_000_000)).toBe(24);
    expect(taxRateOf(150_000_000)).toBe(35);
    expect(taxRateOf(300_000_000)).toBe(38);
    expect(taxRateOf(500_000_000)).toBe(40);
    expect(taxRateOf(1_000_000_000)).toBe(42);
    expect(taxRateOf(1_000_000_001)).toBe(45);
  });

  it('경계를 1원 넘으면 다음 구간이다', () => {
    expect(taxRateOf(14_000_001)).toBe(15);
    expect(taxRateOf(50_000_001)).toBe(24);
    expect(taxRateOf(88_000_001)).toBe(35);
  });

  it('밑지거나 0이면 세율이 없다', () => {
    expect(taxRateOf(0)).toBe(0);
    expect(taxRateOf(-1_000_000)).toBe(0);
  });
});

describe('누진공제', () => {
  it('구간마다 정해진 공제가 선다', () => {
    expect(taxDeductOf(14_000_000)).toBe(0);
    expect(taxDeductOf(50_000_000)).toBe(1_260_000);
    expect(taxDeductOf(88_000_000)).toBe(5_760_000);
    expect(taxDeductOf(150_000_000)).toBe(15_440_000);
    expect(taxDeductOf(300_000_000)).toBe(19_940_000);
    expect(taxDeductOf(500_000_000)).toBe(25_940_000);
    expect(taxDeductOf(1_000_000_000)).toBe(35_940_000);
    expect(taxDeductOf(1_000_000_001)).toBe(65_940_000);
  });

  it('구간이 바뀌는 자리에서 세액이 거꾸로 줄지 않는다', () => {
    // 누진세의 기본 성질 — 1원을 더 벌었다고 세금이 더 적어지면 안 된다
    const edges = [14_000_000, 50_000_000, 88_000_000, 150_000_000, 300_000_000, 500_000_000, 1_000_000_000];
    for (const edge of edges) {
      const before = taxChainOf(edge).incomeTax;
      const after = taxChainOf(edge + 1).incomeTax;
      expect(after).toBeGreaterThanOrEqual(before);
    }
  });
});

describe('사업소득세', () => {
  it('과세표준 × 세율 − 누진공제', () => {
    // 1억: 1억 × 35% − 1,544만 = 1,956만
    expect(incomeTaxOf(100_000_000, 35, 15_440_000)).toBe(19_560_000);
    // 3천만: 3천만 × 15% − 126만 = 324만
    expect(incomeTaxOf(30_000_000, 15, 1_260_000)).toBe(3_240_000);
  });

  it('밑지는 해는 0이다', () => {
    expect(incomeTaxOf(0, 35, 15_440_000)).toBe(0);
    expect(incomeTaxOf(-50_000_000, 35, 15_440_000)).toBe(0);
  });

  it('공제가 세액보다 커도 음수가 되지 않는다', () => {
    expect(incomeTaxOf(1_000_000, 6, 15_440_000)).toBe(0);
  });
});

describe('지방소득세', () => {
  it('사업소득세의 10%가 기본이다', () => {
    expect(localTaxOf(19_560_000)).toBe(1_956_000);
  });

  it('비율을 바꾸면 그 비율로 선다', () => {
    expect(localTaxOf(10_000_000, 7)).toBe(700_000);
  });
});

describe('세후 순이익', () => {
  it('과세표준에서 두 세금을 뺀다', () => {
    expect(afterTaxProfitOf(100_000_000, 19_560_000, 1_956_000)).toBe(78_484_000);
  });

  it('한 번에 셈한 길과 따로 셈한 길이 같다', () => {
    const chain = taxChainOf(100_000_000);
    expect(chain.ratePct).toBe(35);
    expect(chain.deduct).toBe(15_440_000);
    expect(chain.incomeTax).toBe(19_560_000);
    expect(chain.localTax).toBe(1_956_000);
    expect(chain.afterTaxProfit).toBe(78_484_000);
  });

  it('손으로 적은 세율·공제가 있으면 그 값으로 센다', () => {
    const chain = taxChainOf(100_000_000, { ratePct: 24, deduct: 5_760_000, localRatePct: 10 });
    expect(chain.incomeTax).toBe(18_240_000);
    expect(chain.localTax).toBe(1_824_000);
  });

  it('남는 돈이 없으면 세금도 없고 순이익도 그대로다', () => {
    const chain = taxChainOf(-10_000_000);
    expect(chain.incomeTax).toBe(0);
    expect(chain.localTax).toBe(0);
    expect(chain.afterTaxProfit).toBe(-10_000_000);
  });

  it('많이 벌수록 세후 순이익도 늘어난다 (역전되지 않는다)', () => {
    let prev = Number.NEGATIVE_INFINITY;
    for (let gain = 0; gain <= 1_200_000_000; gain += 7_000_000) {
      const now = taxChainOf(gain).afterTaxProfit;
      expect(now).toBeGreaterThanOrEqual(prev);
      prev = now;
    }
  });
});
