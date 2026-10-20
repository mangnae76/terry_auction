<script setup lang="ts">
// MYPAGE — 더보기의 바로가기에서 들어온다.
// 선정물건·계정 자리를 카드로 모아 둔다. 건수는 실제 물건 자료에서 센다.
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import AppToast from '../components/AppToast.vue';
import { useAuthStore } from '../stores/authStore';
import { POINT_GRADES } from '../services/pointPolicy';
import { TRIAL_DAYS } from '../services/trialInfo';
import { PLAN_REST_DAYS } from '../services/billingPlans';
import MyPageCards from '../components/MyPageCards.vue';
import { EVENTS, EVENT_BANNERS, NOTICES, UPDATES } from '../services/boardNews';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

/** 아이디 — 로그인에 쓰는 메일의 앞쪽 */
const loginId = computed(() => (auth.email ?? '').split('@')[0] || '-');
/** 등급 — 결제 누계를 아직 들고 있지 않아 모두 첫 등급에서 시작한다 */
const grade = POINT_GRADES[0];
const myPoint = 0;

// 바로가기에서 '?sec=notice' 처럼 들어오면 그 묶음으로 내려간다
onMounted(() => {
  const sec = String(route.query.sec ?? '');
  if (!sec) return;
  window.setTimeout(() => {
    document.querySelector(`[data-sec="${sec}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
});

const toastText = ref('');
/** 아직 화면이 없는 자리 — 안내만 띄운다 */
const notReady = (what: string) => {
  toastText.value = `${what} — 준비 중입니다.`;
  window.setTimeout(() => { toastText.value = ''; }, 1600);
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
          <button
            type="button"
            class="myp-cell tap"
            @click="router.push({ path: '/points', query: { tab: 'grade' } })"
          >
            <span class="myp-chip">{{ grade.name }} 회원</span>
            <span :class="['myp-badge', grade.tone]">{{ grade.name.slice(0, 1) }}</span>
          </button>
          <button type="button" class="myp-cell tap" @click="router.push('/point-history')">
            <span class="myp-chip">누적 포인트</span>
            <span class="myp-point">{{ myPoint.toLocaleString('ko-KR') }} <small>P</small></span>
          </button>
          <button type="button" class="myp-cell tap" @click="router.push('/payments')">
            <span class="myp-chip">결제 내역</span>
            <span class="myp-plan">{{ PLAN_REST_DAYS }}일 ›</span>
          </button>
        </div>
      </section>

      <MyPageCards />

      <!-- 소식 -->
      <h2 class="myp-h2">소식</h2>
      <section class="myp-news" data-sec="notice">
        <h3 class="myp-news-h">공지사항<i class="dot" /></h3>
        <button v-for="(n, i) in NOTICES" :key="`n${i}`" type="button" class="myp-row" @click="notReady('공지사항')">
          <span v-if="n.star" class="star">✦</span><span v-else class="tag">{{ n.tag }}</span>
          <span class="txt">{{ n.text }}</span>
        </button>
      </section>

      <section class="myp-news" data-sec="event">
        <h3 class="myp-news-h">이벤트</h3>
        <button v-for="(e, i) in EVENTS" :key="`e${i}`" type="button" class="myp-row" @click="notReady('이벤트')">
          <span class="tag">{{ e.tag }}</span><span class="txt">{{ e.text }}</span>
        </button>
        <button
          v-for="(b, i) in EVENT_BANNERS"
          :key="`b${i}`"
          type="button"
          class="myp-banner"
          @click="notReady('이벤트')"
        >
          <span class="badge">{{ b.badge }}</span>
          <strong>{{ b.title }}</strong>
          <small>{{ b.desc }}</small>
          <span class="foot"><em>{{ b.period }}</em><i>{{ b.cta }} ›</i></span>
        </button>
      </section>

      <section class="myp-news" data-sec="update">
        <h3 class="myp-news-h">업데이트</h3>
        <button v-for="(u, i) in UPDATES" :key="`u${i}`" type="button" class="myp-row" @click="notReady('업데이트')">
          <span class="tag">{{ u.tag }}</span><span class="txt">{{ u.text }}</span>
        </button>
      </section>

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
/* 세 칸 모두 칸 전체가 단추다 — 글자든 숫자든 어디를 눌러도 같이 간다 */
.myp-cell {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px;
}
.myp-cell.tap {
  border: none; background: transparent; cursor: pointer;
  padding: 6px 4px; border-radius: 8px; font-family: inherit;
}
.myp-cell.tap:hover { background: #f1f4fb; }
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
/* 남은 날도 포인트와 같은 주황 */
.myp-plan { font-size: 15px; font-weight: 800; color: #e8622a; }

/* 묶음 제목 */
.myp-h2 { margin: 0 2px 8px; font-size: 14px; font-weight: 800; color: #111827; }

/* 소식 */
/* 바로가기로 내려올 때 머리글에 가리지 않게 */
.myp-news { scroll-margin-top: 64px; background: #fff; border: 1px solid #e8ebf1; border-radius: 12px; padding: 12px 13px; margin-bottom: 8px; }
.myp-news-h {
  margin: 0 0 6px; display: flex; align-items: center; gap: 4px;
  font-size: 13px; font-weight: 800; color: #111827;
}
.myp-news-h .dot { width: 5px; height: 5px; border-radius: 50%; background: #ef4444; }
.myp-row {
  width: 100%; display: flex; align-items: center; gap: 7px; text-align: left; cursor: pointer;
  border: none; background: transparent; padding: 7px 0; border-bottom: 1px solid #f4f6fa;
}
.myp-row:last-child { border-bottom: none; }
.myp-row .tag {
  flex: none; min-width: 30px; text-align: center; padding: 2px 5px; border-radius: 4px;
  background: #f1f3f8; font-size: 10px; font-weight: 700; color: #6b7280;
}
.myp-row .star { flex: none; color: #2b6df3; font-size: 12px; }
.myp-row .txt { flex: 1 1 auto; min-width: 0; font-size: 11.5px; color: #374151; word-break: keep-all; }
.myp-banner {
  width: 100%; margin-top: 8px; text-align: left; cursor: pointer;
  border: none; border-radius: 10px; padding: 13px 14px;
  background: linear-gradient(135deg, #2f4fa8 0%, #27408f 100%); color: #fff;
  display: flex; flex-direction: column; gap: 4px;
}
.myp-banner .badge {
  align-self: flex-start; padding: 2px 7px; border-radius: 4px;
  background: rgba(255,255,255,.18); font-size: 9.5px; font-weight: 800; letter-spacing: .5px;
}
.myp-banner strong { font-size: 14px; font-weight: 800; }
.myp-banner small { font-size: 11px; opacity: .85; word-break: keep-all; }
.myp-banner .foot { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.myp-banner .foot em { font-style: normal; font-size: 10.5px; opacity: .75; }
.myp-banner .foot i {
  margin-left: auto; font-style: normal; font-size: 11px; font-weight: 700;
  background: rgba(255,255,255,.16); border-radius: 999px; padding: 4px 10px;
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
