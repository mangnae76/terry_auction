<script setup lang="ts">
// 이벤트 배너 — 더보기의 어느 탭을 보든 탭 바로 아래에 늘 있다.
// 여러 장이면 스스로 넘어가고, 손으로도 넘기고, 점을 눌러 바로 간다.
import { onMounted, onUnmounted, ref, watch } from 'vue';
import AppToast from './AppToast.vue';
import ImageLightbox from './ImageLightbox.vue';
import { useBoardFeed } from '../services/boardFeed';

const { banners } = useBoardFeed();

const at = ref(0);
let timer = 0;
const startRoll = () => {
  window.clearInterval(timer);
  if (banners.value.length < 2) return;
  timer = window.setInterval(() => {
    at.value = (at.value + 1) % banners.value.length;
  }, 5000);
};
const go = (i: number) => { at.value = i; startRoll(); };

let touchX = 0;
const onTouchStart = (e: TouchEvent) => { touchX = e.changedTouches[0]?.clientX ?? 0; };
const onTouchEnd = (e: TouchEvent) => {
  const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX;
  const n = banners.value.length;
  if (n < 2 || Math.abs(dx) < 40) return;
  go((at.value + (dx < 0 ? 1 : n - 1)) % n);
};

onMounted(startRoll);
watch(() => banners.value.length, () => { at.value = 0; startRoll(); });
onUnmounted(() => window.clearInterval(timer));

const zoom = ref('');
const toastText = ref('');
const notReady = () => {
  toastText.value = '이벤트 — 준비 중입니다.';
  window.setTimeout(() => { toastText.value = ''; }, 1600);
};
</script>

<template>
  <div v-if="banners.length" class="evb">
    <div class="evb-track" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
      <button
        v-for="(b, i) in banners"
        v-show="i === at"
        :key="`b${i}`"
        type="button"
        class="evb-card"
        @click="notReady"
      >
        <img v-if="b.imageUrl" :src="b.imageUrl" class="evb-img" alt="" @click.stop="zoom = b.imageUrl ?? ''" />
        <span class="badge">{{ b.badge }}</span>
        <strong>{{ b.title }}</strong>
        <small v-if="b.desc">{{ b.desc }}</small>
        <span class="foot"><em>{{ b.period }}</em><i>{{ b.cta }} ›</i></span>
      </button>
    </div>

    <div v-if="banners.length > 1" class="evb-dots">
      <button
        v-for="(_b, i) in banners"
        :key="`d${i}`"
        type="button"
        :class="['evb-dot', { on: i === at }]"
        :aria-label="`${i + 1}번째 이벤트`"
        @click="go(i)"
      />
    </div>

    <ImageLightbox v-if="zoom" :src="zoom" @close="zoom = ''" />
    <AppToast :visible="!!toastText" :text="toastText" />
  </div>
</template>

<style scoped>
.evb { padding: 2px 14px 10px; }
.evb-track { position: relative; }
.evb-card {
  width: 100%; text-align: left; cursor: pointer;
  border: none; border-radius: 12px; padding: 13px 14px;
  background: linear-gradient(135deg, #2f4fa8 0%, #27408f 100%); color: #fff;
  display: flex; flex-direction: column; gap: 4px;
}
/* 배너 그림 — 가로:세로 3:1 (운영에 권장 크기로 적어 둔 값과 같다) */
.evb-img {
  width: 100%; aspect-ratio: 3 / 1; object-fit: cover;
  border-radius: 8px; margin-bottom: 8px; cursor: zoom-in;
}
.evb-card .badge {
  align-self: flex-start; padding: 2px 7px; border-radius: 4px;
  background: rgba(255, 255, 255, .18); font-size: 9.5px; font-weight: 800; letter-spacing: .5px;
}
.evb-card strong { font-size: 14px; font-weight: 800; }
.evb-card small { font-size: 11px; opacity: .85; word-break: keep-all; }
.evb-card .foot { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.evb-card .foot em { font-style: normal; font-size: 10.5px; opacity: .75; }
.evb-card .foot i {
  margin-left: auto; font-style: normal; font-size: 11px; font-weight: 700;
  background: rgba(255, 255, 255, .16); border-radius: 999px; padding: 4px 10px;
}
.evb-dots { display: flex; justify-content: center; gap: 6px; margin-top: 8px; }
.evb-dot {
  width: 7px; height: 7px; padding: 0; border: none; border-radius: 50%;
  background: #d7dced; cursor: pointer;
}
.evb-dot.on { background: #2a3f8f; width: 18px; border-radius: 4px; }
</style>
