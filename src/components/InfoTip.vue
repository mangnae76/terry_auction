<script setup lang="ts">
// 이름 옆 ⓘ — 이름 글자까지 포함해 마우스를 올리거나 누르면 설명 말풍선. 이름은 슬롯으로, lines 는 한 줄씩
import { ref } from 'vue';
defineProps<{ lines: string[] }>();
const open = ref(false);
</script>

<template>
  <span class="itip" @mouseenter="open = true" @mouseleave="open = false" @click.stop="open = !open">
    <slot />
    <svg class="itip-i" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-label="설명"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.6" /></svg>
    <span v-if="open" class="itip-bubble" role="tooltip"><span v-for="(l, i) in lines" :key="i">{{ l }}</span></span>
  </span>
</template>

<style scoped>
.itip { position: relative; display: inline-flex; align-items: center; gap: 3px; cursor: help; }
.itip-i { color: #9ca3af; flex: 0 0 auto; }
.itip:hover .itip-i { color: #2b6df3; }
.itip-bubble {
  position: absolute; z-index: 30; left: 50%; top: calc(100% + 8px); transform: translateX(-50%);
  display: flex; flex-direction: column; gap: 3px; min-width: 220px; padding: 10px 12px;
  background: #1f2937; color: #f9fafb; border-radius: 8px; box-shadow: 0 8px 20px rgba(15, 23, 42, .25);
  font-size: 13px; font-weight: 500; line-height: 1.45; text-align: left; white-space: nowrap;
}
</style>
