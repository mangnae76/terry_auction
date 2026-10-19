<script setup lang="ts">
// 마이페이지 — 내 정보·보관함·휴지통처럼 계정에 딸린 자리를 모아 둔다.
// 목록은 services/myPageMenu 에 있고 더보기의 알약과 같은 것을 쓴다.
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import AppToast from '../components/AppToast.vue';
import { MY_PAGE_ITEMS, type MyPageItem } from '../services/myPageMenu';
import { useAuthStore } from '../stores/authStore';
import { POINT_GRADES } from '../services/pointPolicy';

const router = useRouter();
const auth = useAuthStore();

/** 아이디 — 로그인에 쓰는 메일의 앞쪽 */
const loginId = computed(() => (auth.email ?? '').split('@')[0] || '-');
/** 등급 — 결제 누계를 아직 들고 있지 않아 모두 첫 등급에서 시작한다 */
const grade = POINT_GRADES[0];
/** 가진 포인트 — 포인트 적립을 붙이기 전까지는 0 */
const myPoint = 0;

const toastText = ref('');
const notReady = (what: string) => {
  toastText.value = `${what} — 준비 중입니다.`;
  window.setTimeout(() => { toastText.value = ''; }, 1600);
};

// 아직 화면이 없는 항목은 안내만 띄운다
const open = (item: MyPageItem) => {
  if (!item.path) { notReady(item.name); return; }
  router.push({ path: item.path, query: item.query });
};
</script>

<template>
  <section class="myp-shell">
    <header class="myp-header">
      <button type="button" class="myp-back" aria-label="뒤로" @click="router.back()">‹</button>
      <h1 class="myp-title">마이페이지</h1>
      <span class="myp-crumb">더보기 › 마이페이지</span>
    </header>

    <div class="myp-body">
      <p class="myp-lead">마이페이지의 기능으로 보다 편리하게 정보를 이용하실 수 있습니다.</p>

      <!-- 내 자리 한눈에 -->
      <section class="myp-sum">
        <span class="myp-who">{{ auth.nickname || '게스트' }} 님<em>( {{ loginId }} )</em></span>
        <div class="myp-cells">
          <div class="myp-cell">
            <span class="myp-chip">{{ grade.name }} 회원</span>
            <span :class="['myp-badge', grade.tone]">{{ grade.name.slice(0, 1) }}</span>
          </div>
          <div class="myp-cell">
            <span class="myp-chip">누적 포인트</span>
            <strong class="myp-point">{{ myPoint.toLocaleString('ko-KR') }} <small>P</small></strong>
          </div>
          <div class="myp-cell">
            <span class="myp-chip">결제 내역</span>
            <button type="button" class="myp-plan" @click="router.push('/billing')">이용권 없음 ›</button>
          </div>
        </div>
        <div class="myp-coupon">
          <span class="myp-coupon-img">COUPON</span>
          <small>발급받은 쿠폰 번호를 입력하고 등록해 주세요.</small>
          <button type="button" class="myp-coupon-btn" @click="notReady('쿠폰등록')">쿠폰등록</button>
        </div>
      </section>

      <section class="myp-card">
        <button
          v-for="m in MY_PAGE_ITEMS"
          :key="m.name"
          type="button"
          class="family"
          @click="open(m)"
        >
          <span class="fname">{{ m.name }}</span>
          <span class="fdesc">{{ m.desc }}</span>
          <span class="arr">›</span>
        </button>
      </section>
    </div>

    <AppToast :visible="!!toastText" :text="toastText" />
    <AppMobileBottomNav active="more" />
  </section>
</template>

<style scoped>
.myp-shell { min-height: 100vh; background: #f4f6fb; padding-bottom: 96px; }
.myp-header { padding: 14px 12px 8px; display: flex; align-items: baseline; gap: 8px; border-bottom: 1px solid #e5e7eb; }
.myp-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 2px; align-self: center;
}
.myp-title { margin: 0; font-size: 20px; font-weight: 800; color: #111827; }
.myp-crumb { margin-left: auto; font-size: 11px; color: #9ca3af; }
.myp-body { padding: 10px 12px; }
.myp-lead { margin: 0 0 10px; text-align: center; font-size: 11.5px; color: #8a93a4; word-break: keep-all; }

/* 내 자리 한눈에 */
.myp-sum {
  position: relative; margin-bottom: 10px;
  background: #fafbfe; border: 1px solid #e8ebf1; border-radius: 10px; padding: 16px 12px 12px;
}
.myp-who {
  position: absolute; top: -10px; left: 12px;
  background: #fff; border: 1px solid #e8ebf1; border-radius: 6px; padding: 3px 9px;
  font-size: 11.5px; font-weight: 800; color: #1f3a72;
}
.myp-who em { font-style: normal; font-weight: 600; color: #8a93a4; margin-left: 3px; }
.myp-cells { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 6px 0 12px; }
.myp-cell { display: flex; flex-direction: column; align-items: center; gap: 7px; }
.myp-chip {
  padding: 3px 9px; border-radius: 5px; background: #4a5bb5; color: #fff;
  font-size: 10.5px; font-weight: 700; white-space: nowrap;
}
.myp-badge {
  width: 30px; height: 30px; border-radius: 8px; color: #fff;
  display: inline-flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800;
}
.myp-badge.welcome { background: #b5d334; }
.myp-badge.silver { background: #b9bec9; }
.myp-badge.gold { background: #e8bb3d; }
.myp-badge.family { background: #7b6ad4; }
.myp-point { font-size: 17px; font-weight: 800; color: #e8622a; }
.myp-point small { font-size: 11px; color: #6b7280; font-weight: 700; }
.myp-plan {
  border: none; background: transparent; padding: 0; cursor: pointer;
  font-family: inherit; font-size: 13px; font-weight: 800; color: #111827;
}

/* 쿠폰 */
.myp-coupon {
  display: flex; align-items: center; gap: 8px;
  border-top: 1px solid #eef1f6; padding-top: 11px;
}
.myp-coupon-img {
  flex: none; padding: 5px 8px; border-radius: 4px; background: #4a3fb5; color: #fff;
  font-size: 9px; font-weight: 800; letter-spacing: 0.5px;
}
.myp-coupon small { flex: 1 1 auto; font-size: 10.5px; color: #6b7280; word-break: keep-all; }
.myp-coupon-btn {
  flex: none; border: none; border-radius: 6px; background: #4a5bb5; color: #fff;
  padding: 7px 10px; font-family: inherit; font-size: 11px; font-weight: 700; cursor: pointer;
}
.myp-card {
  padding: 2px 13px; background: #fff; border: 1px solid #e8ebf1; border-radius: 14px;
}

/* 줄 — 더보기에 있던 것과 같은 꼴 */
.family {
  display: flex; align-items: center; gap: 8px;
  width: 100%; border: none; background: transparent; cursor: pointer;
  padding: 13px 0; border-bottom: 1px solid #f1f3f7; text-align: left;
}
.family:last-child { border-bottom: none; }
.fname { flex: 0 0 auto; font-size: 13px; font-weight: 800; color: #111827; }
.fdesc {
  flex: 1 1 auto; min-width: 0; font-size: 11px; color: #8a93a4;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.arr { flex: 0 0 auto; font-size: 17px; color: #c3cbdd; }
</style>
