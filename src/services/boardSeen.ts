// 어디까지 봤는지 — 새 글이 올라오면 제목 옆에 빨간 점을 띄우려고 기억해 둔다.
// 기기마다 다르게 보면 되는 값이라 이 기기에만 담는다.

const KEY = 'myturn.board.seen';

export type SeenMap = Record<string, string>;

export const loadSeen = (): SeenMap => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch {
    return {};
  }
};

/** 본 것으로 적어 둔다 — 이미 더 늦은 때를 적어 두었으면 그대로 둔다 */
export const markSeen = (kind: string, at: string): void => {
  if (!at) return;
  try {
    const map = loadSeen();
    if ((map[kind] ?? '') >= at) return;
    map[kind] = at;
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* 담지 못해도 그만 — 점이 한 번 더 보일 뿐이다 */
  }
};
