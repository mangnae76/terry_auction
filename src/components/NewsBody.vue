<script setup lang="ts">
// 부가서비스 — 공지사항·이벤트·업데이트·포인트를 차례로 적는다.
// 글은 services/boardNews·pointPolicy 에 있고 여기서는 그리기만 한다.
import { onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import ImageLightbox from './ImageLightbox.vue';
import { useBoardFeed, useBoardNew } from '../services/boardFeed';

/** 관리자가 올린 글 — 아직 없으면 코드의 기본 글을 쓴다 */
const { events: EVENTS, notices: NOTICES, updates: UPDATES } = useBoardFeed();

const router = useRouter();

/* 새 글 알림 — 보는 동안에는 켜 두고, 탭을 떠날 때 본 것으로 적는다 */
const { event: eventNew, notice: noticeNew, update: updateNew, markAllSeen } = useBoardNew();
onUnmounted(markAllSeen);

/** 크게 볼 그림 ('' 이면 닫힘) */
const zoom = ref('');

/** 펼쳐 둔 줄 — 본문이나 그림이 있을 때만 열린다 */
const openRow = ref('');
const toggleRow = (key: string, row: { body?: string; imageUrl?: string }) => {
  if (!row.body && !row.imageUrl) return;
  openRow.value = openRow.value === key ? '' : key;
};

/** 이벤트는 제목 줄을 누르면 상세 보기로 들어간다 (기본 글은 번호가 없어 그 자리에서 펼친다) */
const openEvent = (key: string, row: { id?: string; body?: string; imageUrl?: string }) => {
  if (row.id) { router.push(`/post/${row.id}`); return; }
  toggleRow(key, row);
};
</script>

<template>
  <div class="nws-wrap">
    <section class="nws-card" data-sec="event">
      <h3 class="nws-h">이벤트<i v-if="eventNew" class="dot" /></h3>
      <template v-for="(e, i) in EVENTS" :key="`e${i}`">
        <button type="button" class="nws-row" @click="openEvent(`e${i}`, e)">
          <span class="tag">{{ e.tag }}</span><span class="txt">{{ e.text }}</span>
          <span v-if="e.postedShort" class="when">{{ e.postedShort }}</span>
          <i v-if="e.id" class="chev">›</i>
          <i v-else-if="e.body || e.imageUrl" class="chev">{{ openRow === `e${i}` ? '▴' : '▾' }}</i>
        </button>
        <div v-if="openRow === `e${i}`" class="nws-open">
          <img v-if="e.imageUrl" :src="e.imageUrl" alt="" @click="zoom = e.imageUrl" />
          <p v-if="e.body">{{ e.body }}</p>
          <p v-if="e.postedFull" class="posted">{{ e.postedFull }}</p>
        </div>
      </template>
    </section>

    <section class="nws-card" data-sec="notice">
      <h3 class="nws-h">공지사항<i v-if="noticeNew" class="dot" /></h3>
      <template v-for="(n, i) in NOTICES" :key="`n${i}`">
        <button type="button" class="nws-row" @click="toggleRow(`n${i}`, n)">
        <span v-if="n.star" class="star">✦</span><span v-else class="tag">{{ n.tag }}</span>
          <span class="txt">{{ n.text }}</span>
          <span v-if="n.postedShort" class="when">{{ n.postedShort }}</span>
          <i v-if="n.body || n.imageUrl" class="chev">{{ openRow === `n${i}` ? '▴' : '▾' }}</i>
        </button>
        <div v-if="openRow === `n${i}`" class="nws-open">
          <img v-if="n.imageUrl" :src="n.imageUrl" alt="" @click="zoom = n.imageUrl" />
          <p v-if="n.body">{{ n.body }}</p>
          <p v-if="n.postedFull" class="posted">{{ n.postedFull }}</p>
        </div>
      </template>
    </section>

    <section class="nws-card" data-sec="update">
      <h3 class="nws-h">업데이트<i v-if="updateNew" class="dot" /></h3>
      <template v-for="(u, i) in UPDATES" :key="`u${i}`">
        <button type="button" class="nws-row" @click="toggleRow(`u${i}`, u)">
          <span class="tag">{{ u.tag }}</span><span class="txt">{{ u.text }}</span>
          <span v-if="u.postedShort" class="when">{{ u.postedShort }}</span>
          <i v-if="u.body || u.imageUrl" class="chev">{{ openRow === `u${i}` ? '▴' : '▾' }}</i>
        </button>
        <div v-if="openRow === `u${i}`" class="nws-open">
          <img v-if="u.imageUrl" :src="u.imageUrl" alt="" @click="zoom = u.imageUrl" />
          <p v-if="u.body">{{ u.body }}</p>
          <p v-if="u.postedFull" class="posted">{{ u.postedFull }}</p>
        </div>
      </template>
    </section>

    <ImageLightbox v-if="zoom" :src="zoom" @close="zoom = ''" />
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
  border: none; border-radius: 0; background: transparent; padding: 7px 0; border-bottom: 1px solid #f4f6fa;
}
.nws-row:last-child { border-bottom: none; }
.nws-row .tag {
  flex: none; min-width: 30px; text-align: center; padding: 2px 5px; border-radius: 4px;
  background: #f1f3f8; font-size: 10px; font-weight: 700; color: #6b7280;
}
.nws-row .star { flex: none; color: #2b6df3; font-size: 12px; }
.nws-row .txt { flex: 1 1 auto; min-width: 0; font-size: 11.5px; color: #374151; word-break: keep-all; }
.nws-row .chev { flex: none; font-style: normal; font-size: 10px; color: #9aa6c4; }
/* 언제 올린 글인지 — 줄 오른쪽에 좁게 */
.nws-row .when { flex: none; font-size: 10px; color: #9aa6c4; letter-spacing: -0.2px; }
/* 펼친 글 */
.nws-open { padding: 4px 0 10px 37px; }
.nws-open img { width: 100%; border-radius: 8px; margin-bottom: 7px; cursor: zoom-in; }
.nws-open .posted { margin: 6px 0 0; font-size: 10.5px; color: #9aa6c4; }
.nws-open p {
  margin: 0; font-size: 11.5px; line-height: 1.75; color: #4b5563;
  white-space: pre-line; word-break: keep-all;
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
