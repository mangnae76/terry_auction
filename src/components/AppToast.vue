<script setup lang="ts">
// 앱 공통 토스트 — 복사·저장 같은 짧은 알림은 화면마다 다르게 그리지 않고 이 한 가지 모양을 쓴다.
// (임장경로에서 쓰던 생김새를 그대로 규격으로 삼았다)
withDefaults(
  defineProps<{
    visible: boolean;
    text: string;
    tone?: 'info' | 'success' | 'error';
  }>(),
  { tone: 'info' },
);
</script>

<template>
  <transition name="app-toast-anim">
    <div v-if="visible" :class="['app-toast', `app-toast-${tone}`]" role="status">
      <span class="app-toast-dot" />
      <span class="app-toast-text">{{ text }}</span>
    </div>
  </transition>
</template>

<style scoped>
.app-toast {
  position: fixed; left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  background: rgba(17, 24, 39, 0.92); color: #fff;
  padding: 12px 14px; border-radius: 14px;
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 700;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.35);
  z-index: 9999; max-width: 94vw; min-width: 200px;
  justify-content: center; text-align: center;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.app-toast-text { white-space: pre-wrap; word-break: keep-all; }
.app-toast-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  background: #60a5fa;
}
.app-toast-success .app-toast-dot { background: #34d399; }
.app-toast-error .app-toast-dot { background: #f87171; }

.app-toast-anim-enter-active, .app-toast-anim-leave-active {
  transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.app-toast-anim-enter-from {
  opacity: 0; transform: translate(-50%, calc(-50% + 8px)) scale(0.96);
}
.app-toast-anim-leave-to {
  opacity: 0; transform: translate(-50%, calc(-50% - 4px)) scale(0.98);
}
</style>
