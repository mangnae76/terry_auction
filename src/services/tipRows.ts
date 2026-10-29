// 웹 툴팁(InfoTip) 내용 — 앱 말풍선처럼 [이름표, 내용] 줄로. 같은 설명은 여기 한 곳에서 만든다.

/** [이름표, 내용] — 이름표는 공식 · 의미 · 기준 · 적정 · 제외 · 기간 … */
export type TipRow = [string, string];

const n = (v: number) => Math.round(v).toLocaleString('ko-KR');
const dot = (d: string) => d.replace(/-/g, '.');

/** 총 거래건수 — 랭킹지도 · 지역분석 · 수요분석이 같은 말풍선 */
export const dealCountTip = (o: { normal: number; direct: number; cancel: number; months: number; from?: string; to?: string }): TipRow[] => [
  ['공식', '정상거래 + 직거래 (계약해제 제외)'],
  ['건수', `정상 ${n(o.normal)}건 + 직거래 ${n(o.direct)}건 = ${n(o.normal + o.direct)}건`],
  ['제외', `계약해제 ${n(o.cancel)}건 — 없던 거래`],
  ['기간', o.from && o.to ? `${dot(o.from)} ~ ${dot(o.to)} (조회일 기준 ${o.months}개월)` : `조회일 기준 ${o.months}개월`],
  ['연 · 월', o.months === 12 ? '연 = 12개월 합 · 월 = 연 ÷ 12' : `연 = ${o.months}개월 합을 1년으로 환산 · 월 = 합 ÷ ${o.months}`],
];
