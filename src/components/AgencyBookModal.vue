<script setup lang="ts">
// 중개업체 관리 팝업 — 상담표에서 바로 열어 업체를 더하고 닫는다.
// 화면을 옮기지 않으므로 보던 자리를 잃지 않는다.
import AgencyBookPanel from './AgencyBookPanel.vue';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();
</script>

<template>
  <template v-if="open">
    <div class="abm-veil" @click="emit('close')" />
    <section class="abm-box" @click.stop>
      <header class="abm-head">
        <strong>중개업체 관리</strong>
        <button type="button" class="abm-close" aria-label="닫기" @click="emit('close')">×</button>
      </header>
      <p class="abm-note">여기 적어 둔 업체가 상담표의 상호 목록에 그대로 섭니다. 상호를 고르면 전화번호도 따라 들어갑니다.</p>
      <AgencyBookPanel @saved="emit('close')" />
    </section>
  </template>
</template>

<style scoped>
.abm-veil { position: fixed; inset: 0; z-index: 140; background: rgba(17, 24, 39, 0.35); }
.abm-box {
  position: fixed; z-index: 141; left: 10px; right: 10px; top: 48px;
  max-height: calc(100vh - 96px); overflow-y: auto;
  background: #f5f7fb; border: 1px solid #dde3ee; border-radius: 12px;
  box-shadow: 0 12px 28px rgba(17, 24, 39, 0.18); padding: 10px 12px 14px;
}
.abm-head { display: flex; align-items: center; margin-bottom: 6px; }
.abm-head strong { font-size: 14px; font-weight: 800; color: #111827; }
.abm-close {
  margin-left: auto; border: none; background: transparent; cursor: pointer;
  font-size: 20px; line-height: 1; color: #9ca3af; padding: 0 2px;
}
.abm-note {
  margin: 0 0 8px; padding: 7px 9px; background: #eaf1ff; border-radius: 8px;
  font-size: 11.5px; font-weight: 600; color: #35507f; line-height: 1.5;
}
</style>
