<script setup lang="ts">
// MYPAGE — 더보기의 바로가기에서 들어온다.
// 선정물건·계정 자리를 카드로 모아 둔다. 건수는 실제 물건 자료에서 센다.
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import AppToast from '../components/AppToast.vue';
import { useAuthStore } from '../stores/authStore';
import { useAuctionStore } from '../stores/auctionStore';
import { POINT_GRADES } from '../services/pointPolicy';
import { TRIAL_DAYS } from '../services/trialInfo';

const router = useRouter();
const auth = useAuthStore();
const store = useAuctionStore();

/** 아이디 — 로그인에 쓰는 메일의 앞쪽 */
const loginId = computed(() => (auth.email ?? '').split('@')[0] || '-');
/** 등급 — 결제 누계를 아직 들고 있지 않아 모두 첫 등급에서 시작한다 */
const grade = POINT_GRADES[0];
const myPoint = 0;

/* ───────── 건수 — 실제 물건에서 센다 ───────── */

/** 온비드에서 온 것은 공매, 나머지는 경매 */
const isPublicSale = (id: string) => id.startsWith('onbid-');
const auctionCount = computed(() => store.auctions.filter((a) => !isPublicSale(a.id)).length);
const publicSaleCount = computed(() => store.auctions.filter((a) => isPublicSale(a.id)).length);

const p2 = (n: number) => String(n).padStart(2, '0');
const now = new Date();
const todayKey = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
const monthKey = `${now.getFullYear()}-${p2(now.getMonth() + 1)}`;
const dateKeyOf = (raw?: string) => {
  const d = String(raw ?? '').replace(/\D/g, '');
  return d.length >= 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : '';
};
const bidToday = computed(() => store.auctions.filter((a) => dateKeyOf(a.eventDate) === todayKey).length);
const bidMonth = computed(() => store.auctions.filter((a) => dateKeyOf(a.eventDate).startsWith(monthKey)).length);

/* ───────── 카드 ───────── */

interface Card {
  icon: string;
  title: string;
  desc: string;
  path: string;
  /** 카드 아래 작은 숫자 줄 */
  tally?: string;
  lead?: boolean;
}

const PICK_CARDS = computed<Card[]>(() => [
  {
    icon: '⭐', title: '나의 선정물건', lead: true,
    desc: '내가 등록한 물건을 한자리에서 관리합니다.',
    path: '/auctions/watchlist',
    tally: `경매 ${auctionCount.value}건 · 공매 ${publicSaleCount.value}건`,
  },
  { icon: '📦', title: '보관함', desc: '잠시 내려놓은 물건 — 꺼내면 단계 그대로 돌아옵니다.', path: '/archive' },
  { icon: '🗑️', title: '휴지통', desc: '치운 물건 — 되살리거나 완전히 지웁니다.', path: '/trash' },
  { icon: '🔔', title: '알림설정', desc: '기한·일정 알림을 하나씩 켜고 끕니다.', path: '/notifications' },
  { icon: '🏢', title: '중개업체 관리', desc: '상호·지역·연락처·평가를 더하고 뺍니다.', path: '/agencies' },
  {
    icon: '📅', title: '입찰달력',
    desc: '선정물건의 입찰 일정을 달력에 표시해 드립니다.',
    path: '/bid-calendar',
    tally: `오늘 ${bidToday.value}건 · 이달 ${bidMonth.value}건`,
  },
]);

const ACCOUNT_CARDS: Card[] = [
  { icon: '💳', title: '결제관리', desc: '나의 결제금액과 결제기간을 한눈에 볼 수 있습니다.', path: '/payments' },
  { icon: '🙍', title: '내 정보 수정', desc: '가입된 나의 개인정보를 다시 수정할 수 있습니다.', path: '/profile' },
  { icon: '🚪', title: '회원탈퇴', desc: '탈퇴 시 회원님의 모든 정보는 삭제됩니다.', path: '/withdraw' },
];

const toastText = ref('');
const go = (c: Card) => {
  if (!c.path) {
    toastText.value = `${c.title} — 준비 중입니다.`;
    window.setTimeout(() => { toastText.value = ''; }, 1600);
    return;
  }
  router.push(c.path);
};
</script>

<template>
  <section class="myp-shell">
    <header class="myp-header">
      <button type="button" class="myp-back" aria-label="뒤로" @click="router.back()">‹</button>
      <h1 class="myp-title">MYPAGE</h1>
      <span class="myp-crumb">더보기 › 마이페이지</span>
    </header>

    <div class="myp-body">
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
            <button type="button" class="myp-point" @click="router.push('/point-history')">
              {{ myPoint.toLocaleString('ko-KR') }} <small>P</small>
            </button>
          </div>
          <div class="myp-cell">
            <span class="myp-chip">결제 내역</span>
            <button type="button" class="myp-plan" @click="router.push('/billing')">이용권 없음 ›</button>
          </div>
        </div>
      </section>

      <!-- MY 선정물건 -->
      <h2 class="myp-h2"><em>MY</em> 선정물건</h2>
      <div class="myp-grid">
        <button
          v-for="c in PICK_CARDS"
          :key="c.title"
          type="button"
          :class="['myp-card', { lead: c.lead }]"
          @click="go(c)"
        >
          <span class="myp-card-ico">{{ c.icon }}</span>
          <span class="myp-card-txt">
            <strong>{{ c.title }}<i>›</i></strong>
            <small>{{ c.desc }}</small>
            <em v-if="c.tally" class="myp-tally">{{ c.tally }}</em>
          </span>
        </button>
      </div>

      <!-- 계정 관리 -->
      <h2 class="myp-h2">계정 관리</h2>
      <div class="myp-grid">
        <button v-for="c in ACCOUNT_CARDS" :key="c.title" type="button" class="myp-card" @click="go(c)">
          <span class="myp-card-ico">{{ c.icon }}</span>
          <span class="myp-card-txt">
            <strong>{{ c.title }}<i>›</i></strong>
            <small>{{ c.desc }}</small>
          </span>
        </button>
      </div>

      <!-- 무료체험 -->
      <button type="button" class="myp-trial" @click="router.push('/trial')">
        <strong>{{ TRIAL_DAYS }}일무료체험 이용하기</strong>
        <small>무료체험은 계정당 1회 {{ TRIAL_DAYS }}일(72시간) 동안 사용할 수 있습니다.</small>
        <small>· 체험 항목 : 물건 관리 / 임장경로 / 자금관리 / 낙찰이후</small>
      </button>
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
.myp-title { margin: 0; font-size: 20px; font-weight: 800; color: #111827; letter-spacing: 0.5px; }
.myp-crumb { margin-left: auto; font-size: 11px; color: #9ca3af; }
.myp-body { padding: 16px 12px; }

/* 내 자리 */
.myp-sum {
  position: relative; margin-bottom: 18px;
  background: #fafbfe; border: 1px solid #e8ebf1; border-radius: 10px; padding: 16px 12px 12px;
}
.myp-who {
  position: absolute; top: -10px; left: 12px;
  background: #fff; border: 1px solid #e8ebf1; border-radius: 6px; padding: 3px 9px;
  font-size: 11.5px; font-weight: 800; color: #1f3a72;
}
.myp-who em { font-style: normal; font-weight: 600; color: #8a93a4; margin-left: 3px; }
.myp-cells { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 6px 0 2px; }
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
.myp-point {
  border: none; background: transparent; padding: 0; cursor: pointer;
  font-family: inherit; font-size: 17px; font-weight: 800; color: #e8622a;
}
.myp-point small { font-size: 11px; color: #6b7280; font-weight: 700; }
.myp-plan {
  border: none; background: transparent; padding: 0; cursor: pointer;
  font-family: inherit; font-size: 13px; font-weight: 800; color: #111827;
}

/* 묶음 제목 */
.myp-h2 { margin: 0 2px 8px; font-size: 14px; font-weight: 800; color: #111827; }
.myp-h2 em { font-style: normal; color: #4a5bb5; margin-right: 4px; }
.myp-h2 + .myp-grid { margin-bottom: 18px; }

/* 카드 */
.myp-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; }
.myp-card {
  display: flex; align-items: flex-start; gap: 9px; text-align: left; cursor: pointer;
  background: #fff; border: 1px solid #e8ebf1; border-radius: 12px; padding: 12px 11px;
}
.myp-card.lead { grid-column: 1 / -1; border-color: #c2cdf0; background: #f7f9ff; }
.myp-card-ico {
  flex: none; width: 34px; height: 34px; border-radius: 9px; background: #eef2fc;
  display: inline-flex; align-items: center; justify-content: center; font-size: 17px;
}
.myp-card-txt { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.myp-card-txt strong {
  display: flex; align-items: center; gap: 3px;
  font-size: 12.5px; font-weight: 800; color: #111827;
}
.myp-card-txt strong i { font-style: normal; font-size: 13px; color: #c3cbdd; }
.myp-card-txt small { font-size: 10.5px; line-height: 1.55; color: #8a93a4; word-break: keep-all; }
.myp-tally {
  align-self: flex-start; margin-top: 4px; padding: 3px 8px; border-radius: 5px;
  background: #eef2fc; font-style: normal; font-size: 11px; font-weight: 800; color: #2a3f8f;
}

/* 무료체험 */
.myp-trial {
  width: 100%; margin-top: 4px; text-align: center; cursor: pointer;
  background: #fff; border: 1px solid #e8ebf1; border-radius: 12px; padding: 14px 12px;
  display: flex; flex-direction: column; gap: 4px;
}
.myp-trial strong { font-size: 13px; font-weight: 800; color: #1f3a72; }
.myp-trial small { font-size: 10.5px; line-height: 1.6; color: #8a93a4; word-break: keep-all; }
</style>
