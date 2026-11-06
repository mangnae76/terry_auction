// 무료체험 안내 — 로그인 화면의 안내 창과 무료체험 안내 페이지가 같이 쓴다.
import { POINTS_OPEN, TRIAL_DAYS, WELCOME_POINT } from './billingPlans';

export { TRIAL_DAYS, WELCOME_POINT };

/** 가입하면 바로 받는 것 — 로그인 화면 무료체험 창 · 무료체험 안내 페이지 · 회원가입 카드가 같이 쓴다.
 *  guide — 칸이 좁은 곳(회원가입 카드 · 한 줄 글)은 이용가이드를 뺀다 */
export const TRIAL_PERKS: Array<{ big: string; small: string; guide?: true }> = [
  { big: `${TRIAL_DAYS}일`, small: '무료이용' },
  ...(POINTS_OPEN ? [{ big: `${WELCOME_POINT.toLocaleString('ko-KR')}p`, small: '축하포인트' }] : []),
  { big: '무료', small: '경매교육 영상' },
  { big: '무료', small: '경매교육 전자책' },
  { big: '무료', small: '이용가이드', guide: true },
];
/** 한 줄로 적을 때 — '3일 무료이용권 + 경매교육 영상 · 전자책' */
export const TRIAL_PERK_LINE = '교육영상 + 전자책';
