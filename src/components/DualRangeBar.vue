<script setup lang="ts">
// 양끝 슬라이더 한 줄 — 손품조사 시세분석의 면적 · 건축 막대와 같은 꼴(파란 칠 · 빨간 줄 = 내 물건 · 동그라미 둘).
// 매매수요 입지비교 거르기가 쓴다(2026-11-12). 값은 부모가 들고, 바뀌면 update(lo, hi)로 돌려준다.
const props = defineProps<{
  label: string;
  min: number;
  max: number;
  lo: number;
  hi: number;
  /** 빨간 줄 — 내 물건 값(없으면 0) */
  base?: number;
  step?: number;
  /** 오른쪽 값 글('52~58㎡') */
  text: string;
  /** 값 글 아래 작은 글('15.7~17.5평') */
  sub?: string;
}>();
const emit = defineEmits<{ update: [lo: number, hi: number] }>();
const pct = (v: number) => `${Math.min(100, Math.max(0, ((v - props.min) / (props.max - props.min)) * 100))}%`;
const setLo = (el: HTMLInputElement) => { const v = Math.min(Number(el.value), props.hi); el.value = String(v); emit('update', v, props.hi); };
const setHi = (el: HTMLInputElement) => { const v = Math.max(Number(el.value), props.lo); el.value = String(v); emit('update', props.lo, v); };
</script>

<template>
  <span class="drb">
    <span class="dn">{{ label }}</span>
    <span class="dual">
      <span class="track"><i class="fill" :style="{ left: pct(lo), right: `calc(100% - ${pct(hi)})` }" /><i v-if="base" class="base" :style="{ left: pct(base) }" /></span>
      <input type="range" :min="min" :max="max" :step="step ?? 1" :value="lo" :aria-label="`${label} 최소`" @input="setLo($event.target as HTMLInputElement)">
      <input type="range" :min="min" :max="max" :step="step ?? 1" :value="hi" :aria-label="`${label} 최대`" @input="setHi($event.target as HTMLInputElement)">
    </span>
    <b class="v" :data-t="text">{{ text }}<small v-if="sub">{{ sub }}</small></b>
  </span>
</template>

<style scoped>
.drb { display: inline-flex; align-items: center; gap: 10px; background: #fff; border: 1px solid #dde3ee; border-radius: 8px; padding: 4px 12px; height: 42px; box-sizing: border-box; font-size: 14px; font-weight: 700; color: #374151; }
.dn { white-space: nowrap; }
.dual { position: relative; flex: 1 1 auto; min-width: 120px; height: 24px; }   /* 상자 폭을 따라 늘어난다 */
.track { position: absolute; left: 8px; right: 8px; top: 50%; height: 4px; transform: translateY(-50%); background: #dde3ee; border-radius: 2px; }
.fill { position: absolute; top: 0; bottom: 0; background: #2b6df3; border-radius: 2px; }
.base { position: absolute; top: -5px; width: 2px; height: 14px; background: #e03e3e; transform: translateX(-1px); }
input[type="range"] { position: absolute; inset: 0; width: 100%; margin: 0; background: none; pointer-events: none; -webkit-appearance: none; appearance: none; }
input[type="range"]::-webkit-slider-runnable-track { background: none; }
input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; pointer-events: auto; width: 16px; height: 16px; border-radius: 50%; background: #2b6df3; border: 2px solid #fff; box-shadow: 0 1px 3px rgba(17, 24, 39, .3); cursor: grab; }
input[type="range"]::-moz-range-thumb { pointer-events: auto; width: 14px; height: 14px; border-radius: 50%; background: #2b6df3; border: 2px solid #fff; cursor: grab; }
/* 값 글 — 폭을 넉넉히 잡아 숫자가 바뀌어도 상자가 흔들리지 않게 */
.v { display: inline-flex; flex-direction: column; align-items: flex-end; min-width: 92px; font-size: 13px; line-height: 1.15; color: #2b6df3; font-variant-numeric: tabular-nums; white-space: nowrap; }
.v small { font-size: 12px; font-weight: 400; color: #6b7280; }
:root[data-theme="dark"] .drb { background: #182031; border-color: #2a3449; color: #cfd6e2; }
:root[data-theme="dark"] .track { background: #34405a; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .drb { background: #182031; border-color: #2a3449; color: #cfd6e2; }
  :root:not([data-theme="light"]) .track { background: #34405a; }
}
</style>
