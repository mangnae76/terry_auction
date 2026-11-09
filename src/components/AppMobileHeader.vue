<script setup lang="ts">
import { userMessage } from '../services/userMessage';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import BrandLogo from './BrandLogo.vue';
import calendarIcon from '../assets/icones/calendar-days.png';
import { useAuthStore } from '../stores/authStore';
import { MY_PAGE_ITEMS, type MyPageItem } from '../services/myPageMenu';
import { useAlertBadge } from '../services/alertBadge';
import { useBoardNew } from '../services/boardFeed';
import { POINT_GRADES } from '../services/pointPolicy';
import { PLAN_REST_DAYS, POINTS_OPEN } from '../services/billingPlans';

const authStore = useAuthStore();
const router = useRouter();
const menuOpen = ref(false);

/** 머리글의 '결제하기' 글자 — 내리려면 false 로 */
const SHOW_PAY = true;

/** 회원 등급·포인트 — 적립과 결제를 붙이기 전이라 첫 등급에서 시작한다 */
const grade = POINT_GRADES[0];
const myPoint = 0;
/** 누르면 그 화면으로 간다. 보유포인트 줄은 포인트를 붙일 때까지 뺀다(POINTS_OPEN, 지우지 않음) */
const USER_FACTS = [
  ...(POINTS_OPEN ? [{ label: '보유포인트', value: `${myPoint.toLocaleString('ko-KR')}P`, path: '/point-history', tone: 'blue' }] : []),
  { label: '결제내역', value: `${PLAN_REST_DAYS}일`, path: '/payments', tone: 'orange' },
];
const goFact = (path: string) => {
  menuOpen.value = false;
  router.push(path);
};

/** 알림이 몇 건인지 — 더보기의 바로가기와 같은 셈을 쓴다 */
const { count: alertCount } = useAlertBadge();
/** 공지에 새 글이 있는가 — 더보기의 공지 탭 빨간 점과 같은 값 */
const { any: newsNew } = useBoardNew();

const displayNickname = computed(() => authStore.nickname || (authStore.email ? authStore.email.split('@')[0] : '게스트'));
/** 아이디 — 메일 주소는 통째로 보이지 않게 앞쪽만 적는다 */
const loginId = computed(() => (authStore.email ?? '').split('@')[0] || '-');

const formattedDate = computed(() => {
  const d = new Date();
  const yoil = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${String(d.getFullYear()).slice(-2)}.${mm}.${dd} (${yoil})`;
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
    alert(userMessage(e, '로그아웃하지 못했습니다. 다시 해 주세요.'));
  }
};
</script>

<template>
  <header class="amh">
    <div class="amh-row amh-row-top">
      <div class="amh-brand">
        <BrandLogo :size="40" tone="white" />
      </div>
    </div>
    <div class="amh-row amh-row-bottom">
      <button type="button" class="amh-bell" aria-label="공지" @click="router.push('/news')">
        <!-- 확성기 — 공지. 종과 같은 높이로 그린다. 새 글이 있으면 종처럼 빨간 점 -->
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3.5 9.5v5a1 1 0 0 0 1 1h2.5l8.5 5V3l-8.5 5.5H4.5a1 1 0 0 0-1 1Z" />
          <path d="M19 9a4.2 4.2 0 0 1 0 6" />
          <path d="M7.5 15.5l1.3 5" />
        </svg>
        <i v-if="newsNew" class="amh-bell-dot" />
      </button>
      <button type="button" class="amh-bell" aria-label="알림" @click="router.push('/notifications')">
        <!-- 종 — 알릴 것이 있으면 꼭지에 빨간 점이 붙는다 -->
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" />
          <path d="M10.3 19a2 2 0 0 0 3.4 0" />
        </svg>
        <i v-if="alertCount" class="amh-bell-dot" />
      </button>
      <!-- 날짜 — 결제하기 왼쪽. 누르면 입찰 캘린더로 -->
      <button type="button" class="amh-cal-btn" aria-label="입찰 캘린더 열기" @click="router.push('/bid-calendar')">
        <img :src="calendarIcon" alt="" class="amh-icon" />
        <span>{{ formattedDate }}</span>
      </button>
      <button v-if="SHOW_PAY" type="button" class="amh-pay" @click="router.push('/billing')">결제하기</button>
      <button type="button" class="amh-user-btn" aria-label="사용자 메뉴" :aria-expanded="menuOpen" @click="toggleMenu">
        <!-- 흉상 — 종과 같은 선 그림으로 맞춘다 (그림 파일은 작게 줄이면 뭉개진다) -->
        <svg
          class="amh-greet-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"
          fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"
        >
          <circle cx="12" cy="8.2" r="3.7" />
          <path d="M4.8 20.2c1.3-3.6 3.9-5.4 7.2-5.4s5.9 1.8 7.2 5.4" />
        </svg>
        <!-- 닉네임 — 아이콘에 붙여 한 단추로. 어디를 눌러도 회원정보가 열린다 -->
        <span class="amh-greet"><strong>{{ displayNickname }}</strong><span class="amh-greet-nim">님</span></span>
        <!-- 웹 머리띠와 같은 주황 ▼ — 메뉴가 열리면 뒤집힌다 -->
        <i :class="['amh-caret', { open: menuOpen }]" aria-hidden="true" />
      </button>
      <div v-if="menuOpen" class="amh-user-menu-wrap" @click.self="closeMenu">
        <ul class="amh-user-menu" @click.stop>
          <li class="amh-user-menu-head">마이턴 회원정보</li>
          <li class="amh-user-menu-info">
            <span class="amh-um-name">
              <!-- 등급 배지 — 등급은 포인트(결제 누계)로 정해져 같이 숨긴다(POINTS_OPEN) -->
              <span v-if="POINTS_OPEN" :class="['amh-um-badge', grade.tone]">{{ grade.name.slice(0, 1) }}</span>
              <strong>{{ displayNickname }} 님</strong>
              <em class="amh-um-id">({{ loginId }})</em>
            </span>
            <dl class="amh-um-facts">
              <template v-for="f in USER_FACTS" :key="f.label">
                <dt>
                  <button v-if="f.path" type="button" class="amh-um-link" @click="goFact(f.path)">{{ f.label }}<i>›</i></button>
                  <template v-else>{{ f.label }}</template>
                </dt>
                <dd :class="f.tone">{{ f.value }}</dd>
              </template>
            </dl>
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
/* 닉네임 글자색 — 로고 'MY' 의 하늘색. 날짜 · 결제하기 · 아이콘은 흰색 그대로 */
.amh { --amh-text: #50c3fc; }
/* 날짜를 누르면 입찰 캘린더로 — 글자는 옆 결제하기와 같게 */
.amh-cal-btn {
  border: none; background: transparent; padding: 2px 0; margin: 0 9px 0 0;
  display: inline-flex; align-items: center; gap: 3px; white-space: nowrap;
  font-family: inherit; font-size: 12px; font-weight: 400; color: #fff; cursor: pointer;
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
/* 공지 ~ 닉네임 줄은 로고와 같은 세로 가운데(띠 한가운데)에 — 올린 만큼 아래 마진으로 돌려줘 띠 높이(52px)는 그대로 */
.amh-row-bottom { justify-content: flex-end; gap: 6px; padding-right: 4px; margin-top: -22.5px; margin-bottom: 11.5px; margin-right: -7px; }

/* 로고는 띠 한가운데에 선다. 아래 인사줄이 16px 끌어올려져 있어
   윗줄만 보면 로고가 위로 치우친다 — 아래위 마진을 같은 값으로 주고 받아
   줄 높이는 그대로 둔 채 로고만 8px 내려 띠 한가운데에 맞춘다 */
.amh-brand {
  display: flex; align-items: center; line-height: 0; flex-shrink: 0;
  margin-top: 8px; margin-bottom: -8px;
  /* 왼쪽 끝을 아래 검색줄의 돋보기와 같은 자리에 둔다 — 그림 둘레 빈 여백만큼 더 당긴다(재 보니 3.6px 안쪽이었다) */
  margin-left: -5.5px;
}
/* 아이콘 네 개(공지 · 알림 · 달력 · 사람)는 그려진 높이를 같게(약 13.7px) — 그림마다 여백이 달라 칸 크기는
   공지 · 알림 17 · 달력 15 · 사람 19 로 다르다. 좁은 폰에서도 줄이지 않는다 */
.amh-icon {
  width: 15px; height: 15px;
  object-fit: contain;
  display: block;
  filter: brightness(0) invert(1);
}


/* 인사말과 종 사이도 종·사람 사이와 같은 만큼 띄운다 */
.amh-greet { font-size: 12px; color: var(--amh-text); font-weight: 400; white-space: nowrap; flex-shrink: 0; }
.amh-greet strong { color: inherit; font-weight: 400; margin: 0 1px 0 0; }
.amh-greet-nim { color: inherit; }
.amh-greet-icon { width: 19px; height: 19px; flex-shrink: 0; display: block; }
.amh-user-btn { color: #fff; }
/* 주황 ▼ — 웹 머리띠(.g-arrow)와 같은 꼴 · 같은 색 */
.amh-caret {
  flex: 0 0 auto; width: 0; height: 0; margin-left: 3px;
  border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 6px solid #f4700a;
  transition: transform 0.2s;
}
.amh-caret.open { transform: rotate(180deg); }
.amh-user-btn { border: none; background: transparent; padding: 3px; cursor: pointer; display: inline-flex; align-items: center; gap: 1px; font-family: inherit; }
/* 결제하기 */
.amh-pay {
  border: none; background: transparent; padding: 2px 0; cursor: pointer;
  font-family: inherit; font-size: 12px; font-weight: 400; color: #fff;
  margin-right: 9px;
}

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
/* 머리글 — 이 메뉴가 무엇인지 */
.amh-user-menu-head {
  padding: 9px 14px 7px; font-size: 11px; font-weight: 800; color: #1f3a72;
  background: #f3f6ff; border-bottom: 1px solid #e6ecfb;
}
.amh-user-menu-info { padding: 10px 14px 10px; border-bottom: 1px solid #f1f5f9; display: flex; flex-direction: column; }
.amh-um-name { display: flex; align-items: center; gap: 6px; }
.amh-um-badge {
  width: 20px; height: 20px; border-radius: 6px; color: #fff;
  display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800;
}
.amh-um-badge.welcome { background: #b5d334; }
.amh-um-badge.silver { background: #b9bec9; }
.amh-um-badge.gold { background: #e8bb3d; }
.amh-um-badge.family { background: #7b6ad4; }
.amh-user-menu-info strong { font-size: 13px; font-weight: 800; color: #111827; }
.amh-um-id { font-style: normal; font-size: 11px; color: #8a93a4; }
/* 포인트·결제·이용권 — 이름표와 값을 두 칸으로 */
/* 이름 칸 너비를 못 박아 꺾쇠가 줄마다 같은 자리에 선다 */
.amh-um-facts {
  margin: 9px 0 0; display: grid; grid-template-columns: 78px 1fr; row-gap: 3px; column-gap: 8px;
}
/* 네 줄은 굵게 하지 않는다 — 이름과 등급만 도드라지게 둔다 */
.amh-um-facts dt { font-size: 11px; color: #8a93a4; font-weight: 400; white-space: nowrap; }
.amh-um-facts dd { margin: 0; font-size: 11.5px; color: #374151; font-weight: 400; text-align: right; }
/* 포인트는 파랑, 남은 날은 주황 */
.amh-um-facts dd.blue { color: #2b6df3; }
.amh-um-facts dd.orange { color: #e8622a; }
/* 누르면 그 화면으로 간다는 뜻 — 파란 글자에 꺾쇠를 붙인다 */
.amh-um-link {
  border: none; background: transparent; padding: 0; cursor: pointer;
  display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 2px;
  font-family: inherit; font-size: 11px; font-weight: 400; color: #2b6df3;
}
.amh-um-link i { font-style: normal; font-size: 10px; color: #2b6df3; }
.amh-user-menu-btn {
  width: 100%; text-align: left; padding: 10px 14px; border: none; background: transparent;
  font-size: 13px; color: #dc2626; font-weight: 700; cursor: pointer;
}
/* 마이페이지 항목 — 로그아웃만 빨갛게 두고 나머지는 보통 글씨 */
.amh-user-menu-btn.page { color: #111827; font-weight: 600; }
.amh-user-menu-sep { border-top: 1px solid #f1f5f9; margin-top: 2px; padding-top: 2px; }
.amh-menu-toast {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 260;
  margin: 0; padding: 9px 14px; border-radius: 999px;
  background: rgba(17, 24, 39, 0.92); color: #fff; font-size: 12px; white-space: nowrap;
}
.amh-user-menu-btn:hover { background: #f9fafb; }

/* 넓은 폰(420px 이상) — 로고에 닿지 않는 만큼 날짜 · 결제하기 · 닉네임을 13px로 */
@media (min-width: 420px) {
  .amh-cal-btn, .amh-pay, .amh-greet { font-size: 13px; }
}

@media (max-width: 400px) {
  /* 좁은 손전화 */
  /* 아랫줄이 로고에 닿지 않게 틈을 줄인다 */
  .amh-row-bottom { gap: 3px; }
  .amh-cal-btn, .amh-pay, .amh-bell { margin-right: 4px; }
  .amh-greet { font-size: 12px; }
}
</style>
