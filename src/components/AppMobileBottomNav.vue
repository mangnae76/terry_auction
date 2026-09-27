<script setup lang="ts">
import { useRouter } from 'vue-router';
import starIcon from '../assets/icones/memu/star_Main.png';
import pinIcon from '../assets/icones/memu/map-pinned_Main.png';
import banknoteIcon from '../assets/icones/memu/banknote_main.png';
import buildingIcon from '../assets/icones/memu/building_Main.png';

defineProps<{
  active: 'watchlist' | 'field-trip' | 'finance' | 'culture';
}>();

const router = useRouter();
</script>

<template>
  <nav class="amb">
    <button type="button" :class="['amb-item', { active: active === 'watchlist' }]" @click="router.push('/auctions/watchlist')">
      <img :src="starIcon" alt="" class="amb-icon" />
      <span>선정물건</span>
    </button>
    <button type="button" :class="['amb-item', { active: active === 'field-trip' }]" @click="router.push('/field-trip')">
      <img :src="pinIcon" alt="" class="amb-icon" />
      <span>임장경로</span>
    </button>
    <button type="button" :class="['amb-item', { active: active === 'finance' }]" @click="router.push('/finance')">
      <img :src="banknoteIcon" alt="" class="amb-icon" />
      <span>자금관리</span>
    </button>
    <button type="button" :class="['amb-item', { active: active === 'culture' }]" @click="router.push('/trade-stats')">
      <img :src="buildingIcon" alt="" class="amb-icon" />
      <span>부동산현황</span>
    </button>
  </nav>
</template>

<style scoped>
.amb {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  background: #fff;
  border-top: 1px solid #eef0f5;
  padding: 6px 0 max(6px, env(safe-area-inset-bottom));
  z-index: 200;
}
@media (min-width: 768px) {
  .amb { max-width: 480px; left: 50%; right: auto; transform: translateX(-50%); }
}
.amb-item {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 3px; border: none; background: transparent;
  font-size: 11px; color: #6b7280; cursor: pointer; padding: 4px 0;
}
.amb-icon { width: 22px; height: 22px; object-fit: contain; display: block; }
.amb-item.active { color: #111827; font-weight: 800; }
</style>
