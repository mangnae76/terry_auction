<script setup lang="ts">
// 부가서비스 — 공지사항·이벤트·업데이트·포인트를 차례로 적는다.
// 글은 services/boardNews·pointPolicy 에 있고 여기서는 그리기만 한다.
import { computed, inject, onUnmounted, ref } from 'vue';
import ImageLightbox from './ImageLightbox.vue';
import { useBoardFeed, useBoardNew } from '../services/boardFeed';

/** 관리자가 올린 글 — 아직 없으면 코드의 기본 글을 쓴다 */
const { events: eventsAll, eventsDb, notices: noticesAll, noticesDb, updates: UPDATES } = useBoardFeed();
/** 웹은 공지를 DB 글로만 보여 준다 — 앱은 예전처럼(글이 없으면 기본 글) */
const web = inject('webEmbed', false);
const NOTICES = computed(() => (web ? noticesDb.value : noticesAll.value));
const EVENTS = computed(() => (web ? eventsDb.value : eventsAll.value));
/** noticeOnly — 앱에서 이벤트 목록을 뺄 때. 웹은 2026-11-13부터 이벤트 · 공지사항 · 업데이트 세 상자 */
defineProps<{ noticeOnly?: boolean }>();

/* 새 글 알림 — 보는 동안에는 켜 두고, 탭을 떠날 때 본 것으로 적는다 */
const { event: eventNew, notice: noticeNew, update: updateNew, markAllSeen } = useBoardNew();
onUnmounted(markAllSeen);

/** 크게 볼 그림 ('' 이면 닫힘) */
const zoom = ref('');

/* 웹 — 이벤트 · 공지사항 · 업데이트 세 상자. 줄마다 제목 · 등록 | 작성자, 누르면 팝업(2026-11-13 사용자) */
type NewsRow = { id?: string; tag?: string; star?: boolean; text: string; body?: string; imageUrl?: string; postedShort?: string; postedFull?: string; author?: string };
/** 팝업으로 연 글 — 이벤트 · 공지 · 업데이트 줄을 누르면 연다(웹 · 앱) */
const popRow = ref<NewsRow | null>(null);
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && popRow.value && !zoom.value) popRow.value = null; };
window.addEventListener('keydown', onKey);
onUnmounted(() => window.removeEventListener('keydown', onKey));
/* 상자 제목 아이콘(흰 카드 제목) — 이벤트 선물 · 공지사항 확성기 · 업데이트 반짝임 */
const ICO = {
  e: '<path d="M20 12v9H4v-9" /><path d="M2 7h20v5H2z" /><path d="M12 21V7" /><path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z" />',
  n: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" />',
  u: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />',
};
const webBoxes = computed(() => [
  { key: 'e', title: '이벤트', ico: ICO.e, rows: EVENTS.value as NewsRow[], isNew: eventNew.value, empty: '지금 진행 중인 이벤트가 없습니다' },
  { key: 'n', title: '공지사항', ico: ICO.n, rows: NOTICES.value as NewsRow[], isNew: noticeNew.value, empty: '지금 올라온 공지사항이 없습니다' },
  { key: 'u', title: '업데이트', ico: ICO.u, rows: UPDATES.value as NewsRow[], isNew: updateNew.value, empty: '지금 올라온 업데이트가 없습니다' },
]);
</script>

<template>
  <div :class="['nws-wrap', { web }]">
    <!-- 웹 — 이벤트 · 공지사항 · 업데이트 세 상자(좁으면 위아래). 목록은 테두리 상자 하나, 줄마다 제목 · 등록 | 작성자.
         줄을 누르면 팝업으로 본문 전체 · 그림(2026-11-13 사용자) -->
    <div v-if="web" class="nws-two">
      <section v-for="bx in webBoxes" :key="bx.key" class="nws-card" :data-sec="bx.key === 'e' ? 'event' : bx.key === 'n' ? 'notice' : 'update'">
        <h3 class="nws-h"><svg class="nws-h-ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="bx.ico" />{{ bx.title }}<i v-if="bx.isNew" class="dot" /><span v-if="!bx.rows.length" class="nws-h-empty">{{ bx.empty }}</span></h3>
        <div v-if="bx.rows.length" class="nws-list">
          <button v-for="(r, i) in bx.rows" :key="`${bx.key}${i}`" type="button" class="nws-item" @click="popRow = r">
            <span class="nws-row">
              <span v-if="r.star" class="star">✦</span><span v-else class="tag">{{ r.tag }}</span>
              <span class="txt">{{ r.text }}</span>
              <i class="chev go" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6" /></svg></i>
            </span>
            <span class="nws-date"><span>{{ r.postedFull || r.postedShort }}</span><span class="who">작성자 {{ r.author || '운영자' }}</span></span>
          </button>
        </div>
      </section>
    </div>

    <template v-else>
    <!-- 앱 — 줄을 누르면 웹과 같은 팝업으로 본문 전체(2026-11-13 사용자) -->
    <section v-if="!noticeOnly" class="nws-card" data-sec="event">
      <h3 class="nws-h">이벤트<i v-if="eventNew" class="dot" /></h3>
      <button v-for="(e, i) in EVENTS" :key="`e${i}`" type="button" class="nws-row" @click="popRow = e">
        <span class="tag">{{ e.tag }}</span><span class="txt">{{ e.text }}</span>
        <span v-if="e.postedShort" class="when">{{ e.postedShort }}</span>
        <i class="chev">›</i>
      </button>
    </section>

    <section class="nws-card" data-sec="notice">
      <h3 class="nws-h">공지사항<i v-if="noticeNew" class="dot" /></h3>
      <p v-if="!NOTICES.length" class="nws-empty">지금 올라온 공지사항이 없습니다</p>
      <button v-for="(n, i) in NOTICES" :key="`n${i}`" type="button" class="nws-row" @click="popRow = n">
        <span v-if="n.star" class="star">✦</span><span v-else class="tag">{{ n.tag }}</span>
        <span class="txt">{{ n.text }}</span>
        <span v-if="n.postedShort" class="when">{{ n.postedShort }}</span>
        <i class="chev">›</i>
      </button>
    </section>

    <section class="nws-card" data-sec="update">
      <h3 class="nws-h">업데이트<i v-if="updateNew" class="dot" /></h3>
      <button v-for="(u, i) in UPDATES" :key="`u${i}`" type="button" class="nws-row" @click="popRow = u">
        <span class="tag">{{ u.tag }}</span><span class="txt">{{ u.text }}</span>
        <span v-if="u.postedShort" class="when">{{ u.postedShort }}</span>
        <i class="chev">›</i>
      </button>
    </section>

    </template>

    <!-- 이벤트 · 공지 · 업데이트 팝업(웹 · 앱) — 제목 · 등록 | 작성자 · 그림 · 본문 전체 -->
    <Teleport to="body">
      <div v-if="popRow" class="nws-pop-bg" @click.self="popRow = null">
        <div class="nws-pop" role="dialog" aria-modal="true" :aria-label="popRow.text">
          <div class="nws-pop-head">
            <span v-if="popRow.star" class="star">✦</span><span v-else class="tag">{{ popRow.tag }}</span>
            <h3>{{ popRow.text }}</h3>
            <button type="button" class="x" aria-label="닫기" @click="popRow = null"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
          </div>
          <p class="nws-pop-date"><span>{{ popRow.postedFull || popRow.postedShort }}</span><span>작성자 {{ popRow.author || '운영자' }}</span></p>
          <div class="nws-pop-body">
            <img v-if="popRow.imageUrl" :src="popRow.imageUrl" alt="" @click="zoom = popRow.imageUrl!" />
            <p v-if="popRow.body">{{ popRow.body }}</p>
            <p v-else-if="!popRow.imageUrl" class="none">내용이 없습니다</p>
          </div>
        </div>
        <ImageLightbox v-if="zoom" :src="zoom" @close="zoom = ''" />
      </div>
    </Teleport>
    <ImageLightbox v-if="zoom && !popRow" :src="zoom" @close="zoom = ''" />
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

/* 웹 두 상자 — 넓으면 좌우, 좁으면 위아래. 목록은 테두리 상자 하나(줄 사이는 가는 선) */
.nws-two { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: start; }
@media (max-width: 1100px) { .nws-two { grid-template-columns: minmax(0, 1fr); } }
.web .nws-h { display: flex; align-items: center; gap: 6px; }
.web .nws-h-ico { flex: none; color: #2b6df3; }
.web .nws-h-empty { margin-left: 4px; font-size: 13px; font-weight: 400; color: #9aa6c4; }   /* 글이 없을 때 — 제목 오른쪽에(2026-11-13 사용자) */
.web .nws-card:has(.nws-h-empty) .nws-h { margin-bottom: 0; }
.web .nws-list { border: 1px solid #e3e8f0; border-radius: 10px; background: #fafbfd; overflow: hidden; }
.web .nws-item { display: block; width: 100%; padding: 12px 14px; border: 0; border-radius: 0; background: none; font: inherit; text-align: left; cursor: pointer; }
.web .nws-item + .nws-item { border-top: 1px solid #e8ebf1; }
.web .nws-item:hover { background: #f3f6fc; }
.web .nws-item .nws-row { padding: 0; border: none; }
.web .nws-item .nws-row:hover { background: none; }
.web .nws-item .txt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.web .nws-item .chev.go { margin-left: auto; }
.web .nws-item:hover .chev { background: #eef3ff; color: #2b6df3; }
.web .nws-item .nws-date { display: flex; justify-content: space-between; gap: 12px; margin: 6px 0 0 50px; font-size: 12px; color: #a3adc2; }   /* 등록 · 작성자 — 작고 옅게, 웹 글자 하한 12 */

/* 웹 공지 · 업데이트 팝업 — 본문 전체(길면 팝업 안에서 내린다) */
.nws-pop-bg { position: fixed; inset: 0; z-index: 3000; display: grid; place-items: center; padding: 24px 16px; background: rgba(17, 24, 39, .45); }
.nws-pop { width: 100%; max-width: 640px; max-height: 86vh; display: flex; flex-direction: column; border-radius: 14px; background: var(--surface, #fff); box-shadow: 0 20px 50px rgba(17, 24, 39, .25); overflow: hidden; }
.nws-pop-head { display: flex; align-items: center; gap: 10px; padding: 18px 20px 0; }
.nws-pop-head .tag { flex: none; min-width: 40px; padding: 3px 8px; border-radius: 4px; background: #f1f3f8; color: #6b7280; font-size: 12px; font-weight: 700; text-align: center; }
.nws-pop-head .star { flex: none; color: #2b6df3; font-size: 14px; }
.nws-pop-head h3 { flex: 1 1 auto; min-width: 0; margin: 0; font-size: 16px; font-weight: 800; color: var(--text, #111827); word-break: keep-all; }
.nws-pop-head .x { flex: none; width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 8px; background: none; color: #6b7280; cursor: pointer; }
.nws-pop-head .x:hover { background: #f1f3f8; }
.nws-pop-date { display: flex; justify-content: space-between; gap: 12px; margin: 8px 20px 0; padding-bottom: 14px; border-bottom: 1px solid var(--line, #e3e8f0); font-size: 12px; color: #a3adc2; }
.nws-pop-body { padding: 16px 20px 22px; overflow-y: auto; }
.nws-pop-body img { display: block; max-width: 100%; margin-bottom: 12px; border-radius: 8px; cursor: zoom-in; }
.nws-pop-body p { margin: 0; font-size: 14px; line-height: 1.75; color: var(--text, #374151); white-space: pre-line; word-break: keep-all; }
.nws-pop-body p.none { color: #9aa6c4; }

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
