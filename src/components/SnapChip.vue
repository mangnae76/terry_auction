<script setup lang="ts">
// 저장 칩 — useScreenSnapshot 의 chip 을 그린다. 방금 받아 저장(초록) · 저장해 둔 자료(파랑) · 저장 못 함(빨강)
defineProps<{ chip: { tone: string; text: string } | null }>();
</script>

<template>
  <span v-if="chip" :class="['snap-chip', chip.tone]">{{ chip.text }}</span>
</template>

<style scoped>
.snap-chip { display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 999px; font-size: 13px; font-weight: 700; white-space: nowrap; }
.snap-chip.ok { background: #e8f7f1; color: #0f9d7a; }
.snap-chip.saved { background: #eaf1ff; color: #2b6df3; }
.snap-chip.fail { background: #fdecec; color: #d64545; }
</style>
