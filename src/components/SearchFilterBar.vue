<script setup lang="ts">
// 검색 거르기 한 벌 — '필터 기본 부품 세트'(2026-11-12 사용자, 매매수요 입지비교에서 만든 그대로).
// 1줄 반경 · 거래 · 기간 · 엘베 · 층, 2줄 기준(유사도 · 직접범위) · 면적 · 건축(또는 유사도 막대) · 필터초기화 · 조회하기 · 저장하기.
// 단추는 고르기(draft)만 바꾼다 — 조회하기(apply) · 필터초기화(reset) · 저장하기(save)는 부모가 한다(composables/useFilterDraft 와 같이 쓴다).
// 다른 화면에 옮길 때는 이 부품을 그대로 넣고, 뺄 항목만 hide 로 끈다 — 남은 상자들이 줄 폭을 나눠 채워 간격 8px 이 그대로 맞는다.
import { computed, ref } from 'vue';
import RangeInputBox from './RangeInputBox.vue';
import SimRangeBox from './SimRangeBox.vue';

export type SearchFilterKey = 'range' | 'kind' | 'period' | 'elev' | 'floor' | 'mode' | 'area' | 'year' | 'save';
/** 거래 — 시세분석은 월세까지(kinds 로 넘긴다, 2026-11-12) */
export type SearchKind = '매매' | '전세' | '월세';
export type SearchFilter = {
  range: string | number; months: number; kind: SearchKind; mode: 'sim' | 'range'; sim: number;
  /** 직접범위 칸 — 비우면 null(제한 없음). 유사도와 따로 움직인다 */
  area: [number | null, number | null]; year: [number | null, number | null]; floor: 'same' | null; elev: 'yes' | 'no' | null;
};

const props = defineProps<{
  draft: SearchFilter;
  /** 반경 단추 — [값, 글] */
  rangeOptions: ReadonlyArray<readonly [string | number, string]>;
  /** 기간 단추 — [개월, 글] */
  periodOptions: ReadonlyArray<readonly [number, string]>;
  /** 거래 단추 옆 건수 */
  kindCount: (k: SearchKind) => string;
  /** 거래 단추 — 기본 매매 · 전세(시세분석은 월세까지) */
  kinds?: ReadonlyArray<SearchKind>;
  /** 내 물건 — 면적 · 건축 가운데 빨간 기준 */
  baseArea: number;
  baseYear: number;
  areaMax: number;
  yearMin: number;
  yearMax: number;
  /** 유사도 % → 면적 · 건축 범위 */
  simRange: (sim: number) => { area: [number, number]; year: [number, number] };
  isDefault: boolean;
  canSave: boolean;
  /** 건물 정보(좌표 · 주변시설 · 엘베)를 받는 중 — 저장하기에 '불러오는 중' */
  loading?: boolean;
  saving: boolean;
  /** 저장본과 같다 — '저장됨' */
  saved: boolean;
  /** 저장한 날 — '저장됨' 밑에 작게(2026-11-12 사용자 '같은 세트') */
  savedDay?: string;
  /** 좁은 칸(전체화면 왼쪽 창) — 줄마다 한 항목, 엘베 · 층은 한 줄에 둘(2026-11-12 사용자) */
  compact?: boolean;
  /** 뺄 항목 — '반경만 빼' 같은 요청 */
  hide?: SearchFilterKey[];
}>();
const emit = defineEmits<{ 'update:draft': [v: SearchFilter]; apply: []; reset: []; save: [] }>();
const off = (k: SearchFilterKey) => !!props.hide?.includes(k);
// 고르면 바로 적용 — 받아 둔 실거래 1년치에서 거르기만 해서 조회하기가 필요 없다(전체화면과 같게, 2026-11-12 사용자)
// 보던 자리 지키기 — 필터를 바꾸면 위쪽 칸(예상가 · 지표 등) 높이가 바뀌어 화면이 밀렸다. 바꾸기 전 이 필터의 화면 위치를 재 두고, 다시 그려진 뒤 그만큼 스크롤을 되돌린다(2026-11-12 사용자)
const rootEl = ref<HTMLElement | null>(null);
const keepPlace = () => {
  const el = rootEl.value; if (!el || typeof window === 'undefined') return;
  const y0 = el.getBoundingClientRect().top;
  const fix = () => { if (!el.isConnected) return; const dy = el.getBoundingClientRect().top - y0; if (Math.abs(dy) > 1) window.scrollBy(0, dy); };
  requestAnimationFrame(() => { fix(); requestAnimationFrame(fix); });
};
const set = (patch: Partial<SearchFilter>) => { keepPlace(); emit('update:draft', { ...props.draft, ...patch }); emit('apply'); };
// 유사도 막대는 끄는 동안 값이 계속 바뀐다 — 막대 · 글은 이 부품 안에서만 바로 따라가고(simLive), 화면에 알리기(값 바꾸기 · 다시 계산)는 손을 멈춘 뒤 한 번.
// 예전엔 단계마다 화면 값을 바꿔 표 · 지도를 매번 다시 그려 막대가 무거웠다(2026-11-12 사용자 '슬라이드 바가 너무 무거워')
const simLive = ref<number | null>(null);
let simT = 0;
const key = <K extends keyof SearchFilter>(k: K) => computed<SearchFilter[K]>({ get: () => props.draft[k], set: (v) => set({ [k]: v } as Partial<SearchFilter>) });
const rangeD = key('range');
const kindD = key('kind');
const monthsD = key('months');
const elevD = key('elev');
const floorD = key('floor');
const areaD = key('area');
const yearD = key('year');
/** 유사도 % — 바꾸면 면적 · 건축도 그 범위로 */
/** 유사도 % — 바꾸면 직접범위 칸(면적 · 건축)도 그 범위로 같이 움직인다(2026-11-12 사용자, 시세분석과 같다) */
const simD = computed<number>({
  get: () => simLive.value ?? props.draft.sim,
  set: (v) => { simLive.value = v; window.clearTimeout(simT); simT = window.setTimeout(() => { simLive.value = null; if (v !== props.draft.sim) set({ sim: v, ...props.simRange(v) }); }, 200); },
});
/** 유사도 막대 옆 글 — 그 %로 정해지는 면적 · 건축 */
const simText = computed(() => { const r = props.simRange(simD.value);   /* 끄는 동안에도 글이 따라가게 */ return `면적 ${r.area[0]}~${r.area[1]}㎡ · 건축 ${r.year[0]}~${r.year[1]}년`; });
/** 기준 — 직접범위로 가면 지금 유사도 범위에서 시작하고, 유사도로 가면 유사도 범위로(둘은 같이 움직인다, 시세분석과 같다) */
const modeD = computed<'sim' | 'range'>({
  get: () => props.draft.mode,
  set: (m) => set(m === 'sim' ? { mode: m, ...props.simRange(props.draft.sim) } : { mode: m, ...(props.draft.area[0] == null && props.draft.area[1] == null ? props.simRange(props.draft.sim) : {}) }),
});
const pyTx = (lo: number, hi: number) => `${(lo / 3.305785).toFixed(1)}~${(hi / 3.305785).toFixed(1)}평`;

</script>

<template>
  <div ref="rootEl" :class="['sfb', { compact }]">
    <!-- 거르기 — 제목 · 검색기준 줄 바로 밑(2026-11-12 사용자). 단추는 고르기만, 조회하기를 눌러야 리스트 · 지도 · 칸 줄이 바뀌고 저장된다. (예전: 지도 밑 · 표 바로 위, 2026-11-11) 시세분석 조건 줄과 같은 단추 · 순서(범위 → 거래 → 기간 → 평형). 표 · 지도 · 위 칸 줄이 같이 바뀐다 -->
    <div class="cmp-conds">
      <span v-if="!off('range')" class="pa-lab">반경<span class="pa-seg pa-out" role="radiogroup" aria-label="반경"><button v-for="[v, t] in rangeOptions" :key="String(v)" type="button" role="radio" :class="{ on: rangeD === v }" :aria-checked="rangeD === v" :data-t="t" @click="rangeD = v">{{ t }}</button></span></span>
      <span v-if="!off('kind')" class="pa-lab">거래<span class="pa-seg kindF" role="radiogroup" aria-label="거래 종류"><button v-for="k in (kinds ?? ['매매', '전세'] as const)" :key="k" type="button" role="radio" :data-k="k" :class="{ on: kindD === k }" :aria-checked="kindD === k" @click="kindD = k">{{ k }} {{ kindCount(k) }}</button></span></span>
      <span v-if="!off('period')" class="pa-lab">기간<span class="pa-seg pa-out" role="radiogroup" aria-label="기간"><button v-for="[m, t] in periodOptions" :key="m" type="button" role="radio" :class="{ on: monthsD === m }" :aria-checked="monthsD === m" :data-t="t" @click="monthsD = m">{{ t }}</button></span></span>
      <span v-if="!off('elev')" class="pa-lab">엘베<span class="pa-seg pa-out" role="radiogroup" aria-label="엘베"><button v-for="[v, t] in ([[null, '전체'], ['yes', '있음'], ['no', '없음']] as const)" :key="t" type="button" role="radio" :class="{ on: elevD === v }" :aria-checked="elevD === v" :data-t="t" @click="elevD = v">{{ t }}</button></span></span>
      <span v-if="!off('floor')" class="pa-lab">층<span class="pa-seg pa-out" role="radiogroup" aria-label="층"><button type="button" role="radio" :class="{ on: floorD !== 'same' }" :aria-checked="floorD !== 'same'" data-t="전체" @click="floorD = null">전체</button><button type="button" role="radio" :class="{ on: floorD === 'same' }" :aria-checked="floorD === 'same'" data-t="같은 층" @click="floorD = 'same'">같은 층</button></span></span>
    </div>
    <!-- 면적 · 건축 막대 — 거르기 줄 밑 한 줄, 두 상자가 위 줄 폭에 맞게 반씩(2026-11-12 사용자) -->
    <!-- 면적 · 건축 상자(적는 칸), 조회하기 · 저장하기는 오른쪽 — 단추는 위 거르기까지 다 같이 쓴다(2026-11-12 사용자) -->
    <div class="cmp-bars-row">
    <!-- 기준 묶음 — 기준 · 유사도(또는 면적 · 건축)를 흰 상자 하나에, 안쪽은 얇은 선으로만 나눈다(2026-11-12 사용자 시안) -->
    <div class="cmp-bars joined">
        <span v-if="!off('mode')" class="pa-lab cmp-mode">기준<span class="pa-seg pa-out" role="radiogroup" aria-label="유사 조건 방식"><button v-for="[v, t] in ([['sim', '유사도'], ['range', '직접범위']] as const)" :key="v" type="button" role="radio" :class="{ on: modeD === v }" :aria-checked="modeD === v" :data-t="t" @click="modeD = v">{{ t }}</button></span></span>
        <span v-if="modeD === 'sim'" class="cmp-sim" :style="{ '--p': `${((simD - 60) / 35) * 100}%` }"><SimRangeBox :sim="simD" :text="simText" @update="(v) => (simD = v)" /></span>
        <RangeInputBox v-if="modeD === 'range' && !off('area')" label="면적 ㎡" :min="20" :max="areaMax" :lo="areaD[0]" :hi="areaD[1]" :base="baseArea" :lo-text="areaD[0] == null ? '' : String(areaD[0])" :base-text="String(Number((Math.floor(baseArea * 100 + 1e-6) / 100).toFixed(2)))" :hi-text="areaD[1] == null ? '' : String(areaD[1])" :sub="areaD[0] != null && areaD[1] != null ? pyTx(areaD[0], areaD[1]) : ''" allow-blank @update="(lo, hi) => (areaD = [lo, hi])" />
        <RangeInputBox v-if="modeD === 'range' && !off('year')" label="건축" :min="yearMin" :max="yearMax" :lo="yearD[0]" :hi="yearD[1]" :base="baseYear" :lo-text="yearD[0] == null ? '' : String(yearD[0])" :base-text="String(baseYear || '')" :hi-text="yearD[1] == null ? '' : String(yearD[1])" :sub="yearD[0] != null && yearD[1] != null ? `${yearMax - yearD[1] + 1}~${yearMax - yearD[0] + 1}년차` : ''" allow-blank @update="(lo, hi) => (yearD = [lo, hi])" />
    </div>
    <span class="cmp-qbtns">
        <button type="button" class="cmp-reset" :disabled="isDefault" title="필터를 기본값으로" @click="keepPlace(); emit('reset'); emit('apply')"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 2.6-6.4" /><path d="M3 4v5h5" /></svg>필터초기화</button>
        <button v-if="!off('save')" type="button" :class="['cmp-save', { ready: canSave && !saved }]" :disabled="!canSave || saving || saved" :title="saved ? '저장된 리스트입니다' : canSave ? '지금 리스트를 저장합니다' : '건물 정보를 다 받으면 저장할 수 있습니다'" @click="emit('save')"><template v-if="saved">저장됨<small v-if="savedDay" class="cmp-save-day">{{ savedDay }}</small></template><template v-else>저장하기</template></button>
      </span>
    </div>
  </div>
</template>

<style scoped>
/* 필터 두 줄을 감싸는 회색 상자 — ① 실사용자 상자와 같은 꼴(연회색 바탕 · 옅은 테두리 · 10px 둥글기, 2026-11-12 사용자) */
.sfb { margin: 10px 0 12px; padding: 10px 14px; background: #f7f9fc; border: 1px solid #e3e8f0; border-radius: 10px; }
.sfb > .cmp-conds { margin: 0 0 8px; }
.sfb > .cmp-bars-row { margin: 0; }
:root[data-theme="dark"] .sfb { background: #1a2131; border-color: #2a3449; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .sfb { background: #1a2131; border-color: #2a3449; } }
.cmp-conds { display: flex; flex-wrap: nowrap; align-items: center; gap: 8px; margin: 10px 0 12px; }   /* 범위 · 거래 · 기간 · 엘베 · 층 한 줄 — 상자가 줄 폭을 나눠 갖는다(2026-11-12 사용자) */
.cmp-conds > .pa-lab { flex: 1 1 auto; min-width: 0; justify-content: space-between; padding: 4px 10px; gap: 8px; }
.cmp-conds > .pa-lab > .pa-seg { flex: 1 1 auto; justify-content: space-between; }
.cmp-conds > .pa-lab > .pa-seg > button { flex: 1 1 auto; padding: 0 8px; }
@media (max-width: 1180px) { .cmp-conds { flex-wrap: wrap; } }
.cmp-bars-row { display: flex; align-items: stretch; gap: 8px; margin: -2px 0 12px; }   /* [기준][면적][건축 | 유사도] … [필터초기화][저장하기] — 상자 사이 모두 8px */
.cmp-bars { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; }
.cmp-bars > .cmp-mode { display: inline-flex; align-items: center; gap: 10px; height: 42px; box-sizing: border-box; background: #fff; border: 1px solid #dde3ee; border-radius: 8px; padding: 4px 12px; font-size: 14px; font-weight: 700; color: #6b7280; white-space: nowrap; }   /* 기준 — 반경 · 기간 상자와 같은 꼴 */
.cmp-bars > .cmp-mode .pa-seg { display: inline-flex; gap: 4px; background: #f3f5f9; border-radius: 6px; padding: 3px; height: 32px; box-sizing: border-box; align-items: center; }
.cmp-bars > .cmp-mode .pa-seg button { border: none; background: transparent; border-radius: 5px; height: 26px; padding: 0 12px; font: inherit; font-size: 14px; font-weight: 400; color: #6b7280; cursor: pointer; }
.cmp-bars > .cmp-mode .pa-seg button.on { background: #fff; color: #2b6df3; font-weight: 700; box-shadow: inset 0 0 0 1px #2b6df3; }
.cmp-bars { flex: 1 1 auto; min-width: 0; }   /* 필터초기화 단추까지 같은 8px 간격으로 채운다 */
.cmp-bars > :is(.rib, .cmp-sim) { flex: 1 1 0; min-width: 0; }
.cmp-sim { display: flex; align-items: center; height: 42px; box-sizing: border-box; padding: 0 14px; background: #fff; border: 1px solid #dde3ee; border-radius: 8px; overflow: hidden; }   /* 유사도 막대 상자 — 글 · 막대 · 눈금은 부품 기본(시세분석과 같다) */
.cmp-sim > * { flex: 1 1 auto; min-width: 0; }
@media (max-width: 760px) { .cmp-bars-row { flex-wrap: wrap; } }
/* 둘째 줄(기준 · 유사도 · 면적 · 건축 · 필터초기화 · 저장하기) — 시세분석 유사도 상자와 같은 높이 66px(2026-11-12 사용자 '시세분석 사이즈로'). 좁은 칸(전체화면)은 따로 */
.sfb:not(.compact) .cmp-bars > .cmp-mode, .sfb:not(.compact) .cmp-sim, .sfb:not(.compact) :deep(.rib) { height: 66px; }
.sfb:not(.compact) .cmp-sim { padding: 0 18px; }
.sfb:not(.compact) .cmp-bars > .cmp-mode .pa-seg { height: 36px; }
.sfb:not(.compact) .cmp-bars > .cmp-mode .pa-seg button { height: 30px; }
.sfb:not(.compact) :deep(.rib) { padding: 4px 12px 4px 14px; }
.sfb:not(.compact) :deep(.rib .vals) { padding: 4px; }
.sfb:not(.compact) :deep(.rib .vals input.in.in) { width: 72px; height: 32px !important; }
.sfb:not(.compact) .cmp-qbtns > button { min-height: 66px; }
/* 좁은 칸 줄 맞춤 — 한 줄 하나짜리(반경 · 거래 · 기간 · 기준 · 면적 · 건축)는 이름 칸 폭을 하나(--lab)로 둬
   단추 묶음 · 적는 칸 회색 상자가 모두 같은 x 에서 시작해 줄 끝까지 간다(2026-11-12 사용자). 엘베 · 층(반씩)은 따로 */
.sfb.compact { --lab: 72px; }
.sfb.compact > .cmp-conds > .pa-lab:not(:has([aria-label="엘베"], [aria-label="층"])), .sfb.compact .cmp-bars > .cmp-mode { display: grid; grid-template-columns: var(--lab) minmax(0, 1fr); gap: 0; padding: 4px 10px; }
.sfb.compact > .cmp-conds > .pa-lab:not(:has([aria-label="엘베"], [aria-label="층"])) > .pa-seg, .sfb.compact .cmp-bars > .cmp-mode > .pa-seg { display: flex; }
.sfb.compact :deep(.rib) { display: grid; grid-template-columns: var(--lab) minmax(0, 1fr); gap: 0; padding: 4px 10px; }
.sfb.compact :deep(.rib .vals) { justify-content: space-between; }
.sfb.compact :deep(.rib .vals input.in.in) { flex: 1 1 0; width: auto; min-width: 0; }
.sfb.compact :deep(.rib .vals .me) { flex: 0 0 64px; padding: 0; text-align: center; }   /* 기준값 칸 폭 고정 — 49.74 · 2014 처럼 글 길이가 달라도 양옆 적는 칸이 줄마다 같은 크기(2026-11-12 사용자) */
/* 좁은 칸 — 전체화면 왼쪽 창(폭 ~400px). 반경 · 거래 · 기간 · 기준 · 유사도(면적 · 건축)는 한 줄씩, 엘베 · 층은 반씩, 단추 둘은 맨 아래 반씩 */
.sfb.compact { margin: 0; padding: 8px 10px; container-type: inline-size; }
.sfb.compact .cmp-conds .kindF button { min-width: 0; }   /* 좁은 칸 — 거래 단추(매매 · 전세 · 월세)가 칸을 넘지 않게 */

.sfb.compact > .cmp-conds { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 0 0 6px; }
.sfb.compact > .cmp-conds > .pa-lab { grid-column: 1 / -1; height: 38px; box-sizing: border-box; }
.sfb.compact > .cmp-conds > .pa-lab:has([aria-label="엘베"]), .sfb.compact > .cmp-conds > .pa-lab:has([aria-label="층"]) { grid-column: auto; }
.sfb.compact > .cmp-bars-row { flex-direction: column; gap: 6px; }
.sfb.compact .cmp-bars { flex-direction: column; flex-wrap: nowrap; gap: 6px; }
.sfb.compact .cmp-bars > .cmp-mode { justify-content: space-between; height: 38px; }
.sfb.compact .cmp-bars > .cmp-mode .pa-seg { flex: 1 1 auto; }   /* 기준 단추도 위 줄들처럼 줄 끝까지 넓게 */
.sfb.compact .cmp-bars > .cmp-mode .pa-seg button { flex: 1 1 0; }
.sfb.compact .cmp-bars > :is(.rib, .cmp-sim) { flex: 0 0 auto; width: 100%; }
.sfb.compact .cmp-sim { height: auto; min-height: 42px; padding: 6px 12px; }   /* 좁은 칸 — 유사도 글 · 막대 · 눈금이 잘리지 않게 */
.sfb.compact .cmp-qbtns { margin-left: 0; }
.sfb.compact .cmp-qbtns > button { flex: 1 1 0; min-width: 0; height: 38px; }
.cmp-qbtns { display: flex; align-items: stretch; gap: 8px; margin-left: auto; }
.cmp-qbtns > button { height: auto; min-width: 110px; }
.cmp-reset { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 16px; border: 1px solid #d5dbe6; border-radius: 8px; background: #fff; color: #4b5563; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.cmp-qbtns > .cmp-reset { min-width: 96px; }
.cmp-reset:disabled { color: #b8bfcc; cursor: default; }
:root[data-theme="dark"] .cmp-reset { background: transparent; border-color: #34405a; color: #b5bfd0; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .cmp-reset { background: transparent; border-color: #34405a; color: #b5bfd0; } }   /* 면적 · 건축 상자와 같은 높이(2026-11-12 사용자) */   /* 면적 · 건축 옆 — 필터초기화 · 저장하기(2026-11-12 사용자, 조회하기는 뺐다). .cmp-acts 는 표 줄 바로가기 단추라 이름을 따로 */
.cmp-save { height: 42px; min-width: 96px; padding: 0 18px; border: 1px solid #d5dbe6; border-radius: 8px; background: #fff; color: #9ca3af; font: inherit; font-size: 14px; font-weight: 700; cursor: default; }   /* 저장하기 — 건물 정보를 다 받으면 파랗게 */
.cmp-save.ready { border-color: #2b6df3; background: #2b6df3; color: #fff; cursor: pointer; }   /* 저장 — 다른 화면 저장 단추와 같은 파랑(초록은 이 단추만 달랐다, 2026-11-12 사용자). 저장됨이면 회색 */
.cmp-save { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.2; }
.cmp-save-day { font-size: 12px; font-weight: 500; opacity: .85; }   /* 저장됨 밑 저장한 날 */
:root[data-theme="dark"] .cmp-save:not(.ready) { background: transparent; border-color: #34405a; color: #6e788c; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .cmp-save:not(.ready) { background: transparent; border-color: #34405a; color: #6e788c; } }
/* 마우스 올림 — 모든 단추가 반응한다(2026-11-12 사용자). 폭 · 높이는 그대로, 바탕 · 테두리 색만 */
.cmp-conds .pa-seg button { transition: background-color .12s, color .12s; }
.cmp-conds .pa-seg.pa-out button:not(.on):hover { background: #e6eaf1; color: #374151; }
.cmp-conds .kindF button:not(.on)[data-k="매매"]:hover { background: #dfe6fb; }
.cmp-conds .kindF button:not(.on)[data-k="전세"]:hover { background: #f9e7c6; }
.cmp-conds .kindF button:not(.on)[data-k="월세"]:hover { background: #dcf0e3; }
.cmp-conds .kindF button.on:hover { filter: brightness(1.08); }
.cmp-reset:not(:disabled):hover { background: #f3f5f9; border-color: #b8c2d3; color: #1f2937; }
.cmp-save.ready:not(:disabled):hover { background: #1f5ad6; border-color: #1f5ad6; }
:root[data-theme="dark"] .cmp-conds .pa-seg.pa-out button:not(.on):hover { background: #2a3449; color: #e5e9f0; }
:root[data-theme="dark"] .cmp-reset:not(:disabled):hover { background: #232c3f; border-color: #4a5672; color: #e5e9f0; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .cmp-conds .pa-seg.pa-out button:not(.on):hover { background: #2a3449; color: #e5e9f0; }
  :root:not([data-theme="light"]) .cmp-reset:not(:disabled):hover { background: #232c3f; border-color: #4a5672; color: #e5e9f0; }
}
.cmp-conds .pa-lab { display: inline-flex; align-items: center; gap: 10px; background: #fff; border: 1px solid #dde3ee; border-radius: 8px; padding: 4px 12px; font-size: 14px; font-weight: 700; color: #6b7280; white-space: nowrap; }
.cmp-conds .pa-seg { display: inline-flex; gap: 4px; background: #f3f5f9; border-radius: 6px; padding: 3px; height: 32px; box-sizing: border-box; align-items: center; }
.cmp-conds .pa-seg button { border: none; background: transparent; border-radius: 5px; height: 26px; padding: 0 13px; font: inherit; font-size: 14px; font-weight: 400; color: #6b7280; cursor: pointer; white-space: nowrap; }
.cmp-conds .pa-seg.pa-out button { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; }
.cmp-conds .pa-seg.pa-out button::after { content: attr(data-t); height: 0; overflow: hidden; visibility: hidden; font-weight: 700; pointer-events: none; }
.cmp-conds .pa-seg.pa-out button.on { background: #fff; color: #2b6df3; font-weight: 700; box-shadow: inset 0 0 0 1px #2b6df3; }
.cmp-conds .kindF button { font-weight: 700; }
.cmp-conds .kindF button { min-width: 84px; }   /* '전세 1,234'까지 들어가게 — 건수 자릿수가 바뀌어도 상자 폭이 그대로(2026-11-12) */
.cmp-conds .kindF button[data-k="매매"] { background: #eef2ff; color: #2b3a67; }
.cmp-conds .kindF button[data-k="전세"] { background: #fdf3e1; color: #b7791f; }
.cmp-conds .kindF button.on[data-k="매매"] { background: #2b3a67; color: #fff; }
.cmp-conds .kindF button.on[data-k="전세"] { background: #b7791f; color: #fff; }
.cmp-conds .kindF button[data-k="월세"] { background: #eef7f1; color: #15803d; }   /* 월세 — 시세분석과 같은 초록 */
.cmp-conds .kindF button.on[data-k="월세"] { background: #16a34a; color: #fff; }
/* ===== 기준 묶음 한 상자(2026-11-12 사용자) — 바깥 테두리 하나, 안쪽 상자들은 테두리 · 바탕을 빼고 세로선으로만 나눈다. 기준을 바꿔도 상자 크기 그대로 ===== */
.sfb .cmp-bars.joined { gap: 0; flex-wrap: nowrap; align-items: stretch; background: #fff; border: 1px solid #dde3ee; border-radius: 8px; overflow: hidden; box-sizing: border-box; }
.sfb .cmp-bars.joined > .cmp-mode, .sfb .cmp-bars.joined > .cmp-sim, .sfb .cmp-bars.joined > :deep(.rib) { border: 0; border-radius: 0; background: transparent; }
.sfb .cmp-bars.joined > * + * { border-left: 1px solid #e3e8f0 !important; }
.sfb:not(.compact) .cmp-bars.joined { height: 66px; }
.sfb:not(.compact) .cmp-bars.joined > .cmp-mode, .sfb:not(.compact) .cmp-bars.joined > .cmp-sim, .sfb:not(.compact) .cmp-bars.joined > :deep(.rib) { height: 64px; }
.sfb.compact .cmp-bars.joined { flex-direction: column; }
.sfb.compact .cmp-bars.joined > * + * { border-left: 0 !important; border-top: 1px solid #e3e8f0 !important; }
:root[data-theme="dark"] .sfb .cmp-bars.joined { background: #182031; border-color: #2a3449; }
:root[data-theme="dark"] .sfb .cmp-bars.joined > * + * { border-left-color: #2a3449 !important; border-top-color: #2a3449 !important; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .sfb .cmp-bars.joined { background: #182031; border-color: #2a3449; }
  :root:not([data-theme="light"]) .sfb .cmp-bars.joined > * + * { border-left-color: #2a3449 !important; border-top-color: #2a3449 !important; }
}
/* 아주 좁은 칸(시세분석 전체화면 340px) — 엘베 · 층도 한 줄씩 */
@container (max-width: 380px) {
  .sfb.compact > .cmp-conds, .sfb.compact > .cmp-bars-row { --lab: 56px; }   /* 이름 칸을 좁혀 단추(100m · 300m · 500m · 1km)가 칸을 넘지 않게 */
  .sfb.compact .cmp-conds .pa-seg button { padding: 0 3px !important; }
  .sfb.compact > .cmp-conds > .pa-lab:has([aria-label="엘베"]), .sfb.compact > .cmp-conds > .pa-lab:has([aria-label="층"]) { grid-column: 1 / -1; display: grid; grid-template-columns: var(--lab) minmax(0, 1fr); gap: 0; padding: 4px 10px; }
  .sfb.compact > .cmp-conds > .pa-lab:has([aria-label="엘베"]) > .pa-seg, .sfb.compact > .cmp-conds > .pa-lab:has([aria-label="층"]) > .pa-seg { display: flex; }
}</style>
