<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { RouterView } from 'vue-router';
import SiteNotice from '../components/SiteNotice.vue';
import { startContentSync } from '../services/contentRepository';
import { useAuctionStore } from '../stores/auctionStore';

const auctionStore = useAuctionStore();

onMounted(() => {
  auctionStore.initializeStorage();
  startContentSync();   // FAQ · 약관(운영 › FAQ 관리 · 약관 관리) DB 판
});

onUnmounted(() => {
  auctionStore.disposeStorage();
});
</script>

<template>
  <div class="app-shell">
    <main class="page-content page-content-fullscreen">
      <RouterView />
    </main>
    <!-- 점검 화면 · 시작 팝업(운영 › 점검 모드 · 앱 시작 팝업) -->
    <SiteNotice />
  </div>
</template>
