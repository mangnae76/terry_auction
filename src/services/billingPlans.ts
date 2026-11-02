// 이용요금 — 값은 여기 한곳에서 정한다.
// 결제 화면과 로그인 화면의 '결제안내'가 같은 값을 본다.

/** 1개월 기준가 — 긴 기간은 여기에 할인율만 걸어 셈한다 (값은 여기 한 줄만 고치면 된다) */
export const MONTH_PRICE = 99_000;   // 2026-11-02 39,000 → 99,000 (기간별 금액 · 월 환산 · 할인액은 여기서 저절로 계산된다)

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

/** 무료 회원인가 — 결제를 붙이기 전까지 쓰는 임시 기준(웹 PAID 와 같다): 이 브라우저의 myturn.plan 이 'free' 이면 무료.
 *  결제 연동 뒤에는 계정의 이용권 끝나는 날로 셈해 이 함수만 바꾼다(docs/서비스오픈목록.md 4) */
export const isFreeMember = (): boolean => {
  try { return localStorage.getItem('myturn.plan') === 'free'; } catch { return false; }
};

/** 가입하면 바로 받는 것 — 회원가입 화면의 혜택 카드와 같은 내용 */
export const TRIAL_DAYS = 3;
export const WELCOME_POINT = 1_000;
/** 포인트 스위치 하나 — 포인트를 실제로 붙이는 서비스 오픈 때 true.
 *  저장하는 곳이 없어 보유 0 · 내역 빈 목록이라, 그때까지 포인트에 닿는 화면은 모두 숨긴다(2026-11-02, 지우지 않음).
 *  가입 축하포인트 · 무료체험 안내 · 마이페이지 등급/누적 포인트 · 머리글 보유포인트 · 결제 포인트 사용 · FAQ · 더보기 포인트 탭이 이것을 본다.
 *  웹 껍데기(web/pages/selected.src.html)의 SHOW_POINTS · 이용가이드(public/guide/index.html)의 POINTS_OPEN 도 이 값과 같게 둔다(docs/서비스오픈목록.md 3-1) */
export const POINTS_OPEN = false;
