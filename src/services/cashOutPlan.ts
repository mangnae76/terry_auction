// 돈이 나가는 순서 — 예상수익분석의 값을 '언제 얼마가 필요한가' 로 다시 세운다.
//
// 표에는 비용이 종류별로 적혀 있지만, 실제로 준비해야 하는 것은 '입찰 당일 · 잔금일 ·
// 명도수리' 세 번에 나가는 돈이다. 새로 입력받는 값은 없다 — 표의 값을 다시 묶을 뿐이다.

export interface CashRow {
  label: string;
  amount: number;
}

export interface CashStep {
  /** 1 · 2 · 3 */
  no: number;
  /** 언제 — '입찰 당일' */
  when: string;
  /** 무엇 — '입찰보증금' */
  what: string;
  /** 그날 나가는 돈 */
  amount: number;
  rows: CashRow[];
  /** 덧붙이는 한 줄 */
  note?: string;
}

export interface CashOutPlan {
  steps: CashStep[];
  /** 내 돈으로 먼저 치러야 하는 합계 */
  total: number;
  /** 그 다음에 나가는 돈 — 들고 있는 동안과 팔 때 */
  later: CashRow[];
}

export interface CashOutInput {
  /** 입찰가(낙찰가) */
  bid: number;
  /** 최저매각가격 — 보증금을 셈할 바탕 */
  minPrice: number;
  /** 적어 둔 보증금. 없으면 최저가의 10% */
  deposit?: number;
  loan: number;
  acquisitionTax: number;
  legalCost: number;
  eviction: number;
  repair: number;
  arrears: number;
  advertising: number;
  interest3m: number;
  midRepayment: number;
  brokerage: number;
  salePrice: number;
  incomeTax: number;
  localTax: number;
  /** 잔금 기한 — 알면 '잔금 납부일 (26.11.30)' 로 적어 준다 */
  balanceDue?: string;
}

/** 입찰보증금 — 적어 둔 값이 먼저, 없으면 최저매각가격의 10% */
export const depositOf = (minPrice: number, deposit?: number): number =>
  deposit && deposit > 0 ? deposit : Math.round(minPrice * 0.1);

const pct = (part: number, whole: number) =>
  whole > 0 ? `${(Math.round((part / whole) * 1000) / 10).toLocaleString('ko-KR')}%` : '';

export const buildCashOutPlan = (v: CashOutInput): CashOutPlan => {
  const deposit = depositOf(v.minPrice, v.deposit);
  // 잔금 = 낙찰가에서 이미 낸 보증금과 빌린 돈을 뺀 나머지
  const balance = Math.max(0, v.bid - deposit - v.loan);
  const acquire = v.acquisitionTax + v.legalCost;
  const fixUp = v.eviction + v.repair + v.arrears + v.advertising;

  const steps: CashStep[] = [
    {
      no: 1,
      when: '입찰 당일',
      what: `입찰보증금 (최저매각가격의 ${pct(deposit, v.minPrice) || '10%'})`,
      amount: deposit,
      rows: [],
      note: '낙찰되지 않으면 그날 돌려받습니다.',
    },
    {
      no: 2,
      when: v.balanceDue ? `잔금 납부일 (${v.balanceDue})` : '잔금 납부일',
      what: '잔금과 취득 비용',
      amount: balance + acquire,
      rows: [
        { label: '잔금 (낙찰가 − 보증금 − 대출)', amount: balance },
        { label: `취득세·교육세·법무비 (입찰가의 ${pct(acquire, v.bid) || '0%'})`, amount: acquire },
      ],
    },
    {
      no: 3,
      when: '명도·수리',
      what: '집을 넘겨받고 고치는 비용',
      amount: fixUp,
      rows: [
        { label: '명도비', amount: v.eviction },
        { label: '수리비', amount: v.repair },
        { label: '체납관리비·기타', amount: v.arrears + v.advertising },
      ],
    },
  ];

  const later: CashRow[] = [
    { label: '보유 중 대출이자 (3개월)', amount: v.interest3m },
    { label: '대출 중도상환수수료', amount: v.midRepayment },
    { label: `팔 때 중개수수료 (매도가의 ${pct(v.brokerage, v.salePrice) || '0%'})`, amount: v.brokerage },
    { label: '종합소득세 (개인사업자)', amount: v.incomeTax },
    { label: '지방소득세', amount: v.localTax },
  ].filter((r) => r.amount > 0);

  return {
    steps,
    total: steps.reduce((sum, s) => sum + s.amount, 0),
    later,
  };
};
