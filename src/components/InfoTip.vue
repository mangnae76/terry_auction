<script setup lang="ts">
// 이름 옆 ⓘ — 이름 글자까지 포함해 마우스를 올리거나 누르면 말풍선.
// 웹 툴팁 공통 규칙: 앱 매매수요 말풍선(adp-dm-bubble)과 같은 꼴 — 왼쪽 이름표(공식 · 의미 · 기준 · 적정 …) + 오른쪽 내용, 한 줄에 하나.
// 글씨는 굵게 하지 않는다(작은 글씨에 굵기를 주면 오히려 안 읽힌다). '적정' 줄은 초록.
import { ref } from 'vue';
import type { TipRow } from '../services/tipRows';

defineProps<{ rows: TipRow[] }>();
const open = ref(false);
</script>

<template>
  <span class="itip" @mouseenter="open = true" @mouseleave="open = false" @click.stop="open = !open">
    <slot />
    <svg class="itip-i" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-label="설명"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" /></svg>
    <span v-if="open" class="itip-bubble" role="tooltip">
      <template v-for="(r, i) in rows" :key="i"><em :class="{ good: r[0] === '적정' }">{{ r[0] }}</em><span :class="{ good: r[0] === '적정' }">{{ r[1] }}</span></template>
    </span>
  </span>
</template>

<style scoped>
.itip { position: relative; display: inline-flex; align-items: center; gap: 3px; cursor: help; }
.itip-i { color: #9ca3af; flex: 0 0 auto; }
.itip:hover .itip-i { color: #2b6df3; }
.itip-bubble {
  position: absolute; z-index: 30; left: 50%; top: calc(100% + 8px); transform: translateX(-50%);
  display: grid; grid-template-columns: max-content max-content; column-gap: 8px; row-gap: 3px; padding: 9px 12px;
  background: rgba(17, 24, 39, 0.92); color: #fff; border-radius: 10px; box-shadow: 0 8px 20px rgba(15, 23, 42, .25);
  font-size: 13px; font-weight: 400; line-height: 1.5; text-align: left; white-space: nowrap;
}
.itip-bubble::before {
  content: ''; position: absolute; top: -5px; left: 50%; transform: translateX(-50%);
  border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 6px solid rgba(17, 24, 39, 0.92);
}
.itip-bubble em { font-style: normal; font-weight: 400; color: #9db9ef; }
.itip-bubble .good { color: #86efac; }
.itip-bubble em.good { color: #4ade80; }
</style>
