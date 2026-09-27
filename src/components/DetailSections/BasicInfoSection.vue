<script setup lang="ts">
import { inject, watch } from 'vue';
import FormattedNumberInput from '../FormattedNumberInput.vue';
import type { AuctionDetail } from '../../types/auction';

defineProps<{ readonly: boolean }>();
const form = defineModel<AuctionDetail>('form', { required: true });

const auctionKinds = ['임의', '강제'] as const;
const rounds = ['신건', '2차', '3차'] as const;
const ownerDebtorStatuses = ['점유자O', '알수없음'] as const;
const yesNo = ['O', 'X'] as const;
const oppositionStatuses = ['대항력O', '대항력X'] as const;
const isPdfImportedField = inject<(path: string) => boolean>('isPdfImportedField', () => false);

watch(
  () => form.value.officialPriceValue,
  (value) => {
    if (value > 0) {
      form.value.officialPriceBand = value >= 100000000 ? '1억 이상' : '1억 미만';
    }
  },
  { immediate: true },
);
</script>

<template>
  <section class="panel">
    <h2>물건 기본정보</h2>
    <table class="basic-info-table">
      <colgroup>
        <col class="label-col" />
        <col class="value-col" />
        <col class="label-col" />
        <col class="value-col" />
      </colgroup>
      <tbody>
        <tr>
          <th>사건번호</th>
          <td>
            <div class="pdf-field">
              <span v-if="isPdfImportedField('caseNumber')" class="pdf-badge">P</span>
              <input v-model="form.caseNumber" :readonly="readonly" />
            </div>
          </td>
          <th>입찰기일</th>
          <td>
            <div class="pdf-field">
              <span v-if="isPdfImportedField('eventDate')" class="pdf-badge">P</span>
              <input v-model="form.eventDate" :readonly="readonly" type="date" />
            </div>
          </td>
        </tr>
        <tr>
          <th>주소</th>
          <td>
            <div class="pdf-field">
              <span v-if="isPdfImportedField('address')" class="pdf-badge">P</span>
              <input v-model="form.address" :readonly="readonly" />
            </div>
          </td>
          <th>사용승인</th>
          <td>
            <div class="pdf-field">
              <span v-if="isPdfImportedField('approvalDate')" class="pdf-badge">P</span>
              <input v-model="form.approvalDate" :readonly="readonly" />
            </div>
          </td>
        </tr>
        <tr>
          <th>감정가</th>
          <td>
            <div class="inline-fields">
              <div class="pdf-field">
                <span v-if="isPdfImportedField('auctionKind')" class="pdf-badge">P</span>
                <select v-model="form.auctionKind" :disabled="readonly">
                  <option v-for="kind in auctionKinds" :key="kind" :value="kind">{{ kind }}</option>
                </select>
              </div>
              <div class="pdf-field">
                <span v-if="isPdfImportedField('metrics.appraisalValue')" class="pdf-badge">P</span>
                <FormattedNumberInput v-model="form.metrics.appraisalValue" :readonly="readonly" align="center" />
              </div>
            </div>
          </td>
          <th>신건</th>
          <td>
            <div class="pdf-field">
              <span v-if="isPdfImportedField('auctionRound')" class="pdf-badge">P</span>
              <select v-model="form.auctionRound" :disabled="readonly">
                <option v-for="round in rounds" :key="round" :value="round">{{ round }}</option>
              </select>
            </div>
          </td>
        </tr>
        <tr>
          <th>건물(㎡/평)</th>
          <td>
            <div class="inline-fields">
              <div class="pdf-field">
                <span v-if="isPdfImportedField('buildingAreaM2')" class="pdf-badge">P</span>
                <FormattedNumberInput v-model="form.buildingAreaM2" :readonly="readonly" align="center" placeholder="㎡" />
              </div>
              <div class="pdf-field">
                <span v-if="isPdfImportedField('buildingAreaPyeong')" class="pdf-badge">P</span>
                <FormattedNumberInput v-model="form.buildingAreaPyeong" :readonly="readonly" align="center" placeholder="평" />
              </div>
            </div>
          </td>
          <th>대지(㎡/평)</th>
          <td>
            <div class="inline-fields">
              <div class="pdf-field">
                <span v-if="isPdfImportedField('landAreaM2')" class="pdf-badge">P</span>
                <FormattedNumberInput v-model="form.landAreaM2" :readonly="readonly" align="center" placeholder="㎡" />
              </div>
              <div class="pdf-field">
                <span v-if="isPdfImportedField('landAreaPyeong')" class="pdf-badge">P</span>
                <FormattedNumberInput v-model="form.landAreaPyeong" :readonly="readonly" align="center" placeholder="평" />
              </div>
            </div>
          </td>
        </tr>
        <tr>
          <th>특이사항</th>
          <td>
            <div class="pdf-field">
              <span v-if="isPdfImportedField('floorInfo')" class="pdf-badge">P</span>
              <input v-model="form.floorInfo" :readonly="readonly" />
            </div>
          </td>
          <th>공시가</th>
          <td>
            <div class="inline-fields">
              <div class="pdf-field">
                <span v-if="isPdfImportedField('officialPriceBand')" class="pdf-badge">P</span>
                <input :readonly="true" :value="form.officialPriceBand" />
              </div>
              <div class="pdf-field">
                <span v-if="isPdfImportedField('officialPriceValue')" class="pdf-badge">P</span>
                <FormattedNumberInput v-model="form.officialPriceValue" :readonly="readonly" align="center" />
              </div>
            </div>
          </td>
        </tr>
        <tr>
          <th>주의사항</th>
          <td>
            <div class="pdf-field">
              <span v-if="isPdfImportedField('valuationWarning')" class="pdf-badge">P</span>
              <input v-model="form.valuationWarning" :readonly="readonly" />
            </div>
          </td>
          <th>인수내용</th>
          <td>
            <div class="pdf-field">
              <span v-if="isPdfImportedField('takeoverContent')" class="pdf-badge">P</span>
              <select v-model="form.takeoverContent" :disabled="readonly">
                <option v-for="value in yesNo" :key="value" :value="value">{{ value }}</option>
              </select>
            </div>
          </td>
        </tr>
        <tr>
          <th>현황조사서</th>
          <td>
            <div class="pdf-field">
              <span v-if="isPdfImportedField('surveyStatus')" class="pdf-badge">P</span>
              <input v-model="form.surveyStatus" :readonly="readonly" />
            </div>
          </td>
          <th>미납공과금</th>
          <td>
            <div class="pdf-field">
              <span v-if="isPdfImportedField('delinquentCharges')" class="pdf-badge">P</span>
              <input v-model="form.delinquentCharges" :readonly="readonly" />
            </div>
          </td>
        </tr>
        <tr>
          <th>소유자/채무자</th>
          <td>
            <div class="owner-fields">
              <div class="pdf-field">
                <span v-if="isPdfImportedField('ownerName')" class="pdf-badge">P</span>
                <input v-model="form.ownerName" :readonly="readonly" placeholder="소유자" />
              </div>
              <div class="pdf-field">
                <span v-if="isPdfImportedField('debtorName')" class="pdf-badge">P</span>
                <input v-model="form.debtorName" :readonly="readonly" placeholder="채무자" />
              </div>
              <select v-model="form.ownerDebtorStatus" :disabled="readonly">
                <option v-for="owner in ownerDebtorStatuses" :key="owner" :value="owner">{{ owner }}</option>
              </select>
            </div>
          </td>
          <th>우편물</th>
          <td>
            <input v-model="form.mailStatus" :readonly="readonly" />
          </td>
        </tr>
        <tr>
          <td colspan="4" class="no-pad occupancy-full">
            <div class="occupancy-scroll">
              <table class="occupancy-table">
                <thead>
                  <tr>
                    <th>점유정보</th>
                    <th>이름</th>
                    <th>일시</th>
                    <th>확정</th>
                    <th>대항력</th>
                    <th>보증금액</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, idx) in form.occupancyRows" :key="`occupancy-${idx}`">
                    <td class="label-cell">
                      <span class="label-pill" :class="`row-${idx}`">{{ row.label }}</span>
                    </td>
                    <td>
                      <div class="pdf-field">
                        <span v-if="idx === 0 && isPdfImportedField('occupancyRows.0.name')" class="pdf-badge">P</span>
                        <input v-model="row.name" :readonly="readonly" />
                      </div>
                    </td>
                    <td>
                      <div class="pdf-field">
                        <span v-if="idx === 0 && isPdfImportedField('occupancyRows.0.date')" class="pdf-badge">P</span>
                        <input v-model="row.date" :readonly="readonly" />
                      </div>
                    </td>
                    <td>
                      <div class="pdf-field">
                        <span v-if="idx === 0 && isPdfImportedField('occupancyRows.0.fixed')" class="pdf-badge">P</span>
                        <input v-model="row.fixed" :readonly="readonly" />
                      </div>
                    </td>
                    <td>
                      <div class="pdf-field">
                        <span v-if="idx === 0 && isPdfImportedField('occupancyRows.0.opposition')" class="pdf-badge">P</span>
                        <select v-model="row.opposition" :disabled="readonly">
                          <option v-for="value in oppositionStatuses" :key="value" :value="value">{{ value }}</option>
                        </select>
                      </div>
                    </td>
                    <td>
                      <div class="pdf-field">
                        <span v-if="idx === 0 && isPdfImportedField('occupancyRows.0.depositAmount')" class="pdf-badge">P</span>
                        <input v-model="row.depositAmount" :readonly="readonly" />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.basic-info-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border: 1px solid color-mix(in srgb, var(--line) 88%, #5a6f95);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-card) 94%, var(--bg-soft));
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 14%, transparent);
}

.basic-info-table .label-col {
  width: 90px;
}

.basic-info-table .value-col {
  width: calc((100% - 180px) / 2);
}

.basic-info-table th,
.basic-info-table td {
  border: 1px solid color-mix(in srgb, var(--line) 86%, #61729b);
  padding: 7px 8px;
  vertical-align: middle;
}

.basic-info-table th {
  background: color-mix(in srgb, var(--bg-soft) 72%, #dbe5ff);
  font-size: 11px;
  font-weight: 700;
  color: color-mix(in srgb, var(--text-primary) 80%, #2e3c5a);
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.basic-info-table td input,
.basic-info-table td select {
  width: 100%;
  height: 30px;
  border-radius: 7px;
  border: 1px solid color-mix(in srgb, var(--line) 80%, #7f90b0);
  background: color-mix(in srgb, var(--bg-primary) 92%, #ffffff);
  color: var(--text-primary);
  padding: 0 10px;
  font-family: inherit;
  font-size: 11px;
}

.basic-info-table td input[type='number'] {
  font-size: 9px;
  font-weight: 500;
  letter-spacing: -0.01em;
}

.basic-info-table td input:focus,
.basic-info-table td select:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--accent) 62%, var(--line));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent);
}

.inline-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.owner-fields {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
}

.no-pad {
  padding: 0;
}

.occupancy-full {
  background: color-mix(in srgb, var(--bg-soft) 26%, var(--bg-card));
}

.occupancy-scroll {
  width: 100%;
  overflow-x: auto;
}

.occupancy-table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
  table-layout: auto;
}

.occupancy-table th,
.occupancy-table td {
  border: 1px solid color-mix(in srgb, var(--line) 84%, #6e81aa);
  padding: 6px 7px;
  font-size: 9px;
}

.occupancy-table thead th {
  background: color-mix(in srgb, var(--bg-soft) 76%, #e3ebff);
  color: color-mix(in srgb, var(--text-primary) 74%, #2f4168);
  font-weight: 700;
}

.occupancy-table .label-cell {
  text-align: center;
}

.label-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  border-radius: 999px;
  padding: 2px 8px;
  font-weight: 700;
  font-size: 11px;
}

.label-pill.row-0 {
  background: color-mix(in srgb, #ff6b6b 22%, var(--bg-card));
  color: #d32f2f;
}

.label-pill.row-1 {
  background: color-mix(in srgb, #4da3ff 22%, var(--bg-card));
  color: #1864ab;
}

.label-pill.row-2 {
  background: color-mix(in srgb, #9aa4b2 20%, var(--bg-card));
  color: color-mix(in srgb, var(--text-secondary) 78%, #30363f);
}

::v-deep(:root[data-theme='dark']) .basic-info-table th {
  background: color-mix(in srgb, var(--bg-soft) 58%, #1a2742);
  color: color-mix(in srgb, var(--text-primary) 84%, #c8d7ff);
}

::v-deep(:root[data-theme='dark']) .basic-info-table td input,
::v-deep(:root[data-theme='dark']) .basic-info-table td select {
  background: color-mix(in srgb, var(--bg-soft) 74%, #0f172a);
  border-color: color-mix(in srgb, var(--line) 80%, #415374);
}

@media (max-width: 960px) {
  .basic-info-table .label-col,
  .basic-info-table .value-col {
    width: auto;
  }

  .inline-fields {
    grid-template-columns: 1fr;
  }

  .owner-fields {
    grid-template-columns: 1fr;
  }

  .occupancy-table {
    min-width: 700px;
  }
}
</style>
