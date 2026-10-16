<script setup lang="ts">
// 낙찰 이후 — 명도와 매도까지의 일을 모아 둘 자리.
// 틀은 자금관리(.fin-shell)와 같은 짜임이다: 위는 붙박이(제목 + 탭), 아래만 구른다.
// 탭마다 무엇을 담을지는 사용자가 정해 준다 — 지금은 자리만 잡아 둔다.
import { ref } from 'vue';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';

type TabKey = 'win' | 'balance' | 'evict' | 'repair' | 'sell';
const TABS: Array<{ key: TabKey; label: string; desc: string }> = [
  { key: 'win', label: '낙찰당일', desc: '낙찰가·경쟁 상황, 영수증과 서류 챙기기' },
  { key: 'balance', label: '잔금·등기', desc: '잔금 납부일, 등기 촉탁, 취득세' },
  { key: 'evict', label: '명도', desc: '점유자 확인, 인도명령·강제집행, 이사비 협의' },
  { key: 'repair', label: '수리·정비', desc: '수리 범위와 비용, 업체 일정' },
  { key: 'sell', label: '매도·임대', desc: '내놓은 가격, 중개업소, 계약 일정' },
];
const activeTab = ref<TabKey>('win');
const current = () => TABS.find((t) => t.key === activeTab.value) ?? TABS[0];
</script>

<template>
  <section class="pw-shell">
    <div class="pw-fixed-top">
      <header class="pw-header">
        <h1 class="pw-page-title">낙찰이후</h1>
        <nav class="pw-tabs">
          <button
            v-for="t in TABS"
            :key="t.key"
            type="button"
            :class="['pw-tab', { active: activeTab === t.key }]"
            @click="activeTab = t.key"
          >{{ t.label }}</button>
        </nav>
      </header>
    </div>

    <div class="pw-body">
      <section class="pw-card">
        <header class="pw-card-head">
          <h2>{{ current().label }}</h2>
          <small>{{ current().desc }}</small>
        </header>
        <p class="pw-empty">아직 준비 중입니다.</p>
      </section>
    </div>

    <AppMobileBottomNav active="post-win" />
  </section>
</template>

<style scoped>
/* 위는 붙박이, 아래만 구른다 — 자금관리(.fin-shell)와 같은 짜임 */
.pw-shell {
  position: fixed; inset: 0;
  display: flex; flex-direction: column;
  background: #f5f7fb;
  overflow: hidden;
}
.pw-fixed-top { flex: 0 0 auto; background: #f5f7fb; }
.pw-body {
  flex: 1 1 auto; overflow-y: auto;
  padding: 12px 12px 96px;
  -webkit-overflow-scrolling: touch;
}

.pw-header { background: #fff; border-bottom: 1px solid #eef0f5; }
.pw-page-title {
  margin: 0; padding: 9px 14px 7px;
  font-size: 20px; font-weight: 800; color: #111827;
  border-bottom: 1px solid #e5e7eb;
}
.pw-tabs {
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px;
  margin: 8px 14px 6px; padding: 3px;
  background: #e2e8f2; border-radius: 12px;
}
.pw-tab {
  border: 1px solid transparent; background: transparent;
  padding: 5px 2px; min-height: 36px; border-radius: 9px;
  font-size: 12.5px; font-weight: 700; line-height: 1.25; letter-spacing: -0.5px; color: #6b7280;
  text-align: center; white-space: normal; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-family: inherit;
}
.pw-tab.active {
  background: #fff; color: #111827;
  border-color: #e3e7ef; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}

.pw-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; }
.pw-card-head { display: flex; align-items: baseline; gap: 8px; padding: 16px 16px 12px; }
.pw-card-head h2 { margin: 0; font-size: 15.3px; font-weight: 800; color: #111827; }
.pw-card-head small { font-size: 11.5px; color: #9ca3af; font-weight: 600; }
.pw-empty {
  margin: 0; padding: 26px 16px 30px; text-align: center;
  font-size: 12.5px; color: #9ca3af; font-weight: 600;
  border-top: 1px solid #f1f3f7;
}
</style>
