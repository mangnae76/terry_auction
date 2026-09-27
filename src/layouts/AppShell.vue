<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { RouterView } from 'vue-router';
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
  </div>
</template>
