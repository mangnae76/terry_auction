<script setup lang="ts">
import { watch } from 'vue';
import FormattedNumberInput from '../FormattedNumberInput.vue';
import type { AuctionDetail, NearBidRow, RealTradeRow } from '../../types/auction';

defineProps<{ readonly: boolean }>();
const form = defineModel<AuctionDetail>('form', { required: true });

const createNearBidRow = (): NearBidRow => ({
  saleInfo: '',
  appraisal: '',
  minimum: '',
  winning: '',
  rate: '',
  expectedWinning: '',
});

const createRealTradeRow = (): RealTradeRow => ({
  type: '매매',
  contractDate: '',
  price: '',
  area: '',
  floor: '',
});

const isMeaningfulNearBidRow = (row: NearBidRow) =>
  [row.saleInfo, row.appraisal, row.minimum, row.winning, row.rate, row.expectedWinning].some((value) => value.trim().length > 0);

const serializeNearBidRows = (rows: NearBidRow[]) => {
  const meaningfulRows = rows.filter(isMeaningfulNearBidRow);
  return {
    nearBidSaleInfo: meaningfulRows.map((row) => row.saleInfo).join('\n'),
    nearBidAppraisal: meaningfulRows.map((row) => row.appraisal).join('\n'),
    nearBidMinimum: meaningfulRows.map((row) => row.minimum).join('\n'),
    nearBidWinning: meaningfulRows.map((row) => row.winning).join('\n'),
    nearBidRate: meaningfulRows.map((row) => row.rate).join('\n'),
    nearBidExpectedWinning: meaningfulRows.map((row) => row.expectedWinning).join('\n'),
  };
};

const ensureNearBidRows = () => {
  if (!Array.isArray(form.value.excelAnalysis.nearBidRows) || form.value.excelAnalysis.nearBidRows.length === 0) {
    form.value.excelAnalysis.nearBidRows = [createNearBidRow()];
  }
};

const ensureRealTradeRows = () => {
  if (!Array.isArray(form.value.excelAnalysis.realTradeRows) || form.value.excelAnalysis.realTradeRows.length === 0) {
    form.value.excelAnalysis.realTradeRows = [createRealTradeRow()];
  }
};

const addNearBidRow = (index = form.value.excelAnalysis.nearBidRows.length) => {
  ensureNearBidRows();
  form.value.excelAnalysis.nearBidRows.splice(index, 0, createNearBidRow());
};

const removeNearBidRow = (index: number) => {
  ensureNearBidRows();
  if (form.value.excelAnalysis.nearBidRows.length <= 1) {
    form.value.excelAnalysis.nearBidRows.splice(0, 1, createNearBidRow());
    return;
  }
  form.value.excelAnalysis.nearBidRows.splice(index, 1);
};

const addRealTradeRow = (index = form.value.excelAnalysis.realTradeRows.length) => {
  ensureRealTradeRows();
  form.value.excelAnalysis.realTradeRows.splice(index, 0, createRealTradeRow());
};

const removeRealTradeRow = (index: number) => {
  ensureRealTradeRows();
  if (form.value.excelAnalysis.realTradeRows.length <= 1) {
    form.value.excelAnalysis.realTradeRows.splice(0, 1, createRealTradeRow());
    return;
  }
  form.value.excelAnalysis.realTradeRows.splice(index, 1);
};

watch(
  () => form.value.id,
  () => {
    ensureNearBidRows();
    ensureRealTradeRows();
  },
  { immediate: true },
);

watch(
  () => form.value.excelAnalysis.nearBidRows,
  (rows) => {
    ensureNearBidRows();
    Object.assign(form.value.excelAnalysis, serializeNearBidRows(Array.isArray(rows) ? rows : []));
  },
  { deep: true, immediate: true },
);
</script>

<template>
  <section class="panel excel-panel">
    <h2>엑셀 분석 확장표</h2>
    <div class="excel-wrap">
      <table class="excel-sheet">
        <tbody>
          <tr>
            <th class="year-cell">{{ form.excelAnalysis.marketYear }}</th>
            <th>매물정보(네이버부동산)</th>
            <th>전용면적(㎡)</th>
            <th>공동주택가</th>
            <th>전세가(공주가X보증률)</th>
            <th>네이버호가</th>
            <th>비율(호가/공주가)</th>
          </tr>
          <tr>
            <th rowspan="2">주변호가</th>
            <td><input v-model="form.excelAnalysis.nearOfferSaleInfo" :readonly="readonly" /></td>
            <td><input v-model="form.excelAnalysis.nearOfferExclusiveArea" :readonly="readonly" /></td>
            <td><FormattedNumberInput v-model="form.excelAnalysis.nearOfferCommonPrice" :readonly="readonly" mode="string" /></td>
            <td><FormattedNumberInput v-model="form.excelAnalysis.nearOfferJeonsePrice" :readonly="readonly" mode="string" /></td>
            <td><FormattedNumberInput v-model="form.excelAnalysis.nearOfferNaverPrice" :readonly="readonly" mode="string" /></td>
            <td><input v-model="form.excelAnalysis.nearOfferRatio" :readonly="readonly" /></td>
          </tr>
          <tr>
            <td class="title-cell" colspan="2">예상매매가(공주가 대비 평균 호가율)</td>
            <td><FormattedNumberInput v-model="form.excelAnalysis.nearOfferAvgPrice" :readonly="readonly" mode="string" /></td>
            <td><FormattedNumberInput v-model="form.excelAnalysis.nearOfferAvgJeonse" :readonly="readonly" mode="string" /></td>
            <td><FormattedNumberInput v-model="form.excelAnalysis.nearOfferAvgNaver" :readonly="readonly" mode="string" /></td>
            <td><input v-model="form.excelAnalysis.nearOfferAvgRatio" :readonly="readonly" /></td>
          </tr>

          <tr>
            <th rowspan="2">주변 실거래 평균가</th>
            <th>매물정보(국토교통부)</th>
            <th>전용면적</th>
            <th>공동주택가</th>
            <th>전세가</th>
            <th>해당지역 실거래가평균</th>
            <th>비율(실거래평균가/공주가)</th>
          </tr>
          <tr>
            <td><input v-model="form.excelAnalysis.realTradeSaleInfo" :readonly="readonly" /></td>
            <td><input v-model="form.excelAnalysis.realTradeArea" :readonly="readonly" /></td>
            <td><FormattedNumberInput v-model="form.excelAnalysis.realTradeCommonPrice" :readonly="readonly" mode="string" /></td>
            <td><FormattedNumberInput v-model="form.excelAnalysis.realTradeJeonse" :readonly="readonly" mode="string" /></td>
            <td><FormattedNumberInput v-model="form.excelAnalysis.realTradeLocalAvg" :readonly="readonly" mode="string" /></td>
            <td><input v-model="form.excelAnalysis.realTradeRatio" :readonly="readonly" /></td>
          </tr>

          <tr>
            <th>실거래가</th>
            <td colspan="6" class="real-trade-nested-cell">
              <table class="real-trade-table">
                <thead>
                  <tr>
                    <th>구분</th>
                    <th>계약일</th>
                    <th>거래금액</th>
                    <th>전용면적</th>
                    <th>층</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, index) in form.excelAnalysis.realTradeRows" :key="`real-trade-${index}`">
                    <td><input v-model="row.type" :readonly="readonly" /></td>
                    <td><input v-model="row.contractDate" :readonly="readonly" /></td>
                    <td><FormattedNumberInput v-model="row.price" :readonly="readonly" mode="string" /></td>
                    <td><input v-model="row.area" :readonly="readonly" /></td>
                    <td><input v-model="row.floor" :readonly="readonly" /></td>
                    <td class="real-trade-actions">
                      <template v-if="readonly">-</template>
                      <template v-else>
                        <button class="mini-action" type="button" @click="addRealTradeRow(index + 1)">추가</button>
                        <button class="mini-action danger" type="button" @click="removeRealTradeRow(index)">삭제</button>
                      </template>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
          <tr>
            <th>평단가</th>
            <td><input v-model="form.excelAnalysis.unitPrice" :readonly="readonly" /></td>
            <td></td>
            <td><input v-model="form.excelAnalysis.unitPriceCommonPrice" :readonly="readonly" /></td>
            <td><input v-model="form.excelAnalysis.unitPriceJeonsePrice" :readonly="readonly" /></td>
            <td><input v-model="form.excelAnalysis.unitPriceNaverPrice" :readonly="readonly" /></td>
            <td><input v-model="form.excelAnalysis.unitPriceRatio" :readonly="readonly" /></td>
          </tr>

          <tr>
            <th>주변 낙찰가</th>
            <td colspan="6" class="near-bid-nested-cell">
              <table class="near-bid-table">
                <thead>
                  <tr>
                    <th>매물정보(경매지)</th>
                    <th>감정가</th>
                    <th>최저가</th>
                    <th>낙찰가</th>
                    <th>낙찰가율(낙찰가/공주가)</th>
                    <th>예상낙찰가</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, index) in form.excelAnalysis.nearBidRows" :key="`near-bid-${index}`">
                    <td><input v-model="row.saleInfo" :readonly="readonly" /></td>
                    <td><FormattedNumberInput v-model="row.appraisal" :readonly="readonly" mode="string" /></td>
                    <td><FormattedNumberInput v-model="row.minimum" :readonly="readonly" mode="string" /></td>
                    <td><FormattedNumberInput v-model="row.winning" :readonly="readonly" mode="string" /></td>
                    <td><input v-model="row.rate" :readonly="readonly" /></td>
                    <td><FormattedNumberInput v-model="row.expectedWinning" :readonly="readonly" mode="string" /></td>
                    <td class="near-bid-actions">
                      <template v-if="readonly">-</template>
                      <template v-else>
                        <button class="mini-action" type="button" @click="addNearBidRow(index + 1)">추가</button>
                        <button class="mini-action danger" type="button" @click="removeNearBidRow(index)">삭제</button>
                      </template>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>

          <tr>
            <th rowspan="2">지역분석</th>
            <td colspan="3"></td>
            <th class="sub-head">시세</th>
            <th class="sub-head">부동산명</th>
            <th class="sub-head">연락처</th>
          </tr>
          <tr>
            <td colspan="3"><input v-model="form.excelAnalysis.regionMarket" :readonly="readonly" /></td>
            <td><FormattedNumberInput v-model="form.excelAnalysis.realTradeLocalAvg" :readonly="readonly" mode="string" /></td>
            <td><input v-model="form.excelAnalysis.regionBrokerName" :readonly="readonly" /></td>
            <td><input v-model="form.excelAnalysis.regionContact" :readonly="readonly" placeholder="☎" /></td>
          </tr>
          <tr>
            <th>종합</th>
            <td colspan="4">
              <textarea v-model="form.excelAnalysis.summaryText" :readonly="readonly" rows="2" />
            </td>
            <td><input v-model="form.excelAnalysis.summaryContact" :readonly="readonly" /></td>
            <td><input :readonly="readonly" placeholder="☎" /></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.excel-wrap {
  width: 100%;
  overflow-x: auto;
}

.excel-sheet {
  width: 100%;
  min-width: 920px;
  border-collapse: collapse;
  table-layout: fixed;
  border: 1px solid color-mix(in srgb, var(--line) 88%, #5a6f95);
  border-radius: 12px;
  overflow: hidden;
  background: color-mix(in srgb, var(--bg-card) 94%, var(--bg-soft));
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 14%, transparent);
}

.excel-sheet th,
.excel-sheet td {
  border: 1px solid color-mix(in srgb, var(--line) 86%, #61729b);
  padding: 5px 6px;
  text-align: center;
  vertical-align: middle;
}

.excel-sheet th {
  background: color-mix(in srgb, var(--bg-soft) 72%, #dbe5ff);
  font-weight: 700;
  color: color-mix(in srgb, var(--text-primary) 80%, #2e3c5a);
  font-size: 10px;
  line-height: 1.3;
}

.excel-sheet .year-cell {
  width: 72px;
  font-size: 18px;
  font-weight: 800;
}

.excel-sheet .title-cell {
  text-align: left;
  font-weight: 700;
  background: color-mix(in srgb, var(--bg-soft) 72%, #dbe5ff);
  color: color-mix(in srgb, var(--text-primary) 80%, #2e3c5a);
}

.excel-sheet .sub-head {
  font-size: 10px;
  font-weight: 700;
}

.near-bid-nested-cell {
  padding: 0;
}

.real-trade-nested-cell {
  padding: 0;
}

.real-trade-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.real-trade-table th,
.real-trade-table td {
  border: 1px solid color-mix(in srgb, var(--line) 82%, #7a8aad);
  padding: 4px 5px;
  text-align: center;
  vertical-align: middle;
}

.real-trade-table th {
  background: color-mix(in srgb, var(--bg-soft) 76%, #e1e9ff);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.25;
}

.real-trade-actions {
  white-space: nowrap;
}

.near-bid-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.near-bid-table th,
.near-bid-table td {
  border: 1px solid color-mix(in srgb, var(--line) 82%, #7a8aad);
  padding: 4px 5px;
  text-align: center;
  vertical-align: middle;
}

.near-bid-table th {
  background: color-mix(in srgb, var(--bg-soft) 76%, #e1e9ff);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.25;
}

.near-bid-actions {
  white-space: nowrap;
}

.mini-action {
  border: 1px solid color-mix(in srgb, var(--line) 80%, #7f90b0);
  border-radius: 7px;
  background: color-mix(in srgb, var(--bg-card) 92%, var(--bg-soft));
  padding: 4px 6px;
  font-size: 9px;
  font-weight: 700;
}

.mini-action + .mini-action {
  margin-left: 4px;
}

.mini-action.danger {
  color: var(--danger);
}

.excel-sheet input,
.excel-sheet textarea,
.excel-sheet select {
  width: 100%;
  height: 26px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--line) 80%, #7f90b0);
  background: color-mix(in srgb, var(--bg-primary) 92%, #ffffff);
  color: var(--text-primary);
  text-align: center;
  padding: 0 6px;
  font-family: inherit;
  font-size: 10px;
}

.excel-sheet textarea {
  height: auto;
  min-height: 52px;
  resize: vertical;
  text-align: left;
  padding: 6px 7px;
}

.excel-sheet input:focus,
.excel-sheet textarea:focus,
.excel-sheet select:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--accent) 62%, var(--line));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent);
}

@media (max-width: 960px) {
  .excel-sheet {
    min-width: 860px;
  }

  .excel-sheet th,
  .excel-sheet td {
    padding: 4px 5px;
  }

  .excel-sheet .year-cell {
    width: 64px;
    font-size: 16px;
  }

  .excel-sheet input,
  .excel-sheet textarea,
  .excel-sheet select {
    height: 24px;
    font-size: 9px;
  }

  .excel-sheet textarea {
    min-height: 46px;
  }
}
</style>
