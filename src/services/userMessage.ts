// 화면에 내보내는 오류 문장 — 한 곳 모듈(2026-11-07).
// 바깥(구글 AI · 서버 · 브라우저)이 돌려준 오류 원문(영어 · 코드 · 기호)은 절대 화면에 내보내지 않는다.
// 우리가 직접 쓴 한국어 문장이면 그대로, 아니면 정해 둔 한국어 문장으로. 원문은 콘솔에만 남겨 원인 추적에 쓴다.

/** 화면에 써도 되는 영어 낱말(서비스 이름 · 단위) — 이것을 빼고도 영어 낱말이 남으면 원문으로 본다 */
const ALLOWED = /PDF|AI|ID|URL|MyAgent|agent\.py|Ctrl\+V|Google Drive|KB|MB|GB|UPDATE/g;

/** 우리 한국어 문장인가 — 한글이 있고, 허용 낱말을 뺀 뒤 영어 낱말(두 글자 이상) · 코드 기호가 없어야 한다 */
export const isOurText = (s: string): boolean => {
  const t = String(s || '').trim();
  if (!t || !/[가-힣]/.test(t)) return false;
  const rest = t.replace(ALLOWED, '');
  return !/[A-Za-z]{2,}|[{}<>[\]=`]|\\n/.test(rest);
};

const rawOf = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message?: unknown }).message ?? '');
  return '';
};

/** 오류 → 화면 문장. 우리 문장이 아니면 fallback(원문은 콘솔에만) */
export const userMessage = (err: unknown, fallback = '처리하지 못했습니다. 잠시 뒤 다시 해 주세요.'): string => {
  const raw = rawOf(err);
  if (isOurText(raw)) return raw;
  // eslint-disable-next-line no-console
  if (raw || err) console.warn('[오류 원문 — 화면엔 감춤]', err);
  return fallback;
};

/** 구글 AI 오류 원문 · 상태 번호 → 원인별 한국어 한 문장 */
export const aiErrorText = (raw: string | undefined | null, status?: number): string => {
  const r = String(raw || '');
  // eslint-disable-next-line no-console
  if (r || status) console.warn('[AI 오류 원문 — 화면엔 감춤]', status ?? '', r);
  if (status === 503 || /overload|unavailable|try again later|busy|503/i.test(r)) return 'AI 서버가 붐빕니다. 잠시 뒤 다시 해 주세요.';
  if (status === 429 || /quota|exhaust|rate.?limit|429/i.test(r)) return 'AI 사용 한도에 걸렸습니다. 잠시 뒤 다시 해 주세요.';
  if (status === 413 || /payload|too large|exceeds|token count|413/i.test(r)) return '서류가 너무 큽니다. 장 수를 줄여 다시 해 주세요.';
  if (status === 401 || status === 403 || /api.?key|permission|unauthori[sz]ed|forbidden|401|403/i.test(r)) return 'AI 키를 확인해 주세요.';
  if (/failed to fetch|network|timeout|timed out|econn|load failed/i.test(r)) return '인터넷 연결을 확인해 주세요.';
  if (/safety|blocked|recitation/i.test(r)) return 'AI가 이 서류에는 답하지 않았습니다. 다른 서류로 다시 해 주세요.';
  return 'AI 분석을 하지 못했습니다. 잠시 뒤 다시 해 주세요.';
};
