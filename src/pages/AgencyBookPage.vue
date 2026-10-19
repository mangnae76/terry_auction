<script setup lang="ts">
// 중개업체 관리 — 늘 도는 부동산을 사용자가 직접 더하고 빼는 자리.
// 고치는 알맹이는 components/AgencyBookPanel 에 있다 (상담표의 팝업과 같은 것을 쓴다).
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import AppToast from '../components/AppToast.vue';
import AgencyBookPanel from '../components/AgencyBookPanel.vue';
import { ref } from 'vue';

const router = useRouter();
const toastText = ref('');
const onSaved = (count: number) => {
  toastText.value = `${count}곳을 저장했습니다.`;
  window.setTimeout(() => { toastText.value = ''; }, 1600);
};
</script>

<template>
  <section class="agb-shell">
    <header class="agb-header">
      <button type="button" class="agb-back" aria-label="뒤로" @click="router.back()">‹</button>
      <h1 class="agb-title">중개업체 관리</h1>
    </header>

    <p class="agb-note">
      여기 적어 둔 업체가 물건마다의 <b>부동산 유선 상담 · 현장 상담</b>과
      낙찰이후의 <b>중개 의뢰 현황</b> 상호 목록에 그대로 섭니다.
      상호를 고르면 전화번호도 따라 들어갑니다.
    </p>

    <p class="agb-list-head">중개업체 리스트</p>
    <div class="agb-body">
      <AgencyBookPanel @saved="onSaved" />
    </div>

    <AppMobileBottomNav active="more" />
    <AppToast :visible="!!toastText" :text="toastText" tone="success" />
  </section>
</template>

<style scoped>
.agb-shell { min-height: 100vh; background: #f4f6fb; padding-bottom: 86px; }
.agb-header { padding: 14px 12px 8px; display: flex; align-items: baseline; gap: 8px; }
.agb-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 2px; align-self: center;
}
.agb-title { margin: 0; flex: 0 0 auto; font-size: 20px; font-weight: 800; color: #111827; }
.agb-note {
  margin: 0 12px 10px; padding: 8px 10px;
  background: #eef4ff; border-radius: 8px;
  font-size: 11.5px; line-height: 1.6; color: #35507f;
}
.agb-note b { color: #1d3d75; }
.agb-list-head { margin: 10px 12px 2px; font-size: 12.5px; font-weight: 800; color: #374151; }
.agb-body { padding: 0 12px; }
</style>
