<script setup lang="ts">
// 부가서비스 — 공지사항·이벤트·업데이트·포인트를 차례로 적는다.
// 글은 services/boardNews·pointPolicy 에 있고 여기서는 그리기만 한다.
import { computed, inject, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import ImageLightbox from './ImageLightbox.vue';
import { useBoardFeed, useBoardNew } from '../services/boardFeed';

/** 관리자가 올린 글 — 아직 없으면 코드의 기본 글을 쓴다 */
const { events: EVENTS, notices: noticesAll, noticesDb, updates: UPDATES } = useBoardFeed();
/** 웹은 공지를 DB 글로만 보여 준다 — 앱은 예전처럼(글이 없으면 기본 글) */
const web = inject('webEmbed', false);
const NOTICES = computed(() => (web ? noticesDb.value : noticesAll.value));
/** noticeOnly — 웹 공지는 이벤트 목록을 뺀다(서비스 시작 뒤로 미뤘다, 2026-11-02). 업데이트는 2026-11-13부터 웹에도 */
defineProps<{ noticeOnly?: boolean }>();

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

/* 웹 — 공지사항 · 업데이트를 좌우 두 상자로. 줄은 제목만, 화살표로 본문 · 등록일을 편다(2026-11-13 사용자) */
type NewsRow = { tag?: string; star?: boolean; text: string; body?: string; imageUrl?: string; postedShort?: string; postedFull?: string; author?: string };
const webBoxes = computed(() => [
  { key: 'n', title: '공지사항', rows: NOTICES.value as NewsRow[], isNew: noticeNew.value, empty: '지금 올라온 공지사항이 없습니다' },
  { key: 'u', title: '업데이트', rows: UPDATES.value as NewsRow[], isNew: updateNew.value, empty: '지금 올라온 업데이트가 없습니다' },
]);
/** 이벤트는 제목 줄을 누르면 상세 보기로 들어간다 (기본 글은 번호가 없어 그 자리에서 펼친다) */
const openEvent = (key: string, row: { id?: string; body?: string; imageUrl?: string }) => {
  if (row.id) { router.push(`/post/${row.id}`); return; }
  toggleRow(key, row);
};
</script>

<template>
  <div :class="['nws-wrap', { web }]">
    <section v-if="!noticeOnly" class="nws-card" data-sec="event">
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

    <!-- 웹 — 공지사항 · 업데이트 좌우 두 상자. 제목 아래 목록을 테두리 상자 하나로 묶고, 줄은 꼬리표 · 제목만.
         오른쪽 끝 화살표를 누르면 그 아래에 본문 · 그림 · 등록일(2026-11-13 사용자) -->
    <div v-if="web" class="nws-two">
      <section v-for="bx in webBoxes" :key="bx.key" class="nws-card" :data-sec="bx.key === 'n' ? 'notice' : 'update'">
        <h3 class="nws-h">{{ bx.title }}<i v-if="bx.isNew" class="dot" /></h3>
        <p v-if="!bx.rows.length" class="nws-empty">{{ bx.empty }}</p>
        <div v-else class="nws-list">
          <div v-for="(r, i) in bx.rows" :key="`${bx.key}${i}`" :class="['nws-item', { open: openRow === `${bx.key}${i}` }]">
            <button type="button" class="nws-row" :aria-expanded="openRow === `${bx.key}${i}`" @click="openRow = openRow === `${bx.key}${i}` ? '' : `${bx.key}${i}`">
              <span v-if="r.star" class="star">✦</span><span v-else class="tag">{{ r.tag }}</span>
              <span class="txt">{{ r.text }}</span>
              <i :class="['chev', { up: openRow === `${bx.key}${i}` }]" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg></i>
            </button>
            <div v-if="openRow === `${bx.key}${i}`" class="nws-open">
              <img v-if="r.imageUrl" :src="r.imageUrl" alt="" @click="zoom = r.imageUrl!" />
              <p v-if="r.body">{{ r.body }}</p>
              <!-- 등록 날짜 · 시각, 오른쪽 끝에 작성자 아이디(2026-11-13 사용자) -->
              <p class="nws-date"><span>{{ r.postedFull || r.postedShort }}</span><span class="who">작성자 {{ r.author || '운영자' }}</span></p>
            </div>
          </div>
        </div>
      </section>
    </div>

    <template v-else>
    <section class="nws-card" data-sec="notice">
      <h3 class="nws-h">공지사항<i v-if="noticeNew" class="dot" /></h3>
      <p v-if="!NOTICES.length" class="nws-empty">지금 올라온 공지사항이 없습니다</p>
      <template v-for="(n, i) in NOTICES" :key="`n${i}`">
        <button type="button" class="nws-row" @click="toggleRow(`n${i}`, n)">
        <span v-if="n.star" class="star">✦</span><span v-else class="tag">{{ n.tag }}</span>
          <span class="txt">{{ n.text }}</span>
          <span v-if="n.postedShort" class="when">{{ n.postedShort }}</span>
          <i v-if="(n.body || n.imageUrl) && web" :class="['chev', { up: openRow === `n${i}` }]" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg></i>
          <i v-else-if="n.body || n.imageUrl" class="chev">{{ openRow === `n${i}` ? '▴' : '▾' }}</i>
        </button>
        <div v-if="openRow === `n${i}`" class="nws-open">
          <img v-if="n.imageUrl" :src="n.imageUrl" alt="" @click="zoom = n.imageUrl" />
          <p v-if="n.body">{{ n.body }}</p>
          <p v-if="n.postedFull" class="posted">{{ n.postedFull }}</p>
        </div>
      </template>
    </section>

    <!-- 업데이트는 웹 공지에도 보인다(2026-11-13 사용자 — 이벤트 목록만 서비스 시작 뒤로) -->
    <section class="nws-card" data-sec="update">
      <h3 class="nws-h">업데이트<i v-if="updateNew" class="dot" /></h3>
      <template v-for="(u, i) in UPDATES" :key="`u${i}`">
        <button type="button" class="nws-row" @click="toggleRow(`u${i}`, u)">
          <span class="tag">{{ u.tag }}</span><span class="txt">{{ u.text }}</span>
          <span v-if="u.postedShort" class="when">{{ u.postedShort }}</span>
          <i v-if="(u.body || u.imageUrl) && web" :class="['chev', { up: openRow === `u${i}` }]" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg></i>
          <i v-else-if="u.body || u.imageUrl" class="chev">{{ openRow === `u${i}` ? '▴' : '▾' }}</i>
        </button>
        <div v-if="openRow === `u${i}`" class="nws-open">
          <img v-if="u.imageUrl" :src="u.imageUrl" alt="" @click="zoom = u.imageUrl" />
          <p v-if="u.body">{{ u.body }}</p>
          <p v-if="u.postedFull" class="posted">{{ u.postedFull }}</p>
        </div>
      </template>
    </section>

    </template>

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
.nws-empty { margin: 0; padding: 14px 0 8px; font-size: 12px; color: #9aa6c4; text-align: center; }
/* 펼친 글 */
.nws-open { padding: 4px 0 10px 37px; }
.nws-open img { width: 100%; border-radius: 8px; margin-bottom: 7px; cursor: zoom-in; }
.nws-open .posted { margin: 6px 0 0; font-size: 10.5px; color: #9aa6c4; }
.nws-open p {
  margin: 0; font-size: 11.5px; line-height: 1.75; color: #4b5563;
  white-space: pre-line; word-break: keep-all;
}

/* 웹 — 글자 규칙(최소 12 · 카드 제목 16 · 줄 제목 15) 과 잘 보이는 펼침 화살표(2026-11-08) */
.web .nws-card { padding: 18px 20px; }
.web .nws-h { margin-bottom: 8px; font-size: 16px; }
.web .nws-row { gap: 10px; padding: 12px 4px; }
.web .nws-row:hover { background: #f7f9fc; }
.web .nws-row .tag { min-width: 40px; padding: 3px 8px; font-size: 12px; }
.web .nws-row .star { font-size: 14px; }
.web .nws-row .txt { font-size: 15px; font-weight: 600; color: #111827; }
.web .nws-row .when { font-size: 13px; color: #6b7280; }
.web .nws-row .chev { width: 26px; height: 26px; display: inline-grid; place-items: center; border-radius: 7px; background: #f1f3f8; color: #4b5563; }
.web .nws-row .chev svg { transition: transform .2s ease; } .web .nws-row .chev.up svg { transform: rotate(180deg); }
.web .nws-row:hover .chev { background: #eef3ff; color: #2b6df3; }
.web .nws-empty { font-size: 14px; }
.web .nws-open { padding: 6px 4px 16px 54px; }
.web .nws-open p { font-size: 14px; color: #374151; }
.web .nws-open .posted { font-size: 13px; }

/* 웹 두 상자 — 넓으면 좌우, 좁으면 위아래. 목록은 테두리 상자 하나(줄 사이는 가는 선) */
.nws-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
@media (max-width: 900px) { .nws-two { grid-template-columns: minmax(0, 1fr); } }
.web .nws-list { border: 1px solid #e3e8f0; border-radius: 10px; background: #fafbfd; overflow: hidden; }
.web .nws-item + .nws-item { border-top: 1px solid #e8ebf1; }
.web .nws-item .nws-row { padding: 12px 14px; border: none; }
.web .nws-item .nws-row:hover { background: #f1f5fd; }
.web .nws-item.open .nws-row { background: #eef3ff; }
.web .nws-item .txt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.web .nws-item .chev { margin-left: auto; }
.web .nws-item .nws-open { padding: 4px 14px 14px 64px; background: #fff; }
.web .nws-date { display: flex; justify-content: space-between; gap: 12px; margin: 12px 0 0; padding-top: 8px; border-top: 1px dashed #e3e8f0; font-size: 12px; font-weight: 400; color: #a3adc2; }   /* 등록 · 작성자 — 본문(14)보다 작고 옅게, 웹 글자 하한 12 */
.web .nws-date .who { color: #a3adc2; }

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
