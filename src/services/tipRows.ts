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
  ['연월', o.months === 12 ? '연 = 12개월 합 · 월 = 연 ÷ 12' : `연 = ${o.months}개월 합을 1년으로 환산 · 월 = 합 ÷ ${o.months}`],
];

/** 실거래가 조사(가격정보 · 시장분석 경매지번) — 공시 줄 네 칸 말풍선 */
export const jeonseRateTip = (rate: number): TipRow[] => [
  ['공식', `공동주택가 × ${rate}%`],
  ['의미', '허그 보증 126% 전세가 추정치'],
  ['수정', '퍼센트 칸에 적어 비율을 고칠 수 있음'],
];
export const PUB_RATIO_TIP: TipRow[] = [
  ['공식', '매매 실거래가 ÷ 공동주택가 × 100'],
  ['의미', '공시가격 대비 실거래가 수준'],
];
export const JEONSE_RATIO_TIP: TipRow[] = [
  ['공식', '전세가 ÷ 매매 실거래가 × 100'],
  ['갭', '매매 실거래가 − 전세가'],
  ['의미', '매매가에서 전세보증금이 차지하는 몫'],
  ['높으면', '적은 돈으로 사지만 역전세·깡통 위험이 커진다'],
];
export const pubPriceTip = (o: { year?: string; unit?: string }): TipRow[] => {
  if (!o.year) return [['조회', '결과 없음']];
  const rows: TipRow[] = [
    ['출처', '국토교통부 공시가격 API · 실시간'],
    ['기준', `${o.year}-01-01 · 연 1회 공시`],
  ];
  if (o.unit) rows.push(['대상', o.unit]);
  return rows;
};
