// 포인트 제도 — 등급·적립률과 안내 글을 여기 한곳에 둔다.
// 화면(PointsPage)은 이 글을 그대로 그린다.

export interface PointGrade {
  key: string;
  name: string;
  /** 머리글 아래 한 줄 */
  lead: string[];
  /** 구간별 적립률 — 등급 안에서 결제 누계에 따라 갈린다 */
  rows: Array<{ range: string; rate: string }>;
  /** 배지 색 */
  tone: 'welcome' | 'silver' | 'gold' | 'family';
}

/** 총 결제금액 합산 기준 — 등급에 따른 포인트 혜택 */
export const POINT_GRADES: PointGrade[] = [
  {
    key: 'welcome',
    name: 'WELCOME',
    tone: 'welcome',
    lead: ['회원가입 시', '포인트 적립 1,000P'],
    rows: [{ range: '회원가입', rate: '1,000P' }],
  },
  {
    key: 'silver',
    name: 'SILVER',
    tone: 'silver',
    lead: ['결제금액의', '포인트 적립률 4%~6%'],
    rows: [
      { range: '~ 50만원 미만', rate: '4%' },
      { range: '50만원 ~ 100만원 미만', rate: '5%' },
      { range: '100만원 ~ 200만원 미만', rate: '6%' },
    ],
  },
  {
    key: 'gold',
    name: 'GOLD',
    tone: 'gold',
    lead: ['결제금액의', '포인트 적립률 7%~8%'],
    rows: [
      { range: '200만원 ~ 300만원 미만', rate: '7%' },
      { range: '300만원 ~ 400만원 미만', rate: '8%' },
    ],
  },
  {
    key: 'family',
    name: 'FAMILY',
    tone: 'family',
    lead: ['결제금액의', '포인트 적립률 9%~10%'],
    rows: [
      { range: '400만원 ~ 500만원 미만', rate: '9%' },
      { range: '500만원 ~', rate: '10%' },
    ],
  },
];

export const POINT_NOTES: string[] = [
  '포인트를 포함한 결제 금액이 아니라 실제 결제한 금액으로 누적됩니다.',
  '포인트 적립 최대 결제금액은 50만원으로 제한합니다 (50만원 이상 결제 시 50만원 기준으로 적립).',
];

export const POINT_EXCLUDES: string[] = [
  '무료 이용권·쿠폰 사용으로 실 결제 금액이 없는 경우',
  '제휴사 기간연장 및 할인 적용 시 포인트 제외',
  '포인트로 결제한 금액에 대해서는 포인트 제외',
];

/** 두 번째 탭 — 포인트를 어떻게 쌓고 쓰는지 */
export interface PointGuide {
  title: string;
  lines: string[];
}

export const POINT_GUIDES: PointGuide[] = [
  {
    title: '포인트란',
    lines: [
      '마이턴 옥션에서 이용요금을 결제할 때 현금처럼 쓸 수 있는 적립금입니다.',
      '1포인트는 1원으로 셈합니다.',
    ],
  },
  {
    title: '쌓는 방법',
    lines: [
      '회원가입을 하면 축하 포인트 1,000P를 바로 드립니다.',
      '이용요금을 결제하면 등급별 적립률만큼 쌓입니다.',
      '적립은 결제가 끝난 뒤 바로 반영됩니다.',
    ],
  },
  {
    title: '쓰는 방법',
    lines: [
      '더보기 › 결제하기에서 이용 기간을 고른 뒤 쓸 포인트를 적으면 결제 금액에서 빠집니다.',
      '1,000P부터 쓸 수 있고, 가진 만큼 전액 사용도 됩니다.',
      '결제 금액보다 많은 포인트는 쓸 수 없습니다.',
    ],
  },
  {
    title: '사라지는 때',
    lines: [
      '쌓은 날로부터 2년이 지나면 사라집니다.',
      '회원 탈퇴 시 남은 포인트는 모두 사라지며 되살릴 수 없습니다.',
      '포인트는 현금으로 바꿔 드리지 않습니다.',
    ],
  },
];
