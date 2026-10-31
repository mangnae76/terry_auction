// 확정한 입찰안 — 수익분석 A~D안 중 실제로 입찰할 안 하나.
// 0(또는 없음) = A안(물건의 기본 값). 1~3 = bidScenarios[0~2](B~D안).
// 입찰가 · 매도가 · 비용을 가져다 쓰는 화면(웹)은 withConfirmedPlan 으로 바꿔 끼운 물건을 읽는다.
import type { AuctionDetail } from '../types/auction';

type PlanLike = Pick<AuctionDetail, 'bidScenarios'> & { confirmedPlan?: number };

/** 확정한 안 번호 — 지워졌거나 없으면 0(A안) */
export const confirmedPlanOf = (a: PlanLike | null | undefined): number => {
  const i = a?.confirmedPlan ?? 0;
  return i > 0 && a?.bidScenarios?.[i - 1] ? i : 0;
};

/** 확정한 안의 입찰가 · 매도가 · 비용으로 바꿔 끼운 물건(A안이면 그대로) — 원본은 건드리지 않는다 */
export function withConfirmedPlan<T extends Partial<AuctionDetail>>(a: T): T;
export function withConfirmedPlan<T extends Partial<AuctionDetail>>(a: T | null | undefined): T | null | undefined;
export function withConfirmedPlan<T extends Partial<AuctionDetail>>(a: T | null | undefined) {
  if (!a) return a;
  const i = confirmedPlanOf(a as PlanLike);
  if (!i) return a;
  const sc = a.bidScenarios![i - 1];
  return {
    ...a,
    metrics: { ...(a.metrics as AuctionDetail['metrics']), myBidValue: sc.myBidValue },
    expectedSaleValue: sc.expectedSaleValue,
    expectedSaleValue2: sc.expectedSaleValue2,
    bidCost: sc.bidCost,
  };
}
