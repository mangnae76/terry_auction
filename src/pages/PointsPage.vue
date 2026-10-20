<script setup lang="ts">
// 포인트 안내 — 고객센터·더보기에서 들어온다. 글은 services/pointPolicy 에 있고
// 본문은 components/PointsBody 가 그린다 (더보기의 포인트 탭과 같은 것).
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import PointsBody from '../components/PointsBody.vue';

const router = useRouter();
const route = useRoute();

// '?tab=grade' 처럼 들어오면 그 묶음으로 내려간다
onMounted(() => {
  const sec = String(route.query.tab ?? '');
  if (!sec) return;
  window.setTimeout(() => {
    document.querySelector(`[data-sec="${sec}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
});
</script>

<template>
  <section class="pt-shell">
    <header class="pt-header">
      <button type="button" class="pt-back" aria-label="뒤로" @click="router.back()">‹</button>
      <h1 class="pt-title">포인트 안내</h1>
      <span class="pt-crumb">더보기 › 포인트</span>
    </header>

    <PointsBody />

    <AppMobileBottomNav active="more" />
  </section>
</template>

<style scoped>
.pt-shell { min-height: 100vh; background: #f4f6fb; padding-bottom: 96px; }
.pt-header { padding: 14px 12px 8px; display: flex; align-items: baseline; gap: 8px; }
.pt-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 2px; align-self: center;
}
.pt-title { margin: 0; font-size: 20px; font-weight: 800; color: #111827; }
.pt-crumb { margin-left: auto; font-size: 11px; color: #9ca3af; }
</style>
