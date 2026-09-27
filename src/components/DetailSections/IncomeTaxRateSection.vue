<script setup lang="ts">
import type { AuctionDetail } from '../../types/auction';

defineProps<{ readonly: boolean }>();
defineModel<AuctionDetail>('form', { required: true });

const rows = [
  { base: '1,400만원 이하', rate: '6%', deduction: '-' },
  { base: '5,000만원 이하', rate: '15%', deduction: '126만원' },
  { base: '8,800만원 이하', rate: '24%', deduction: '576만원' },
  { base: '1억5천만원 이하', rate: '35%', deduction: '1,544만원' },
  { base: '3억원 이하', rate: '38%', deduction: '1,994만원' },
  { base: '5억원 이하', rate: '40%', deduction: '2,594만원' },
  { base: '10억원 이하', rate: '42%', deduction: '3,594만원' },
  { base: '10억원 초과', rate: '45%', deduction: '6,594만원' },
];
</script>

<template>
  <section class="panel">
    <h2>개인소득세율(종합소득세)</h2>
    <table class="tax-table">
      <thead>
        <tr>
          <th>과세표준</th>
          <th>세율</th>
          <th>누진공제</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.base">
          <td>{{ row.base }}</td>
          <td>{{ row.rate }}</td>
          <td class="deduction">{{ row.deduction }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.tax-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border: 1px solid color-mix(in srgb, var(--line) 88%, #5a6f95);
  border-radius: 12px;
  overflow: hidden;
  background: color-mix(in srgb, var(--bg-card) 94%, var(--bg-soft));
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 14%, transparent);
}

.tax-table th,
.tax-table td {
  border: 1px solid color-mix(in srgb, var(--line) 86%, #61729b);
  padding: 10px 12px;
  text-align: center;
}

.tax-table th {
  background: color-mix(in srgb, var(--bg-soft) 72%, #dbe5ff);
  color: color-mix(in srgb, var(--text-primary) 80%, #2e3c5a);
  font-size: 13px;
  font-weight: 700;
}

.tax-table td {
  font-weight: 600;
  font-size: 10px;
  letter-spacing: -0.01em;
}

.tax-table .deduction {
  background: color-mix(in srgb, var(--bg-soft) 54%, var(--bg-card));
}
</style>
