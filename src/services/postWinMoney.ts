// 낙찰이후 · 명도비용 · 세금분석(웹)의 셈 — 화면과 떼어 둔다.
// 세금은 입찰가산정과 같은 셈(profitMath)을 쓴다 — 두 화면의 숫자가 어긋나지 않게.

import { taxChainOf } from './profitMath';

/** 명도비용 입력 — 기본값은 아래 근거(EVICT_BASIS)의 시세, 화면에서 고친다 */
export interface EvictInput {
  /** 대출금 · 연 금리(%) — 늦어지는 달마다 이자가 나간다 */
  loan: number;
  ratePct: number;
  /** 한 달 관리비 · 공과금 */
  monthlyFee: number;
  /** 전용 평수 — 이사비 · 노무 인원을 평으로 셈한다 */
  pyeong: number;
  // 협의로 끝날 때
  movePerPyeong: number;  // 이사비(평당) — 포장이사 시세
  noticeCost: number;     // 내용증명 등 우편
  orderCost: number;      // 인도명령 인지 · 송달료
  dealMonths: number;     // 잔금 뒤 명도까지 걸리는 달
  // 강제집행까지 갈 때
  serveExtra: number;     // 특별송달 · 공시송달 등
  execBase: number;       // 집행 접수 · 계고 예납
  laborDaily: number;     // 노무자 1명 일당
  locksmith: number;      // 열쇠공(개문)
  truck: number;          // 운반(트럭)
  ladder: number;         // 사다리차
  storagePerMonth: number;// 짐 보관료(한 달)
  storageMonths: number;  // 보관 달
  execMonths: number;     // 잔금 뒤 명도까지 걸리는 달
}

export const EVICT_DEFAULT: EvictInput = {
  loan: 0,
  ratePct: 5,
  monthlyFee: 200_000,
  pyeong: 25,
  movePerPyeong: 45_000,
  noticeCost: 10_000,
  orderCost: 50_000,
  dealMonths: 1,
  serveExtra: 50_000,
  execBase: 300_000,
  laborDaily: 120_000,
  locksmith: 100_000,
  truck: 500_000,
  ladder: 200_000,
  storagePerMonth: 200_000,
  storageMonths: 3,
  execMonths: 4,
};

/** 기본값의 근거 — 화면 '셈에 쓴 값' 아래에 그대로 보인다 (2026-10 웹 자료 기준, 지역 · 짐 양에 따라 다르다) */
export const EVICT_BASIS: string[] = [
  '이사비 — 포장이사 시세(20평대 85~100만원 · 30평대 100~130만원)를 평당 약 4.5만원으로 잡았다. 주거용 이사비 합의는 100만원 안팎이 흔하고, 강제집행 예상비를 넘기지 않는다',
  '노무비 — 노무자 1명 일당 약 12만원 × 인원. 인원은 평수 ÷ 3(최소 4명) — 33평(84㎡) 아파트에 10~12명',
  '집행 접수 · 계고 예납 — 계고(집행관 출장) 약 20만원 + 접수 · 수수료',
  '운반 — 1톤 15만원 · 5톤 50만원(짐이 많으면 5톤) · 짐 보관 — 컨테이너 월 10~30만원',
  '열쇠공(개문) 10만원 이상 · 사다리차 6층 16만원 · 20층 28만원',
];

export interface CostLine { label: string; amount: number }

/** 늦어지는 달마다 나가는 돈(이자 + 관리비) */
export const monthlyCarry = (i: EvictInput) => Math.round((i.loan * i.ratePct) / 100 / 12) + i.monthlyFee;
/** 강제집행 노무 인원 — 평수 ÷ 3, 최소 4명 */
export const crewOf = (i: EvictInput) => Math.max(4, Math.ceil(i.pyeong / 3));
const won = (n: number) => n.toLocaleString('ko-KR');

/** 강제집행까지 갈 때 — 이사비는 주지 않는다 */
export const execCost = (i: EvictInput): { lines: CostLine[]; total: number; direct: number } => {
  const crew = crewOf(i);
  const direct: CostLine[] = [
    { label: '집행 접수 · 계고 예납', amount: i.execBase },
    { label: `노무비(${crew}명 × 일당 ${won(i.laborDaily)}원)`, amount: i.laborDaily * crew },
    { label: '열쇠공(개문)', amount: i.locksmith },
    { label: '운반(트럭)', amount: i.truck },
    { label: '사다리차', amount: i.ladder },
    { label: `짐 보관료(${i.storageMonths}개월 × ${won(i.storagePerMonth)}원)`, amount: i.storagePerMonth * i.storageMonths },
  ];
  const lines: CostLine[] = [
    { label: '내용증명 · 우편', amount: i.noticeCost * 2 },
    { label: '인도명령 신청(인지 · 송달료)', amount: i.orderCost },
    { label: '특별송달 · 공시송달', amount: i.serveExtra },
    ...direct,
    { label: `늦어지는 ${i.execMonths}개월 이자 · 관리비`, amount: monthlyCarry(i) * i.execMonths },
  ];
  return { lines, total: lines.reduce((a, b) => a + b.amount, 0), direct: direct.reduce((a, b) => a + b.amount, 0) };
};

/** 이사비 — 평당 × 평수, 강제집행 직접비를 넘지 않게 */
export const moveMoneyOf = (i: EvictInput) => Math.min(i.movePerPyeong * i.pyeong, execCost(i).direct);

/** 협의로 끝날 때 */
export const dealCost = (i: EvictInput): { lines: CostLine[]; total: number } => {
  const lines: CostLine[] = [
    { label: `이사비(${i.pyeong}평 × 평당 ${won(i.movePerPyeong)}원)`, amount: moveMoneyOf(i) },
    { label: '내용증명 · 우편', amount: i.noticeCost },
    { label: '인도명령 신청(인지 · 송달료)', amount: i.orderCost },
    { label: `늦어지는 ${i.dealMonths}개월 이자 · 관리비`, amount: monthlyCarry(i) * i.dealMonths },
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

/** 입찰가산정 A안에서 세금분석이 쓰는 값 — 낙찰가 · 매도가 · 취득세 · 그 밖의 필요경비(명도비 뺌).
 *  명도비는 명도분석 값으로 바꿔 넣으므로 여기서 뺀다. */
export interface PlanSource {
  metrics?: { myBidValue?: number; minimumBidValue?: number };
  expectedSaleValue?: number;
  bidCost?: Partial<{
    acquisitionTaxAmount: number; acquisitionTaxRate: number; legalCostAmount: number; interestAmount: number;
    midRepaymentAmount: number; brokerageAmount: number; arrearsFee: number; repairCost: number; advertisingCost: number;
  }>;
}
export const planOf = (a: PlanSource | null | undefined) => {
  const c = a?.bidCost ?? {};
  const bid = a?.metrics?.myBidValue || a?.metrics?.minimumBidValue || 0;
  const acq = c.acquisitionTaxAmount || Math.round(bid * 0.011);
  const acqPct = c.acquisitionTaxRate || (bid ? Math.round((acq / bid) * 1000) / 10 : 1.1);
  const interest = (c.interestAmount || 0) + (c.midRepaymentAmount || 0);
  const others = (c.legalCostAmount || 0) + interest + (c.brokerageAmount || 0)
    + (c.arrearsFee || 0) + (c.repairCost || 0) + (c.advertisingCost || 0);
  return { bid, sale: a?.expectedSaleValue || 0, acq, acqPct, others, interest };
};

/** 건물분 부가세 — 매매사업자가 전용 85㎡ 넘는 주택이나 주택 아닌 건물(상가 · 오피스텔 등)을 팔 때 */
export const vatOf = (propertyType: string, areaM2: number) => {
  const housing = /아파트|다세대|연립|빌라|단독|다가구|주택/.test(propertyType || '');
  if (!housing) return { taxable: true, why: `${propertyType || '주택 아닌 건물'} — 건물분 부가세 10%` };
  if (areaM2 > 85) return { taxable: true, why: `전용 ${Math.round(areaM2 * 10) / 10}㎡ 주택(85㎡ 초과) — 건물분 부가세 10%` };
  return { taxable: false, why: `전용 ${areaM2 ? `${Math.round(areaM2 * 10) / 10}㎡` : '85㎡ 이하'} 국민주택 규모 — 면세` };
};

/** 종합소득세 — 올해 다른 매매차익에 이 물건 차익을 더한 과세표준으로 셈하고, 이 물건 몫(늘어난 만큼)만 돌려준다 */
export const bizIncomeTaxOf = (gain: number, otherGain: number) => {
  const before = taxChainOf(Math.max(0, otherGain));
  const total = Math.max(0, otherGain + gain);
  const after = taxChainOf(total);
  const incomeTax = Math.max(0, after.incomeTax - before.incomeTax);
  const localTax = Math.max(0, after.localTax - before.localTax);
  return { base: total, ratePct: after.ratePct, incomeTax, localTax, afterTax: gain - incomeTax - localTax };
};
