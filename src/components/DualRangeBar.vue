<script setup lang="ts">
// 양끝 슬라이더 한 줄 — 손품조사 시세분석 '직접범위'의 면적 · 건축 막대와 같은 꼴(2026-11-12 사용자 '그대로 갖고 와').
// 왼쪽 이름(아래 평 · 연차 범위), 오른쪽 막대. 막대 위 숫자 셋은 빨간 줄(내 물건) 자리에 고정 — 가운데 내 값(빨강), 왼쪽 최소 · 오른쪽 최대(파랑).
// 동그라미를 움직이면 숫자만 바뀐다. 값은 부모가 들고, 바뀌면 update(lo, hi).
const props = defineProps<{
  label: string;
  min: number;
  max: number;
  lo: number;
  hi: number;
  /** 빨간 줄 — 내 물건 값(없으면 0) */
  base: number;
  step?: number;
  /** 막대 위 숫자 — 최소 · 내 값 · 최대 */
  loText: string;
  baseText: string;
  hiText: string;
  /** 이름 아래 작은 글('15.1~18.5평' · '12~22년차') */
  sub?: string;
  /** 숫자 셋 상자 폭(px) — 자릿수가 다른 면적 · 연도에 맞춘다 */
  tvgW?: number;
}>();
const emit = defineEmits<{ update: [lo: number, hi: number] }>();
const pct = (v: number) => `${Math.min(100, Math.max(0, ((v - props.min) / (props.max - props.min)) * 100))}%`;
const setLo = (el: HTMLInputElement) => { const v = Math.min(Number(el.value), props.hi); el.value = String(v); emit('update', v, props.hi); };
const setHi = (el: HTMLInputElement) => { const v = Math.max(Number(el.value), props.lo); el.value = String(v); emit('update', props.lo, v); };
</script>

<template>
  <div class="dl">
    <span class="dn">{{ label }}<small v-if="sub">{{ sub }}</small></span>
    <div class="dual">
      <div class="track"><i class="fill" :style="{ left: pct(lo), right: `calc(100% - ${pct(hi)})` }" /><i v-if="base" class="base" :style="{ left: pct(base) }" /></div>
      <span v-if="base" class="tvg" :style="{ left: `calc(8px + (100% - 16px) * ${(Math.min(max, Math.max(min, base)) - min) / (max - min)})`, width: `${tvgW ?? 136}px` }"><i>{{ loText }}</i><i class="me">{{ baseText }}</i><i>{{ hiText }}</i></span>
      <input type="range" :min="min" :max="max" :step="step ?? 1" :value="lo" :aria-label="`${label} 최소`" @input="setLo($event.target as HTMLInputElement)">
      <input type="range" :min="min" :max="max" :step="step ?? 1" :value="hi" :aria-label="`${label} 최대`" @input="setHi($event.target as HTMLInputElement)">
    </div>
  </div>
</template>

<style scoped>
/* 시세분석 .simB .dl.one 과 같은 치수 — 왼쪽 64px 이름 · 오른쪽 막대 */
.dl { display: grid; grid-template-columns: 64px minmax(0, 1fr); align-items: center; gap: 0 12px; min-width: 0; }
.dn { display: grid; justify-items: start; gap: 2px; font-size: 14px; font-weight: 800; color: #111827; white-space: nowrap; }
.dn small { font-size: 12px; font-weight: 400; color: #6b7280; }
.dual { position: relative; min-width: 80px; height: 24px; margin-top: 18px; }
.track { position: absolute; left: 8px; right: 8px; top: 50%; height: 4px; transform: translateY(-50%); background: #dde3ee; border-radius: 2px; }
.fill { position: absolute; top: 0; bottom: 0; background: #2b6df3; border-radius: 2px; }
.base { position: absolute; top: -5px; width: 2px; height: 14px; background: #e03e3e; transform: translateX(-1px); }
.tvg { position: absolute; bottom: 22px; transform: translateX(-50%); display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 8px; font-size: 13px; line-height: 1; font-weight: 800; color: #2b6df3; white-space: nowrap; font-variant-numeric: tabular-nums; pointer-events: none; }
.tvg i { font-style: normal; }
.tvg i:first-child { text-align: right; }
.tvg i.me { color: #e03e3e; }
input[type="range"] { position: absolute; inset: 0; width: 100%; margin: 0; background: none; pointer-events: none; -webkit-appearance: none; appearance: none; }
input[type="range"]::-webkit-slider-runnable-track { background: none; }
input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; pointer-events: auto; width: 16px; height: 16px; border-radius: 50%; background: #2b6df3; border: 2px solid #fff; box-shadow: 0 1px 3px rgba(17, 24, 39, .3); cursor: grab; }
input[type="range"]::-moz-range-thumb { pointer-events: auto; width: 14px; height: 14px; border-radius: 50%; background: #2b6df3; border: 2px solid #fff; cursor: grab; }
:root[data-theme="dark"] .dn { color: #e3e8f2; }
:root[data-theme="dark"] .track { background: #34405a; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .dn { color: #e3e8f2; }
  :root:not([data-theme="light"]) .track { background: #34405a; }
}
</style>
