<script setup lang="ts">
// 마이페이지 메뉴 카드 — MYPAGE 화면과 더보기가 같은 것을 쓴다.
// 건수는 실제 물건 자료에서 센다.
import { computed, inject, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppToast from './AppToast.vue';
import { useAuctionStore } from '../stores/auctionStore';
import { useAuthStore } from '../stores/authStore';
import { propTypeName } from '../utils/propertyType';
import { POINT_GRADES } from '../services/pointPolicy';
import { PLAN_REST_DAYS } from '../services/billingPlans';

const router = useRouter();
const store = useAuctionStore();

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

/** 종류별 건수 — 많은 것부터. 선정물건 목록의 배지와 같은 기준으로 묶는다 */
const typeTally = computed(() => {
  const by = new Map<string, number>();
  for (const a of store.auctions) {
    const name = propTypeName(a.propertyType);
    by.set(name, (by.get(name) ?? 0) + 1);
  }
  return [...by.entries()].sort((x, y) => y[1] - x[1]).map(([name, n]) => `${name} ${n}`);
});

/** 등급·포인트 — 쌓는 길을 아직 붙이지 않아 첫 등급과 0 으로 보인다 */
const grade = POINT_GRADES[0];
const myPoint = 0;
/** 아이디 — 메일 주소는 통째로 보이지 않게 앞쪽만 적는다 */
const auth = useAuthStore();
const loginId = computed(() => (auth.email ?? '').split('@')[0] || '-');

interface Card {
  icon: string;
  title: string;
  /** 없으면 제목만 적는다 */
  desc?: string;
  path: string;
  tally?: string;
  /** 두 번째 줄 — 종류별 건수처럼 여러 토막 */
  tallies?: string[];
  lead?: boolean;
}

const PICK_CARDS = computed<Card[]>(() => [
  {
    icon: '⭐', title: '나의 선정물건', lead: true,
    desc: '내가 등록한 물건을 한자리에서',
    path: '/auctions/watchlist',
    tally: `경매 ${auctionCount.value}건 · 공매 ${publicSaleCount.value}건`,
    tallies: typeTally.value,
  },
  { icon: '📦', title: '보관함', desc: '선정물건 중 보관 물건', path: '/archive' },
  { icon: '🗑️', title: '휴지통', desc: '물건 지우기 및 되살리기', path: '/trash' },
  { icon: '🔔', title: '알림설정', desc: '기한·일정 알림', path: '/notifications' },
  { icon: '🏢', title: '중개업체 관리', desc: '상호·연락처 관리', path: '/agencies' },
  {
    icon: '📅', title: '입찰달력',
    path: '/bid-calendar',
    tally: `오늘 ${bidToday.value}건 · 이달 ${bidMonth.value}건`,
  },
  { icon: '🛠️', title: '인테리어 업체', desc: '견적·업체 비딩 관리', path: '/interior-vendors' },
]);

/** 웹 — 웹 마이페이지에 있는 AI 설정 둘을 계정관리에도 둔다(누르면 웹 마이페이지의 그 자리로). 앱에는 없다 */
const webEmbed = inject<boolean>('webEmbed', false);
const WEB_AI_CARDS: Card[] = [
  { icon: '🤖', title: 'AI 자동 분석 설정', desc: '자동 등록 · 권리 분석 켜고 끄기', path: '/web-mypage' },
  { icon: '🔑', title: '제미나이 API 키 등록', desc: 'AI 분석에 쓰는 키', path: '/web-mypage' },
];
const ACCOUNT_CARDS_BASE: Card[] = [
  { icon: '🎁', title: '3일무료체험', desc: '무료로 먼저 써 보기', path: '/trial' },
  { icon: '🧾', title: '결제하기', desc: '이용 기간 고르기', path: '/billing' },
  { icon: '💳', title: '결제관리', desc: '내역·영수증 보기', path: '/payments' },
  { icon: '🅿️', title: '포인트내역', desc: '적립·사용 내역', path: '/point-history' },
  { icon: '🙍', title: '정보수정', desc: '닉네임·개인정보', path: '/profile' },
  { icon: '🚪', title: '회원탈퇴', desc: '계정·자료 삭제', path: '/withdraw' },
];
const ACCOUNT_CARDS = webEmbed ? [...ACCOUNT_CARDS_BASE, ...WEB_AI_CARDS] : ACCOUNT_CARDS_BASE;

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
  <div class="mpc">
    <!-- 내 자리 한눈에 — 누르면 그 화면으로 간다 -->
    <div class="mpc-sum">
      <span class="mpc-who">{{ auth.nickname || '게스트' }} 님<em>( {{ loginId }} )</em></span>
      <button type="button" class="mpc-cell" @click="router.push({ path: '/points', query: { tab: 'grade' } })">
        <span class="mpc-chip">{{ grade.name }} 회원</span>
        <span :class="['mpc-badge', grade.tone]">{{ grade.name.slice(0, 1) }}</span>
      </button>
      <button type="button" class="mpc-cell" @click="router.push('/point-history')">
        <span class="mpc-chip">누적 포인트</span>
        <span class="mpc-val">{{ myPoint.toLocaleString('ko-KR') }} <small>P</small></span>
      </button>
      <button type="button" class="mpc-cell" @click="router.push('/payments')">
        <span class="mpc-chip">결제 내역</span>
        <span class="mpc-val">{{ PLAN_REST_DAYS }}일</span>
      </button>
    </div>

    <h2 class="mpc-h2">선정물건</h2>
    <div class="mpc-grid">
      <button
        v-for="c in PICK_CARDS"
        :key="c.title"
        type="button"
        :class="['mpc-card', { lead: c.lead }]"
        @click="go(c)"
      >
        <span class="mpc-ico">{{ c.icon }}</span>
        <span class="mpc-txt">
          <strong>{{ c.title }}</strong>
          <small v-if="c.desc">{{ c.desc }}</small>
          <span v-if="c.tally || c.tallies?.length" class="mpc-tallyline">
            <em v-if="c.tally" class="mpc-tally">{{ c.tally }}</em>
            <i v-for="t in c.tallies" :key="t" class="mpc-type">{{ t }}</i>
          </span>
        </span>
        <i class="mpc-go">›</i>
      </button>
    </div>

    <h2 class="mpc-h2">계정관리</h2>

    <div class="mpc-grid">
      <button v-for="c in ACCOUNT_CARDS" :key="c.title" type="button" class="mpc-card" @click="go(c)">
        <span class="mpc-ico">{{ c.icon }}</span>
        <span class="mpc-txt">
          <strong>{{ c.title }}</strong>
          <small v-if="c.desc">{{ c.desc }}</small>
        </span>
        <i class="mpc-go">›</i>
      </button>
    </div>

    <AppToast :visible="!!toastText" :text="toastText" />
  </div>
</template>

<style scoped>
.mpc-h2 { margin: 0 2px 8px; font-size: 14px; font-weight: 800; color: #111827; }
.mpc-h2 em { font-style: normal; color: #4a5bb5; margin-right: 4px; }
.mpc-h2 + .mpc-grid { margin-bottom: 18px; }

/* 내 자리 세 칸 — 칸 전체가 단추다. 이름표는 테두리에 걸쳐 앉는다 */
.mpc-sum {
  position: relative;
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 10px 0 8px;
  background: #fafbfe; border: 1px solid #e8ebf1; border-radius: 12px; padding: 16px 8px 10px;
}
.mpc-who {
  position: absolute; top: -10px; left: 12px;
  background: #fff; border: 1px solid #e8ebf1; border-radius: 6px; padding: 3px 9px;
  font-size: 11.5px; font-weight: 800; color: #1f3a72;
}
.mpc-who em { font-style: normal; font-weight: 600; color: #8a93a4; margin-left: 3px; }
.mpc-cell {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px;
  border: none; background: transparent; cursor: pointer;
  padding: 6px 4px; border-radius: 8px; font-family: inherit;
}
.mpc-cell:hover { background: #f1f4fb; }
.mpc-chip {
  padding: 3px 9px; border-radius: 5px; background: #4a5bb5; color: #fff;
  font-size: 10.5px; font-weight: 700; white-space: nowrap;
}
.mpc-badge {
  width: 30px; height: 30px; border-radius: 8px; color: #fff;
  display: inline-flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800;
}
.mpc-badge.welcome { background: #b5d334; }
.mpc-badge.silver { background: #b9bec9; }
.mpc-badge.gold { background: #e8bb3d; }
.mpc-badge.family { background: #7b6ad4; }
.mpc-val { font-size: 16px; font-weight: 800; color: #e8622a; }
.mpc-val small { font-size: 11px; color: #6b7280; font-weight: 700; }

.mpc-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; }
/* 카드 전체가 단추다 — 꺾쇠는 '누를 수 있다'는 표시일 뿐, 어디를 눌러도 같이 간다.
   글이 한 줄이라 그림과 글의 세로 가운데를 맞춘다 */
.mpc-card {
  position: relative; display: flex; align-items: center; gap: 9px;
  text-align: left; cursor: pointer;
  background: #fff; border: 1px solid #e8ebf1; border-radius: 12px; padding: 11px 20px 11px 11px;
}
.mpc-card.lead { grid-column: 1 / -1; align-items: flex-start; border-color: #c2cdf0; background: #f7f9ff; }
.mpc-go {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  font-style: normal; font-size: 16px; color: #c3cbdd; pointer-events: none;
}
.mpc-ico {
  flex: none; width: 34px; height: 34px; border-radius: 9px; background: #eef2fc;
  display: inline-flex; align-items: center; justify-content: center; font-size: 17px;
}
.mpc-txt { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.mpc-txt strong { font-size: 12.5px; font-weight: 800; color: #111827; }
/* 설명은 한 줄로 — 칸을 넘치면 … 로 줄인다 */
.mpc-txt small {
  font-size: 10.5px; line-height: 1.5; color: #8a93a4;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.mpc-card.lead .mpc-txt small { white-space: normal; word-break: keep-all; }
/* 건수 줄 — 경매·공매 수와 종류별 수가 한 줄에 선다 (모자라면 다음 줄로) */
.mpc-tallyline { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 5px; }
.mpc-tally {
  padding: 3px 8px; border-radius: 5px;
  background: #eef2fc; font-style: normal; font-size: 11px; font-weight: 800; color: #2a3f8f;
}
.mpc-type {
  font-style: normal; font-size: 10.5px; font-weight: 700; color: #4b5563;
  background: #f3f5fa; border-radius: 4px; padding: 3px 6px;
}
</style>
