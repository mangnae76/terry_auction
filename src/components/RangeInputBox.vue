<script setup lang="ts">
import { clampAroundBase } from '../services/rangeClamp';
// 범위 적는 상자 하나 — 면적 · 건축(2026-11-12 사용자: 막대를 빼고 반경 · 기간 상자와 같은 꼴로).
// [이름 / 아래 작은 글]  [최소] 내 값(빨강) [최대]. 최소 · 최대는 적는 칸, 가운데 빨간 값은 기준(내 물건).
// 손품조사 시세분석 · 매매수요 입지비교가 같이 쓴다. 범위 규칙은 services/rangeClamp 한 곳 — 내 값을 넘지 못하고, 칸을 벗어나면 끝 값으로.
const props = defineProps<{
  label: string;
  /** 이름 아래 작은 글('15.7~17.8평' · '1~47년차') */
  sub?: string;
  min: number;
  max: number;
  lo: number;
  hi: number;
  /** 기준 — 내 물건 값(없으면 0, 막지 않는다) */
  base: number;
  loText: string;
  baseText: string;
  hiText: string;
}>();
const emit = defineEmits<{ update: [lo: number, hi: number] }>();
const typeIn = (el: HTMLInputElement, moved: 'lo' | 'hi') => {
  const raw = String(el.value).replace(/[^\d.]/g, '');
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) { el.value = moved === 'lo' ? props.loText : props.hiText; return; }
  const v = Math.min(props.max, Math.max(props.min, n));
  const [a, b] = clampAroundBase(moved === 'lo' ? v : props.lo, moved === 'hi' ? v : props.hi, props.base, moved);
  emit('update', a, b);
  el.value = moved === 'lo' ? String(a) : String(b);
};
</script>

<template>
  <span class="rib">
    <span class="dn">{{ label }}<small v-if="sub">{{ sub }}</small></span>
    <span class="vals">
      <input class="in" :value="loText" inputmode="decimal" :aria-label="`${label} 최소`" @change="typeIn($event.target as HTMLInputElement, 'lo')" @keydown.enter="($event.target as HTMLInputElement).blur()">
      <i v-if="base" class="me" :title="`기준 — 내 물건 ${baseText}`">{{ baseText }}</i>
      <input class="in" :value="hiText" inputmode="decimal" :aria-label="`${label} 최대`" @change="typeIn($event.target as HTMLInputElement, 'hi')" @keydown.enter="($event.target as HTMLInputElement).blur()">
    </span>
  </span>
</template>

<style scoped>
/* 반경 · 기간 상자(.pa-lab)와 같은 틀 — 흰 바탕 · 테두리 · 둥근 8px */
.rib { display: inline-flex; align-items: center; justify-content: space-between; gap: 12px; height: 42px; box-sizing: border-box; padding: 4px 10px 4px 12px; background: #fff; border: 1px solid #dde3ee; border-radius: 8px; }
.dn { display: grid; gap: 1px; font-size: 14px; font-weight: 700; line-height: 1.15; color: #6b7280; white-space: nowrap; }
.dn small { font-size: 12px; font-weight: 400; color: #6b7280; }
.vals { display: inline-flex; align-items: center; gap: 8px; background: #f3f5f9; border-radius: 6px; padding: 3px; }
.me { font-style: normal; font-size: 14px; font-weight: 800; color: #e03e3e; font-variant-numeric: tabular-nums; padding: 0 2px; }
/* 적는 칸 — 웹 .app-detail 입력칸 16px !important 를 이긴다(선택자를 좁게) */
.rib .vals input.in.in { width: 64px; height: 26px !important; min-height: 0 !important; padding: 0 6px !important; box-sizing: border-box; border: 1px solid #2b6df3; border-radius: 5px; background: #fff; text-align: center; font-family: inherit; font-size: 14px !important; font-weight: 700; color: #2b6df3; font-variant-numeric: tabular-nums; box-shadow: none !important; }
.rib .vals input.in.in:focus { outline: none; box-shadow: 0 0 0 2px rgba(43, 109, 243, .2) !important; }
:root[data-theme="dark"] .rib { background: #182031; border-color: #2a3449; }
:root[data-theme="dark"] .dn { color: #9aa3b5; }
:root[data-theme="dark"] .vals { background: #1d2638; }
:root[data-theme="dark"] .rib .vals input.in.in { background: #182031; color: #8fb0ff; border-color: #5b8cff; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .rib { background: #182031; border-color: #2a3449; }
  :root:not([data-theme="light"]) .dn { color: #9aa3b5; }
  :root:not([data-theme="light"]) .vals { background: #1d2638; }
  :root:not([data-theme="light"]) .rib .vals input.in.in { background: #182031; color: #8fb0ff; border-color: #5b8cff; }
}
</style>
