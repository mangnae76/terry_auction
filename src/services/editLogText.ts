// 최근 분석(웹 홈 · 전체보기 창) · 최근 작성(마이페이지) 한 줄의 글 — 세 곳이 같은 꼬리표 · 설명을 쓴다(2026-11-06)
// 기록(editLog)의 where 는 '단계' · '물건상세 › 수익분석' · '임장경로' · '낙찰이후 › 명도분석' · '자금관리 › 필요경비' 꼴

/** 꼬리표 칩 — '물건상세 › 수익분석' → '수익분석', '낙찰이후 › 명도분석' → '낙찰이후 · 명도분석' */
export const editLogTag = (where: string): string => {
  const w = String(where || '').replace(/입찰가산정/g, '수익분석');
  if (w === '단계') return '단계';
  const item = w.match(/^물건상세 › (.+)$/);
  if (item) return item[1];
  if (/^임장경로/.test(w)) return '임장경로';
  const pw = w.match(/^낙찰이후(?: › (.+))?$/);
  if (pw) return `낙찰이후 · ${pw[1] || '진행절차'}`;
  const fin = w.match(/^자금관리 › (.+)$/);
  if (fin) return `자금관리 · ${fin[1]}`;
  return w;
};

/** 칩 오른쪽 설명 — 단계는 '낙찰 → 임장예정 변경', 그 밖은 '내용수정'(무엇을 고쳤는지 적힌 줄은 그 글 + 수정) */
export const editLogDesc = (where: string, what?: string): string => {
  if (String(where || '') === '단계') return what ? `${what} 변경` : '변경';
  return what ? `${what} 수정` : '내용수정';
};
