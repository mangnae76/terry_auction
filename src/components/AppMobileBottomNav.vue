<script setup lang="ts">
import { useRouter } from 'vue-router';
import starIcon from '../assets/icones/memu/star_Main.png';
import pinIcon from '../assets/icones/memu/map-pinned_Main.png';
import banknoteIcon from '../assets/icones/memu/banknote_main.png';
import calendarIcon from '../assets/icones/calendar-days (1).png';

defineProps<{
  active: 'watchlist' | 'field-trip' | 'finance' | 'calendar' | 'more';
}>();

const router = useRouter();
</script>

<template>
  <nav class="amb">
    <button type="button" :class="['amb-item', { active: active === 'watchlist' }]" @click="router.push('/auctions/watchlist')">
      <span class="amb-icon amb-mask" :style="{ '--i': `url(${starIcon})` }" />
      <span>선정물건</span>
    </button>
    <button type="button" :class="['amb-item', { active: active === 'field-trip' }]" @click="router.push('/field-trip')">
      <span class="amb-icon amb-mask" :style="{ '--i': `url(${pinIcon})` }" />
      <span>임장경로</span>
    </button>
    <!-- 시장정보는 분석 도구로 옮겼다 — 그 자리에는 입찰 캘린더를 둔다 -->
    <button type="button" :class="['amb-item', { active: active === 'calendar' }]" @click="router.push('/bid-calendar')">
      <span class="amb-icon amb-mask" :style="{ '--i': `url(${calendarIcon})` }" />
      <span>캘린더</span>
    </button>
    <button type="button" :class="['amb-item', { active: active === 'finance' }]" @click="router.push('/finance')">
      <span class="amb-icon amb-mask" :style="{ '--i': `url(${banknoteIcon})` }" />
      <span>자금관리</span>
    </button>
    <button type="button" :class="['amb-item', { active: active === 'more' }]" @click="router.push('/more')">
      <svg class="amb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round">
        <rect x="2.5" y="8.5" width="7" height="7" rx="1.6" />
        <rect x="14.5" y="8.5" width="7" height="7" rx="1.6" />
        <rect x="8.5" y="2.5" width="7" height="7" rx="1.6" />
      </svg>
      <span>더보기</span>
    </button>
  </nav>

</template>

<style scoped>
.amb {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  display: grid;
  /* 메뉴 수에 맞춰 고르게 나눈다 — 세금관리가 빠져 다섯 칸이다 */
  grid-template-columns: repeat(5, minmax(0, 1fr));
  background: #fff;
  border-top: 1px solid #eef0f5;
  padding: 6px 0 max(6px, env(safe-area-inset-bottom));
  z-index: 200;
}
.amb-item {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 3px; border: none; background: transparent;
  font-size: 11.3px; font-weight: 500; color: #6b7280; cursor: pointer; padding: 4px 0;
}
.amb-icon { width: 24px; height: 24px; object-fit: contain; display: block; }
svg.amb-icon { stroke: currentColor; }
/* PNG는 마스크로 실루엣만 써서 글자색과 똑같은 색으로 칠한다 */
.amb-mask {
  background-color: currentColor;
  -webkit-mask: var(--i) center / contain no-repeat;
  mask: var(--i) center / contain no-repeat;
}
.amb-item.active { color: #2a5fbf; }
</style>
