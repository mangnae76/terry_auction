<script setup lang="ts">
// 고객센터 — 더보기 · 바로가기의 '고객센터'에서 들어온다.
// 글은 services/supportFaq 에 있고 여기서는 그리기만 한다.
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import AppToast from '../components/AppToast.vue';
import {
  SUPPORT_CONTACTS,
  SUPPORT_FAQ,
  SUPPORT_GUIDES,
  type ContactWay,
  type FaqItem,
  type GuideItem,
} from '../services/supportFaq';

const router = useRouter();

/** 처음에는 여덟 개만 — 더 보고 싶으면 펼친다 */
const FIRST = 8;
const showAll = ref(false);
const faqs = computed<FaqItem[]>(() => (showAll.value ? SUPPORT_FAQ : SUPPORT_FAQ.slice(0, FIRST)));
const rest = computed(() => Math.max(0, SUPPORT_FAQ.length - FIRST));

/** 누른 줄만 답이 열린다 */
const openQ = ref('');
const toggle = (q: string) => { openQ.value = openQ.value === q ? '' : q; };

const toastText = ref('');
const notReady = (what: string) => {
  toastText.value = `${what} — 준비 중입니다.`;
  window.setTimeout(() => { toastText.value = ''; }, 1600);
};

const goGuide = (g: GuideItem) => {
  if (!g.path) { notReady(g.label); return; }
  router.push(g.path);
};
const openContact = (c: ContactWay) => {
  if (!c.href) { notReady(c.title); return; }
  window.location.href = c.href;
};
</script>

<template>
  <section class="sup-shell">
    <header class="sup-header">
      <button type="button" class="sup-back" aria-label="뒤로" @click="router.back()">‹</button>
      <h1 class="sup-title">고객센터</h1>
      <span class="sup-crumb">더보기 › 고객센터</span>
    </header>

    <div class="sup-body">
      <!-- 자주 찾는 도움말 -->
      <section class="sup-card">
        <h2 class="sup-h2">자주 찾는 도움말</h2>
        <ul class="sup-faq">
          <li v-for="f in faqs" :key="f.q" :class="['sup-q', { on: openQ === f.q }]">
            <!-- 꼬리표가 곧 단추다 — 누르면 그 자리에서 답이 펼쳐진다 -->
            <button
              type="button"
              :class="['sup-tag', f.tag === '회원·결제' ? 'pay' : (f.tag === '기타' ? 'etc' : 'info')]"
              :aria-expanded="openQ === f.q"
              @click="toggle(f.q)"
            >{{ f.tag }} 도움말<i>{{ openQ === f.q ? '▴' : '▾' }}</i></button>
            <button type="button" class="sup-q-head" @click="toggle(f.q)">
              <em class="sup-qmark">Q</em>
              <span class="sup-q-txt">{{ f.q }}</span>
            </button>
            <p v-if="openQ === f.q" class="sup-a">{{ f.a }}</p>
          </li>
        </ul>
        <button v-if="!showAll && rest" type="button" class="sup-more" @click="showAll = true">
          ＋ 도움말 더보기 ({{ rest }})
        </button>
      </section>

      <!-- 이용방법 및 안내 -->
      <section class="sup-card">
        <h2 class="sup-h2">마이턴 옥션 이용방법 및 안내</h2>
        <div v-for="g in SUPPORT_GUIDES" :key="g.title" class="sup-guide">
          <h3 class="sup-h3">{{ g.title }}</h3>
          <div class="sup-grid">
            <button v-for="it in g.items" :key="it.label" type="button" class="sup-tile" @click="goGuide(it)">
              <span class="sup-ico">{{ it.icon }}</span>
              <small>{{ it.label }}</small>
            </button>
          </div>
        </div>
      </section>

      <!-- 1:1 문의 -->
      <section class="sup-card">
        <h2 class="sup-h2">1:1 고객문의 안내</h2>
        <button v-for="c in SUPPORT_CONTACTS" :key="c.title" type="button" class="sup-contact" @click="openContact(c)">
          <span class="sup-c-ico">{{ c.icon }}</span>
          <span class="sup-c-txt">
            <strong>{{ c.title }}</strong>
            <small v-for="(l, i) in c.lines" :key="i">{{ l }}</small>
          </span>
          <i class="sup-arr">›</i>
        </button>
      </section>

      <!-- 앱 내려받기 -->
      <section class="sup-card">
        <h2 class="sup-h2">앱 내려받기</h2>
        <p class="sup-app-txt">
          경매정보 플랫폼 마이턴 옥션 — 손품부터 낙찰 이후까지 한 곳에서 봅니다.
          앱 설치는 준비 중이며, 지금은 웹 화면을 홈 화면에 추가해 앱처럼 쓸 수 있습니다.
        </p>
        <div class="sup-stores">
          <button type="button" class="sup-store" @click="notReady('Google Play')">Google Play</button>
          <button type="button" class="sup-store" @click="notReady('App Store')">App Store</button>
        </div>
      </section>
    </div>

    <AppToast :visible="!!toastText" :text="toastText" />
    <AppMobileBottomNav active="more" />
  </section>
</template>

<style scoped>
.sup-shell { min-height: 100vh; background: #f4f6fb; padding-bottom: 96px; }
.sup-header { padding: 14px 12px 8px; display: flex; align-items: baseline; gap: 8px; border-bottom: 1px solid #e5e7eb; }
.sup-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 2px; align-self: center;
}
.sup-title { margin: 0; font-size: 20px; font-weight: 800; color: #111827; }
.sup-crumb { margin-left: auto; font-size: 11px; color: #9ca3af; }
.sup-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.sup-card { background: #fff; border-radius: 10px; padding: 13px 13px 15px; }
.sup-h2 { margin: 0 0 10px; font-size: 14px; font-weight: 800; color: #111827; }
.sup-h3 { margin: 0 0 7px; font-size: 12px; font-weight: 800; color: #1f3a72; }

/* 도움말 */
.sup-faq { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.sup-q { position: relative; border: 1px solid #e3e8f0; border-radius: 8px; padding: 9px 10px 10px; }
.sup-q.on { border-color: #c7d2ea; background: #f8faff; }
.sup-q-head {
  width: 100%; border: none; background: transparent; padding: 0; cursor: pointer;
  display: flex; align-items: flex-start; gap: 6px; text-align: left;
}
.sup-qmark { flex: none; font-style: normal; font-size: 12px; font-weight: 800; color: #2a3f8f; line-height: 1.5; }
/* 오른쪽 위 꼬리표 자리를 비워 둔다 — 질문이 그 아래로 파고들지 않게 */
.sup-q-txt {
  flex: 1 1 auto; padding-right: 116px;
  font-size: 12.5px; line-height: 1.5; color: #111827; font-weight: 600; word-break: keep-all;
}
.sup-a {
  margin: 8px 0 0; padding: 8px 0 0 18px; border-top: 1px solid #e8edf7;
  font-size: 12px; line-height: 1.75; color: #4b5563; word-break: keep-all;
}
/* 꼬리표 칸은 글자가 짧든 길든 같은 크기로 — 가장 긴 '회원·결제 도움말'이
   어느 글꼴에서도 들어가는 폭으로 못 박는다 (min-width 로 두면 글꼴에 따라
   긴 쪽만 늘어나 들쭉날쭉해진다) */
.sup-tag {
  position: absolute; top: 8px; right: 8px;
  width: 104px; box-sizing: border-box; overflow: hidden; white-space: nowrap;
  border: none; border-radius: 4px; padding: 3px 4px; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 3px;
  font-family: inherit; font-size: 10px; font-weight: 700; color: #fff; background: #2a3f8f;
}
.sup-tag i { font-style: normal; font-size: 8px; opacity: .85; }
.sup-tag.pay { background: #4f7bd4; }
.sup-tag.etc { background: #3aa06a; }
.sup-more {
  width: 100%; margin-top: 10px; height: 34px;
  border: 1px solid #dbe3f7; border-radius: 999px; background: #fff;
  font-family: inherit; font-size: 12px; font-weight: 700; color: #2a3f8f; cursor: pointer;
}

/* 이용방법 */
.sup-guide + .sup-guide { margin-top: 14px; padding-top: 12px; border-top: 1px solid #f1f3f7; }
.sup-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.sup-tile {
  border: none; background: transparent; padding: 4px 0; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 5px;
}
.sup-ico {
  width: 42px; height: 42px; border-radius: 12px; background: #eef3ff;
  display: inline-flex; align-items: center; justify-content: center; font-size: 19px;
}
.sup-tile small { font-size: 10px; line-height: 1.35; color: #4b5563; text-align: center; word-break: keep-all; }

/* 문의 */
.sup-contact {
  width: 100%; border: 1px solid #e3e8f0; border-radius: 8px; background: #fff;
  padding: 11px 10px; cursor: pointer; display: flex; align-items: center; gap: 10px; text-align: left;
}
.sup-contact + .sup-contact { margin-top: 7px; }
.sup-c-ico {
  flex: none; width: 34px; height: 34px; border-radius: 50%; background: #eef3ff;
  display: inline-flex; align-items: center; justify-content: center; font-size: 16px;
}
.sup-c-txt { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.sup-c-txt strong { font-size: 13px; font-weight: 800; color: #111827; }
.sup-c-txt small { font-size: 11px; line-height: 1.5; color: #6b7280; word-break: keep-all; }
.sup-arr { flex: none; font-style: normal; font-size: 18px; color: #c3cbdd; }

/* 앱 */
.sup-app-txt { margin: 0 0 10px; font-size: 11.5px; line-height: 1.7; color: #6b7280; word-break: keep-all; }
.sup-stores { display: flex; gap: 7px; }
.sup-store {
  flex: 1 1 0; height: 38px; border: 1px solid #d7deea; border-radius: 8px; background: #111827;
  font-family: inherit; font-size: 12px; font-weight: 700; color: #fff; cursor: pointer;
}
</style>
