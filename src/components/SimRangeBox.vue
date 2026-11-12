<script setup lang="ts">
import { SIM_STEPS } from '../services/priceAnalysis';
// 유사도 막대 한 줄 — '유사도 기준 80%' · '면적 ±10% · 건축 ±5년' · 60~95% 막대 · 눈금.
// 손품조사 시세분석 · 매매수요 입지비교가 같이 쓴다(2026-11-12 사용자 — 기준 상자 '유사도 · 직접범위').
defineProps<{ sim: number; text: string }>();
const emit = defineEmits<{ update: [sim: number] }>();
</script>

<template>
  <div class="simA">
    <span class="simlab"><span>유사도 기준 <b>{{ sim }}%</b></span><span>{{ text }}</span></span>
    <input type="range" min="60" max="95" step="5" :value="sim" aria-label="유사도 기준" @input="emit('update', Number(($event.target as HTMLInputElement).value))">
    <div class="ticks" aria-hidden="true"><span v-for="s in SIM_STEPS" :key="s">{{ s }}%</span></div>
  </div>
</template>

<style scoped>
.simA { display: grid; grid-template-columns: minmax(0, 1fr); align-content: center; gap: 1px; min-width: 0; }
.simlab { display: flex; gap: 10px; align-items: baseline; font-size: 12.5px; line-height: 1.2; color: #111827; white-space: nowrap; overflow: hidden; }
.simlab b { color: #2b6df3; }
.simlab span + span { color: #6b7280; font-size: 12px; }
input[type="range"] { width: 100%; height: 14px; margin: 0; accent-color: #2b6df3; }
.ticks { display: flex; justify-content: space-between; font-size: 10px; line-height: 1; color: #9ca3af; padding: 0 2px; transform: translateY(2px); }
:root[data-theme="dark"] .simlab { color: #e3e8f2; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .simlab { color: #e3e8f2; } }
</style>
