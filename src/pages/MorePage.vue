<script setup lang="ts">
// 더보기 — 계정·설정·공지 등 다른 탭에 들어가지 않는 것들을 모아 둔다.
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import MyPageCards from '../components/MyPageCards.vue';
import BillingBody from '../components/BillingBody.vue';
import PointsBody from '../components/PointsBody.vue';
import NewsBody from '../components/NewsBody.vue';
import SupportBody from '../components/SupportBody.vue';
import { useAuthStore } from '../stores/authStore';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const displayName = computed(() => {
  const nick = authStore.nickname ?? '';
  if (nick) return nick;
  const email = authStore.email ?? '';
  return email ? email.split('@')[0] : '게스트';
});

const toast = ref('');
// 이름을 누르면 마이페이지 탭으로 — 더보기 안에 그대로 있다
const goMyPage = () => { tab.value = 'mypage'; };
const notReady = (what: string) => {
  toast.value = `${what} — 준비 중입니다.`;
  setTimeout(() => { toast.value = ''; }, 1600);
};

// 들어와 있으면 나가고, 나가 있으면 들어가는 자리 — 알약 하나로 둘 다 받는다
const onAuthPill = async () => {
  if (!authStore.isLoggedIn) { router.push('/login'); return; }
  await authStore.logout();
  router.push('/login');
};

/** 더보기는 한 화면이다 — 탭을 누르면 그 내용이 아래에 펼쳐진다 */
const TABS = [
  { key: 'mypage', label: '마이페이지' },
  { key: 'billing', label: '결제하기' },
  { key: 'points', label: '포인트' },
  { key: 'news', label: '부가서비스' },
  { key: 'support', label: '고객센터' },
] as const;
type TabKey = (typeof TABS)[number]['key'];
const tab = ref<TabKey>('mypage');

// 다른 화면에서 '?tab=news&sec=event' 로 들어오면 그 탭을 열고 그 묶음으로 내려간다
onMounted(() => {
  const asked = String(route.query.tab ?? '');
  if (TABS.some((t) => t.key === asked)) tab.value = asked as TabKey;
  const sec = String(route.query.sec ?? '');
  if (!sec) return;
  tab.value = 'news';
  window.setTimeout(() => {
    document.querySelector(`[data-sec="${sec}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
});

</script>

<template>
  <section class="more-shell">
    <!-- 제목과 계정 상자는 자리를 지킨다 — 아래 내용만 흐른다 -->
    <div class="more-fixed">
      <div class="more-titlebar">
        <button type="button" class="more-back" aria-label="뒤로" @click="router.back()">‹</button>
        <h1 class="more-title">더보기</h1>
      </div>

      <!-- 계정 -->
      <section class="more-card first">
      <div class="profile">
        <span class="avatar">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#9aa6c4" stroke-width="1.7" stroke-linecap="round">
            <circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
          </svg>
        </span>
        <div class="profile-main">
          <button type="button" class="pname" @click="goMyPage">
            {{ displayName }}<span class="arr">›</span>
          </button>
          <button type="button" class="pill" @click="onAuthPill">{{ authStore.isLoggedIn ? '로그아웃' : '로그인' }}</button>
          <button type="button" class="pill last" @click="notReady('인증/보안')">인증·보안</button>
        </div>
      </div>

      <nav class="quick">
        <button
          v-for="t in TABS"
          :key="t.key"
          type="button"
          :class="['quick-item', { on: tab === t.key }]"
          @click="tab = t.key"
        >{{ t.label }}</button>
      </nav>
      </section>
    </div>

    <!-- 고른 탭의 내용이 여기에 그대로 펼쳐진다 (다른 화면으로 가지 않는다) -->
    <div class="more-body">
      <MyPageCards v-if="tab === 'mypage'" />
      <BillingBody v-else-if="tab === 'billing'" />
      <PointsBody v-else-if="tab === 'points'" />
      <NewsBody v-else-if="tab === 'news'" />
      <SupportBody v-else />
    </div>

    <p class="more-version">MyTurn Auction · v1.0</p>

    <Teleport to="body">
      <p v-if="toast" class="more-toast">{{ toast }}</p>
    </Teleport>

    <AppMobileBottomNav active="more" />
  </section>
</template>

<style scoped>
.more-shell {
  min-height: 100vh;
  background: #f4f6fb;
  padding: 0 0 86px;
}
/* 제목줄 — 다른 화면처럼 왼쪽에 뒤로가기를 둔다 */
.more-titlebar {
  display: flex; align-items: center; gap: 4px;
  padding: 9px 14px 7px; background: #fff;
  /* 제목줄 아래 구분선 — 물건상세와 같게 */
  border-bottom: 1px solid #e5e7eb;
}
.more-back {
  border: none; background: transparent; cursor: pointer;
  padding: 0 2px; font-size: 22px; line-height: 1; color: #334155;
}
.more-title {
  margin: 0; padding: 0;
  font-size: 20px; font-weight: 800; color: #111827; background: transparent;
}
.more-fixed {
  position: sticky; top: 0; z-index: 5;
  background: #f4f6fb; padding-bottom: 2px;
}
/* 제목에 바짝 붙어 있어 답답했다 — 한 숨 띄운다 */
.more-card.first { margin-top: 10px; }
/* 바로가기로 내려올 때 고정된 제목·계정 상자에 가리지 않게 자리를 둔다 */
.more-card[data-sec] { scroll-margin-top: 122px; }
.more-body { padding: 0 14px; }
.more-card {
  margin: 0 14px 10px; padding: 14px 13px;
  background: #fff; border: 1px solid #e8ebf1; border-radius: 14px;
}

/* 계정 */
.profile { display: flex; gap: 11px; align-items: flex-start; }
.avatar {
  flex: 0 0 auto; width: 48px; height: 48px; border-radius: 50%;
  background: #eef1f8; display: inline-flex; align-items: center; justify-content: center;
}
.profile-main {
  flex: 1 1 auto; min-width: 0;
  display: flex; flex-wrap: wrap; align-items: center; gap: 5px;
}
.pname {
  border: none; background: transparent; padding: 0; cursor: pointer;
  font-size: 16px; font-weight: 800; color: #111827;
  display: inline-flex; align-items: center; gap: 2px;
}
/* 네 개를 똑같은 폭으로 — 오른쪽 끝이 아래 '인증/보안' 박스와 맞는다 */

.pill {
  border: 1px solid #e3e7ef; background: #f7f8fb; border-radius: 999px;
  /* 글자만큼만 — 둘만 남아 자리를 나눠 가지니 지나치게 넓어졌다 */
  flex: 0 0 auto; box-sizing: border-box;
  padding: 5px 11px; font-size: 10px; font-weight: 700; color: #4b5563; cursor: pointer;
  text-align: center; white-space: nowrap; letter-spacing: -0.3px;
}
.quick {
  position: relative; display: grid; grid-template-columns: repeat(5, 1fr);
  margin-top: 12px; border: 1px solid #eef0f5; border-radius: 10px; background: #fff;
}
/* 네 칸짜리 상자 — 고른 칸만 색이 바뀐다 */
.quick-item {
  width: 100%; border: none; border-radius: 0; background: #fff;
  padding: 11px 2px; cursor: pointer;
  font-family: inherit; font-size: 12px; font-weight: 700; color: #6b7280;
}
.quick-item + .quick-item { border-left: 1px solid #eef0f5; }
.quick-item:first-child { border-radius: 10px 0 0 10px; }
.quick-item:last-child { border-radius: 0 10px 10px 0; }
.quick-item.on { background: #2a3f8f; color: #fff; }
/* 알림설정 알약 — 알릴 것이 있으면 점 하나 (머리글 종과 같은 뜻) */
.pill-dot {
  display: inline-block; width: 5px; height: 5px; border-radius: 50%;
  background: #e03b3b; margin-left: 3px; vertical-align: 3px;
}

/* 공통 */
.sec-head {
  margin: 0 0 6px; padding: 0;
  font-size: 15.3px; font-weight: 800; color: #111827;
  display: flex; align-items: center; gap: 4px;
  border: none; background: transparent; width: 100%; cursor: default;
}
.sec-head.link { cursor: pointer; }
.sec-head.plain { color: #111827; font-weight: 800; }
.sec-head .dot { width: 5px; height: 5px; border-radius: 50%; background: #ef4444; }
.arr { margin-left: auto; color: #c4cad6; font-size: 16px; line-height: 1; }
.pname { margin-right: 3px; }
/* 이름이 길어도 알약 자리를 먹지 않게 — 넘치면 … 로 줄인다 */
.pname { flex: 0 1 auto; min-width: 0; max-width: 42%; overflow: hidden; }
.pname .arr { margin-left: 2px; font-size: 15px; }

/* ===== 이벤트 배너 ===== */
.ev-banners {
  margin-top: 10px;
  display: flex; gap: 8px;
  overflow-x: auto; scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 2px;
}
.ev-banners::-webkit-scrollbar { display: none; }
.ev-banner {
  flex: 0 0 100%; scroll-snap-align: start; min-width: 0;
  display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
  box-sizing: border-box;
  border: none; border-radius: 12px; cursor: pointer; text-align: left;
  padding: 14px 14px 12px;
  background: linear-gradient(135deg, #2b6df3 0%, #1f3a72 100%);
  color: #fff;
}
.ev-badge {
  display: inline-block; padding: 2px 8px; border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  font-size: 9.5px; font-weight: 800; letter-spacing: 0.6px;
}
.ev-title { font-size: 15px; font-weight: 800; line-height: 1.3; }
.ev-desc { font-size: 11.5px; font-weight: 400; line-height: 1.45; opacity: 0.88; }
.ev-foot {
  margin-top: 6px; width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.ev-period { font-size: 10.5px; font-weight: 400; opacity: 0.75; }
.ev-cta {
  flex: 0 0 auto;
  padding: 4px 10px; border-radius: 999px;
  background: #fff; color: #1f3a72;
  font-size: 11px; font-weight: 800; white-space: nowrap;
}

.list-item {
  display: flex; align-items: center; gap: 7px;
  width: 100%; border: none; background: transparent; cursor: pointer;
  padding: 9px 0; text-align: left;
}
.list-item.pinned {
  background: #f3f7ff; border-radius: 8px; padding: 9px 8px; margin: 2px 0;
}
.tag {
  flex: 0 0 auto; background: #f1f3f7; color: #6b7280;
  border-radius: 5px; padding: 2px 6px; font-size: 10px; font-weight: 700;
}
.star { flex: 0 0 auto; color: #2b6df3; font-size: 12px; }
.txt {
  flex: 1 1 auto; min-width: 0; font-size: 12.5px; color: #374151;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.list-item.pinned .txt { font-weight: 700; color: #111827; }

/* 마이페이지 목록 */
.family {
  display: flex; align-items: center; gap: 8px;
  width: 100%; border: none; background: transparent; cursor: pointer;
  padding: 11px 0; border-bottom: 1px solid #f1f3f7; text-align: left;
}
.family:last-child { border-bottom: none; }
.fname { flex: 0 0 auto; font-size: 13px; font-weight: 800; color: #111827; }
.fdesc {
  flex: 1 1 auto; min-width: 0; font-size: 11px; color: #8a93a4;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* 약관 */
.policy {
  display: block; width: 100%; border: none; background: transparent; cursor: pointer;
  padding: 10px 0; text-align: left;
  font-size: 13px; color: #4b5563;
}

.more-version { margin: 14px 16px 0; font-size: 10.5px; color: #b6bcc7; text-align: center; }
</style>

<style>
.more-toast {
  position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%);
  z-index: 9999; margin: 0;
  background: #111827; color: #fff; border-radius: 999px;
  padding: 9px 16px; font-size: 12px; font-weight: 700;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.28);
}
</style>
