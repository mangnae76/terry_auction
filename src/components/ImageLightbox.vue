<script setup lang="ts">
// 그림 크게 보기 — 글에 딸린 그림을 누르면 화면 가득 띄운다.
defineProps<{ src: string; alt?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();
</script>

<template>
  <div class="lbx" @click.self="emit('close')">
    <button type="button" class="lbx-x" aria-label="닫기" @click="emit('close')">
      <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
        <path d="M1.5 1.5 12.5 12.5M12.5 1.5 1.5 12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
    </button>
    <img :src="src" :alt="alt ?? ''" @click="emit('close')" />
  </div>
</template>

<style scoped>
.lbx {
  position: fixed; inset: 0; z-index: 200; background: rgba(10, 14, 24, .92);
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.lbx img {
  max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 6px; cursor: zoom-out;
}
.lbx-x {
  position: absolute; top: 14px; right: 14px;
  width: 34px; height: 34px; border-radius: 8px; cursor: pointer;
  border: 1px solid rgba(255, 255, 255, .35); background: rgba(255, 255, 255, .12); color: #fff;
  display: inline-flex; align-items: center; justify-content: center; padding: 0; line-height: 0;
}
.lbx-x svg { display: block; }
</style>
