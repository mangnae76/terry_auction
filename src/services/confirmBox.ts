// 확인창 한 벌 — 선정물건과 보관함이 같은 창을 쓴다.
// 브라우저 기본 confirm 에는 체크상자를 넣을 수 없어 직접 만들었다.
export type ConfirmBox = {
  title: string;
  desc: string;
  okLabel: string;
  /** 저장 열쇠. 비우면 '오늘 하루 보지 않기'를 내지 않는다(되돌릴 수 없는 일) */
  skipKey: string;
  /** 단추 색 — 기본은 빨강(지우는 일). 'calm' 은 되돌릴 수 있는 일(보관 등) */
  tone?: 'danger' | 'calm';
  run: () => Promise<void> | void;
  /** 알리기만 하는 창 — 취소 단추 없이 확인 하나(맞지 않는 날짜 등) */
  alertOnly?: boolean;
  /** 제목 앞 아이콘 — 'warn' 은 빨간 삼각형 느낌표(맞지 않는 날짜 · 고를 수 없는 단계) */
  icon?: 'warn';
};

/** 오늘 날짜 — 하루가 지나면 '보지 않기'가 저절로 풀린다 */
export const todayStamp = () => {
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
};

export const skipsToday = (key: string) => {
  if (!key) return false;
  try { return localStorage.getItem(key) === todayStamp(); } catch { return false; }
};

export const rememberSkip = (key: string) => {
  if (!key) return;
  try { localStorage.setItem(key, todayStamp()); } catch { /* 저장 못 해도 하던 일은 진행한다 */ }
};
