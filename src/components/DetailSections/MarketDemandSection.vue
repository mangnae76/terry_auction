<script setup lang="ts">
import { inject } from 'vue';
import type { AuctionDetail } from '../../types/auction';

defineProps<{ readonly: boolean }>();
const form = defineModel<AuctionDetail>('form', { required: true });
const isPdfImportedField = inject<(path: string) => boolean>('isPdfImportedField', () => false);
</script>

<template>
  <section class="panel">
    <h2>매매수요 분석</h2>
    <div class="demand-wrap">
      <table class="demand-table">
        <tbody>
          <tr>
            <th>구분</th>
            <th>상세</th>
            <th colspan="4">초단타는 입지/개별성/매매대기수요/금매가로 승부 (데이터입력)</th>
          </tr>
          <tr>
            <th rowspan="7">실사용자(중요)</th>
            <th>실사용자(중요)</th>
            <td><input v-model="form.marketDemand.practicalArea" :readonly="readonly" /></td>
            <td><input v-model="form.marketDemand.practicalFamilyType" :readonly="readonly" /></td>
            <td><input v-model="form.marketDemand.practicalPeople" :readonly="readonly" /></td>
            <td><input v-model="form.marketDemand.practicalKeyword" :readonly="readonly" /></td>
          </tr>
          <tr>
            <th>구역내 입지</th>
            <td colspan="4"><input v-model="form.marketDemand.districtLocation" :readonly="readonly" /></td>
          </tr>
          <tr>
            <th>단지내 입지</th>
            <td colspan="4"><input v-model="form.marketDemand.complexLocation" :readonly="readonly" /></td>
          </tr>
          <tr>
            <th>학군</th>
            <td>
              <div class="pdf-field">
                <span v-if="isPdfImportedField('marketDemand.schoolInfoA')" class="pdf-badge">P</span>
                <input v-model="form.marketDemand.schoolInfoA" :readonly="readonly" />
              </div>
            </td>
            <td>
              <div class="pdf-field">
                <span v-if="isPdfImportedField('marketDemand.schoolInfoB')" class="pdf-badge">P</span>
                <input v-model="form.marketDemand.schoolInfoB" :readonly="readonly" />
              </div>
            </td>
            <td colspan="2">
              <div class="pdf-field">
                <span v-if="isPdfImportedField('marketDemand.schoolInfoC')" class="pdf-badge">P</span>
                <input v-model="form.marketDemand.schoolInfoC" :readonly="readonly" />
              </div>
            </td>
          </tr>
          <tr>
            <th>교통</th>
            <td colspan="4">
              <div class="pdf-field">
                <span v-if="isPdfImportedField('marketDemand.transportInfo')" class="pdf-badge">P</span>
                <input v-model="form.marketDemand.transportInfo" :readonly="readonly" />
              </div>
            </td>
          </tr>
          <tr>
            <th>일자리</th>
            <td colspan="4"><input v-model="form.marketDemand.jobInfo" :readonly="readonly" /></td>
          </tr>
          <tr>
            <th>인프라</th>
            <td colspan="4"><input v-model="form.marketDemand.infraInfo" :readonly="readonly" /></td>
          </tr>

          <tr>
            <th rowspan="9">개별성(등수)</th>
            <th>난식</th>
            <td colspan="4"><input v-model="form.marketDemand.layoutType" :readonly="readonly" /></td>
          </tr>
          <tr>
            <th>동/세대수/주차수</th>
            <td colspan="2"><input v-model="form.marketDemand.totalHouseholds" :readonly="readonly" /></td>
            <td colspan="2"><input v-model="form.marketDemand.parking" :readonly="readonly" /></td>
          </tr>
          <tr>
            <th>층</th>
            <td><input v-model="form.marketDemand.floorCurrent" :readonly="readonly" /></td>
            <td><input v-model="form.marketDemand.floorTarget" :readonly="readonly" /></td>
            <td colspan="2"><input v-model="form.marketDemand.elevator" :readonly="readonly" /></td>
          </tr>
          <tr>
            <th>복도/테로티/엘베</th>
            <td><input v-model="form.marketDemand.corridorType" :readonly="readonly" /></td>
            <td><input v-model="form.marketDemand.parking" :readonly="readonly" /></td>
            <td colspan="2"><input v-model="form.marketDemand.elevator" :readonly="readonly" /></td>
          </tr>
          <tr>
            <th>검사/혐오시설</th>
            <td><input v-model="form.marketDemand.inspectionTarget" :readonly="readonly" /></td>
            <td colspan="3"><input v-model="form.marketDemand.inspectionResult" :readonly="readonly" /></td>
          </tr>
          <tr>
            <th>건물관리상태</th>
            <td colspan="2"><input v-model="form.marketDemand.maintenanceTarget" :readonly="readonly" /></td>
            <td colspan="2"><input v-model="form.marketDemand.maintenanceResult" :readonly="readonly" /></td>
          </tr>
          <tr>
            <th>향/뷰/일조량</th>
            <td><input v-model="form.marketDemand.structureHeating" :readonly="readonly" /></td>
            <td><input v-model="form.marketDemand.structureView" :readonly="readonly" /></td>
            <td colspan="2"><input v-model="form.marketDemand.structureEntrance" :readonly="readonly" /></td>
          </tr>
          <tr>
            <th>타입/평/희장실</th>
            <td><input v-model="form.marketDemand.roomType" :readonly="readonly" /></td>
            <td><input v-model="form.marketDemand.bathCount" :readonly="readonly" /></td>
            <td colspan="2"><input v-model="form.marketDemand.roomCount" :readonly="readonly" /></td>
          </tr>
          <tr>
            <th>수리상태/건물내부/집내부</th>
            <td><input v-model="form.marketDemand.repairCondition" :readonly="readonly" /></td>
            <td><input v-model="form.marketDemand.buildingInside" :readonly="readonly" /></td>
            <td colspan="2"><input v-model="form.marketDemand.houseInside" :readonly="readonly" /></td>
          </tr>

          <tr>
            <th rowspan="2">매매수요 결과</th>
            <th>거래량</th>
            <td><input v-model="form.marketDemand.tradeVolumeRate" :readonly="readonly" /></td>
            <td><input v-model="form.marketDemand.tradeVolumeSupply" :readonly="readonly" /></td>
            <td><input v-model="form.marketDemand.tradeVolumeMonths" :readonly="readonly" /></td>
            <td><input v-model="form.marketDemand.tradeVolumeNote" :readonly="readonly" /></td>
          </tr>
          <tr>
            <th>매물개수</th>
            <td><input v-model="form.marketDemand.listingRate" :readonly="readonly" /></td>
            <td><input v-model="form.marketDemand.listingSupply" :readonly="readonly" /></td>
            <td><input v-model="form.marketDemand.listingCurrent" :readonly="readonly" /></td>
            <td><input v-model="form.marketDemand.listingNote" :readonly="readonly" /></td>
          </tr>

          <tr>
            <th rowspan="2">금매가 분석</th>
            <th>실거래가</th>
            <td><input v-model="form.marketDemand.lowPriceAvgPyeong" :readonly="readonly" /></td>
            <td colspan="3"><input v-model="form.marketDemand.lowPriceDecision" :readonly="readonly" /></td>
          </tr>
          <tr>
            <th>저가매물</th>
            <td><input v-model="form.marketDemand.lowPriceTarget" :readonly="readonly" /></td>
            <td colspan="3"><input v-model="form.marketDemand.lowPriceNote" :readonly="readonly" /></td>
          </tr>

          <tr>
            <th>시세조사</th>
            <th>실거래 없을 시</th>
            <td colspan="4">
              <div class="pdf-field">
                <span v-if="isPdfImportedField('marketDemand.marketSurveyNoTrade')" class="pdf-badge">P</span>
                <input v-model="form.marketDemand.marketSurveyNoTrade" :readonly="readonly" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.demand-wrap {
  width: 100%;
  overflow-x: auto;
}

.demand-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
  table-layout: fixed;
  border: 1px solid color-mix(in srgb, var(--line) 88%, #5a6f95);
  border-radius: 12px;
  overflow: hidden;
  background: color-mix(in srgb, var(--bg-card) 94%, var(--bg-soft));
}

.demand-table th,
.demand-table td {
  border: 1px solid color-mix(in srgb, var(--line) 86%, #61729b);
  padding: 4px 6px;
  text-align: center;
  vertical-align: middle;
}

.demand-table th {
  background: color-mix(in srgb, var(--bg-soft) 72%, #dbe5ff);
  color: color-mix(in srgb, var(--text-primary) 80%, #2e3c5a);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.3;
}

.demand-table input {
  width: 100%;
  height: 26px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--line) 80%, #7f90b0);
  background: color-mix(in srgb, var(--bg-primary) 92%, #ffffff);
  color: var(--text-primary);
  padding: 0 6px;
  font-size: 10px;
}

.demand-table tr > th:first-child {
  width: 70px;
}

.demand-table tr > th:nth-child(2) {
  width: 100px;
}

@media (max-width: 960px) {
  .demand-table {
    min-width: 900px;
  }

  .demand-table th,
  .demand-table td {
    padding: 4px 5px;
  }

  .demand-table input {
    height: 24px;
    font-size: 9px;
  }
}
</style>
