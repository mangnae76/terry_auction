// 어디까지 봤는지 — 새 글이 올라오면 제목 옆에 빨간 점을 띄우려고 기억해 둔다.
// 기기마다 다르게 보면 되는 값이라 이 기기에만 담는다.

import { ref } from 'vue';

const KEY = 'myturn.board.seen';

export type SeenMap = Record<string, string>;

const read = (): SeenMap => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch {
    return {};
  }
};

/** 어디까지 봤는지 — 여러 화면이 같은 값을 본다 (점이 한곳에서 꺼지면 다른 곳도 꺼진다) */
const seen = ref<SeenMap>(read());
export const useSeen = () => seen;

/** 본 것으로 적어 둔다 — 이미 더 늦은 때를 적어 두었으면 그대로 둔다 */
export const markSeen = (kind: string, at: string): void => {
  if (!at) return;
  if ((seen.value[kind] ?? '') >= at) return;
  seen.value = { ...seen.value, [kind]: at };
  try {
    localStorage.setItem(KEY, JSON.stringify(seen.value));
  } catch {
    /* 담지 못해도 그만 — 점이 한 번 더 보일 뿐이다 */
  }
};
