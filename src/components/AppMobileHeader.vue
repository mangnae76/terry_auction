<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import logoImg from '../assets/icones/log/LOGO_ENG.png';
import calendarIcon from '../assets/icones/calendar-days.png';
import sunIcon from '../assets/icones/sun.png';
import dollarIcon from '../assets/icones/circle-dollar-sign.png';
import refreshIcon from '../assets/icones/refresh-cw.png';
import fileUserIcon from '../assets/icones/file-user.png';
import { useAuthStore } from '../stores/authStore';
import { MY_PAGE_ITEMS, type MyPageItem } from '../services/myPageMenu';

const authStore = useAuthStore();
const router = useRouter();
const menuOpen = ref(false);

const displayNickname = computed(() => authStore.nickname || (authStore.email ? authStore.email.split('@')[0] : '게스트'));

const formattedDate = computed(() => {
  const d = new Date();
  const yoil = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${String(d.getFullYear()).slice(-2)}년 ${parseInt(mm, 10)}월 ${parseInt(dd, 10)}일 (${yoil})`;
});

const onRefresh = () => {
  if (typeof window !== 'undefined') window.location.reload();
};

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
        <img class="amh-brand-logo" :src="logoImg" alt="MYTURN" />
        <span class="amh-brand-sub">AUCTION</span>
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
        <button type="button" class="amh-refresh" aria-label="새로고침" @click="onRefresh">
          <img :src="refreshIcon" alt="" class="amh-icon" />
        </button>
      </div>
    </div>
    <div class="amh-row amh-row-bottom">
      <span class="amh-greet">반가워요! <strong>{{ displayNickname }}</strong><span class="amh-greet-nim">님</span></span>
      <button type="button" class="amh-user-btn" aria-label="사용자 메뉴" @click="toggleMenu">
        <img :src="fileUserIcon" alt="" class="amh-icon amh-greet-icon" />
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
  padding: 0 12px 9px;
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 0 0 auto;
}
.amh-row { display: flex; align-items: center; gap: 8px; }
.amh-row-top { justify-content: space-between; }
.amh-row-bottom { justify-content: flex-end; gap: 6px; padding-right: 4px; margin-top: -16px; margin-right: -5px; }

.amh-brand {
  display: flex; flex-direction: column; align-items: flex-start;
  gap: 0; flex-shrink: 0; line-height: 1;
}
.amh-brand-logo {
  height: 34px;
  width: auto;
  object-fit: contain;
  background: transparent;
  padding: 0;
  border-radius: 0;
  display: block;
  margin-top: 6px;
}
/* AUCTION의 마지막 N을 로고(MYTURN)의 마지막 N과 같은 세로선에 맞춘다.
   .amh-brand는 세로 플렉스라 width:100%가 로고 폭이 되고, 오른쪽 정렬이면 끝이 맞는다.
   letter-spacing은 마지막 글자 뒤에도 붙어 오른쪽에 빈틈을 남기므로 그만큼 당겨 준다. */
.amh-brand-sub {
  display: block;
  width: 100%;
  box-sizing: border-box;
  font-size: 7.2px;
  font-weight: 700;
  letter-spacing: 0.8px;
  color: #fff;
  opacity: 0.95;
  margin-top: -10px;
  padding-left: 0;
  text-align: right;
  margin-right: -0.8px;
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

.amh-refresh {
  border: none; background: transparent; padding: 2px;
  cursor: pointer; display: inline-flex; align-items: center;
}

.amh-greet { font-size: 11px; color: #ffb38a; font-weight: 400; white-space: nowrap; flex-shrink: 0; }
.amh-greet strong { color: #fff; font-weight: 400; margin: 0 2px; }
.amh-greet-nim { color: #fff; }
.amh-greet-icon { width: 14px; height: 14px; flex-shrink: 0; }
.amh-user-btn { border: none; background: transparent; padding: 2px; cursor: pointer; display: inline-flex; align-items: center; }
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
  .amh-brand-logo { height: 30px; }
  .amh-brand-sub { font-size: 6px; letter-spacing: 0.6px; padding-left: 0; text-align: right; margin-right: -0.6px; }
  .amh-greet { font-size: 11px; }
  .amh-greet-icon { width: 14px; height: 14px; }
}
</style>
