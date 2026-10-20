<script setup lang="ts">
// 부가서비스 — 공지사항·이벤트·업데이트·포인트를 차례로 적는다.
// 글은 services/boardNews·pointPolicy 에 있고 여기서는 그리기만 한다.
import { ref } from 'vue';
import AppToast from './AppToast.vue';
import { EVENTS, EVENT_BANNERS, NOTICES, UPDATES } from '../services/boardNews';

const toastText = ref('');
const notReady = (what: string) => {
  toastText.value = `${what} — 준비 중입니다.`;
  window.setTimeout(() => { toastText.value = ''; }, 1600);
};
</script>

<template>
  <div class="nws-wrap">
    <section class="nws-card" data-sec="notice">
      <h3 class="nws-h">공지사항<i class="dot" /></h3>
      <button v-for="(n, i) in NOTICES" :key="`n${i}`" type="button" class="nws-row" @click="notReady('공지사항')">
        <span v-if="n.star" class="star">✦</span><span v-else class="tag">{{ n.tag }}</span>
        <span class="txt">{{ n.text }}</span>
      </button>
    </section>

    <section class="nws-card" data-sec="event">
      <h3 class="nws-h">이벤트</h3>
      <button v-for="(e, i) in EVENTS" :key="`e${i}`" type="button" class="nws-row" @click="notReady('이벤트')">
        <span class="tag">{{ e.tag }}</span><span class="txt">{{ e.text }}</span>
      </button>
      <button v-for="(b, i) in EVENT_BANNERS" :key="`b${i}`" type="button" class="nws-banner" @click="notReady('이벤트')">
        <span class="badge">{{ b.badge }}</span>
        <strong>{{ b.title }}</strong>
        <small>{{ b.desc }}</small>
        <span class="foot"><em>{{ b.period }}</em><i>{{ b.cta }} ›</i></span>
      </button>
    </section>

    <section class="nws-card" data-sec="update">
      <h3 class="nws-h">업데이트</h3>
      <button v-for="(u, i) in UPDATES" :key="`u${i}`" type="button" class="nws-row" @click="notReady('업데이트')">
        <span class="tag">{{ u.tag }}</span><span class="txt">{{ u.text }}</span>
      </button>
    </section>

    <AppToast :visible="!!toastText" :text="toastText" />
  </div>
</template>

<style scoped>
.nws-wrap { display: flex; flex-direction: column; gap: 8px; }
.nws-card {
  scroll-margin-top: 64px;
  background: #fff; border: 1px solid #e8ebf1; border-radius: 12px; padding: 12px 13px;
}
.nws-h {
  margin: 0 0 6px; display: flex; align-items: center; gap: 4px;
  font-size: 13px; font-weight: 800; color: #111827;
}
.nws-h .dot { width: 5px; height: 5px; border-radius: 50%; background: #ef4444; }
.nws-h .more {
  margin-left: auto; border: none; background: transparent; padding: 0; cursor: pointer;
  font-family: inherit; font-size: 11px; font-weight: 700; color: #2b6df3;
}
.nws-row {
  width: 100%; display: flex; align-items: center; gap: 7px; text-align: left; cursor: pointer;
  border: none; background: transparent; padding: 7px 0; border-bottom: 1px solid #f4f6fa;
}
.nws-row:last-child { border-bottom: none; }
.nws-row .tag {
  flex: none; min-width: 30px; text-align: center; padding: 2px 5px; border-radius: 4px;
  background: #f1f3f8; font-size: 10px; font-weight: 700; color: #6b7280;
}
.nws-row .star { flex: none; color: #2b6df3; font-size: 12px; }
.nws-row .txt { flex: 1 1 auto; min-width: 0; font-size: 11.5px; color: #374151; word-break: keep-all; }
.nws-banner {
  width: 100%; margin-top: 8px; text-align: left; cursor: pointer;
  border: none; border-radius: 10px; padding: 13px 14px;
  background: linear-gradient(135deg, #2f4fa8 0%, #27408f 100%); color: #fff;
  display: flex; flex-direction: column; gap: 4px;
}
.nws-banner .badge {
  align-self: flex-start; padding: 2px 7px; border-radius: 4px;
  background: rgba(255,255,255,.18); font-size: 9.5px; font-weight: 800; letter-spacing: .5px;
}
.nws-banner strong { font-size: 14px; font-weight: 800; }
.nws-banner small { font-size: 11px; opacity: .85; word-break: keep-all; }
.nws-banner .foot { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.nws-banner .foot em { font-style: normal; font-size: 10.5px; opacity: .75; }
.nws-banner .foot i {
  margin-left: auto; font-style: normal; font-size: 11px; font-weight: 700;
  background: rgba(255,255,255,.16); border-radius: 999px; padding: 4px 10px;
}

/* 포인트 — 안내 화면과 같은 파란 상자 */
.nws-blue { background: #4a7bd8; border-radius: 10px; padding: 14px 13px; color: #fff; }
.nws-blue-sec + .nws-blue-sec { margin-top: 14px; }
.nws-blue h4 { margin: 0 0 6px; font-size: 12.5px; font-weight: 800; color: #ffe27a; }
.nws-blue p { margin: 0 0 6px; font-size: 11.5px; line-height: 1.7; word-break: keep-all; }
.nws-blue ul { list-style: none; margin: 0; padding: 0; }
.nws-blue li {
  position: relative; padding-left: 11px; margin-bottom: 5px;
  font-size: 11px; line-height: 1.65; white-space: pre-line; word-break: keep-all;
}
.nws-blue li::before { content: '·'; position: absolute; left: 2px; }
</style>
