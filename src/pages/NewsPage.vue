<script setup lang="ts">
// 공지 — 머리글의 확성기로 들어온다. 예전 더보기 › 공지 탭 내용(NewsBody)을 그대로 한 화면에 띄운다.
// '?sec=event' 로 들어오면 그 묶음으로 내려간다.
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import NewsBody from '../components/NewsBody.vue';

const router = useRouter();
const route = useRoute();

onMounted(() => {
  const sec = String(route.query.sec ?? '');
  if (!sec) return;
  window.setTimeout(() => {
    document.querySelector(`[data-sec="${sec}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
});
</script>

<template>
  <section class="nws-shell">
    <header class="nws-header">
      <button type="button" class="nws-back" aria-label="뒤로" @click="router.back()"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg></button>
      <h1 class="nws-title">공지</h1>
    </header>
    <div class="nws-body">
      <NewsBody />
    </div>
    <AppMobileBottomNav active="more" />
  </section>
</template>

<style scoped>
.nws-shell { min-height: 100vh; background: #f4f6fb; padding-bottom: 96px; }
.nws-header { padding: 14px 12px 8px; display: flex; align-items: baseline; gap: 8px; }
.nws-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 2px; align-self: center;
}
.nws-title { margin: 0; font-size: 20px; font-weight: 800; color: #111827; }
.nws-body { padding: 0 14px; }
</style>
