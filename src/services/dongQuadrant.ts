// 지역분석 평당가 · 동 사분면 — 위 요약(평 단가) · 동별 표 · 사분면 · 읽는법이 한 셈을 쓴다.
// 화면마다 따로 세면 같은 화면에서 평균이 486만 / 484만으로 갈렸다(사분면만 직거래까지 넣었다).
// 규칙 — 건수는 총 거래건수와 같게 정상 + 직거래(계약해제 제외), 값(가격 · 평당가)은 정상거래만.
import type { DongTradeDetailRow } from './publicDataApi';

export const PYEONG_M2 = 3.305785;

type PriceRow = Pick<DongTradeDetailRow, 'priceWon' | 'areaM2' | 'kind'>;

/** 값을 셀 수 있는 거래 — 정상거래 중 금액 · 전용면적이 다 있는 것 */
const pricedNormal = (r: PriceRow) => r.kind === '정상거래' && r.priceWon > 0 && r.areaM2 > 0;

/** 거래 하나의 평당가(원/평) */
export const unitPriceOf = (r: Pick<DongTradeDetailRow, 'priceWon' | 'areaM2'>) => (
  r.priceWon > 0 && r.areaM2 > 0 ? (r.priceWon / r.areaM2) * PYEONG_M2 : 0
);

/** 평균 평당가(원/평) — 정상거래마다의 평당가를 평균. 없으면 0 */
export const avgUnitPriceOf = (rows: PriceRow[]) => {
  const list = rows.filter(pricedNormal);
  return list.length ? list.reduce((s, r) => s + unitPriceOf(r), 0) / list.length : 0;
};

/** 가운데 값 — 짝수면 가운데 둘의 평균(동별 표 중간가와 같다) */
export const medianOf = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (!n) return 0;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

/** 사분면 칸 — 1 활발 · 비쌈, 2 활발 · 저렴, 3 한산 · 비쌈, 4 한산 · 저렴 */
export type QuadDong = { name: string; n: number; unit: number; avg: number; med: number; q: number };
export type QuadModel = { dongs: QuadDong[]; guUnit: number; avgN: number };

/** 동 사분면의 동 · 평균선. 정상거래 값이 하나도 없는 동(직거래만 · 금액 없음)은 찍지 않는다 —
 *  동별 표에서 가격이 '—'인 동이 사분면에만 점으로 서던 것을 막는다 */
export const dongQuadrantModel = (rows: Array<PriceRow & { umdNm: string }>): QuadModel => {
  const counted = rows.filter((r) => r.umdNm && r.kind !== '계약해제');
  const nBy = new Map<string, number>();
  counted.forEach((r) => nBy.set(r.umdNm, (nBy.get(r.umdNm) ?? 0) + 1));
  const valBy = new Map<string, PriceRow[]>();
  counted.filter(pricedNormal).forEach((r) => valBy.set(r.umdNm, [...(valBy.get(r.umdNm) ?? []), r]));
  const guUnit = avgUnitPriceOf(counted);
  const dongs: QuadDong[] = [...valBy.entries()].map(([name, l]) => {
    const ps = l.map((r) => r.priceWon);
    return {
      name,
      n: nBy.get(name) ?? l.length,
      unit: avgUnitPriceOf(l),
      avg: ps.reduce((a, v) => a + v, 0) / ps.length,
      med: medianOf(ps),
      q: 0,
    };
  });
  const avgN = dongs.length ? dongs.reduce((s, d) => s + d.n, 0) / dongs.length : 0;
  dongs.forEach((d) => { d.q = d.n >= avgN ? (d.unit >= guUnit ? 1 : 2) : (d.unit >= guUnit ? 3 : 4); });
  return { dongs, guUnit, avgN };
};

/** 원 중심을 그림 칸 안으로 — 원이 축 글자 쪽으로 넘어가지 않게(위에 이름을 다는 작은 원은 그만큼 더 띄운다) */
export const clampCircle = (
  x: number, y: number, r: number,
  box: { l: number; r: number; t: number; b: number },
  labelAbove = 0,
) => ({
  x: Math.min(Math.max(x, box.l + r), Math.max(box.l + r, box.r - r)),
  y: Math.min(Math.max(y, box.t + r + labelAbove), Math.max(box.t + r + labelAbove, box.b - r)),
});
