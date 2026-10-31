<script setup lang="ts">
// 골라 지우기 줄 — 선정물건 목록의 '선택' 줄과 같은 꼴(N건 골랐습니다 · 전체선택 · 삭제 · 닫기).
// 표마다 따로 만들지 않고 이것 하나를 붙인다(필요경비 · 사업경비 · 자금입출금)
defineProps<{ n: number; all: boolean; note?: string }>();
const emit = defineEmits<{ (e: 'all'): void; (e: 'delete'): void; (e: 'close'): void }>();
</script>

<template>
  <div class="pkb">
    <span class="msg"><b>{{ n.toLocaleString('ko-KR') }}</b>건 골랐습니다<small v-if="note">{{ note }}</small></span>
    <button type="button" @click="emit('all')">{{ all ? '전체해제' : '전체선택' }}</button>
    <button type="button" class="purge" :disabled="!n" @click="emit('delete')">삭제{{ n ? ` (${n.toLocaleString('ko-KR')})` : '' }}</button>
    <button type="button" @click="emit('close')">닫기</button>
  </div>
</template>

<style scoped>
.pkb { display: flex; gap: 6px; align-items: center; margin: 0 0 10px; padding: 7px 8px; border: 1px solid #dfe5ee; border-radius: 8px; background: #fff; }
.pkb .msg { margin: 0 auto 0 6px; font-size: 14px; font-weight: 600; color: #374151; }
.pkb .msg b { color: #2b6df3; }
.pkb .msg small { margin-left: 12px; font-size: 13px; font-weight: 400; color: #6b7280; }
.pkb button { min-width: 84px; height: 30px; padding: 0 12px; border-radius: 6px; border: 1px solid #dfe5ee; background: #fff; font-size: 14px; font-weight: 700; color: #4b5563; cursor: pointer; }
.pkb button:hover:not(:disabled) { border-color: #b8c1d1; color: #111827; }
.pkb button.purge { border-color: #f1c4c4; color: #c24f4f; }
.pkb button.purge:hover:not(:disabled) { background: rgba(209, 67, 67, .06); }
.pkb button:disabled { opacity: .45; cursor: not-allowed; }
</style>
