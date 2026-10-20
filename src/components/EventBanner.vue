<script setup lang="ts">
// 이벤트 배너 — 더보기의 어느 탭을 보든 탭 바로 아래에 늘 있다.
// 배너를 눌러도 어디로 가지 않는다. 손으로 밀어 넘기고, 갈 곳은 '자세히 보기'가 맡는다.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import ImageLightbox from './ImageLightbox.vue';
import { useBoardFeed } from '../services/boardFeed';

const emit = defineEmits<{ (e: 'open', id: string): void }>();

const { banners } = useBoardFeed();
const many = computed(() => banners.value.length > 1);

const at = ref(0);
let timer = 0;
const startRoll = () => {
  window.clearInterval(timer);
  if (!many.value) return;
  timer = window.setInterval(() => {
    at.value = (at.value + 1) % banners.value.length;
  }, 5000);
};
const go = (i: number) => {
  const n = banners.value.length;
  at.value = ((i % n) + n) % n;
  startRoll();
};

/* 손으로 밀기 — 미는 만큼 배너가 따라 움직이고, 충분히 밀었으면 다음 장으로 넘어간다 */
const dx = ref(0);
const dragging = ref(false);
let startX = 0;
let startY = 0;
/** 세로로 긋기 시작했다면 화면 스크롤이다 — 배너는 가만히 둔다 */
let axis: '' | 'x' | 'y' = '';

const onDown = (e: PointerEvent) => {
  if (!many.value) return;
  startX = e.clientX;
  startY = e.clientY;
  axis = '';
  dragging.value = true;
  window.clearInterval(timer);
};
const onMove = (e: PointerEvent) => {
  if (!dragging.value) return;
  const mx = e.clientX - startX;
  const my = e.clientY - startY;
  if (!axis) {
    if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
    axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
    if (axis === 'y') { dragging.value = false; dx.value = 0; startRoll(); return; }
  }
  dx.value = mx;
};
const onUp = () => {
  if (!dragging.value) { startRoll(); return; }
  const moved = dx.value;
  dragging.value = false;
  dx.value = 0;
  if (Math.abs(moved) > 40) go(at.value + (moved < 0 ? 1 : -1));
  else startRoll();
};

onMounted(startRoll);
watch(() => banners.value.length, () => { at.value = 0; startRoll(); });
onUnmounted(() => window.clearInterval(timer));

/** 밀던 끝에 손을 뗀 것은 누름이 아니다 — 그림 확대·자세히 보기가 잘못 열리지 않게 */
const wasDrag = () => Math.abs(dx.value) > 6 || axis === 'x';

const zoom = ref('');
const openImage = (url?: string) => { if (url && !wasDrag()) zoom.value = url; };
const openList = (id?: string) => { if (!wasDrag()) emit('open', id ?? ''); };
</script>

<template>
  <div v-if="banners.length" class="evb">
    <div
      class="evb-view"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @pointerleave="onUp"
    >
      <div
        class="evb-track"
        :style="{
          transform: `translateX(calc(${-at * 100}% + ${dx}px))`,
          transition: dragging ? 'none' : 'transform .32s ease',
        }"
      >
        <div v-for="(b, i) in banners" :key="`b${i}`" class="evb-card">
          <img
            v-if="b.imageUrl"
            :src="b.imageUrl"
            class="evb-img"
            alt=""
            draggable="false"
            @click="openImage(b.imageUrl)"
          />
          <span class="badge">{{ b.badge }}</span>
          <strong>{{ b.title }}</strong>
          <small v-if="b.desc">{{ b.desc }}</small>
          <span class="foot">
            <em>{{ b.period }}</em>
            <button type="button" class="cta" @click="openList(b.id)">{{ b.cta }} ›</button>
          </span>
        </div>
      </div>
    </div>

    <div v-if="many" class="evb-dots">
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
  </div>
</template>

<style scoped>
.evb { padding: 2px 14px 10px; }
/* 밀어 넘기는 창 — 세로 스크롤은 그대로 두고 가로로 미는 것만 가로챈다 */
.evb-view { overflow: hidden; border-radius: 12px; touch-action: pan-y; cursor: grab; }
.evb-view:active { cursor: grabbing; }
.evb-track { display: flex; will-change: transform; }
.evb-card {
  flex: 0 0 100%; box-sizing: border-box;
  border-radius: 12px; padding: 13px 14px;
  background: linear-gradient(135deg, #2f4fa8 0%, #27408f 100%); color: #fff;
  display: flex; flex-direction: column; gap: 4px;
  user-select: none;
}
/* 배너 그림 — 가로:세로 3:1 (운영에 권장 크기로 적어 둔 값과 같다) */
.evb-img {
  width: 100%; aspect-ratio: 3 / 1; object-fit: cover;
  border-radius: 8px; margin-bottom: 8px; cursor: zoom-in;
  -webkit-user-drag: none;
}
.evb-card .badge {
  align-self: flex-start; padding: 2px 7px; border-radius: 4px;
  background: rgba(255, 255, 255, .18); font-size: 9.5px; font-weight: 800; letter-spacing: .5px;
}
.evb-card strong { font-size: 14px; font-weight: 800; }
.evb-card small { font-size: 11px; opacity: .85; word-break: keep-all; }
.evb-card .foot { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.evb-card .foot em { font-style: normal; font-size: 10.5px; opacity: .75; }
.evb-card .foot { flex-wrap: wrap; row-gap: 2px; }
.evb-card .cta {
  margin-left: auto; border: none; font-family: inherit;
  font-size: 11px; font-weight: 700; color: #fff; cursor: pointer;
  background: rgba(255, 255, 255, .16); border-radius: 999px; padding: 5px 11px;
}
.evb-dots { display: flex; justify-content: center; gap: 6px; margin-top: 8px; }
.evb-dot {
  width: 7px; height: 7px; padding: 0; border: none; border-radius: 50%;
  background: #d7dced; cursor: pointer;
}
.evb-dot.on { background: #2a3f8f; width: 18px; border-radius: 4px; }
</style>
