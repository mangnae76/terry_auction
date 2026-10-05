<script setup lang="ts">
// 더보기 — 계정·설정·공지 등 다른 탭에 들어가지 않는 것들을 모아 둔다.
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import { useAuthStore } from '../stores/authStore';

const router = useRouter();
const authStore = useAuthStore();

const displayName = computed(() => {
  const nick = authStore.nickname ?? '';
  if (nick) return nick;
  const email = authStore.email ?? '';
  return email ? email.split('@')[0] : '게스트';
});

const toast = ref('');
// 위쪽 '마이페이지' 버튼 → 아래 마이페이지 묶음으로 데려간다
const myPageRef = ref<HTMLElement | null>(null);
const goMyPage = () => {
  myPageRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
const notReady = (what: string) => {
  toast.value = `${what} — 준비 중입니다.`;
  setTimeout(() => { toast.value = ''; }, 1600);
};

const onLogout = async () => {
  await authStore.logout();
  router.push('/login');
};

const QUICK = ['알림설정', '결제관리', '인증/보안'];

const EVENTS = [
  { tag: '안내', text: '경매 PDF 자동 분석 정확도 개선 안내' },
  { tag: '안내', text: '국토부 실거래가 조회 기간 확대 (최대 12개월)' },
];

// 이벤트 배너 — 운영에서 내려주는 값으로 바꾸면 되는 자리. 지금은 더미 한 장.
const EVENT_BANNERS = [
  {
    badge: 'EVENT',
    title: '첫 낙찰 축하 리워드',
    desc: '마이턴에서 분석한 물건으로 낙찰받으면 분석 리포트 3개월 무료',
    cta: '자세히 보기',
    period: '2026.10.01 ~ 10.31',
  },
];

const NOTICES = [
  { tag: '', star: true, text: '서비스 이용약관 개정 안내 (시행 예정)' },
  { tag: '점검', star: false, text: '정기 서버 점검 안내 — 매월 첫째 주 새벽' },
  { tag: '안내', star: false, text: '국토부 실거래가 조회 일시 지연 안내' },
  { tag: '안내', star: false, text: '경매 PDF 자료 보관 기간 안내' },
];

const UPDATES = [
  { tag: '신규', text: '세금관리 탭 추가 — 연도별 사업소득·종합소득세 집계' },
  { tag: '신규', text: '입찰 캘린더 추가 — 선정물건 입찰일을 달력으로' },
  { tag: '기능', text: '입찰가산정에 낙찰일·매도일 입력 추가' },
  { tag: '기능', text: '임장경로 동선최적화 목록 드래그 순서 변경' },
  { tag: '개선', text: '선정물건 목록 중요도 별표(1·2·3) 표시' },
  { tag: '개선', text: '숨긴 물건 선택 복원 기능' },
];

const MY_PAGE = [
  { name: '입찰 캘린더', desc: '선정물건 입찰일을 달력으로', path: '/bid-calendar' },
  { name: '나의 관심 물건', desc: '관심 단계로 담아 둔 물건', path: '/auctions/watchlist', query: { status: '임장예정' } },
  { name: '보관함', desc: '선정물건에서 치운 물건을 카드로 보고 되살리기', path: '/trash' },
  { name: '결제 관리', desc: '구독·결제 내역 관리', path: '' },
  { name: '내 정보 수정', desc: '닉네임·비밀번호 변경', path: '' },
  { name: '알림 설정', desc: '입찰일·가격변동 알림 받기', path: '' },
  { name: '회원 탈퇴', desc: '계정과 저장된 자료 삭제', path: '' },
];
// 아직 화면이 없는 항목은 안내만 띄운다
const openMyPageItem = (item: { name: string; path: string; query?: Record<string, string> }) => {
  if (!item.path) {
    notReady(item.name);
    return;
  }
  router.push({ path: item.path, query: item.query });
};


const POLICIES = ['이용약관', '개인정보처리방침', '위치기반서비스 이용약관', '청소년보호정책'];
</script>

<template>
  <section class="more-shell">
    <h1 class="more-title">더보기</h1>

    <!-- 계정 -->
    <section class="more-card">
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
          <div class="pills">
            <button type="button" class="pill" @click="onLogout">로그아웃</button>
            <button type="button" class="pill" @click="goMyPage">마이페이지</button>
            <button type="button" class="pill" @click="notReady('결제하기')">결제하기</button>
            <button type="button" class="pill" @click="notReady('고객센터')">고객센터</button>
          </div>
        </div>
      </div>

      <div class="quick">
        <button v-for="q in QUICK" :key="q" type="button" class="quick-item" @click="notReady(q)">{{ q }}</button>
      </div>
    </section>

    <!-- 이벤트 -->
    <section class="more-card">
      <h2 class="sec-head">이벤트</h2>
      <button v-for="(e, i) in EVENTS" :key="i" type="button" class="list-item" @click="notReady('이벤트')">
        <span class="tag">{{ e.tag }}</span>
        <span class="txt">{{ e.text }}</span>
      </button>

      <!-- 이벤트 배너 자리 — 여러 장이면 옆으로 넘겨 본다 -->
      <div class="ev-banners">
        <button
          v-for="(b, i) in EVENT_BANNERS"
          :key="i"
          type="button"
          class="ev-banner"
          @click="notReady('이벤트')"
        >
          <span class="ev-badge">{{ b.badge }}</span>
          <strong class="ev-title">{{ b.title }}</strong>
          <span class="ev-desc">{{ b.desc }}</span>
          <span class="ev-foot">
            <span class="ev-period">{{ b.period }}</span>
            <span class="ev-cta">{{ b.cta }} ›</span>
          </span>
        </button>
      </div>
    </section>

    <!-- 마이페이지 -->
    <section ref="myPageRef" class="more-card">
      <h2 class="sec-head">마이페이지</h2>
      <button v-for="m in MY_PAGE" :key="m.name" type="button" class="family" @click="openMyPageItem(m)">
        <span class="fname">{{ m.name }}</span>
        <span class="fdesc">{{ m.desc }}</span>
        <span class="arr">›</span>
      </button>
    </section>

    <!-- 공지사항 -->
    <section class="more-card">
      <button type="button" class="sec-head link" @click="notReady('공지사항')">
        공지사항<span class="dot" /><span class="arr">›</span>
      </button>
      <button v-for="(n, i) in NOTICES" :key="i" :class="['list-item', { pinned: n.star }]" type="button" @click="notReady('공지사항')">
        <span v-if="n.star" class="star">✦</span>
        <span v-else class="tag">{{ n.tag }}</span>
        <span class="txt">{{ n.text }}</span>
      </button>
    </section>

    <!-- 업데이트 소식 -->
    <section class="more-card">
      <button type="button" class="sec-head link" @click="notReady('업데이트 소식')">
        업데이트 소식<span class="arr">›</span>
      </button>
      <button v-for="(u, i) in UPDATES" :key="i" class="list-item" type="button" @click="notReady('업데이트 소식')">
        <span class="tag">{{ u.tag }}</span>
        <span class="txt">{{ u.text }}</span>
      </button>
    </section>

    <!-- 약관 및 정책 -->
    <section class="more-card">
      <h2 class="sec-head plain">약관 및 정책</h2>
      <button
        v-for="p in POLICIES"
        :key="p"
        type="button"
        class="policy"
        @click="notReady(p)"
      >{{ p }}</button>
    </section>

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
.more-title {
  margin: 0; padding: 9px 14px 7px;
  font-size: 20px; font-weight: 800; color: #111827;
  background: #fff;
  /* 제목줄 아래 구분선 — 물건상세와 같게 */
  border-bottom: 1px solid #e5e7eb;
}
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
.profile-main { flex: 1 1 auto; min-width: 0; }
.pname {
  border: none; background: transparent; padding: 0; cursor: pointer;
  font-size: 16px; font-weight: 800; color: #111827;
  display: inline-flex; align-items: center; gap: 2px;
}
/* 네 개를 똑같은 폭으로 — 오른쪽 끝이 아래 '인증/보안' 박스와 맞는다 */
.pills { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin-top: 8px; }
.pill {
  border: 1px solid #e3e7ef; background: #f7f8fb; border-radius: 999px;
  padding: 5px 2px; font-size: 10px; font-weight: 700; color: #4b5563; cursor: pointer;
  text-align: center; white-space: nowrap; letter-spacing: -0.3px;
}
.quick {
  display: grid; grid-template-columns: repeat(3, 1fr);
  margin-top: 12px; border: 1px solid #eef0f5; border-radius: 10px; overflow: hidden;
}
.quick-item {
  border: none; background: #fff; padding: 11px 2px; cursor: pointer;
  font-size: 12px; font-weight: 700; color: #374151;
}
.quick-item + .quick-item { border-left: 1px solid #eef0f5; }

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
