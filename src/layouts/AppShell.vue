<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { RouterView } from 'vue-router';
import SiteNotice from '../components/SiteNotice.vue';
import { useAuctionStore } from '../stores/auctionStore';

const auctionStore = useAuctionStore();

onMounted(() => {
  auctionStore.initializeStorage();
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
