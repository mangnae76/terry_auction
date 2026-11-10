// 매매수요 등급 — 앱 물건상세(손품+현장 › 매매수요)의 A·B·C 기준과 같다(엑셀 수식 그대로).
// 웹 수요분석 표도 이 한 곳을 쓴다. 기준을 바꾸면 여기만 고친다.

export type DemandGrade = 'A' | 'B' | 'C' | '-';
export type DemandMetric = 'turnover' | 'absorb' | 'burden' | 'clear';

/** a = A 경계, b = B 경계. higher = 클수록 좋다 */
export const DEMAND_GRADE_RULES: Record<DemandMetric, { a: number; b: number; higher: boolean }> = {
  turnover: { a: 3, b: 1.5, higher: true },   // 연간 회전율(%) — A 3%↑ · B 1.5%↑
  absorb: { a: 180, b: 120, higher: true },   // 연간 매물 소화율(%) — A 180%↑ · B 120%↑
  burden: { a: 3, b: 5, higher: false },      // 매물율(%) — A 3%↓ · B 5%↓
  clear: { a: 6, b: 10, higher: false },      // 매물 소화기간(개월) — A 6↓ · B 10↓(소화율 120% 와 같은 선 = 1,200 ÷ 120, 2026-11-10)
};

/** 값이 준비되지 않았으면 '-' */
export const demandGradeOf = (metric: DemandMetric, ready: boolean, value: number): DemandGrade => {
  if (!ready) return '-';
  const { a, b, higher } = DEMAND_GRADE_RULES[metric];
  if (higher) return value >= a ? 'A' : value >= b ? 'B' : 'C';
  return value <= a ? 'A' : value <= b ? 'B' : 'C';
};

/** 거래 회전율 합격선(연 %) — 아파트는 3%: 수도권 아파트 연 회전율이 2022년 0.56~1.66% · 2023년 1.76~3.23%(직방)라 3% 넘으면 평균 이상.
 *  전국 7.9%(2020)는 활황기 전국 값이라 수도권 기준으론 높다 — 5% → 3%(2026-11-10 사용자 결정). 지역 수치는 ⓘ 표(APT_TURNOVER_STATS)에.
 *  8% 이상(300세대에 월 2건, 2020 활황기 전국 평균)은 매우 활발. 빌라 · 그 밖은 엑셀 기준 그대로(1.5%, 공식 통계 아님) */
export const APT_TURNOVER_LINE = 3;
export const APT_TURNOVER_HOT = 8;
/** 아파트 회전율 ⓘ 단계 — 선마다 어느 해 · 어느 지역 수준인지(APT_TURNOVER_STATS 와 직방 전국 값) */
export const APT_TURNOVER_STEPS: Array<[string, string]> = [
  [`${APT_TURNOVER_LINE}% 이상`, '수도권 평균 이상(2023년 경기 2.99% · 인천 3.23%)'],
  ['5% 이상', '활발 — 2021년 전국 수준(5.36%)'],
  [`${APT_TURNOVER_HOT}% 이상`, '매우 활발 — 2020년 활황기 전국(7.9%), 같은 평형 300세대에 월 2건'],
];
/** 아파트 회전율 ⓘ 표 — 지역별 연 회전율(직방, 국토부 실거래 ÷ 아파트 재고). 2024년 이후 지역별 발표는 없다(2026-11-10 조사) */
export const APT_TURNOVER_STATS: Array<[string, string]> = [
  ['구분', '서울 · 경기 · 인천 · 전국'],
  ['2022년', '0.56% · 1.55% · 1.66% · 2.28%'],
  ['2023년', '1.76% · 2.99% · 3.23% · 3.04%'],
  ['출처', '직방(국토부 실거래 기준, 2023년 12월 발표)'],
];
export const turnoverLineOf = (apt: boolean) => (apt ? APT_TURNOVER_LINE : DEMAND_GRADE_RULES.turnover.b);

/** 소수 한 자리 — 0 이면 떼고 정수로('100.0' → '100', '3.6' 그대로). 수요지표 값 공통(2026-11-10) */
export const dec1 = (n: number) => { const r = Math.round(n * 10) / 10; return Number.isInteger(r) ? r.toLocaleString('ko-KR') : r.toFixed(1); };

/** 합격선 한 줄 — 웹 수요분석 지표 칸 막대 뒤(등급 A·B·C 대신, 2026-11-10 사용자 결정). '적합' 쪽만 짧게 — 부적합 설명은 ⓘ 에. 선은 등급표의 '적합' 끝(B 경계) */
export const DEMAND_PASS_TEXT: Record<DemandMetric, string> = {
  absorb: `${DEMAND_GRADE_RULES.absorb.b}% 이상 적합`,
  clear: `${DEMAND_GRADE_RULES.clear.b}개월 이하 적합`,
  turnover: `${DEMAND_GRADE_RULES.turnover.b}% 이상 적합`,
  burden: `${DEMAND_GRADE_RULES.burden.b}% 이하 적합`,
};

/** 막대 뒤 합격선 글 — 아파트 회전율만 3%(빌라 1.5%) */
export const demandPassText = (m: DemandMetric, apt = false) => (m === 'turnover' ? `${turnoverLineOf(apt)}% 이상 적합` : DEMAND_PASS_TEXT[m]);

/** 합격선 기호 — 막대 뒤 짧은 표시('≥3%' · '≤5%' · '≥120%' · '≤10개월'). 말로 된 기준은 ⓘ · title 에(2026-11-10) */
export const demandLineText = (m: DemandMetric, apt = false) => {
  const R = DEMAND_GRADE_RULES;
  if (m === 'turnover') return `≥${turnoverLineOf(apt)}%`;
  if (m === 'clear') return `≤${R.clear.b}개월`;
  return `${R[m].higher ? '≥' : '≤'}${R[m].b}%`;
};
/** 이 값이 합격선을 넘었나 — 기호 옆 ✓(적합) · ✕(부적합) */
export const demandPassOf = (m: DemandMetric, value: number, apt = false) => {
  const R = DEMAND_GRADE_RULES[m];
  const line = m === 'turnover' ? turnoverLineOf(apt) : R.b;
  return R.higher ? value >= line : value <= line;
};

/** 종합 의견 — 매물(소화기간 10개월 선) × 거래(회전율 1.5% 선, 아파트 3%) 네 칸. 등급 대신 한 줄(2026-11-10 사용자 시안 'Level 3 · 저매물 / 저거래').
 *  매물이 많고 적음은 세대수가 아니라 팔리는 속도로 본다 — 1년치가 쌓였으면 세대수 대비 적어도 '고매물'(2026-11-10 사용자 결정, 성포동 329건 · 329건).
 *  소화기간 = 1,200 ÷ 소화율 이라 소화율로 받는다(거래 0건이면 소화율 0 → 고매물). 선은 DEMAND_PASS_TEXT 와 같은 합격선. 값이 없으면 null */
export const demandOpinionOf = (absorb: number, turnover: number, ready: boolean, apt = false): { level: number; title: string; text: string } | null => {
  if (!ready) return null;
  const clearMonths = absorb > 0 ? 1200 / absorb : Infinity;
  const lowListing = clearMonths <= DEMAND_GRADE_RULES.clear.b;
  const highDeal = turnover >= turnoverLineOf(apt);
  // 거래가 얼마나 활발한지 한 낱말 — 아파트 3~5% 다소 · 5~8% · 8%↑ 매우(ⓘ 단계와 같다), 빌라 1.5~3% 다소 · 3%↑
  const lively = apt
    ? (turnover >= APT_TURNOVER_HOT ? '매우 활발' : turnover >= 5 ? '활발' : '다소 활발')
    : (turnover >= DEMAND_GRADE_RULES.turnover.a ? '활발' : '다소 활발');
  // 뒤 한 문장 — 그 구간에서 가격이 어느 쪽으로 가기 쉬운지(단정하지 않는다, 2026-11-10)
  if (lowListing && highDeal) return { level: 1, title: '저매물 / 고거래', text: `매물은 적고 거래는 ${lively}합니다. 매도자 우위라 가격이 오르기 쉽습니다.` };
  if (!lowListing && highDeal) return { level: 2, title: '고매물 / 고거래', text: `매물은 많지만 거래도 ${lively}합니다. 균형 구간이라 가격은 보합이기 쉽습니다.` };
  if (lowListing) return { level: 3, title: '저매물 / 저거래', text: '매물은 적지만 거래도 둔합니다. 관망 구간이라 가격이 정체되기 쉽습니다.' };
  return { level: 4, title: '고매물 / 저거래', text: '매물은 쌓이고 거래도 둔합니다. 매수자 우위라 가격이 내리기 쉽습니다.' };
};

/** A·B 는 적합, C 는 부적합 */
export const demandFitText = (g: DemandGrade) => (g === '-' ? '' : g === 'A' || g === 'B' ? '적합' : '부적합');

/** 네 지표 말풍선 — 웹 수요분석 · 단지 수요분석. 기준 줄은 등급(A·B·C) 대신 합격선 한 줄(DEMAND_PASS_TEXT 와 같은 말, 2026-11-10). what = '연립·다세대' 같은 종류 이름 */
export const demandTip = (metric: DemandMetric, what: string, apt = false): Array<[string, string]> => ({
  turnover: [
    ['공식', '12개월 거래량 ÷ 총 세대수 × 100'],
    ['의미', `${what} 중 1년에 몇 %가 손바뀜되나`],
    ['기준', `${turnoverLineOf(apt)}% 이상 적합 · 미만 부적합`],
    ...(apt ? [...APT_TURNOVER_STEPS, ...APT_TURNOVER_STATS]
      : [['참고', `${DEMAND_GRADE_RULES.turnover.b}%는 업계에서 쓰는 기준(공식 통계 아님)`] as [string, string]]),
  ],
  absorb: [
    ['공식', '12개월 거래량 ÷ 총 매물수 × 100'],
    ['의미', '나와 있는 매물 중 한 해에 몇 %가 팔리나'],
    ['기준', `${DEMAND_GRADE_RULES.absorb.b}% 이상 적합 · 미만 부적합`],
  ],
  burden: [
    ['공식', '총 매물수 ÷ 총 세대수 × 100'],
    ['의미', `${what} 가운데 지금 팔려고 내놓은 집이 몇 %인가`],
    ['예', '1,000세대에 매물 30건이면 3%'],
    ['기준', '5% 이하 적합 · 초과 부적합'],
    ['위험', '5%가 넘으면 매물이 쌓였다'],
  ],
  clear: [
    ['공식', '총 매물수 ÷ 월평균 거래량'],
    ['의미', '총 누적 매물이 다 팔리는 데 걸리는 달 수'],
    ['기준', `${DEMAND_GRADE_RULES.clear.b}개월 이하 적합 · 초과 부적합`],
    ['관계', `소화율 ${DEMAND_GRADE_RULES.absorb.b}%와 같은 선(1,200 ÷ ${DEMAND_GRADE_RULES.absorb.b})`],
  ],
} as Record<DemandMetric, Array<[string, string]>>)[metric];

/** 종합등급 — 네 등급을 A 3 · B 2 · C 1 로 바꿔 평균(2.5↑ A · 1.5↑ B · 그 아래 C). 셋 이상 매겨져야 나온다(앱 dmTotalGrade 와 같다) */
export const demandTotalGrade = (grades: DemandGrade[]): DemandGrade => {
  const scored = grades.filter((g) => g !== '-').map((g) => ({ A: 3, B: 2, C: 1 } as Record<string, number>)[g] ?? 0);
  if (scored.length < 3) return '-';
  const avg = scored.reduce((a, b) => a + b, 0) / scored.length;
  return avg >= 2.5 ? 'A' : avg >= 1.5 ? 'B' : 'C';
};

/** 종합 말풍선 — 앱 매매수요(dmTipData.total)와 같은 줄 */
export const DEMAND_TOTAL_TIP: Array<[string, string]> = [
  ['대상', '매물 소화율 · 매물 소화기간 · 거래 회전율 · 매물율'],
  ['공식', '네 등급을 A 3 · B 2 · C 1로 바꿔 평균을 낸다'],
  ['기준', '평균 2.5↑ A · 1.5↑ B · 그 아래 C'],
  ['조건', '네 등급 중 셋 이상 매겨져야 종합등급이 나온다'],
];

/** 칸 이름 밑 쉬운 말 — 공식을 몰라도 뜻이 들어오게(앱 · 웹 같은 말) */
export const DEMAND_PLAIN: Record<DemandMetric, string> = {
  absorb: '1년에 매물이 몇 % 팔리나',
  clear: '다 팔리는 데 걸리는 시간',
  turnover: '동네 거래가 얼마나 활발한가',
  burden: '매물이 얼마나 쌓였나',
};
/** 종합 칸 쉬운 말 */
export const DEMAND_TOTAL_PLAIN = '수요지표 4가지 합산';

/** 동마다 받은 세대수를 더한 상태 — 값: 양수 · 0(없음) = 받음, -1 = 못 받음, undefined = 받는 중.
 *  다 받기 전의 합은 '일부'라 총 세대수 · 회전율 · 부담률 · 등급을 확정값처럼 쓰면 안 된다(ready 일 때만) */
export type UnitsTally = {
  /** 받은 동의 합(못 받은 · 받는 중인 동은 빠진 값) */
  total: number;
  /** 동 수 · 받은 동 · 받는 중 · 못 받음 */
  count: number; done: number; pending: number; failed: number;
  /** 모든 동을 받았다 — 이때만 total 이 총 세대수다 */
  ready: boolean;
};
export const tallyDongUnits = (values: Array<number | undefined>): UnitsTally => {
  let total = 0; let done = 0; let pending = 0; let failed = 0;
  values.forEach((v) => {
    if (v === undefined) pending += 1;
    else if (v < 0) failed += 1;
    else { done += 1; total += v; }
  });
  return { total, count: values.length, done, pending, failed, ready: pending === 0 && failed === 0 };
};
