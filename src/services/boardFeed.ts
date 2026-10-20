// 앱이 보는 공지·이벤트·업데이트.
//
// 관리자가 올린 글이 있으면 그것을 쓰고, 아직 하나도 없으면 코드에 적어 둔
// 기본 글(boardNews)을 보여 준다 — 화면이 비어 보이지 않게.
import { computed, ref } from 'vue';
import { EVENTS, EVENT_BANNERS, NOTICES, UPDATES, type NewsRow } from './boardNews';
import { subscribeBoardPosts, type BoardPost } from './boardRepository';

const posts = ref<BoardPost[]>([]);
let started = false;

/** 처음 쓰는 화면에서 한 번만 구독한다 */
export const useBoardFeed = () => {
  if (!started) {
    started = true;
    subscribeBoardPosts(
      (rows) => { posts.value = rows; },
      (msg) => { console.warn('[board]', msg); },
    );
  }

  const of = (kind: BoardPost['kind']) => posts.value.filter((p) => p.kind === kind);
  const rowsOf = (kind: 'event' | 'notice' | 'update', fallback: NewsRow[]) => computed<NewsRow[]>(() => {
    const mine = of(kind);
    if (mine.length === 0) return fallback;
    return mine.map((p) => ({ tag: p.tag, text: p.text, star: p.star }));
  });

  return {
    events: rowsOf('event', EVENTS),
    notices: rowsOf('notice', NOTICES),
    updates: rowsOf('update', UPDATES),
    banners: computed(() => {
      const mine = of('banner');
      if (mine.length === 0) return EVENT_BANNERS;
      return mine.map((p) => ({
        badge: p.badge ?? 'EVENT',
        title: p.text,
        desc: p.desc ?? '',
        cta: p.cta ?? '자세히 보기',
        period: p.period ?? '',
      }));
    }),
  };
};
