<script setup lang="ts">
import { computed } from 'vue';
import FormattedNumberInput from '../FormattedNumberInput.vue';
import type { AuctionDetail } from '../../types/auction';
import { formatNumber } from '../../utils/numberFormat';

defineProps<{ readonly: boolean }>();
const form = defineModel<AuctionDetail>('form', { required: true });

const appraisal = computed(() => Number(form.value.metrics.appraisalValue || 0));
const bidPrice = computed(() => Math.round(appraisal.value * (form.value.bidCost.bidRate / 100)));
const loanAmount = computed(() => Math.round(bidPrice.value * (form.value.bidCost.loanRate / 100)));

const acquisitionTax = computed(() => Math.round(bidPrice.value * (form.value.bidCost.acquisitionTaxRate / 100)));
const legalCost = computed(() => Math.round(bidPrice.value * (form.value.bidCost.legalCostRate / 100)));
const midRepayment = computed(() => Math.round(loanAmount.value * (form.value.bidCost.midRepaymentRate / 100)));
const interest3m = computed(() => Math.round(loanAmount.value * (form.value.bidCost.interestRate3m / 100) * 0.25));
const brokerage = computed(() => Math.round(form.value.bidCost.salePrice * (form.value.bidCost.brokerageRate / 100)));

const calculateProgressiveIncomeTax = (taxBase: number) => {
  if (taxBase <= 14_000_000) {
    return Math.round(taxBase * 0.06);
  }
  if (taxBase <= 50_000_000) {
    return Math.round(taxBase * 0.15 - 1_260_000);
  }
  if (taxBase <= 88_000_000) {
    return Math.round(taxBase * 0.24 - 5_760_000);
  }
  if (taxBase <= 150_000_000) {
    return Math.round(taxBase * 0.35 - 15_440_000);
  }
  if (taxBase <= 300_000_000) {
    return Math.round(taxBase * 0.38 - 19_940_000);
  }
  if (taxBase <= 500_000_000) {
    return Math.round(taxBase * 0.4 - 25_940_000);
  }
  if (taxBase <= 1_000_000_000) {
    return Math.round(taxBase * 0.42 - 35_940_000);
  }

  return Math.round(taxBase * 0.45 - 65_940_000);
};

const totalCost = computed(
  () =>
    acquisitionTax.value +
    legalCost.value +
    midRepayment.value +
    interest3m.value +
    brokerage.value +
    Number(form.value.bidCost.arrearsFee || 0) +
    Number(form.value.bidCost.repairCost || 0) +
    Number(form.value.bidCost.evictionCost || 0),
);

const capitalGain = computed(() => form.value.bidCost.salePrice - bidPrice.value - totalCost.value);
const incomeTax = computed(() => calculateProgressiveIncomeTax(capitalGain.value));
const localTax = computed(() => Math.round(incomeTax.value * (form.value.bidCost.localTaxRate / 100)));
const totalInvestment = computed(() => bidPrice.value + totalCost.value);
const realInvestment = computed(() => bidPrice.value - loanAmount.value + totalCost.value);
const afterTaxProfit = computed(() => capitalGain.value - incomeTax.value - localTax.value);
const roi = computed(() => (realInvestment.value === 0 ? 0 : (afterTaxProfit.value / realInvestment.value) * 100));

const fmtMoney = (value: number) => formatNumber(value);
const fmtRate = (value: number) => `${formatNumber(value, { minFractionDigits: 2, maxFractionDigits: 2 })}%`;
</script>

<template>
  <section class="panel">
    <h2>입찰가/비용/수익 분석</h2>
    <table class="bid-table">
      <thead>
        <tr>
          <th>구분</th>
          <th>상세</th>
          <th>비중(%)</th>
          <th>금액</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th rowspan="3">입찰가</th>
          <td>감정가</td>
          <td>-</td>
          <td class="num">{{ fmtMoney(appraisal) }}</td>
        </tr>
        <tr>
          <td>입찰가</td>
          <td>
            <FormattedNumberInput v-model="form.bidCost.bidRate" :readonly="readonly" />
          </td>
          <td class="num">{{ fmtMoney(bidPrice) }}</td>
        </tr>
        <tr>
          <td>대출(사업자)</td>
          <td>
            <FormattedNumberInput v-model="form.bidCost.loanRate" :readonly="readonly" />
          </td>
          <td class="num">{{ fmtMoney(loanAmount) }}</td>
        </tr>

        <tr>
          <th rowspan="9">비용</th>
          <td>취득세</td>
          <td><FormattedNumberInput v-model="form.bidCost.acquisitionTaxRate" :readonly="readonly" /></td>
          <td class="num">{{ fmtMoney(acquisitionTax) }}</td>
        </tr>
        <tr>
          <td>법무비/채권</td>
          <td><FormattedNumberInput v-model="form.bidCost.legalCostRate" :readonly="readonly" /></td>
          <td class="num">{{ fmtMoney(legalCost) }}</td>
        </tr>
        <tr>
          <td>중도상환</td>
          <td><FormattedNumberInput v-model="form.bidCost.midRepaymentRate" :readonly="readonly" /></td>
          <td class="num">{{ fmtMoney(midRepayment) }}</td>
        </tr>
        <tr>
          <td>이자(3M)</td>
          <td><FormattedNumberInput v-model="form.bidCost.interestRate3m" :readonly="readonly" /></td>
          <td class="num">{{ fmtMoney(interest3m) }}</td>
        </tr>
        <tr>
          <td>매도중개료</td>
          <td><FormattedNumberInput v-model="form.bidCost.brokerageRate" :readonly="readonly" /></td>
          <td class="num">{{ fmtMoney(brokerage) }}</td>
        </tr>
        <tr>
          <td>미납관리비</td>
          <td>-</td>
          <td><FormattedNumberInput v-model="form.bidCost.arrearsFee" :readonly="readonly" /></td>
        </tr>
        <tr>
          <td>수리비</td>
          <td>-</td>
          <td><FormattedNumberInput v-model="form.bidCost.repairCost" :readonly="readonly" /></td>
        </tr>
        <tr>
          <td>명도비</td>
          <td>-</td>
          <td><FormattedNumberInput v-model="form.bidCost.evictionCost" :readonly="readonly" /></td>
        </tr>
        <tr class="sum-row">
          <td colspan="2">비용</td>
          <td class="num">{{ fmtMoney(totalCost) }}</td>
        </tr>

        <tr class="sale-row">
          <th></th>
          <td colspan="2">매도가</td>
          <td><FormattedNumberInput v-model="form.bidCost.salePrice" :readonly="readonly" /></td>
        </tr>

        <tr>
          <th rowspan="7">수익</th>
          <td>종합소득세</td>
          <td><FormattedNumberInput v-model="form.bidCost.incomeTaxRate" :readonly="readonly" /></td>
          <td class="num">{{ fmtMoney(incomeTax) }}</td>
        </tr>
        <tr>
          <td>지방세</td>
          <td><FormattedNumberInput v-model="form.bidCost.localTaxRate" :readonly="readonly" /></td>
          <td class="num">{{ fmtMoney(localTax) }}</td>
        </tr>
        <tr>
          <td>총투자금</td>
          <td>(입찰가+비용)</td>
          <td class="num">{{ fmtMoney(totalInvestment) }}</td>
        </tr>
        <tr>
          <td>실투자금</td>
          <td>(입찰가-대출+비용)</td>
          <td class="num">{{ fmtMoney(realInvestment) }}</td>
        </tr>
        <tr>
          <td>양도차익</td>
          <td>(매도가-입찰가-비용)</td>
          <td class="num">{{ fmtMoney(capitalGain) }}</td>
        </tr>
        <tr class="sum-row">
          <td>세후이익</td>
          <td>(양도차익-세금)</td>
          <td class="num">{{ fmtMoney(afterTaxProfit) }}</td>
        </tr>
        <tr class="sum-row">
          <td>순투자수익율</td>
          <td>(세후이익/실투자금)</td>
          <td class="num">{{ fmtRate(roi) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.bid-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border: 1px solid color-mix(in srgb, var(--line) 88%, #5a6f95);
  border-radius: 12px;
  overflow: hidden;
  background: color-mix(in srgb, var(--bg-card) 94%, var(--bg-soft));
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 14%, transparent);
}

.bid-table th,
.bid-table td {
  border: 1px solid color-mix(in srgb, var(--line) 86%, #61729b);
  padding: 5px 6px;
  text-align: center;
}

.bid-table thead th {
  background: color-mix(in srgb, var(--bg-soft) 72%, #dbe5ff);
  color: color-mix(in srgb, var(--text-primary) 80%, #2e3c5a);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.3;
}

.bid-table input {
  width: 100%;
  height: 26px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--line) 80%, #7f90b0);
  background: color-mix(in srgb, var(--bg-primary) 92%, #ffffff);
  color: var(--text-primary);
  text-align: right;
  padding: 0 6px;
  font-size: 9px;
  letter-spacing: -0.01em;
}

.bid-table input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--accent) 62%, var(--line));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent);
}

.bid-table .num {
  text-align: right;
  font-weight: 700;
  font-size: 10px;
  letter-spacing: -0.01em;
}

.bid-table .sum-row td {
  background: color-mix(in srgb, var(--bg-soft) 54%, var(--bg-card));
  font-weight: 700;
}

.bid-table .sale-row td {
  background: color-mix(in srgb, var(--bg-soft) 54%, var(--bg-card));
  font-weight: 700;
}

@media (max-width: 960px) {
  .bid-table th,
  .bid-table td {
    padding: 4px 5px;
  }

  .bid-table input {
    height: 24px;
    font-size: 8.5px;
  }

  .bid-table .num {
    font-size: 9px;
  }
}
</style>
