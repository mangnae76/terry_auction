<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import type { AuctionDetail } from '../../types/auction';
import { formatNumber } from '../../utils/numberFormat';

defineProps<{ readonly: boolean }>();
const form = defineModel<AuctionDetail>('form', { required: true });

const regionType = ref<'지방' | '서울'>('지방');
const propertyTypes = ['빌라', '아파트', '주택', '오피스텔'] as const;
const isPdfImportedField = inject<(path: string) => boolean>('isPdfImportedField', () => false);

const appraisal = computed(() => Number(form.value.metrics.appraisalValue || 0));
const secondRound = computed(() => Math.round(appraisal.value * 0.7));
const thirdRound = computed(() => Math.round(appraisal.value * 0.49));
const deposit = computed(() => Math.round(appraisal.value * 0.1));

const formatMoney = (value: number) => formatNumber(value);
</script>

<template>
  <section class="panel">
    <h2>기일내역</h2>
    <table class="schedule-table">
      <tbody>
        <tr>
          <th>종류</th>
          <td>
            <div class="pdf-field">
              <select v-model="regionType" :disabled="readonly">
                <option value="지방">지방</option>
                <option value="서울">서울</option>
              </select>
            </div>
          </td>
          <td>
            <div class="pdf-field">
              <span v-if="isPdfImportedField('propertyType')" class="pdf-badge">P</span>
              <select v-model="form.propertyType" :disabled="readonly">
                <option v-for="type in propertyTypes" :key="type" :value="type">{{ type }}</option>
              </select>
            </div>
          </td>
          <th>비고</th>
        </tr>
        <tr>
          <th>신건</th>
          <td class="percent">100%</td>
          <td class="amount">
            <span v-if="isPdfImportedField('metrics.appraisalValue')" class="pdf-badge">P</span>
            {{ formatMoney(appraisal) }}
          </td>
          <td class="memo">자동출력</td>
        </tr>
        <tr>
          <th>2차</th>
          <td class="percent">
            <span v-if="isPdfImportedField('bidCost.bidRate')" class="pdf-badge">P</span>
            70%
          </td>
          <td class="amount">
            <span v-if="isPdfImportedField('metrics.minimumBidValue')" class="pdf-badge">P</span>
            {{ formatMoney(secondRound) }}
          </td>
          <td class="memo">자동출력</td>
        </tr>
        <tr>
          <th>3차</th>
          <td class="percent">49%</td>
          <td class="amount">{{ formatMoney(thirdRound) }}</td>
          <td class="memo">자동출력</td>
        </tr>
        <tr>
          <th>보증금</th>
          <td class="percent blue">10%</td>
          <td class="amount blue">{{ formatMoney(deposit) }}</td>
          <td class="memo">자동출력</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.schedule-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border: 1px solid color-mix(in srgb, var(--line) 88%, #5a6f95);
  border-radius: 12px;
  overflow: hidden;
  background: color-mix(in srgb, var(--bg-card) 94%, var(--bg-soft));
}

.schedule-table th,
.schedule-table td {
  border: 1px solid color-mix(in srgb, var(--line) 86%, #61729b);
  padding: 9px 10px;
  text-align: center;
  font-size: 10px;
}

.schedule-table th {
  background: color-mix(in srgb, var(--bg-soft) 72%, #dbe5ff);
  color: color-mix(in srgb, var(--text-primary) 80%, #2e3c5a);
  font-size: 10px;
  font-weight: 700;
}

.schedule-table select {
  width: 100%;
  height: 30px;
  border-radius: 7px;
  border: 1px solid color-mix(in srgb, var(--line) 80%, #7f90b0);
  background: color-mix(in srgb, var(--bg-primary) 92%, #ffffff);
  color: var(--text-primary);
  text-align: center;
  font-family: inherit;
  font-size: 11px;
}

.schedule-table .percent,
.schedule-table .amount {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.schedule-table .memo {
  color: color-mix(in srgb, var(--text-secondary) 82%, #8e99aa);
  font-weight: 700;
  font-size: 9px;
}

.schedule-table .blue {
  color: #2149d6;
}
</style>
