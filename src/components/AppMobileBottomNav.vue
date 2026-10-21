<script setup lang="ts">
import { useRouter } from 'vue-router';
import starIcon from '../assets/icones/memu/star_Main.png';
import pinIcon from '../assets/icones/memu/map-pinned_Main.png';
import banknoteIcon from '../assets/icones/memu/banknote_main.png';

defineProps<{
  active: 'watchlist' | 'field-trip' | 'post-win' | 'finance' | 'more';
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
    <!-- 낙찰 이후 — 명도와 매도. 열쇠를 넘겨받는 일이라 열쇠로 그린다.
         선정물건(별)·임장경로(핀)·자금관리(지폐)와 같은 선 아이콘 한 벌로 맞춘다 -->
    <button type="button" :class="['amb-item', { active: active === 'post-win' }]" @click="router.push('/post-win')">
      <svg class="amb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />
        <path d="m21 2-9.6 9.6" />
        <circle cx="7.5" cy="15.5" r="5.5" />
      </svg>
      <span>낙찰이후</span>
    </button>
    <button type="button" :class="['amb-item', { active: active === 'finance' }]" @click="router.push('/finance')">
      <span class="amb-icon amb-mask" :style="{ '--i': `url(${banknoteIcon})` }" />
      <span>자금관리</span>
    </button>
    <button type="button" :class="['amb-item', { active: active === 'more' }]" @click="router.push('/more')">
      <!-- 네모 셋을 ㄱ 뒤집은 꼴로 두고, 빈 칸에 ＋ 를 넣는다 — '더 있다'는 뜻 -->
      <svg class="amb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2.6" y="2.6" width="8.3" height="8.3" rx="1.9" />
        <rect x="13.1" y="2.6" width="8.3" height="8.3" rx="1.9" />
        <rect x="2.6" y="13.1" width="8.3" height="8.3" rx="1.9" />
        <path d="M17.25 13.8v7M13.75 17.3h7" stroke-width="2.2" />
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
  font-size: 10.5px; font-weight: 500; color: #6b7280; cursor: pointer; padding: 4px 0;
  white-space: nowrap; letter-spacing: -0.3px;
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
