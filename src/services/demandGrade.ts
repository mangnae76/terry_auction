// 매매수요 등급 — 앱 물건상세(손품+현장 › 매매수요)의 A·B·C 기준과 같다(엑셀 수식 그대로).
// 웹 수요분석 표도 이 한 곳을 쓴다. 기준을 바꾸면 여기만 고친다.

export type DemandGrade = 'A' | 'B' | 'C' | '-';
export type DemandMetric = 'turnover' | 'absorb' | 'burden' | 'clear';

/** a = A 경계, b = B 경계. higher = 클수록 좋다 */
export const DEMAND_GRADE_RULES: Record<DemandMetric, { a: number; b: number; higher: boolean }> = {
  turnover: { a: 3, b: 1.5, higher: true },   // 연간 회전율(%) — A 3%↑ · B 1.5%↑
  absorb: { a: 180, b: 120, higher: true },   // 연간 매물 소화율(%) — A 180%↑ · B 120%↑
  burden: { a: 3, b: 5, higher: false },      // 매물율(%) — A 3%↓ · B 5%↓
  clear: { a: 6, b: 12, higher: false },      // 매물 소화기간(개월) — A 6↓ · B 12↓
};

/** 값이 준비되지 않았으면 '-' */
export const demandGradeOf = (metric: DemandMetric, ready: boolean, value: number): DemandGrade => {
  if (!ready) return '-';
  const { a, b, higher } = DEMAND_GRADE_RULES[metric];
  if (higher) return value >= a ? 'A' : value >= b ? 'B' : 'C';
  return value <= a ? 'A' : value <= b ? 'B' : 'C';
};

/** 거래 회전율 합격선(연 %) — 아파트는 5%: 전국 아파트가 평범한 해 3~5%라 그 위면 '평균보다 잘 팔리는 단지'.
 *  8% 이상(300세대에 월 2건, 2020 활황기 전국 평균)은 매우 활발 — ⓘ 에 적는다(2026-11-10 사용자 결정).
 *  빌라 · 그 밖은 엑셀 기준 그대로(1.5%, 공식 통계 아님) */
export const APT_TURNOVER_LINE = 5;
export const APT_TURNOVER_HOT = 8;
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

/** 막대 뒤 합격선 글 — 아파트 회전율만 8% */
export const demandPassText = (m: DemandMetric, apt = false) => (m === 'turnover' ? `${turnoverLineOf(apt)}% 이상 적합` : DEMAND_PASS_TEXT[m]);

/** 종합 의견 — 매물율(5% 선) × 거래 회전율(1.5% 선, 아파트 8%) 네 칸. 등급 대신 한 줄(2026-11-10 사용자 시안 'Level 3 · 저매물 / 저거래').
 *  선은 DEMAND_PASS_TEXT 와 같은 합격선. 둘 중 하나라도 값이 없으면 null */
// '고거래'는 회전율과 매물 소화율이 둘 다 적합일 때만 — 회전율만 넘고 매물이 안 팔리면(소화율 미달) 활발하다고 하지 않는다(2026-11-10)
export const demandOpinionOf = (burden: number, turnover: number, ready: boolean, apt = false, absorb = Infinity): { level: number; title: string; text: string } | null => {
  if (!ready) return null;
  const lowListing = burden <= DEMAND_GRADE_RULES.burden.b;
  const highDeal = turnover >= turnoverLineOf(apt) && absorb >= DEMAND_GRADE_RULES.absorb.b;
  if (lowListing && highDeal) return { level: 1, title: '저매물 / 고거래', text: '매물은 적고 거래는 활발한 구간입니다.' };
  if (!lowListing && highDeal) return { level: 2, title: '고매물 / 고거래', text: '매물은 많지만 거래도 활발한 구간입니다.' };
  if (lowListing) return { level: 3, title: '저매물 / 저거래', text: '매물은 적지만 거래도 둔한 구간입니다.' };
  return { level: 4, title: '고매물 / 저거래', text: '매물은 쌓이고 거래도 둔한 구간입니다.' };
};

/** A·B 는 적합, C 는 부적합 */
export const demandFitText = (g: DemandGrade) => (g === '-' ? '' : g === 'A' || g === 'B' ? '적합' : '부적합');

/** 네 지표 말풍선 — 웹 수요분석 · 단지 수요분석. 기준 줄은 등급(A·B·C) 대신 합격선 한 줄(DEMAND_PASS_TEXT 와 같은 말, 2026-11-10). what = '연립·다세대' 같은 종류 이름 */
export const demandTip = (metric: DemandMetric, what: string, apt = false): Array<[string, string]> => ({
  turnover: [
    ['공식', '12개월 거래량 ÷ 총 세대수 × 100'],
    ['의미', `${what} 중 1년에 몇 %가 손바뀜되나`],
    ['기준', `${turnoverLineOf(apt)}% 이상 적합 · 미만 부적합`],
    ...(apt ? [['활발', `${APT_TURNOVER_HOT}% 이상이면 매우 활발(같은 평형 300세대에 월 2건)`] as [string, string]]
      : [['참고', `${DEMAND_GRADE_RULES.turnover.b}%는 업계에서 쓰는 기준(공식 통계 아님)`] as [string, string]]),
  ],
  absorb: [
    ['공식', '12개월 거래량 ÷ 총 매물수 × 100'],
    ['의미', '나와 있는 매물 중 한 해에 몇 %가 팔리나'],
    ['기준', '120% 이상 적합 · 미만 부적합'],
  ],
  burden: [
    ['공식', '총 매물수 ÷ 총 세대수 × 100'],
    ['의미', `${what} 중 몇 %가 매물로 나와 있나`],
    ['기준', '5% 이하 적합 · 초과 부적합'],
    ['위험', '5%가 넘으면 매물이 쌓였다'],
  ],
  clear: [
    ['공식', '총 매물수 ÷ 월평균 거래량'],
    ['의미', '총 누적 매물이 다 팔리는 데 걸리는 달 수'],
    ['기준', '12개월 이하 적합 · 초과 부적합'],
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
