<script setup lang="ts">
import { inject } from 'vue';
import FormattedNumberInput from '../FormattedNumberInput.vue';
import type { AuctionDetail } from '../../types/auction';

defineProps<{ readonly: boolean }>();
const form = defineModel<AuctionDetail>('form', { required: true });
const isPdfImportedField = inject<(path: string) => boolean>('isPdfImportedField', () => false);
</script>

<template>
  <section class="panel">
    <h2>임장 체크리스트</h2>
    <div class="checklist-row">
      <label v-for="item in form.fieldSurvey.checklist" :key="item.id" class="check-item">
        <input v-model="item.checked" :disabled="readonly" type="checkbox" />
        <span>{{ item.label }}</span>
      </label>
    </div>
    <div class="form-grid">
      <label class="wide">
        특이사항
        <div class="pdf-field">
          <span v-if="isPdfImportedField('fieldSurvey.occupantNote')" class="pdf-badge">P</span>
          <textarea v-model="form.fieldSurvey.occupantNote" :readonly="readonly" rows="3" />
        </div>
      </label>
      <label>
        점유관계
        <input v-model="form.fieldSurvey.rentalIssue" :readonly="readonly" />
      </label>
      <label>
        대항력
        <input v-model="form.fieldSurvey.keyIssue" :readonly="readonly" />
      </label>
      <label>
        미납 관리비
        <FormattedNumberInput v-model="form.fieldSurvey.arrearsMaintenance" :readonly="readonly" />
      </label>
      <label>
        전기/가스/수도
        <FormattedNumberInput v-model="form.fieldSurvey.arrearsUtilities" :readonly="readonly" />
      </label>
      <label>
        총 미납액
        <div class="pdf-field">
          <span v-if="isPdfImportedField('fieldSurvey.totalArrears')" class="pdf-badge">P</span>
          <FormattedNumberInput v-model="form.fieldSurvey.totalArrears" :readonly="readonly" />
        </div>
      </label>
      <label class="wide">
        점유/명도 메모
        <div class="pdf-field">
          <span v-if="isPdfImportedField('fieldSurvey.surveyMemo')" class="pdf-badge">P</span>
          <textarea v-model="form.fieldSurvey.surveyMemo" :readonly="readonly" rows="3" />
        </div>
      </label>
    </div>
  </section>
</template>

<style scoped>
.checklist-row {
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.check-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
}

.form-grid :deep(input.align-right) {
  font-size: 9px;
  letter-spacing: -0.01em;
}
</style>
