<script setup lang="ts">
// 부가서비스 — 공지사항·이벤트·업데이트·포인트를 차례로 적는다.
// 글은 services/boardNews·pointPolicy 에 있고 여기서는 그리기만 한다.
import { onMounted, onUnmounted, ref, watch } from 'vue';
import AppToast from './AppToast.vue';
import ImageLightbox from './ImageLightbox.vue';
import { useBoardFeed } from '../services/boardFeed';

/** 관리자가 올린 글 — 아직 없으면 코드의 기본 글을 쓴다 */
const { events: EVENTS, notices: NOTICES, updates: UPDATES, banners: EVENT_BANNERS } = useBoardFeed();

/* 배너 넘기기 — 여러 장이면 스스로 돌고, 손으로도 넘긴다 */
const bannerAt = ref(0);
let timer = 0;
const startRoll = () => {
  window.clearInterval(timer);
  if (EVENT_BANNERS.value.length < 2) return;
  timer = window.setInterval(() => {
    bannerAt.value = (bannerAt.value + 1) % EVENT_BANNERS.value.length;
  }, 5000);
};
const goBanner = (i: number) => { bannerAt.value = i; startRoll(); };
let touchX = 0;
const onTouchStart = (e: TouchEvent) => { touchX = e.changedTouches[0]?.clientX ?? 0; };
const onTouchEnd = (e: TouchEvent) => {
  const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX;
  const n = EVENT_BANNERS.value.length;
  if (n < 2 || Math.abs(dx) < 40) return;
  goBanner((bannerAt.value + (dx < 0 ? 1 : n - 1)) % n);
};
onMounted(startRoll);
watch(() => EVENT_BANNERS.value.length, () => { bannerAt.value = 0; startRoll(); });
onUnmounted(() => window.clearInterval(timer));

/** 크게 볼 그림 ('' 이면 닫힘) */
const zoom = ref('');

/** 펼쳐 둔 줄 — 본문이나 그림이 있을 때만 열린다 */
const openRow = ref('');
const toggleRow = (key: string, row: { body?: string; imageUrl?: string }) => {
  if (!row.body && !row.imageUrl) return;
  openRow.value = openRow.value === key ? '' : key;
};

const toastText = ref('');
const notReady = (what: string) => {
  toastText.value = `${what} — 준비 중입니다.`;
  window.setTimeout(() => { toastText.value = ''; }, 1600);
};
</script>

<template>
  <div class="nws-wrap">
    <section class="nws-card" data-sec="event">
      <h3 class="nws-h">이벤트</h3>
      <!-- 배너 — 여러 장이면 옆으로 넘겨 보고, 점으로 몇 장인지 알린다 -->
      <div v-if="EVENT_BANNERS.length" class="nws-bwrap">
        <div
          class="nws-btrack"
          @touchstart.passive="onTouchStart"
          @touchend.passive="onTouchEnd"
        >
          <button
            v-for="(b, i) in EVENT_BANNERS"
            v-show="i === bannerAt"
            :key="`b${i}`"
            type="button"
            class="nws-banner"
            @click="notReady('이벤트')"
          >
            <img v-if="b.imageUrl" :src="b.imageUrl" class="nws-bimg" alt="" @click.stop="zoom = b.imageUrl" />
            <span class="badge">{{ b.badge }}</span>
            <strong>{{ b.title }}</strong>
            <small v-if="b.desc">{{ b.desc }}</small>
            <span class="foot"><em>{{ b.period }}</em><i>{{ b.cta }} ›</i></span>
          </button>
        </div>
        <div v-if="EVENT_BANNERS.length > 1" class="nws-dots">
          <button
            v-for="(_b, i) in EVENT_BANNERS"
            :key="`d${i}`"
            type="button"
            :class="['nws-dot', { on: i === bannerAt }]"
            :aria-label="`${i + 1}번째 이벤트`"
            @click="goBanner(i)"
          />
        </div>
      </div>
      <template v-for="(e, i) in EVENTS" :key="`e${i}`">
        <button type="button" class="nws-row" @click="toggleRow(`e${i}`, e)">
          <span class="tag">{{ e.tag }}</span><span class="txt">{{ e.text }}</span>
          <i v-if="e.body || e.imageUrl" class="chev">{{ openRow === `e${i}` ? '▴' : '▾' }}</i>
        </button>
        <div v-if="openRow === `e${i}`" class="nws-open">
          <img v-if="e.imageUrl" :src="e.imageUrl" alt="" @click="zoom = e.imageUrl" />
          <p v-if="e.body">{{ e.body }}</p>
        </div>
      </template>
    </section>

    <section class="nws-card" data-sec="notice">
      <h3 class="nws-h">공지사항<i class="dot" /></h3>
      <template v-for="(n, i) in NOTICES" :key="`n${i}`">
        <button type="button" class="nws-row" @click="toggleRow(`n${i}`, n)">
        <span v-if="n.star" class="star">✦</span><span v-else class="tag">{{ n.tag }}</span>
          <span class="txt">{{ n.text }}</span>
          <i v-if="n.body || n.imageUrl" class="chev">{{ openRow === `n${i}` ? '▴' : '▾' }}</i>
        </button>
        <div v-if="openRow === `n${i}`" class="nws-open">
          <img v-if="n.imageUrl" :src="n.imageUrl" alt="" @click="zoom = n.imageUrl" />
          <p v-if="n.body">{{ n.body }}</p>
        </div>
      </template>
    </section>

    <section class="nws-card" data-sec="update">
      <h3 class="nws-h">업데이트</h3>
      <template v-for="(u, i) in UPDATES" :key="`u${i}`">
        <button type="button" class="nws-row" @click="toggleRow(`u${i}`, u)">
          <span class="tag">{{ u.tag }}</span><span class="txt">{{ u.text }}</span>
          <i v-if="u.body || u.imageUrl" class="chev">{{ openRow === `u${i}` ? '▴' : '▾' }}</i>
        </button>
        <div v-if="openRow === `u${i}`" class="nws-open">
          <img v-if="u.imageUrl" :src="u.imageUrl" alt="" @click="zoom = u.imageUrl" />
          <p v-if="u.body">{{ u.body }}</p>
        </div>
      </template>
    </section>

    <ImageLightbox v-if="zoom" :src="zoom" @close="zoom = ''" />
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
.nws-row .chev { flex: none; font-style: normal; font-size: 10px; color: #9aa6c4; }
/* 펼친 글 */
.nws-open { padding: 4px 0 10px 37px; }
.nws-open img { width: 100%; border-radius: 8px; margin-bottom: 7px; cursor: zoom-in; }
.nws-open p {
  margin: 0; font-size: 11.5px; line-height: 1.75; color: #4b5563;
  white-space: pre-line; word-break: keep-all;
}
/* 배너 묶음 */
.nws-bwrap { margin-top: 8px; }
.nws-btrack { position: relative; }
.nws-dots { display: flex; justify-content: center; gap: 6px; margin-top: 8px; }
.nws-dot {
  width: 7px; height: 7px; padding: 0; border: none; border-radius: 50%;
  background: #d7dced; cursor: pointer;
}
.nws-dot.on { background: #2a3f8f; width: 18px; border-radius: 4px; }
/* 배너 그림 — 가로:세로 3:1 (운영에 권장 크기로 적어 둔 값과 같다) */
.nws-bimg {
  width: 100%; aspect-ratio: 3 / 1; object-fit: cover;
  border-radius: 8px; margin-bottom: 8px; cursor: zoom-in;
}
.nws-banner {
  width: 100%; text-align: left; cursor: pointer;
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
