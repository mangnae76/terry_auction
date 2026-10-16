<script setup lang="ts">
// 낙찰 이후 — 명도와 매도까지의 일을 모아 둘 자리.
// 아직 화면을 짜지 않았으므로 어떤 일을 담을지만 적어 둔다 (빈 화면으로 두지 않는다).
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import AppMobileHeader from '../components/AppMobileHeader.vue';

const STEPS: Array<{ title: string; desc: string }> = [
  { title: '잔금·소유권 이전', desc: '잔금 납부일, 등기 촉탁, 취득세' },
  { title: '명도', desc: '점유자 확인, 인도명령·강제집행, 이사비 협의' },
  { title: '수리·정비', desc: '수리 범위와 비용, 업체 일정' },
  { title: '매도·임대', desc: '내놓은 가격, 중개업소, 계약 일정' },
];
</script>

<template>
  <section class="pw-shell">
    <AppMobileHeader />

    <div class="pw-body">
      <header class="pw-head">
        <h1>낙찰 이후</h1>
        <p>명도부터 매도까지, 낙찰받은 뒤의 일을 여기에 모읍니다.</p>
      </header>

      <ol class="pw-steps">
        <li v-for="(s, i) in STEPS" :key="s.title" class="pw-step">
          <span class="pw-num">{{ i + 1 }}</span>
          <div class="pw-txt">
            <strong>{{ s.title }}</strong>
            <small>{{ s.desc }}</small>
          </div>
        </li>
      </ol>

      <p class="pw-note">아직 준비 중입니다. 어떤 것부터 담을지 정해 주시면 그 순서로 만듭니다.</p>
    </div>

    <AppMobileBottomNav active="post-win" />
  </section>
</template>

<style scoped>
.pw-shell { min-height: 100vh; background: #e9edf4; padding-bottom: 86px; }
.pw-body { padding: 14px 12px; display: flex; flex-direction: column; gap: 12px; }
.pw-head { padding: 2px 2px 0; }
.pw-head h1 { margin: 0; font-size: 20px; font-weight: 800; color: #111827; letter-spacing: -0.4px; }
.pw-head p { margin: 4px 0 0; font-size: 12.5px; color: #6b7280; font-weight: 600; }

.pw-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.pw-step {
  display: flex; align-items: center; gap: 11px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 13px 14px;
}
.pw-num {
  flex: 0 0 24px; width: 24px; height: 24px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  background: #eef4ff; color: #2b6df3; font-size: 12px; font-weight: 800;
}
.pw-txt { min-width: 0; }
.pw-txt strong { display: block; font-size: 13.5px; font-weight: 800; color: #111827; }
.pw-txt small { display: block; margin-top: 2px; font-size: 11.5px; color: #9ca3af; font-weight: 600; }

.pw-note {
  margin: 2px 0 0; padding: 12px 14px; border-radius: 10px;
  background: #fffbeb; color: #92400e; font-size: 12.5px; font-weight: 600;
}
</style>
