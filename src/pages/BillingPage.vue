<script setup lang="ts">
// 결제하기 — 본문은 components/BillingBody 가 그린다 (더보기의 결제하기 탭과 같은 것).
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import BillingBody from '../components/BillingBody.vue';

const router = useRouter();
</script>

<template>
  <section class="bil-shell">
    <header class="bil-header">
      <button type="button" class="bil-back" aria-label="뒤로" @click="router.back()">‹</button>
      <h1 class="bil-title">결제하기</h1>
      <span class="bil-crumb">마이페이지 › 결제하기</span>
    </header>

    <BillingBody />

    <AppMobileBottomNav active="more" />
  </section>
</template>

<style scoped>
.bil-shell { min-height: 100vh; background: #f4f6fb; padding-bottom: 96px; }
.bil-header { padding: 14px 12px 8px; display: flex; align-items: baseline; gap: 8px; }
.bil-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 2px; align-self: center;
}
.bil-title { margin: 0; font-size: 20px; font-weight: 800; color: #111827; }
.bil-crumb { margin-left: auto; font-size: 11px; color: #9ca3af; }
</style>
