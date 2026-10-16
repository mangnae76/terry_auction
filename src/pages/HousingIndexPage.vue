<script setup lang="ts">
// KB 주택가격지수 — 분석 도구의 '부동산 시장정보' 묶음에 드는 한 화면.
// 틀은 다른 분석 화면과 같은 것을 쓰고, 알맹이는 HousingIndexPanel 이 그린다.
import { useRouter } from 'vue-router';
import HousingIndexPanel from '../components/HousingIndexPanel.vue';

const router = useRouter();
</script>

<template>
  <section class="adm-shell">
    <header class="adm-top">
      <div class="adm-top-in">
        <button type="button" class="adm-back" aria-label="뒤로" @click="router.push('/admin')">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg>
        </button>
        <div class="adm-title">
          <h1>KB 주택가격지수</h1>
          <p>전국과 서울의 주택가격지수 흐름을 달 단위로 본다.</p>
        </div>
      </div>
    </header>

    <div class="adm-body">
      <HousingIndexPanel />
    </div>
  </section>
</template>

<style scoped>
/* 분석 도구와 같은 틀 */
.adm-shell { min-height: 100vh; background: #f5f7fb; color: #111827; display: flex; flex-direction: column; }
.adm-top {
  position: sticky; top: 0; z-index: 20;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: saturate(160%) blur(10px);
  border-bottom: 1px solid #e8ecf3;
}
.adm-top-in { max-width: 1680px; margin: 0 auto; padding: 12px 28px; display: flex; align-items: center; gap: 14px; }
.adm-back {
  border: 1px solid #dde3ee; background: #fff; border-radius: 9px;
  width: 32px; height: 32px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  line-height: 0; color: #374151; cursor: pointer;
}
.adm-back:hover { border-color: #b9cdf7; color: #2b6df3; }
.adm-title h1 { margin: 0; font-size: 17px; font-weight: 800; letter-spacing: -0.3px; }
.adm-title p { margin: 2px 0 0; font-size: 12px; color: #9ca3af; }
.adm-body { flex: 1 1 auto; width: 100%; max-width: 1680px; margin: 0 auto; padding: 24px 28px 60px; }
</style>
