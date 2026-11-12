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
/** 매물율 합격선은 동 · 단지 모두 5%(5%까지 정상, 넘으면 문제). 대장 아파트 2~3%는 '좋은 거래' 참고값일 뿐 선이 아니다(2026-11-11 사용자) */
export const COMPLEX_BURDEN_LINE = DEMAND_GRADE_RULES.burden.b;
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
export const demandPassText = (m: DemandMetric, apt = false, complex = false) => (m === 'turnover' ? `${turnoverLineOf(apt)}% 이상 적합` : m === 'burden' && complex ? `${COMPLEX_BURDEN_LINE}% 이하 적합` : DEMAND_PASS_TEXT[m]);

/** 종합 의견 — 매물(소화기간 10개월 · 매물율 5% 선) × 거래(회전율 1.5% 선, 아파트 3%) 네 칸. 등급 대신 한 줄(2026-11-10 사용자 시안 'Level 3 · 저매물 / 저거래').
 *  (2026-11-12 바뀜) 매물 많고 적음은 매물율 하나로 본다 — 소화기간은 매물율 ÷ 회전율 × 12 라 따로 세지 않고 결론 끝에 참고로. 매물율이 없을 때만 소화기간으로.
 *  소화기간 = 1,200 ÷ 소화율 이라 소화율로 받는다(거래 0건이면 소화율 0 → 고매물). 선은 DEMAND_PASS_TEXT 와 같은 합격선. 값이 없으면 null */
// (예전 11-10: 매물율 · 소화기간 둘 중 하나만 넘어도 고매물 → 11-12 사용자가 매물율 하나로 바꿈)
export const demandOpinionOf = (absorb: number, turnover: number, ready: boolean, apt = false, burden = 0, burdenLine: number = DEMAND_GRADE_RULES.burden.b): { level: number; title: string; text: string } | null => {
  if (!ready) return null;
  const clearMonths = absorb > 0 ? 1200 / absorb : Infinity;
  const clearLine = DEMAND_GRADE_RULES.clear.b;
  const tLine = turnoverLineOf(apt);
  // 매물 많고 적음은 매물율 하나로 — 소화기간은 매물율 ÷ 회전율 × 12 라 같은 숫자를 두 번 세지 않게(2026-11-12 사용자, 11-10 '둘 중 하나만 넘어도 고매물'을 바꿈).
  // 매물율을 모르면(0) 예전처럼 소화기간으로
  const lowListing = burden > 0 ? burden <= burdenLine : clearMonths <= clearLine;
  const highDeal = turnover >= tLine;
  const over = burden > burdenLine * 2 || (!(burden > 0) && clearMonths > clearLine * 2);
  // 거래가 얼마나 활발한지 한 낱말 — 아파트 3~5% 다소 · 5~8% · 8%↑ 매우(ⓘ 단계와 같다), 빌라 1.5~3% 다소 · 3%↑
  const lively = apt
    ? (turnover >= APT_TURNOVER_HOT ? '매우 활발' : turnover >= 5 ? '활발' : '다소 활발')
    : (turnover >= DEMAND_GRADE_RULES.turnover.a ? '활발' : '다소 활발');
  // 문장은 숫자와 기준을 같이 — 무엇 때문에 그런 판단인지 바로 보이게(2026-11-12 사용자 '너무 단순하고 오해의 여지')
  const listTx = !(burden > 0) ? (lowListing ? '매물이 빠르게 소화되는 편입니다.' : '매물이 쌓여 소화가 느립니다.')
    : over ? `매물율 ${dec1(burden)}%로 기준 ${burdenLine}%의 ${dec1(burden / burdenLine)}배라 매물이 심하게 쌓여 있습니다.`
      : lowListing ? `매물율 ${dec1(burden)}%로 기준 ${burdenLine}% 이하라 매물은 적정합니다.`
        : `매물율 ${dec1(burden)}%로 기준 ${burdenLine}%를 넘어 매물이 많은 편입니다.`;
  const dealTx = highDeal ? `거래 회전율 ${dec1(turnover)}%로 기준 ${tLine}% 이상, 거래가 ${lively}합니다.`
    : `거래 회전율 ${dec1(turnover)}%로 기준 ${tLine}%에 못 미쳐 거래가 둔합니다.`;
  // 소화기간 — 단지 매물 전체가 다 팔리는 평균 시간일 뿐, 내 물건은 가격 · 상태로 더 빨리 팔 수 있다
  const clearTx = !Number.isFinite(clearMonths) ? '최근 1년 거래가 없어 매물이 언제 소화될지 가늠하기 어렵습니다.'
    : clearMonths > clearLine ? `다만 지금 거래 속도로는 매물이 다 팔리는 데 ${dec1(clearMonths)}개월이 걸립니다(기준 ${clearLine}개월). 가격이나 상태에서 경쟁력을 갖추면 그보다 빨리 팔 수 있습니다.`
      : `지금 거래 속도면 매물이 ${dec1(clearMonths)}개월 안에 소화됩니다(기준 ${clearLine}개월 이하).`;
  const join = (...a: string[]) => a.join(' ');
  if (lowListing && highDeal) return { level: 1, title: '저매물 / 고거래', text: join(listTx, dealTx, '매도자 우위 시장으로, 가격 상승 압력이 있습니다.', clearTx) };
  if (!lowListing && highDeal) return over
    ? { level: 2, title: '매물 과잉 / 고거래', text: join(listTx, dealTx, '쌓인 물량을 소화하기엔 부족해, 가격이 오르기 어렵고 조정 압력이 남아 있습니다.', clearTx) }
    : { level: 2, title: '고매물 / 고거래', text: join(listTx, dealTx, '수급이 맞서는 균형 구간으로, 가격은 보합 흐름이 예상됩니다.', clearTx) };
  if (lowListing) return { level: 3, title: '저매물 / 저거래', text: join(listTx, dealTx, '관망세가 짙은 구간으로, 가격이 정체되기 쉽습니다.', clearTx) };
  return over
    ? { level: 4, title: '매물 과잉 / 저거래', text: join(listTx, dealTx, '매수자 우위가 뚜렷해, 가격 하락 압력이 큽니다.', clearTx) }
    : { level: 4, title: '고매물 / 저거래', text: join(listTx, dealTx, '매수자 우위 시장으로, 가격 하락 압력이 있습니다.', clearTx) };
};

/** A·B 는 적합, C 는 부적합 */
export const demandFitText = (g: DemandGrade) => (g === '-' ? '' : g === 'A' || g === 'B' ? '적합' : '부적합');

/** 네 지표 말풍선 — 웹 수요분석 · 단지 수요분석. 기준 줄은 등급(A·B·C) 대신 합격선 한 줄(DEMAND_PASS_TEXT 와 같은 말, 2026-11-10). what = '연립·다세대' 같은 종류 이름 */
export const demandTip = (metric: DemandMetric, what: string, apt = false, complex = false): Array<[string, string]> => ({
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
    ...(complex ? [['참고', '대장 아파트는 세대수의 2~3%가 매물이면 좋은 거래 수준']] as Array<[string, string]> : []),
    ['위험', '5%가 넘으면 물건이 적체 — 잘 안 나간다는 뜻(종합 의견 고매물)'],
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
