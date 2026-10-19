// 무료체험 안내 — 로그인 화면의 안내 창과 무료체험 안내 페이지가 같이 쓴다.
import { TRIAL_DAYS, WELCOME_POINT } from './billingPlans';

export { TRIAL_DAYS, WELCOME_POINT };

/** 가입하면 바로 받는 것 — 회원가입 화면의 카드와 같은 내용 */
export const TRIAL_PERKS: Array<{ big: string; small: string }> = [
  { big: `${TRIAL_DAYS}일`, small: '무료이용' },
  { big: `${WELCOME_POINT.toLocaleString('ko-KR')}p`, small: '축하포인트' },
  { big: '무료', small: '경매교육 영상' },
];

/** 무료체험을 어떻게 받는지 — 숫자 셋으로 나눠 적는다 (b 로 묶은 곳만 굵게) */
export const TRIAL_STEPS: string[] = [
  `회원가입을 하시면 <b>${TRIAL_DAYS}일 무료이용권</b>이 바로 지급됩니다`,
  '무료체험 기간에는 <b>결제하지 않습니다</b> — 모든 기능을 그대로 쓰실 수 있습니다',
  '무료체험은 <b>계정당 1회</b>만 사용 가능합니다',
];

export const TRIAL_NOTE =
  `※ ${TRIAL_DAYS}일(72시간)이 지나면 더보기 › 결제하기에서 이용 기간을 고르시면 `
  + '그대로 이어서 쓰실 수 있습니다. 적어 두신 물건과 사진은 사라지지 않습니다.';
