// 앱이 보는 공지·이벤트·업데이트.
//
// 관리자가 올린 글이 있으면 그것을 쓰고, 아직 하나도 없으면 코드에 적어 둔
// 기본 글(boardNews)을 보여 준다 — 화면이 비어 보이지 않게.
import { computed, ref } from 'vue';
import { EVENTS, EVENT_BANNERS, NOTICES, UPDATES, type NewsRow } from './boardNews';
import { isLive, nowLocal, subscribeBoardPosts, titleOf, type BoardPost } from './boardRepository';

const posts = ref<BoardPost[]>([]);
let started = false;

// 예약한 때가 지나면 저절로 올라오고 내려가도록 1분마다 지금 시각을 다시 본다
const now = ref(nowLocal());

/** 처음 쓰는 화면에서 한 번만 구독한다 */
export const useBoardFeed = () => {
  if (!started) {
    started = true;
    subscribeBoardPosts(
      (rows) => { posts.value = rows; },
      (msg) => { console.warn('[board]', msg); },
    );
    window.setInterval(() => { now.value = nowLocal(); }, 60_000);
  }

  const of = (kind: BoardPost['kind']) => posts.value.filter((p) => p.kind === kind);
  const live = (rows: BoardPost[]) => rows.filter((p) => isLive(p, now.value));
  const rowsOf = (kind: 'event' | 'notice' | 'update', fallback: NewsRow[]) => computed<NewsRow[]>(() => {
    // 옛 글 중 배너로 띄우던 이벤트는 아래 줄 목록에 또 적지 않는다
    const pool = kind === 'event' ? of(kind).filter((p) => !p.banner) : of(kind);
    if (pool.length === 0) return fallback;
    return live(pool).map((p) => ({
      tag: p.tag,
      text: titleOf(p),
      star: p.star,
      body: p.body,
      imageUrl: p.imageUrl,
    }));
  });

  return {
    events: rowsOf('event', EVENTS),
    notices: rowsOf('notice', NOTICES),
    updates: rowsOf('update', UPDATES),
    banners: computed(() => {
      // 배너는 따로 쓰지만, 옛 글(이벤트에 배너 표시)도 그대로 읽는다
      const pool = [...of('banner'), ...of('event').filter((p) => p.banner)];
      if (pool.length === 0) return EVENT_BANNERS;
      return live(pool).map((p) => ({
        badge: p.badge || 'EVENT',
        title: titleOf(p),
        imageUrl: p.imageUrl,
        desc: p.body ?? p.desc ?? '',
        cta: p.cta || '자세히 보기',
        period: p.period ?? '',
      }));
    }),
  };
};
