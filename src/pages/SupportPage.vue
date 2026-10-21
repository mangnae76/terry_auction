<script setup lang="ts">
// 고객센터 — 본문은 components/SupportBody 가 그린다 (더보기의 고객센터 탭과 같은 것).
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import SupportBody from '../components/SupportBody.vue';

const router = useRouter();
</script>

<template>
  <section class="sup-shell">
    <header class="sup-header">
      <button type="button" class="sup-back" aria-label="뒤로" @click="router.back()"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg></button>
      <h1 class="sup-title">고객센터</h1>
      <span class="sup-crumb">더보기 › 고객센터</span>
    </header>

    <SupportBody />

    <AppMobileBottomNav active="more" />
  </section>
</template>

<style scoped>
.sup-shell { min-height: 100vh; background: #f4f6fb; padding-bottom: 96px; }
.sup-header { padding: 14px 12px 8px; display: flex; align-items: baseline; gap: 8px; border-bottom: 1px solid #e5e7eb; }
.sup-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 2px; align-self: center;
}
.sup-title { margin: 0; font-size: 20px; font-weight: 800; color: #111827; }
.sup-crumb { margin-left: auto; font-size: 11px; color: #9ca3af; }
</style>
