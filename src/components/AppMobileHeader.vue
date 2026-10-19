<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import BrandLogo from './BrandLogo.vue';
import calendarIcon from '../assets/icones/calendar-days.png';
import sunIcon from '../assets/icones/sun.png';
import dollarIcon from '../assets/icones/circle-dollar-sign.png';
import { useAuthStore } from '../stores/authStore';
import { MY_PAGE_ITEMS, type MyPageItem } from '../services/myPageMenu';
import { useAlertBadge } from '../services/alertBadge';

const authStore = useAuthStore();
const router = useRouter();
const menuOpen = ref(false);

/** 알림이 몇 건인지 — 더보기의 바로가기와 같은 셈을 쓴다 */
const { count: alertCount } = useAlertBadge();

const displayNickname = computed(() => authStore.nickname || (authStore.email ? authStore.email.split('@')[0] : '게스트'));

const formattedDate = computed(() => {
  const d = new Date();
  const yoil = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${String(d.getFullYear()).slice(-2)}년 ${parseInt(mm, 10)}월 ${parseInt(dd, 10)}일 (${yoil})`;
});

const toggleMenu = () => { menuOpen.value = !menuOpen.value; };
/** 마이페이지 항목 — 더보기까지 가지 않고 여기서 바로 연다.
 *  아직 화면이 없는 항목은 안내만 띄운다 (더보기와 같은 규칙) */
const menuToast = ref('');
const openMyPage = (item: MyPageItem) => {
  menuOpen.value = false;
  if (!item.path) {
    menuToast.value = `${item.name} — 준비 중입니다.`;
    setTimeout(() => { menuToast.value = ''; }, 1600);
    return;
  }
  router.push({ path: item.path, query: item.query });
};
const closeMenu = () => { menuOpen.value = false; };

const onLogout = async () => {
  menuOpen.value = false;
  try {
    await authStore.logout();
    router.replace('/login');
  } catch (e) {
    alert(`로그아웃 실패: ${e instanceof Error ? e.message : ''}`);
  }
};
</script>

<template>
  <header class="amh">
    <div class="amh-row amh-row-top">
      <div class="amh-brand">
        <BrandLogo :size="40" tone="white" />
      </div>
      <div class="amh-info">
        <button type="button" class="amh-info-cell amh-cal-btn" aria-label="입찰 캘린더 열기" @click="router.push('/bid-calendar')">
          <img :src="calendarIcon" alt="" class="amh-icon" />
          <span>{{ formattedDate }}</span>
        </button>
        <span class="amh-info-cell">
          <img :src="sunIcon" alt="" class="amh-icon" />
          <span>인천 23℃</span>
        </span>
        <span class="amh-info-cell">
          <img :src="dollarIcon" alt="" class="amh-icon" />
          <span>USD 1,385 <em>+3.2</em></span>
        </span>
      </div>
    </div>
    <div class="amh-row amh-row-bottom">
      <span class="amh-greet">반가워요! <strong>{{ displayNickname }}</strong><span class="amh-greet-nim">님</span></span>
      <button type="button" class="amh-bell" aria-label="알림" @click="router.push('/notifications')">
        <!-- 종 — 알릴 것이 있으면 꼭지에 빨간 점이 붙는다 -->
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" />
          <path d="M10.3 19a2 2 0 0 0 3.4 0" />
        </svg>
        <i v-if="alertCount" class="amh-bell-dot" />
      </button>
      <button type="button" class="amh-user-btn" aria-label="사용자 메뉴" @click="toggleMenu">
        <!-- 흉상 — 종과 같은 선 그림으로 맞춘다 (그림 파일은 작게 줄이면 뭉개진다) -->
        <svg
          class="amh-greet-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"
          fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"
        >
          <circle cx="12" cy="8.2" r="3.7" />
          <path d="M4.8 20.2c1.3-3.6 3.9-5.4 7.2-5.4s5.9 1.8 7.2 5.4" />
        </svg>
      </button>
      <div v-if="menuOpen" class="amh-user-menu-wrap" @click.self="closeMenu">
        <ul class="amh-user-menu" @click.stop>
          <li class="amh-user-menu-info">
            <strong>{{ displayNickname }}</strong>
            <small>{{ authStore.email }}</small>
          </li>
          <li v-for="item in MY_PAGE_ITEMS" :key="item.name">
            <button type="button" class="amh-user-menu-btn page" @click="openMyPage(item)">{{ item.name }}</button>
          </li>
          <li class="amh-user-menu-sep">
            <button type="button" class="amh-user-menu-btn" @click="onLogout">로그아웃</button>
          </li>
        </ul>
      </div>
    </div>
    <p v-if="menuToast" class="amh-menu-toast">{{ menuToast }}</p>
  </header>
</template>

<style scoped>
/* 날짜를 누르면 입찰 캘린더로 — 생김새는 옆 칸들과 똑같이 */
.amh-cal-btn {
  border: none; background: transparent; padding: 0; margin: 0;
  font: inherit; color: inherit; cursor: pointer;
}
.amh {
  background: linear-gradient(180deg, #1f3a72 0%, #15295b 100%);
  color: #fff;
  padding: 0 12px 2px;
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 0 0 auto;
}
.amh-row { display: flex; align-items: center; gap: 8px; }
/* 윗줄 높이를 못 박아 둔다 — 로고를 키워도 띠(52px)가 따라 커지지 않는다.
   로고가 줄보다 크면 위아래로 조금 넘치되, 아래 마진 셈으로 띠 한가운데에 선다 */
.amh-row-top { justify-content: space-between; height: 36px; }
/* 인사말 줄을 3px 내린다 — 띠 아래 여백에서 그만큼 가져와 띠 높이는 52px 그대로다 */
.amh-row-bottom { justify-content: flex-end; gap: 6px; padding-right: 4px; margin-top: -11px; margin-right: -7px; }

/* 로고는 띠 한가운데에 선다. 아래 인사줄이 16px 끌어올려져 있어
   윗줄만 보면 로고가 위로 치우친다 — 아래위 마진을 같은 값으로 주고 받아
   줄 높이는 그대로 둔 채 로고만 8px 내려 띠 한가운데에 맞춘다 */
.amh-brand {
  display: flex; align-items: center; line-height: 0; flex-shrink: 0;
  margin-top: 8px; margin-bottom: -8px;
}
.amh-info {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  font-size: 11px;
  white-space: nowrap;
  min-width: 0;
  font-weight: 400;
  flex-shrink: 1;
  overflow: hidden;
  margin-top: 3px;
  align-self: flex-start;
}
.amh-info-cell { display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0; }
.amh-info-cell em { color: #4ade80; font-style: normal; font-weight: 400; margin-left: 1px; }

.amh-icon {
  width: 13px; height: 13px;
  object-fit: contain;
  display: block;
  filter: brightness(0) invert(1);
}


/* 인사말과 종 사이도 종·사람 사이와 같은 만큼 띄운다 */
.amh-greet { font-size: 11px; color: #ffb38a; font-weight: 400; white-space: nowrap; flex-shrink: 0; margin-right: 9px; }
.amh-greet strong { color: #fff; font-weight: 400; margin: 0 2px; }
.amh-greet-nim { color: #fff; }
.amh-greet-icon { width: 19px; height: 19px; flex-shrink: 0; display: block; }
.amh-user-btn { color: #fff; }
.amh-user-btn { border: none; background: transparent; padding: 3px; cursor: pointer; display: inline-flex; align-items: center; }
/* 종과 사람은 손가락이 닿을 자리를 넉넉히 두고 서로 떨어뜨린다 */
.amh-bell {
  position: relative; border: none; background: transparent; padding: 3px; cursor: pointer;
  display: inline-flex; align-items: center; color: #fff; margin-right: 9px;
}
.amh-bell-dot {
  position: absolute; top: 2px; right: 2px; width: 7px; height: 7px; border-radius: 50%;
  background: #ff4d4f; border: 1px solid #1f3a72;
}
.amh-user-menu-wrap {
  position: fixed; inset: 0; z-index: 250;
  background: rgba(0, 0, 0, 0.35);
  display: flex; justify-content: flex-end; align-items: flex-start;
  padding: 56px 12px 0;
}
.amh-user-menu {
  list-style: none; margin: 0; padding: 6px 0;
  background: #fff; border-radius: 10px; min-width: 180px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
  color: #111827;
}
.amh-user-menu-info { padding: 10px 14px 8px; border-bottom: 1px solid #f1f5f9; display: flex; flex-direction: column; }
.amh-user-menu-info strong { font-size: 13px; font-weight: 800; color: #111827; }
.amh-user-menu-info small { font-size: 11px; color: #6b7280; margin-top: 2px; word-break: break-all; }
.amh-user-menu-btn {
  width: 100%; text-align: left; padding: 10px 14px; border: none; background: transparent;
  font-size: 13px; color: #dc2626; font-weight: 700; cursor: pointer;
}
/* 마이페이지 항목 — 로그아웃만 빨갛게 두고 나머지는 보통 글씨 */
.amh-user-menu-btn.page { color: #111827; font-weight: 600; }
.amh-user-menu-sep { border-top: 1px solid #f1f5f9; margin-top: 2px; padding-top: 2px; }
.amh-menu-toast {
  position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%); z-index: 260;
  margin: 0; padding: 9px 14px; border-radius: 999px;
  background: rgba(17, 24, 39, 0.92); color: #fff; font-size: 12px; white-space: nowrap;
}
.amh-user-menu-btn:hover { background: #f9fafb; }

@media (max-width: 400px) {
  .amh-info { gap: 6px; font-size: 10px; }
  .amh-info-cell { gap: 3px; }
  .amh-icon { width: 12px; height: 12px; }
  .amh-greet { font-size: 11px; }
  .amh-greet-icon { width: 14px; height: 14px; }
}
</style>
