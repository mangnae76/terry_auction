<script setup lang="ts">
// 마이페이지 메뉴 카드 — MYPAGE 화면과 더보기가 같은 것을 쓴다.
// 건수는 실제 물건 자료에서 센다.
import { computed, inject, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AppToast from './AppToast.vue';
import { useAuctionStore } from '../stores/auctionStore';
import { useAuthStore } from '../stores/authStore';
import { propTypeName } from '../utils/propertyType';
import { shownPlaceOf } from '../utils/addressName';
import { POINT_GRADES } from '../services/pointPolicy';
import { PLAN_REST_DAYS, POINTS_OPEN, isFreeMember } from '../services/billingPlans';
import { updateStamp } from '../services/updateStamp';
import { editLogDesc, editLogTag } from '../services/editLogText';

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
/* 회원등급 · 누적 포인트 칸 · 계정관리 '포인트내역' 카드 — 앱 · 웹 모두 POINTS_OPEN 하나로 숨긴다(지우지 않음, docs/서비스오픈목록.md 3-1) */
/** 무료 회원이면 결제내역 칸에 남은 날 대신 '무료회원' */
const freeMember = isFreeMember();
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
    icon: '📅', title: '입찰 캘린더',
    path: '/bid-calendar',
    tally: `오늘 ${bidToday.value}건 · 이달 ${bidMonth.value}건`,
  },
  { icon: '🛠️', title: '인테리어 업체', desc: '견적·업체 비딩 관리', path: '/interior-vendors' },
].filter((c) => !(webEmbed && c.path === '/bid-calendar')));   // 웹은 입찰 캘린더가 마이페이지 탭(결제하기 옆)에 따로 있다 — 기타 설정 카드에선 뺀다

/** 웹 — AI 설정(자동 분석 켜고 끄기 · 제미나이 키 등록 한 창)을 계정관리에 둔다. 누르면 웹이 설정 창을 띄운다. 앱에는 없다 */
const webEmbed = inject<boolean>('webEmbed', false);
const WEB_AI_CARDS: Card[] = [
  { icon: '🤖', title: 'AI 자동 분석 설정', desc: '켜고 끄기 · 제미나이 API 키 등록', path: '/web-ai' },
];
const ACCOUNT_CARDS_BASE: Card[] = [
  { icon: '🎁', title: '3일무료체험', desc: '무료로 먼저 써 보기', path: '/trial' },
  { icon: '🧾', title: '결제하기', desc: '이용 기간 고르기', path: '/billing' },
  { icon: '💳', title: '결제관리', desc: '내역·영수증 보기', path: '/payments' },
  { icon: '🅿️', title: '포인트내역', desc: '적립·사용 내역', path: '/point-history' },
  { icon: '🙍', title: '정보수정', desc: '닉네임·개인정보', path: '/profile' },
  { icon: '🚪', title: '회원탈퇴', desc: '계정·자료 삭제', path: '/withdraw' },
].filter((c) => POINTS_OPEN || c.path !== '/point-history');   // 포인트내역은 포인트를 붙일 때까지 뺀다
/** 웹 — 중요한 차례로, 두 칸씩 비슷한 것끼리 짝지어 놓는다(왼쪽 | 오른쪽)
 *  내 계정(정보수정 | AI 설정) → 결제(결제하기 | 결제관리) → 혜택(포인트내역 | 3일무료체험) → 회원탈퇴는 맨 끝 */
const WEB_ACCOUNT_ORDER = ['정보수정', 'AI 자동 분석 설정', '결제하기', '결제관리', ...(POINTS_OPEN ? ['포인트내역'] : []), '3일무료체험', '회원탈퇴'];
const ACCOUNT_CARDS = webEmbed
  ? WEB_ACCOUNT_ORDER.map((t) => [...ACCOUNT_CARDS_BASE, ...WEB_AI_CARDS].find((c) => c.title === t)).filter((c): c is Card => !!c)
  : ACCOUNT_CARDS_BASE;

// ===== 최근 작성 — 물건마다 남긴 editLog(저장할 때 한 줄)를 모아 새것부터 세 줄. 맨 위 요약 줄엔 한 건 =====
// 경매 진행 단계(물건상세 탭 · 임장경로 · 낙찰이후)에서 남긴 줄만 — 시장분석(손품조사 등)에서 남긴 줄은 뺀다
const STAGE_WHERE = /^(단계$|물건상세 › |임장경로|낙찰이후|자금관리 › )/;   // 단계 — 고정카드 · 선정물건 카드에서 단계를 바꾼 줄(웹 홈 최근 분석과 같게)
const FLOW_OF: Record<string, string> = { 진행절차: 'steps', 명도분석: 'evict', 세금분석: 'tax', 필요경비: 'need', 사업경비: 'biz', 매물등록: 'sell' };
const FIN_OF: Record<string, string> = { 자금입출금: 'cashFlow', 필요경비: 'businessExpense', 사업경비: 'interior', 세금신고: 'tax' };
const recentLive = computed(() => store.auctions
  .filter((a) => !a.hidden)
  .flatMap((a) => (a.editLog ?? []).filter((e) => STAGE_WHERE.test(String(e.where ?? ''))).map((e) => {
    const where = String(e.where ?? '').replace(/입찰가산정/g, '수익분석');
    // 꼬리표 칩 · 설명 — 웹 홈 최근 분석과 같은 글('단계' + '낙찰 → 임장예정 변경', '수익분석' + '내용수정')
    return { ...e, where, tag: editLogTag(where), desc: editLogDesc(where, e.what, e.items), id: a.id, cn: a.caseNumber || '', place: shownPlaceOf(a) };
  }))
  .sort((x, y) => y.at - x.at)
  .slice(0, 3)
  // 줄 이름표 — 물건 · 화면(같은 둘이 또 있으면 순번). 시각을 넣으면 시각이 바뀔 때마다 줄을 새로 만들어 깜빡였다
  .map((r, i, all) => ({ ...r, key: `${r.id}|${r.where}|${all.slice(0, i).filter((x) => x.id === r.id && x.where === r.where).length}` })));
// 최근 작성은 화면을 열 때 한 번만 — 저장할 때마다 바뀌어 다시 그리면 깜빡이고, 카드로 들어간 화면이 흔들렸다.
// 물건 목록이 처음 들어온 순간의 줄을 붙잡아 두고, 새 줄은 다시 들어올 때(새로고침 · 화면 다시 열기) 보인다
const recent = ref<typeof recentLive.value>([]);
let recentTaken = false;
watch(() => store.auctions.length, () => {
  if (recentTaken || !store.auctions.length) return;
  recentTaken = true;
  recent.value = recentLive.value;
}, { immediate: true });
const agoText = (at: number) => {
  const m = Math.floor((Date.now() - at) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  if (m < 24 * 60 && new Date(at).toDateString() === new Date().toDateString()) return `${Math.floor(m / 60)}시간 전`;
  return updateStamp(at);
};
/** 그 물건의 그 화면으로 — 물건상세 탭 이름 → 탭 열쇠, 손품조사 · 임장경로 기록은 손품+현장 탭 */
const TAB_OF: Record<string, string> = { 물건정보: 'basic', 권리분석: 'rights', '손품+현장': 'survey', 손품조사: 'survey', 수요분석: 'survey', 가격분석: 'survey', 시세분석: 'survey', 손품결론: 'survey', 가격정보: 'verify', 수익분석: 'profit', 입찰가산정: 'profit' };
const openRecent = (r: { id: string; where: string }) => {
  if (r.where.startsWith('임장경로')) { router.push('/field-trip'); return; }
  if (r.where.startsWith('낙찰이후')) {   // 낙찰이후 — 진행절차 안 그 탭(진행절차 ~ 매물등록)까지
    try { sessionStorage.setItem('pw.flow.sub', FLOW_OF[r.where.split(' › ')[1] ?? ''] ?? 'steps'); } catch { /* 그만 */ }
    router.push({ path: '/post-win', query: { tab: 'flow' } }); return;
  }
  if (r.where.startsWith('자금관리')) { router.push({ path: '/finance', query: { tab: FIN_OF[r.where.split(' › ')[1] ?? ''] ?? 'cashFlow' } }); return; }
  const tab = TAB_OF[r.where.split(' › ').pop() ?? ''] ?? 'basic';
  router.push({ path: `/auctions/${r.id}`, query: { tab } });
};

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
      <!-- 웹 — 나의 선정물건은 이름 바로 옆 칸으로(아래 카드 묶음에서는 뺀다) -->
      <button v-if="webEmbed" type="button" class="mpc-cell" @click="go(PICK_CARDS[0])">
        <span class="mpc-chip">나의선정물건</span>
        <span class="mpc-val">{{ (auctionCount + publicSaleCount).toLocaleString('ko-KR') }}<small>건</small></span>
      </button>
      <!-- 회원등급 · 누적 포인트 — 앱 · 웹 모두 서비스 오픈 때까지 숨긴다(POINTS_OPEN) -->
      <button v-if="POINTS_OPEN" type="button" class="mpc-cell" @click="router.push({ path: '/points', query: { tab: 'grade' } })">
        <span class="mpc-chip">{{ grade.name }} 회원</span>
        <span :class="['mpc-badge', grade.tone]">{{ grade.name.slice(0, 1) }}</span>
      </button>
      <button v-if="POINTS_OPEN" type="button" class="mpc-cell" @click="router.push('/point-history')">
        <span class="mpc-chip">누적 포인트</span>
        <span class="mpc-val">{{ myPoint.toLocaleString('ko-KR') }} <small>P</small></span>
      </button>
      <!-- 웹 — 최근 작성: 마지막으로 손댄 물건 · 화면 · 내용, 누르면 그 자리로 -->
      <button v-if="webEmbed && recent.length" type="button" class="mpc-cell mpc-recent" :title="`${recent[0].tag} · ${recent[0].desc}`" @click="openRecent(recent[0])">
        <span class="mpc-chip">최근작성</span>
        <span class="mpc-rec">
          <b>{{ recent[0].cn }} · {{ recent[0].place }}</b>
          <small><i class="mpc-tag">{{ recent[0].tag }}</i>{{ recent[0].desc }} · {{ agoText(recent[0].at) }}</small>
        </span>
        <i class="mpc-go2">이어서 ›</i>
      </button>
      <button type="button" class="mpc-cell" @click="router.push('/payments')">
        <span class="mpc-chip">결제내역</span>
        <span class="mpc-val">{{ freeMember ? '무료회원' : `${PLAN_REST_DAYS}일` }}</span>
      </button>
    </div>

    <template v-if="webEmbed && recent.length">
      <!-- 전체보기 — 웹이 홈 '최근 분석 내역'과 같은 창(날짜 묶음 · 구분 칩)을 띄운다 -->
      <div class="mpc-h2row"><h2 class="mpc-h2">최근 작성</h2><button type="button" class="mpc-more" @click="router.push('/web-recent')">전체보기 →</button></div>
      <div class="mpc-grid mpc-recent-list">
        <button v-for="r in recent" :key="r.key" type="button" class="mpc-card mpc-rrow" @click="openRecent(r)">
          <span class="mpc-rt">
            <span class="mpc-t1"><span class="mpc-what"><b>{{ r.cn }}</b>{{ r.place }}</span><span class="mpc-when">{{ agoText(r.at) }}</span></span>
            <span class="mpc-t2"><i class="mpc-tag">{{ r.tag }}</i>{{ r.desc }}</span>
          </span>
          <i class="mpc-go">›</i>
        </button>
      </div>
    </template>

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

    <!-- 기타 설정 — 예전 「선정물건」 묶음(보관함 · 휴지통 · 알림설정 …). 계정관리 아래로 -->
    <h2 class="mpc-h2">기타 설정</h2>
    <div class="mpc-grid">
      <button
        v-for="c in (webEmbed ? PICK_CARDS.filter((x) => !x.lead) : PICK_CARDS)"
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

    <AppToast :visible="!!toastText" :text="toastText" />
  </div>
</template>

<style scoped>
.mpc-h2 { margin: 0 2px 8px; font-size: 14px; font-weight: 800; color: #111827; }
.mpc-h2 em { font-style: normal; color: #4a5bb5; margin-right: 4px; }
.mpc-h2 + .mpc-grid, .mpc-h2row + .mpc-grid { margin-bottom: 18px; }
.mpc-h2row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.mpc-h2row .mpc-h2 { margin-bottom: 0; }
.mpc-more { height: 28px; padding: 0 10px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; color: #111827; font-size: 12px; font-weight: 700; cursor: pointer; }

/* 내 자리 칸 — 칸 전체가 단추다. 이름표는 테두리에 걸쳐 앉는다.
   칸 수는 보이는 만큼 똑같이 나눈다(포인트 두 칸을 숨기면 결제내역 한 칸이 통째로) */
.mpc-sum {
  position: relative;
  display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 6px; margin: 10px 0 8px;
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
/* 최근 작성 칸 — 건수 · 결제내역 숫자(오렌지)와 달리 글 두 줄. 남는 폭을 다 쓴다 */
.mpc-recent { flex: 1 1 auto !important; min-width: 0; justify-content: flex-start !important; }
.mpc-rec { display: grid; gap: 2px; min-width: 0; text-align: left; }
.mpc-rec b { font-size: 14px; font-weight: 800; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mpc-rec small { font-size: 12px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* 이어서 › — 칸 오른쪽 끝으로, 주소와는 최소 16px 띄운다(붙어 보였다 2026-11-03) */
.mpc-go2 { flex: 0 0 auto; margin-left: auto; padding-left: 16px; font-style: normal; font-size: 13px; font-weight: 700; color: #2b6df3; white-space: nowrap; }
/* 아래 최근 작성 세 줄 — 한 줄에 하나(두 칸으로 나누지 않는다) */
.mpc-recent-list { grid-template-columns: minmax(0, 1fr) !important; }
.mpc-rrow { display: grid !important; grid-template-columns: minmax(0, 1fr) 14px; align-items: center; gap: 10px; text-align: left; }
/* 한 줄 — 첫 줄 사건 · 주소 … 오른쪽 끝 언제, 둘째 줄 꼬리표 칩 + 설명(웹 홈 최근 분석과 같은 꼴, 2026-11-06) */
.mpc-rt { display: grid; gap: 3px; min-width: 0; }
.mpc-t1 { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.mpc-when { flex: 0 0 auto; margin-left: auto; font-size: 12.5px; color: #6b7280; font-variant-numeric: tabular-nums; white-space: nowrap; }
.mpc-what { min-width: 0; font-size: 13.5px; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mpc-what b { margin-right: 6px; }
.mpc-t2 { min-width: 0; font-size: 12px; color: #4b5563; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mpc-tag { font-style: normal; margin-right: 6px; padding: 1px 6px; border-radius: 4px; background: #eef2ff; color: #2b4fd8; font-size: 12px; font-weight: 700; }
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
