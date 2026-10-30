<script setup lang="ts">
// 회원탈퇴 — 마이페이지의 '회원탈퇴'에서 들어온다.
// 지우기 전에 무엇이 사라지는지 먼저 알린다. 실제 삭제 처리는 아직 붙이지 않았다.
import { computed, inject, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import AppToast from '../components/AppToast.vue';

const router = useRouter();

// 웹은 메뉴 이름이 '낙찰관리' 다
const webEmbed = inject<boolean>('webEmbed', false);
const KEEP_NOTES = [
  '가입된 회원정보와 결제내역 정보가 삭제됩니다.',
  '가입된 전화번호는 재가입 부당이득 방지를 위해 3개월간 보관됩니다.',
];
const LOSE_NOTES = [
  `경매 물건 관리, 임장경로, 자금관리, ${webEmbed ? '낙찰관리' : '낙찰이후'} 등 회원제 서비스를 이용할 수 없습니다.`,
  '선정물건으로 등록한 물건과 현장사진이 모두 삭제됩니다. (다른 아이디로 재가입 후 다시 등록해야 합니다)',
  '저장해 둔 검색조건과 중개업체 목록이 삭제됩니다.',
];
const RED_NOTES = [
  '탈퇴한 아이디는 마이턴 옥션에서 다시 사용할 수 없습니다.',
  '탈퇴 후 동일한 전화번호로는 3개월간 재가입이 불가능합니다.',
];

/** 이용권이 남아 있는지 — 결제 연동 전이라 아직 들고 있지 않다 */
const hasPlan = ref(false);

const agree = ref(false);
const canGo = computed(() => agree.value);

const toastText = ref('');
const toast = (text: string) => {
  toastText.value = text;
  window.setTimeout(() => { toastText.value = ''; }, 2600);
};

const onWithdraw = () => {
  if (!canGo.value) { toast('안내 내용에 동의해 주세요.'); return; }
  // 되돌릴 수 없는 처리라 손으로 붙이기 전까지는 고객센터로 보낸다
  toast('탈퇴 처리는 준비 중입니다. 고객센터로 알려 주시면 바로 처리해 드립니다.');
};
</script>

<template>
  <section class="wd-shell">
    <header class="wd-header">
      <button type="button" class="wd-back" aria-label="뒤로" @click="router.back()"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg></button>
      <h1 class="wd-title">회원탈퇴</h1>
      <span class="wd-crumb">마이페이지 › 회원탈퇴</span>
    </header>

    <div class="wd-body">
      <h2 class="wd-h2">회원 탈퇴</h2>
      <p class="wd-lead">탈퇴 전 아래 내용을 반드시 확인해 주세요.</p>

      <section class="wd-card">
        <h3>회원정보와 결제서비스의 정보</h3>
        <ul>
          <li v-for="(t, i) in KEEP_NOTES" :key="i">{{ t }}</li>
        </ul>

        <h3 class="line">회원정보 및 회원제 서비스의 정보 삭제</h3>
        <ul>
          <li v-for="(t, i) in LOSE_NOTES" :key="i">{{ t }}</li>
        </ul>

        <ul class="wd-red">
          <li v-for="(t, i) in RED_NOTES" :key="i">{{ t }}</li>
        </ul>
      </section>

      <p class="wd-help">
        이용기간이 남은 회원님은 고객센터로 알려 주시기 바랍니다.<br />
        <button type="button" class="wd-help-link" @click="router.push('/support')">고객센터 바로가기 ›</button>
      </p>

      <label class="wd-agree">
        <input v-model="agree" type="checkbox" />
        전화번호 보관 및 탈퇴안내 내용에 동의합니다.
      </label>

      <p v-if="hasPlan" class="wd-warn">
        ☞ 회원님께서는 현재 이용기간이 남아 있습니다.<br />고객센터로 연락주세요.
      </p>

      <button type="button" :class="['wd-go', { on: canGo }]" :disabled="!canGo" @click="onWithdraw">
        회원탈퇴
      </button>
    </div>

    <AppToast :visible="!!toastText" :text="toastText" />
    <AppMobileBottomNav active="more" />
  </section>
</template>

<style scoped>
.wd-shell { min-height: 100vh; background: #f4f6fb; padding-bottom: 96px; }
.wd-header { padding: 14px 12px 8px; display: flex; align-items: baseline; gap: 8px; border-bottom: 1px solid #e5e7eb; }
.wd-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 2px; align-self: center;
}
.wd-title { margin: 0; font-size: 20px; font-weight: 800; color: #111827; }
.wd-crumb { margin-left: auto; font-size: 11px; color: #9ca3af; }
.wd-body { padding: 16px 12px; }
.wd-h2 { margin: 0; text-align: center; font-size: 17px; font-weight: 800; color: #111827; }
.wd-lead { margin: 6px 0 14px; text-align: center; font-size: 11.5px; color: #8a93a4; }

.wd-card { background: #fff; border: 1px solid #e8ebf1; border-radius: 10px; padding: 14px 13px 12px; }
.wd-card h3 { margin: 0 0 7px; font-size: 12.5px; font-weight: 800; color: #111827; }
.wd-card h3.line { margin-top: 14px; padding-top: 13px; border-top: 1px solid #f1f3f7; }
.wd-card ul { list-style: none; margin: 0; padding: 0; }
.wd-card li {
  position: relative; padding-left: 11px; margin-bottom: 5px;
  font-size: 11.5px; line-height: 1.75; color: #4b5563; word-break: keep-all;
}
.wd-card li::before { content: '·'; position: absolute; left: 2px; color: #9aa6c4; }
.wd-red {
  margin-top: 13px !important; padding: 11px 11px 7px !important;
  background: #fdf3f3; border-radius: 8px;
}
.wd-red li { color: #c62828; }
.wd-red li::before { color: #c62828; }

.wd-help {
  margin: 10px 0 0; padding: 12px; text-align: center;
  background: #f1f3f8; border-radius: 8px;
  font-size: 11.5px; line-height: 1.8; color: #4b5563;
}
.wd-help-link {
  border: none; background: transparent; padding: 0; cursor: pointer;
  font-family: inherit; font-size: 12px; font-weight: 800; color: #1f3a72;
}

.wd-agree {
  display: flex; align-items: center; gap: 7px; margin-top: 12px;
  border: 1px solid #c7d2ea; border-radius: 8px; padding: 13px 12px; background: #fff;
  font-size: 12px; font-weight: 700; color: #374151; cursor: pointer;
}
.wd-agree input { width: 15px; height: 15px; accent-color: #2a3f8f; }

.wd-warn {
  margin: 10px 0 0; padding: 12px; text-align: center;
  border: 1px solid #f0d4a8; background: #fffaf0; border-radius: 8px;
  font-size: 11.5px; line-height: 1.8; color: #8a6418;
}

.wd-go {
  width: 100%; height: 46px; margin-top: 14px;
  border: none; border-radius: 8px; background: #c3cbdd; color: #fff;
  font-family: inherit; font-size: 14px; font-weight: 800; cursor: not-allowed;
}
.wd-go.on { background: #c62828; cursor: pointer; }
</style>
