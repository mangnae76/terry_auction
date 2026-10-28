// 낙찰이후 · 명도비용 · 세금분석(웹)의 셈 — 화면과 떼어 둔다.
// 세금은 입찰가산정과 같은 셈(profitMath)을 쓴다 — 두 화면의 숫자가 어긋나지 않게.

import { taxChainOf } from './profitMath';

/** 명도비용 입력 — 기본값은 대략의 시세, 화면에서 고친다 */
export interface EvictInput {
  /** 대출금 · 연 금리(%) — 늦어지는 달마다 이자가 나간다 */
  loan: number;
  ratePct: number;
  /** 한 달 관리비 · 공과금 */
  monthlyFee: number;
  /** 전용 평수 — 강제집행 노무비를 평으로 셈한다 */
  pyeong: number;
  // 협의로 끝날 때
  moveMoney: number;      // 이사비
  noticeCost: number;     // 내용증명 등 우편
  orderCost: number;      // 인도명령 인지 · 송달료
  dealMonths: number;     // 잔금 뒤 명도까지 걸리는 달
  // 강제집행까지 갈 때
  serveExtra: number;     // 특별송달 · 공시송달 등
  execBase: number;       // 집행 접수 · 계고 예납
  laborPerPyeong: number; // 노무비(평당)
  truck: number;          // 사다리차 · 운반
  storagePerMonth: number;// 짐 보관료(한 달)
  storageMonths: number;  // 보관 달
  execMonths: number;     // 잔금 뒤 명도까지 걸리는 달
}

export const EVICT_DEFAULT: EvictInput = {
  loan: 0,
  ratePct: 5,
  monthlyFee: 200_000,
  pyeong: 25,
  moveMoney: 2_000_000,
  noticeCost: 10_000,
  orderCost: 50_000,
  dealMonths: 1,
  serveExtra: 50_000,
  execBase: 200_000,
  laborPerPyeong: 100_000,
  truck: 300_000,
  storagePerMonth: 400_000,
  storageMonths: 3,
  execMonths: 4,
};

export interface CostLine { label: string; amount: number }

/** 늦어지는 달마다 나가는 돈(이자 + 관리비) */
export const monthlyCarry = (i: EvictInput) => Math.round((i.loan * i.ratePct) / 100 / 12) + i.monthlyFee;

/** 협의로 끝날 때 */
export const dealCost = (i: EvictInput): { lines: CostLine[]; total: number } => {
  const lines: CostLine[] = [
    { label: '이사비', amount: i.moveMoney },
    { label: '내용증명 · 우편', amount: i.noticeCost },
    { label: '인도명령 신청(인지 · 송달료)', amount: i.orderCost },
    { label: `늦어지는 ${i.dealMonths}개월 이자 · 관리비`, amount: monthlyCarry(i) * i.dealMonths },
  ];
  return { lines, total: lines.reduce((a, b) => a + b.amount, 0) };
};

/** 강제집행까지 갈 때 — 이사비는 주지 않는다 */
export const execCost = (i: EvictInput): { lines: CostLine[]; total: number } => {
  const lines: CostLine[] = [
    { label: '내용증명 · 우편', amount: i.noticeCost * 2 },
    { label: '인도명령 신청(인지 · 송달료)', amount: i.orderCost },
    { label: '특별송달 · 공시송달', amount: i.serveExtra },
    { label: '집행 접수 · 계고 예납', amount: i.execBase },
    { label: `노무비(${i.pyeong}평 × 평당)`, amount: i.laborPerPyeong * i.pyeong },
    { label: '사다리차 · 운반', amount: i.truck },
    { label: `짐 보관료(${i.storageMonths}개월)`, amount: i.storagePerMonth * i.storageMonths },
    { label: `늦어지는 ${i.execMonths}개월 이자 · 관리비`, amount: monthlyCarry(i) * i.execMonths },
  ];
  return { lines, total: lines.reduce((a, b) => a + b.amount, 0) };
};

/** 세금분석 입력 */
export interface TaxInput {
  bid: number;        // 낙찰가
  sale: number;       // 예상 매도가
  costs: CostLine[];  // 필요경비(취득세 · 법무비 · 이자 · 중개 · 수리 · 명도 …)
}

/** 매매차익 → 사업소득세 · 지방소득세 · 세후 이익 */
export const taxOf = (t: TaxInput) => {
  const costTotal = t.costs.reduce((a, b) => a + (b.amount || 0), 0);
  const gain = t.sale - t.bid - costTotal;
  const chain = taxChainOf(Math.max(0, gain));
  return { costTotal, gain, ...chain, afterTax: gain - chain.incomeTax - chain.localTax };
};

/** 개인(매매사업자 아님) 양도소득세 — 주택 단기 세율(1년 미만 70% · 2년 미만 60%), 2년 이상은 기본세율.
 *  기본공제 250만 원. 장기보유특별공제 · 비과세 · 중과는 셈하지 않는다(대략 보기) */
export type HoldTerm = 'lt1' | 'lt2' | 'ge2';
export const transferTaxOf = (gain: number, term: HoldTerm) => {
  const base = Math.max(0, gain - 2_500_000);
  let incomeTax: number; let ratePct: number;
  if (term === 'lt1') { ratePct = 70; incomeTax = base * 0.7; }
  else if (term === 'lt2') { ratePct = 60; incomeTax = base * 0.6; }
  else { const c = taxChainOf(base); ratePct = c.ratePct; incomeTax = c.incomeTax; }
  const localTax = incomeTax / 10;
  return { base, ratePct, incomeTax, localTax, afterTax: gain - incomeTax - localTax };
};
