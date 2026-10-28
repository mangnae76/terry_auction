// 낙찰이후 · 절차상세(웹) — 인테리어 · 매도 · 세금 장의 체크리스트 원본.
// 절차진행의 큰일이 이 상자를 가리켜 창으로 띄운다. 체크는 물건마다(auction.postWinChecks) 줄 id 로 남는다.
// 사용자가 고쳐 저장하는 표가 아니라 코드에 둔 기본 글이다.
import type { CheckGroup } from './postWinChecklist';

export const DETAIL_REPAIR: CheckGroup[] = [
  {
    key: 'ri.plan',
    title: '공사 범위 · 예산',
    note: '팔 값 · 세 놓을 값에 맞춰 범위를 정한다 — 넘치게 고치면 남는 게 없다',
    webOnly: true,
    sections: [
      {
        label: '현장',
        rows: [
          { id: 'ri.plan.s1', depth: 0, text: '집 전체 실측 · 사진 남기기' },
          { id: 'ri.plan.s2', depth: 0, text: '누수 · 결로 · 곰팡이 · 배관 · 전기 상태 확인' },
        ],
      },
      {
        label: '범위',
        rows: [
          { id: 'ri.plan.r1', depth: 0, text: '고칠 곳 정하기 — 도배 · 장판 · 욕실 · 주방 · 샷시 · 조명' },
          { id: 'ri.plan.r2', depth: 0, text: '예산 상한 정하기(매도가 · 임대가 기준)' },
        ],
      },
    ],
  },
  {
    key: 'ri.bid',
    title: '업체 비딩 · 계약',
    note: '같은 범위로 견적을 받아야 값을 견줄 수 있다',
    webOnly: true,
    sections: [
      {
        label: '견적',
        rows: [
          { id: 'ri.bid.q1', depth: 0, text: '업체 3곳 이상에서 같은 범위로 견적 받기' },
          { id: 'ri.bid.q2', depth: 0, text: '견적서 항목 · 자재 등급 · 기간 비교' },
        ],
      },
      {
        label: '계약',
        rows: [
          { id: 'ri.bid.c1', depth: 0, text: '계약서에 공정 · 기간 · 하자보수 기간 · 지급 조건 적기' },
          { id: 'ri.bid.c2', depth: 0, text: '선금은 적게, 잔금은 완료 검수 뒤', warn: true },
        ],
      },
    ],
  },
  {
    key: 'ri.work',
    title: '공사 진행 · 검수',
    webOnly: true,
    sections: [
      {
        label: '시작 전',
        rows: [
          { id: 'ri.work.b1', depth: 0, text: '관리사무소 공사 신고 · 승강기 보양' },
          { id: 'ri.work.b2', depth: 0, text: '이웃 세대에 공사 안내문 붙이기' },
        ],
      },
      {
        label: '진행 · 완료',
        rows: [
          { id: 'ri.work.p1', depth: 0, text: '중간 점검 — 철거 뒤 · 마감 전' },
          { id: 'ri.work.p2', depth: 0, text: '완료 검수 — 하자 목록 만들어 보수 요청' },
          { id: 'ri.work.p3', depth: 0, text: '완공 사진 남기기(매물 사진으로도 쓴다)' },
        ],
      },
    ],
  },
  {
    key: 'ri.cost',
    title: '비용 정리',
    note: '증빙이 있어야 매매차익에서 비용으로 뺄 수 있다',
    webOnly: true,
    sections: [
      {
        label: '증빙',
        rows: [
          { id: 'ri.cost.e1', depth: 0, text: '사업용 계좌 · 카드로 지급' },
          { id: 'ri.cost.e2', depth: 0, text: '세금계산서 · 현금영수증 받기' },
        ],
      },
      {
        label: '기록',
        rows: [
          { id: 'ri.cost.r1', depth: 0, text: '인테리어 표에 업체 · 금액 · 날짜 적기' },
          { id: 'ri.cost.r2', depth: 0, text: '자금관리에 지출 적기' },
        ],
      },
    ],
  },
];

export const DETAIL_SELL: CheckGroup[] = [
  {
    key: 'se.price',
    title: '시세 · 가격 정하기',
    webOnly: true,
    sections: [
      {
        label: '시세',
        rows: [
          { id: 'se.price.m1', depth: 0, text: '같은 단지 · 같은 평형 실거래가 확인' },
          { id: 'se.price.m2', depth: 0, text: '지금 나와 있는 매물 호가 · 개수 확인' },
        ],
      },
      {
        label: '가격',
        rows: [
          { id: 'se.price.p1', depth: 0, text: '내놓을 값과 최저선 정하기(세금 · 비용 뺀 남는 돈 기준)' },
        ],
      },
    ],
  },
  {
    key: 'se.list',
    title: '매물 내놓기',
    webOnly: true,
    sections: [
      {
        label: '준비',
        rows: [
          { id: 'se.list.r1', depth: 0, text: '집 사진 · 설명 · 수리 내역 정리' },
          { id: 'se.list.r2', depth: 0, text: '보여 줄 수 있는 시간 · 비밀번호 정하기' },
        ],
      },
      {
        label: '의뢰',
        rows: [
          { id: 'se.list.a1', depth: 0, text: '중개업소 여러 곳에 의뢰' },
          { id: 'se.list.a2', depth: 0, text: '매도·임대 탭 의뢰 현황에 기록' },
          { id: 'se.list.a3', depth: 0, text: '문의 · 방문 반응 보고 값 조정' },
        ],
      },
    ],
  },
  {
    key: 'se.deal',
    title: '계약',
    webOnly: true,
    sections: [
      {
        label: '계약서',
        rows: [
          { id: 'se.deal.c1', depth: 0, text: '특약 확인 — 하자 · 인도일 · 잔금일' },
          { id: 'se.deal.c2', depth: 0, text: '계약금 받기(사업용 계좌)' },
          { id: 'se.deal.c3', depth: 0, text: '중도금 · 잔금 날짜 적어 두기' },
        ],
      },
      {
        label: '임대일 때',
        rows: [
          { id: 'se.deal.l1', depth: 0, text: '대상이면 계약 30일 안에 임대차 신고(보증금 6천만 원 초과 · 월세 30만 원 초과)' },
        ],
      },
    ],
  },
  {
    key: 'se.close',
    title: '잔금 · 집 넘기기',
    webOnly: true,
    sections: [
      {
        label: '잔금',
        rows: [
          { id: 'se.close.p1', depth: 0, text: '잔금 받은 것 확인(사업용 계좌)' },
          { id: 'se.close.p2', depth: 0, text: '대출 상환 · 근저당 말소' },
          { id: 'se.close.p3', depth: 0, text: '소유권 이전 서류 넘기기' },
        ],
      },
      {
        label: '정산',
        rows: [
          { id: 'se.close.s1', depth: 0, text: '관리비 · 공과금 정산, 열쇠 넘기기' },
          { id: 'se.close.s2', depth: 0, text: '자금관리에 매도 금액 · 비용 적기' },
        ],
      },
    ],
  },
];

export const DETAIL_TAX: CheckGroup[] = [
  {
    key: 'tx.acq',
    title: '취득 때',
    webOnly: true,
    sections: [
      {
        label: '취득세',
        rows: [
          { id: 'tx.acq.t1', depth: 0, text: '잔금 낸 날부터 60일 안에 취득세 신고 · 납부' },
          { id: 'tx.acq.t2', depth: 0, text: '영수증 보관 — 매매차익 계산 때 비용으로 넣는다' },
        ],
      },
    ],
  },
  {
    key: 'tx.pre',
    title: '매매차익 예정신고',
    note: '매매사업자는 팔 때마다 신고한다 — 잔금 달 말일부터 2개월 안',
    webOnly: true,
    sections: [
      {
        label: '준비',
        rows: [
          { id: 'tx.pre.p1', depth: 0, text: '취득가 · 취득세 · 수리비 · 중개수수료 등 증빙 모으기' },
          { id: 'tx.pre.p2', depth: 0, text: '비교과세 대상인지 확인(조정대상지역 주택 등)', warn: true },
        ],
      },
      {
        label: '신고',
        rows: [
          { id: 'tx.pre.f1', depth: 0, text: '홈택스 매매차익 예정신고 · 납부' },
          { id: 'tx.pre.f2', depth: 0, text: '지방소득세 함께 신고 · 납부' },
        ],
      },
    ],
  },
  {
    key: 'tx.vat',
    title: '부가가치세',
    note: '전용 85㎡ 넘는 주택 · 상가를 팔면 건물 값에 부가세가 붙는다',
    webOnly: true,
    sections: [
      {
        label: '해당 시',
        rows: [
          { id: 'tx.vat.v1', depth: 0, text: '매도 값을 토지 · 건물로 나누어 계약서에 적기' },
          { id: 'tx.vat.v2', depth: 0, text: '세금계산서 발급 · 부가세 신고(1월 · 7월)' },
        ],
      },
    ],
  },
  {
    key: 'tx.final',
    title: '종합소득세 확정신고',
    note: '이듬해 5월 — 한 해 매매를 모두 합쳐 신고하고, 예정신고 때 낸 세금은 뺀다',
    webOnly: true,
    sections: [
      {
        label: '준비',
        rows: [
          { id: 'tx.fin.p1', depth: 0, text: '한 해 매도 건 · 예정신고 내역 모으기' },
          { id: 'tx.fin.p2', depth: 0, text: '장부 정리(간편장부 · 복식부기 대상 확인)' },
        ],
      },
      {
        label: '신고',
        rows: [
          { id: 'tx.fin.f1', depth: 0, text: '홈택스 종합소득세 신고 · 납부(5월 31일까지)' },
          { id: 'tx.fin.f2', depth: 0, text: '지방소득세 함께 신고 · 납부' },
        ],
      },
    ],
  },
];
