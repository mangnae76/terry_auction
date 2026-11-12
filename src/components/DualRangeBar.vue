<script setup lang="ts">
import { clampAroundBase } from '../services/rangeClamp';
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
// 범위 규칙은 services/rangeClamp 한 곳 — 내 값(빨간 줄)을 넘지 못하고, 끝까지 밀면 정확히 내 값에서 멈춘다
const set = (el: HTMLInputElement, moved: 'lo' | 'hi') => {
  const v = Number(el.value);
  const [a, b] = clampAroundBase(moved === 'lo' ? v : props.lo, moved === 'hi' ? v : props.hi, props.base, moved);
  const now = moved === 'lo' ? a : b;
  if (String(now) !== el.value) el.value = String(now);   // 막힌 자리로 동그라미도 되돌린다
  emit('update', a, b);
};
/** 위 숫자 칸에 직접 적기(2026-11-12 사용자) — 칸을 벗어나면 막대 끝으로, 범위 규칙은 막대와 같다. 숫자가 아니면 원래 값으로 */
const typeIn = (el: HTMLInputElement, moved: 'lo' | 'hi') => {
  const n = Number(String(el.value).replace(/[^\d.]/g, ''));
  if (!String(el.value).trim() || !Number.isFinite(n)) { el.value = moved === 'lo' ? props.loText : props.hiText; return; }
  const v = Math.min(props.max, Math.max(props.min, n));
  const [a, b] = clampAroundBase(moved === 'lo' ? v : props.lo, moved === 'hi' ? v : props.hi, props.base, moved);
  emit('update', a, b);
  el.value = String(moved === 'lo' ? a : b);
};
const setLo = (el: HTMLInputElement) => set(el, 'lo');
const setHi = (el: HTMLInputElement) => set(el, 'hi');
</script>

<template>
  <div class="dl">
    <span class="dn">{{ label }}<small v-if="sub">{{ sub }}</small></span>
    <div class="dual">
      <div class="track"><i class="fill" :style="{ left: pct(lo), right: `calc(100% - ${pct(hi)})` }" /><i v-if="base" class="base" :style="{ left: pct(base) }" /></div>
      <span v-if="base" class="tvg" :style="{ left: `calc(8px + (100% - 16px) * ${(Math.min(max, Math.max(min, base)) - min) / (max - min)})`, width: `${tvgW ?? 136}px` }"><input class="tv-in lo" :value="loText" inputmode="decimal" :aria-label="`${label} 최소 적기`" @change="typeIn($event.target as HTMLInputElement, 'lo')" @keydown.enter="($event.target as HTMLInputElement).blur()"><i class="me">{{ baseText }}</i><input class="tv-in hi" :value="hiText" inputmode="decimal" :aria-label="`${label} 최대 적기`" @change="typeIn($event.target as HTMLInputElement, 'hi')" @keydown.enter="($event.target as HTMLInputElement).blur()"></span>
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
.dual { position: relative; min-width: 80px; height: 42px; }   /* 숫자 줄(위 16px) + 막대(아래 26px) 한 덩어리 — 왼쪽 이름과 세로 가운데로 맞춘다(2026-11-12 사용자) */
.track { position: absolute; left: 8px; right: 8px; top: 29px; height: 4px; transform: translateY(-50%); background: #dde3ee; border-radius: 2px; }
.fill { position: absolute; top: 0; bottom: 0; background: #2b6df3; border-radius: 2px; }
.base { position: absolute; top: -5px; width: 2px; height: 14px; background: #e03e3e; transform: translateX(-1px); }
.tvg { position: absolute; top: 0; transform: translateX(-50%); display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 8px; font-size: 13px; line-height: 1; font-weight: 800; color: #2b6df3; white-space: nowrap; font-variant-numeric: tabular-nums; pointer-events: none; }
.tvg i { font-style: normal; }
.tvg i:first-child { text-align: right; }
.tvg i.me { color: #e03e3e; line-height: 18px; }   /* 양옆 적는 칸(18px)과 같은 줄에 */
/* 위 최소 · 최대 숫자는 적는 칸 — 평소엔 글자처럼, 대면 밑줄 · 누르면 테두리(2026-11-12 사용자) */
.tv-in { width: 100%; min-width: 0; height: 18px; padding: 0 2px; border: 0; border-bottom: 1px dashed #9db8f5; border-radius: 0; background: transparent; font-family: inherit; font-size: 13px !important; font-weight: 800; line-height: 18px; color: #2b6df3; box-shadow: none !important; pointer-events: auto; font-variant-numeric: tabular-nums; }
.tv-in.lo { text-align: right; } .tv-in.hi { text-align: left; }
/* 웹 .app-detail 입력칸 16px !important 를 이긴다(선택자를 더 좁게) — 숫자는 빨간 값과 같은 13px */
.dl .tvg input.tv-in.lo, .dl .tvg input.tv-in.hi { font-size: 13px !important; height: 18px !important; min-height: 0 !important; padding: 0 2px !important; }
.tv-in:hover { border-bottom-style: solid; }
.tv-in:focus { outline: none; border: 1px solid #2b6df3; border-radius: 4px; background: #fff; }
:root[data-theme="dark"] .tv-in:focus { background: #182031; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .tv-in:focus { background: #182031; } }
input[type="range"] { position: absolute; left: 0; right: 0; top: 17px; height: 24px; width: 100%; margin: 0; background: none; pointer-events: none; -webkit-appearance: none; appearance: none; }
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
