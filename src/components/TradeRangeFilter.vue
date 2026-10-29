<script setup lang="ts">
// 실거래 거르기 칸 — 시세조사의 유사물건 · 실거래가 조건분석이 같이 쓴다(예전 가격정보 조건분석과 같은 항목).
// 기간선택을 누르면 시작 · 종료일자가 같이 바뀌고, 날짜를 손으로 고치면 기간선택은 풀린다.
// 검색 단추 · 저장은 없다 — 이미 받은 자료를 거르는 것이라 값을 바꾸면 바로 걸러진다.
import { tradeWindowOf } from '../services/publicDataApi';
import { RANGE_MONTHS, type TradeRange } from '../services/caseTradeAnalysis';

const props = defineProps<{ modelValue: TradeRange }>();
const emit = defineEmits<{ 'update:modelValue': [TradeRange] }>();

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const set = (patch: Partial<TradeRange>) => emit('update:modelValue', { ...props.modelValue, ...patch });
const pickMonths = (m: number) => {
  const w = tradeWindowOf(Date.now(), m);
  set({ months: m, from: ymd(w.start), to: ymd(w.end) });
};
const val = (e: Event) => (e.target as HTMLInputElement).value;
</script>

<template>
  <div class="trf">
    <div class="trf-row">
      <span class="trf-lab">기간선택</span>
      <div class="trf-months">
        <button v-for="m in RANGE_MONTHS" :key="m" type="button" :class="['trf-m', { on: modelValue.months === m }]" @click="pickMonths(m)">{{ m }}개월</button>
      </div>
      <span class="trf-lab">시작일자</span>
      <input class="trf-in" type="date" :value="modelValue.from" @input="set({ from: val($event), months: 0 })" />
      <span class="trf-lab">종료일자</span>
      <input class="trf-in" type="date" :value="modelValue.to" @input="set({ to: val($event), months: 0 })" />
    </div>
    <div class="trf-row">
      <span class="trf-lab">면적</span>
      <span class="trf-pair">
        <input class="trf-in" inputmode="decimal" placeholder="최소 전체" :value="modelValue.areaMin" @input="set({ areaMin: val($event) })" /><em>평</em>
        <i>~</i>
        <input class="trf-in" inputmode="decimal" placeholder="최대 전체" :value="modelValue.areaMax" @input="set({ areaMax: val($event) })" /><em>평</em>
      </span>
      <span class="trf-lab">건축년도</span>
      <span class="trf-pair">
        <input class="trf-in" inputmode="numeric" maxlength="4" placeholder="전체" :value="modelValue.buildMin" @input="set({ buildMin: val($event) })" />
        <i>~</i>
        <input class="trf-in" inputmode="numeric" maxlength="4" placeholder="전체" :value="modelValue.buildMax" @input="set({ buildMax: val($event) })" />
      </span>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.trf { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid #e5e7eb; border-radius: 10px; background: #f8fafc; }
.trf-row { display: grid; grid-template-columns: auto 1.6fr auto 1fr auto 1fr; align-items: center; gap: 8px 10px; }
.trf-row:last-child { grid-template-columns: auto 1.6fr auto 1fr auto; }
.trf-lab { font-size: 14px; font-weight: 700; color: #374151; white-space: nowrap; }
.trf-months { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.trf-m { height: 40px; border: 1px solid #dde3ee; border-radius: 8px; background: #fff; font-family: inherit; font-size: 14px; font-weight: 700; color: #6b7280; cursor: pointer; }
.trf-m.on { border-color: #2b6df3; background: #eef3ff; color: #2b6df3; }
.trf-in { box-sizing: border-box; width: 100%; min-width: 0; height: 40px; padding: 0 12px; border: 1px solid #dde3ee; border-radius: 8px; background: #fff; font-family: inherit; font-size: 14px; color: #111827; }
.trf-in:focus { outline: none; border-color: #2b6df3; }
.trf-in::placeholder { color: #9aa3b2; }
.trf-pair { display: flex; align-items: center; gap: 6px; min-width: 0; }
.trf-pair em { font-style: normal; font-size: 13px; color: #6b7280; }
.trf-pair i { font-style: normal; color: #9aa3b2; }
</style>
