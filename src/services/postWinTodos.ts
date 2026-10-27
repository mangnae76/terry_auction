// 절차진행(웹) — 단계마다 '해야 할 큰일'. 세부 체크는 절차상세(낙찰당일 · 명도 · 잔금·등기)의 상자에 있고,
// 여기서는 그 상자를 가리키기만 한다(체크는 한 곳에만 남는다). 진행도는 가리킨 상자의 체크로 센다.

/** 낙찰이후 하위 탭 열쇠 — 절차상세 장(win · evict · balance), 가이드 장(gevict · biz), 그 밖(repair · sell) */
export type PostWinTabKey = 'flow' | 'win' | 'evict' | 'balance' | 'gwin' | 'gevict' | 'biz' | 'repair' | 'sell';

export interface StepTodo {
  text: string;
  /** '만나면' · '못 만나면'처럼 둘 중 하나만 하는 일에 붙이는 작은 말 */
  when?: string;
  /** 바로가기로 열 탭(장) */
  tab?: PostWinTabKey;
  /** 다른 메뉴로 갈 때(자금관리 · 세금신고 등) — 앱 경로와 탭 */
  page?: { path: string; tab?: string };
  /** 그 탭의 상자(CheckGroup.key) */
  group?: string;
  /** 상자 안 이름 칸만 셀 때(공백 무시) */
  section?: string | string[];
  /** 줄을 콕 집어 셀 때 */
  rows?: string[];
  /** 갈래 그림의 몇 번째 갈래인지(0부터) · 그 안의 번호만 셀 때 */
  branch?: number;
  stepNos?: string[];
  /** 진행도를 세지 않는다(바로가기만) */
  noCount?: boolean;
}

const TAX = { path: '/finance', tab: 'tax' };

/** 기본 단계 열쇠 → 큰일. 현장은 계획대로 안 되니 '만나면 / 못 만나면'으로 갈라 두고, 못 만났으면 다음 단계에서 다시 찾아간다 */
export const STEP_TODOS: Record<string, StepTodo[]> = {
  // 낙찰 당일 — 현장 동선 순서. 협상은 이날 하고, 이사는 잔금 납부일까지(그 뒤로는 이자가 내 몫)
  bid: [
    { text: '사건기록 열람', tab: 'win', group: 'file' },
    { text: '점유자 바로 협상 — 이사는 잔금 납부일까지', when: '만나면', tab: 'win', group: 'visit', section: '협상내용' },
    { text: '메모지·연락처 남기기', when: '못 만나면', tab: 'win', group: 'visit', rows: ['pw.visit.c1'] },
    { text: '주민·동대표·관리소 탐문', tab: 'win', group: 'visit', rows: ['pw.visit.c2', 'pw.visit.c3', 'pw.visit.c4'] },
    { text: '부동산 방문 — 시세·거래기록', tab: 'win', group: 'visit', section: '부동산방문' },
  ],
  decide: [
    { text: '점유자 다시 연락·재방문', when: '만날 때까지', tab: 'evict', group: 'ev.step', branch: 1 },
    { text: '내부·관리비 확인', tab: 'win', group: 'visit', section: '내부확인' },
    { text: '1차 내용증명 준비', when: '연락 안 되면', tab: 'win', group: 'visit', rows: ['pw.visit.c5'] },
  ],
  confirm: [
    { text: '이사 날짜 확정 — 잔금 납부일 이전', when: '합의되면', tab: 'win', group: 'visit', noCount: true },
    { text: '대출 심사 서류 준비', tab: 'balance', group: 'loan.screen' },
    { text: '대출업체 비딩', tab: 'balance', group: 'loan.bid' },
    { text: '사업자등록', tab: 'biz' },
  ],
  balance: [
    { text: '대출준비서류 챙기기', tab: 'balance', group: 'loan.docs' },
    { text: '법무비용 확인', tab: 'balance', group: 'loan.legal' },
    { text: '잔금 납부·완납증명', tab: 'balance', group: 'loan.self', section: ['1단계경매계방문', '2단계은행·잔금납부', '3단계완납증명원'] },
    { text: '취득세 신고·납부', tab: 'balance', group: 'loan.self', section: '4단계취득세신고·납부' },
    { text: '등기 촉탁', tab: 'balance', group: 'loan.self', section: '5단계등기촉탁' },
    { text: '인도명령 신청', tab: 'evict', group: 'ev.step', branch: 2, stepNos: ['1'] },
  ],
  order: [{ text: '내용증명 발송', tab: 'evict', group: 'ev.step', branch: 2, stepNos: ['2'] }],
  serve: [{ text: '인도명령 결정문 송달 확인', tab: 'evict', group: 'ev.step', branch: 3, stepNos: ['3'] }],
  warn: [{ text: '강제집행 신청', tab: 'evict', group: 'ev.step', branch: 3, stepNos: ['4'] }],
  exec: [{ text: '강제집행 실시', tab: 'evict', group: 'ev.step', branch: 4, stepNos: ['5'] }],
  repairStart: [{ text: '인테리어 업체 비딩', tab: 'repair' }],
  repairDone: [{ text: '인테리어 비용 정리', tab: 'repair' }],
  list: [{ text: '중개업소 의뢰·매물 내놓기', tab: 'sell' }],
  contract: [{ text: '매도·임대 계약', tab: 'sell' }],
  close: [{ text: '매도 잔금 받기·자금 정리', page: { path: '/finance', tab: 'cashFlow' } }],
  taxPre: [{ text: '매매차익 예정신고·납부', page: TAX }],
  taxFinal: [{ text: '종합소득세 확정신고', page: TAX }],
};

/** 옛 저장본(열쇠 없음)은 이름으로 찾는다 */
export const STEP_KEY_BY_NAME: Record<string, string> = {
  '입찰 기일 (시작)': 'bid',
  '매각 결정 기일': 'decide',
  '매각 허가 확정일': 'confirm',
  '잔금 납부 기한': 'balance',
  '인도명령 결정': 'order',
  '송달 완료 (공시송달)': 'serve',
  '강제집행 계고': 'warn',
  '강제집행 완료 (종료)': 'exec',
  '인테리어 시작': 'repairStart',
  '인테리어 완료': 'repairDone',
  '매물 내놓기': 'list',
  '매도·임대 계약': 'contract',
  '매도 잔금': 'close',
  '매매차익 예정신고': 'taxPre',
  '종합소득세 확정신고': 'taxFinal',
};
