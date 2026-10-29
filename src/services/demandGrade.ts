// 매매수요 등급 — 앱 물건상세(손품+현장 › 매매수요)의 A·B·C 기준과 같다(엑셀 수식 그대로).
// 웹 수요분석 표도 이 한 곳을 쓴다. 기준을 바꾸면 여기만 고친다.

export type DemandGrade = 'A' | 'B' | 'C' | '-';
export type DemandMetric = 'turnover' | 'absorb' | 'burden' | 'clear';

/** a = A 경계, b = B 경계. higher = 클수록 좋다 */
export const DEMAND_GRADE_RULES: Record<DemandMetric, { a: number; b: number; higher: boolean }> = {
  turnover: { a: 3, b: 1.5, higher: true },   // 연간 회전율(%) — A 3%↑ · B 1.5%↑
  absorb: { a: 180, b: 120, higher: true },   // 연간 매물 소화율(%) — A 180%↑ · B 120%↑
  burden: { a: 3, b: 5, higher: false },      // 매물 부담율(%) — A 3%↓ · B 5%↓
  clear: { a: 6, b: 12, higher: false },      // 매물 소진기간(개월) — A 6↓ · B 12↓
};

/** 값이 준비되지 않았으면 '-' */
export const demandGradeOf = (metric: DemandMetric, ready: boolean, value: number): DemandGrade => {
  if (!ready) return '-';
  const { a, b, higher } = DEMAND_GRADE_RULES[metric];
  if (higher) return value >= a ? 'A' : value >= b ? 'B' : 'C';
  return value <= a ? 'A' : value <= b ? 'B' : 'C';
};

/** A·B 는 적합, C 는 부적합 */
export const demandFitText = (g: DemandGrade) => (g === '-' ? '' : g === 'A' || g === 'B' ? '적합' : '부적합');
