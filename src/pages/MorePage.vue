<script setup lang="ts">
// 더보기 — 계정·설정·공지 등 다른 탭에 들어가지 않는 것들을 모아 둔다.
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import MyPageCards from '../components/MyPageCards.vue';
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
// 마이페이지는 제 화면을 따로 둔다 (/mypage)
const goMyPage = () => { router.push('/mypage'); };
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

interface QuickSub { name: string; path: string; query?: Record<string, string> }
interface QuickItem { name: string; path: string; items?: QuickSub[] }
const QUICK: QuickItem[] = [
  { name: '마이페이지', path: '/mypage' },
  { name: '결제하기', path: '/billing' },
  // 부가서비스만 눌러서 펼친다 — 소식 묶음은 마이페이지 안으로 데려간다
  {
    name: '부가서비스',
    path: '',
    items: [
      { name: '공지사항', path: '/mypage', query: { sec: 'notice' } },
      { name: '이벤트', path: '/mypage', query: { sec: 'event' } },
      { name: '업데이트', path: '/mypage', query: { sec: 'update' } },
      { name: '포인트', path: '/points' },
    ],
  },
  { name: '고객센터', path: '/support' },
];
/** 펼쳐 둔 바로가기 이름 ('' 이면 닫힘) */
const quickOpen = ref('');
const goQuick = (q: QuickItem) => {
  if (q.items?.length) { quickOpen.value = quickOpen.value === q.name ? '' : q.name; return; }
  if (!q.path) { notReady(q.name); return; }
  router.push(q.path);
};
const goQuickSub = (it: QuickSub) => {
  quickOpen.value = '';
  if (!it.path) { notReady(it.name); return; }
  router.push({ path: it.path, query: it.query });
};

// 머리글의 선물상자처럼 '?sec=event' 로 들어오면 그 묶음으로 내려간다
onMounted(() => {
  const sec = String(route.query.sec ?? '');
  if (!sec) return;
  window.setTimeout(() => {
    document.querySelector(`[data-sec="${sec}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
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
          <button type="button" class="pill" @click="router.push('/profile')">내 정보 수정</button>
          <button type="button" class="pill last" @click="notReady('인증/보안')">인증·보안</button>
        </div>
      </div>

      <div v-if="quickOpen" class="quick-veil" @click="quickOpen = ''" />
      <div class="quick">
        <div v-for="q in QUICK" :key="q.name" class="quick-cell">
          <button type="button" class="quick-item" @click="goQuick(q)">
            {{ q.name }}<i v-if="q.items" class="quick-caret">{{ quickOpen === q.name ? '▴' : '▾' }}</i>
          </button>
          <ul v-if="q.items && quickOpen === q.name" class="quick-menu">
            <li v-for="it in q.items" :key="it.name">
              <button type="button" @click="goQuickSub(it)">{{ it.name }}</button>
            </li>
          </ul>
        </div>
      </div>
      </section>
    </div>

    <!-- 마이페이지 메뉴를 그대로 뿌린다 (MYPAGE 화면과 같은 카드) -->
    <div class="more-body">
      <MyPageCards />
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
  /* 다섯이 남은 자리를 똑같이 나눠 가진다 — 칸도 사이도 일정하다 */
  flex: 1 1 0; min-width: 0; box-sizing: border-box;
  padding: 5px 0; font-size: 9.5px; font-weight: 700; color: #4b5563; cursor: pointer;
  text-align: center; white-space: nowrap; letter-spacing: -0.4px;
}
.quick {
  position: relative; display: grid; grid-template-columns: repeat(4, 1fr);
  margin-top: 12px; border: 1px solid #eef0f5; border-radius: 10px; background: #fff;
}
.quick-cell { position: relative; }
.quick-cell + .quick-cell { border-left: 1px solid #eef0f5; }
.quick-cell:first-child .quick-item { border-radius: 10px 0 0 10px; }
.quick-cell:last-child .quick-item { border-radius: 0 10px 10px 0; }
.quick-item {
  width: 100%; border: none; background: #fff; padding: 11px 2px; cursor: pointer;
  font-size: 12px; font-weight: 700; color: #374151;
}
.quick-caret { font-style: normal; font-size: 9px; color: #9aa6c4; margin-left: 3px; }
/* 펼친 줄 — 바로가기 칸 바로 아래에 붙는다 */
.quick-veil { position: fixed; inset: 0; z-index: 14; }
.quick-menu {
  /* 칸보다 넓게 — 글자가 접히지 않게 둔다 */
  position: absolute; top: calc(100% + 4px); left: -1px; z-index: 15;
  min-width: 152px; white-space: nowrap;
  list-style: none; margin: 0; padding: 4px;
  background: #fff; border: 1px solid #e3e8f0; border-radius: 8px;
  box-shadow: 0 6px 18px rgba(17, 24, 39, .12);
}
/* 줄은 왼쪽에서 한 칸 들여 적는다 */
.quick-menu button {
  width: 100%; border: none; background: transparent; border-radius: 6px;
  padding: 8px 8px 8px 12px; text-align: left;
  font-family: inherit; font-size: 12px; font-weight: 700; color: #374151; cursor: pointer;
}
.quick-menu button:hover { background: #f4f6fb; }
/* 묶음을 가르는 가는 선 */
.quick-menu li.split { margin-top: 5px; padding-top: 5px; border-top: 1px solid #eef1f6; }
/* 아직 자리를 정하지 못한 줄 */
.quick-menu button.mark { color: #d2434f; }
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
