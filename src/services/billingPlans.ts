// 이용요금 — 값은 여기 한곳에서 정한다.
// 결제 화면과 로그인 화면의 '결제안내'가 같은 값을 본다.

/** 1개월 기준가 — 긴 기간은 여기에 할인율만 걸어 셈한다 (값은 여기 한 줄만 고치면 된다) */
export const MONTH_PRICE = 39_000;

export interface Plan {
  key: string;
  label: string;
  months: number;
  /** 받는 값 = 기준가 × 개월 × (1 − 할인율) */
  price: number;
  off: number;
  base?: boolean;
}

const planOf = (months: number, off: number): Plan => ({
  key: `m${months}`,
  label: `${months}개월`,
  months,
  off,
  price: Math.round((MONTH_PRICE * months * (100 - off)) / 100),
  base: off === 0,
});

export const PLANS: Plan[] = [planOf(1, 0), planOf(3, 15), planOf(6, 25), planOf(12, 35)];

/** 안내 글도 표와 같은 값에서 뽑는다 — 할인율만 고치면 글이 저절로 따라온다 */
const offPlans = PLANS.filter((p) => !p.base);
export const OFF_TEXT = offPlans
  .map((p, i) => (i === offPlans.length - 1 ? `${p.label}은 ${p.off}%` : `${p.label} ${p.off}%`))
  .join(', ');
export const MAX_OFF = Math.max(...PLANS.map((p) => p.off));
export const OFF_LABELS = offPlans.map((p) => p.label).join('·');

/** 한 달로 치면 얼마인지 — 깎인 값이 눈에 들어오게 같이 적는다 */
export const perMonth = (p: Plan) => Math.round(p.price / p.months);

/** 남은 이용 기간(일) — 결제 연동 전까지 쓰는 임시값.
 *  만료일을 저장하기 시작하면 그 날짜로 셈해 이 값을 버린다. */
export const PLAN_REST_DAYS = 999;

/** 가입하면 바로 받는 것 — 회원가입 화면의 혜택 카드와 같은 내용 */
export const TRIAL_DAYS = 3;
export const WELCOME_POINT = 1_000;
