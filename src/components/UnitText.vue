<script setup lang="ts">
// 값 글 속 단위(억 · 만 · 원 · % · 년차 · 개월 · ㎡ · 평 …)만 작게 · 회색으로 — 웹 요약 상자 공통 규칙.
// 크기 · 색은 YmCount 의 '연 · 월'(12px · 700 · #6b7280)과 같다. 숫자는 감싼 칸의 글자를 따른다.
// 웹(webEmbed)에서만 나눠 그린다 — 앱은 지금 모양 그대로 글 한 줄.
import { computed, inject } from 'vue';

const props = defineProps<{ text: string; suffix?: string }>();
const web = inject<boolean>('webEmbed', false);

const UNIT = /(\s\/\s|\/|년차|개월|억|만|원|%|㎡|평|건|년)/;
const parts = computed(() => {
  const empty = !props.text || props.text === '-' || props.text === '—';
  const full = web && props.suffix && !empty ? `${props.text}${props.suffix}` : props.text;
  // ' / ' (띄운 빗금)은 두 값을 가르는 막대, 붙은 '/'(만/㎡)는 단위의 일부
  return full.split(UNIT).filter(Boolean).map((t) => ({
    t,
    kind: t !== '/' && t.trim() === '/' ? 'sep' : UNIT.test(t) ? 'unit' : 'num',
  }));
});
</script>

<template>
  <span v-if="web" class="ut"><template v-for="(p, i) in parts" :key="i"><em v-if="p.kind === 'unit'" class="u">{{ p.t }}</em><em v-else-if="p.kind === 'sep'" class="sep">/</em><template v-else>{{ p.t }}</template></template></span>
  <template v-else>{{ text }}</template>
</template>

<style scoped>
.ut { white-space: nowrap; }
.u { font-style: normal; font-size: 12px; font-weight: 700; color: #6b7280; margin-left: 2px; }
.sep { font-style: normal; font-weight: 400; color: #c3c9d4; margin: 0 6px; }
</style>
