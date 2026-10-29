<script setup lang="ts">
// 이름 옆 ⓘ — 이름 글자까지 포함해 마우스를 올리거나 누르면 말풍선.
// 웹 툴팁 공통 규칙: 앱 매매수요 말풍선(adp-dm-bubble)과 같은 꼴 — 왼쪽 이름표(공식 · 의미 · 기준 · 적정 …) + 오른쪽 내용, 한 줄에 하나.
// 글씨는 굵게 하지 않는다(작은 글씨에 굵기를 주면 오히려 안 읽힌다). '적정' 줄은 초록.
import { computed, ref } from 'vue';
import type { TipRow } from '../services/tipRows';

/** show — 감싼 칸이 열고 닫을 때(칸 전체에 마우스를 대면 뜨게). 안 주면 ⓘ 와 이름에 댈 때만 */
/** align='end' — 화면 오른쪽 끝 칸은 말풍선을 왼쪽으로 펼친다(가운데로 펼치면 화면 밖으로 잘렸다) */
/** under='box' — 말풍선을 ⓘ 밑이 아니라 감싼 칸(가장 가까운 position 이 있는 상자) 아래 밖에 띄운다. 칸 안 숫자를 가리지 않는다(손품조사 말풍선과 같은 자리) */
const props = defineProps<{ rows: TipRow[]; show?: boolean; align?: 'end'; under?: 'box' }>();
const hover = ref(false);
const open = computed(() => (props.show === undefined ? hover.value : props.show || hover.value));
</script>

<template>
  <span :class="['itip', { box: under === 'box' }]" @mouseenter="hover = true" @mouseleave="hover = false" @click.stop="hover = !hover">
    <slot />
    <svg class="itip-i" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-label="설명"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" /></svg>
    <span v-if="open" :class="['itip-bubble', { end: align === 'end' }]" role="tooltip">
      <template v-for="(r, i) in rows" :key="i"><em :class="{ good: r[0] === '적정' }">{{ r[0] }}</em><span :class="{ good: r[0] === '적정' }">{{ r[1] }}</span></template>
    </span>
  </span>
</template>

<style scoped>
.itip { position: relative; display: inline-flex; align-items: center; gap: 3px; cursor: help; }
.itip-i { color: #9ca3af; flex: 0 0 auto; }
.itip.box { position: static; }
.itip.box .itip-bubble { top: calc(100% + 8px); }
.itip.box .itip-bubble.end { right: 0; }
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
.itip-bubble.end { left: auto; right: -12px; transform: none; }
.itip-bubble.end::before { left: auto; right: 12px; transform: none; }
.itip-bubble em { font-style: normal; font-weight: 400; color: #9db9ef; }
.itip-bubble .good { color: #86efac; }
.itip-bubble em.good { color: #4ade80; }
</style>
