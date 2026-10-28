// 절차진행(웹) — 단계마다 '해야 할 큰일'. 세부 체크는 절차상세(낙찰당일 · 명도 · 잔금·등기)의 상자에 있고,
// 여기서는 그 상자를 가리키기만 한다(체크는 한 곳에만 남는다). 진행도는 가리킨 상자의 체크로 센다.

/** 낙찰이후 하위 탭 열쇠 — 절차상세 장(win · evict · balance), 가이드 장(gevict · biz), 그 밖(repair · sell) */
export type PostWinTabKey = 'flow' | 'win' | 'dpre' | 'gdeny' | 'evict' | 'balance' | 'drepair' | 'dsell' | 'dtax' | 'gwin' | 'gevict' | 'biz' | 'repair' | 'sell';

/** 큰일의 갈래 — 명도 · 대출 · 절차(법원 · 등기 · 사업자 · 인테리어 · 매도 · 세금) */
export type TodoCat = 'evict' | 'loan' | 'proc';
export const TODO_CATS: Array<[TodoCat, string]> = [['evict', '명도'], ['loan', '대출'], ['proc', '절차']];

export interface StepTodo {
  text: string;
  cat: TodoCat;
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
  /** 이 카드에서 서식을 열면 먼저 보일 서식(내용증명 몇 차 등) */
  form?: string;
  /** 카드 맨 위 안내줄 — 원본 상자의 안내 대신 */
  cardNote?: string;
  /** 카드 제목 — 없으면 큰일 이름 */
  cardTitle?: string;
  /** 같이 띄울 카드(상자 · 제목) */
  also?: Array<{ group: string; title: string }>;
  /** 카드에서 비고 칸을 바꿔 보인다(줄 id → 비고, 빈 글이면 비움) */
  memos?: Record<string, string>;
  /** 카드에서 부수 칸을 바꿔 보인다(줄 id → 부수) */
  qtys?: Record<string, string>;
  /** 창에서 줄 글을 바꿔 보인다(줄 id → 새 글) */
  texts?: Record<string, string>;
  /** 창에서 칸 이름을 바꿔 보인다(공백 뺀 이름 → 새 이름) — 둘 중 하나를 고르는 일에 '만났을 때' 같은 머리를 단다 */
  labels?: Record<string, string>;
}

/** 기본 단계 열쇠 → 큰일. 현장은 계획대로 안 되니 '만나면 / 못 만나면'으로 갈라 두고, 못 만났으면 다음 단계에서 다시 찾아간다 */
export const STEP_TODOS: Record<string, StepTodo[]> = {
  // 낙찰 당일 — 현장 동선 순서. 협상은 이날 하고, 이사는 잔금 납부일까지(그 뒤로는 이자가 내 몫)
  bid: [
    { text: '사건기록 열람', cat: 'proc', tab: 'win', group: 'file' },
    {
      text: '점유자 협상 or 메모 - 1차 방문', cat: 'evict', tab: 'win', group: 'visit', noCount: true,
      section: ['협상내용', '폐문부재연락부재'],
      rows: ['pw.visit.n1', 'pw.visit.n2', 'pw.visit.n3', 'pw.visit.n4', 'pw.visit.n5', 'pw.visit.n6', 'pw.visit.n7', 'pw.visit.n8', 'pw.visit.c1'],
      labels: { 협상내용: '만났을 때\n협상내용', 폐문부재연락부재: '못 만났을 때\n메모 남기기' },
      texts: { 'pw.visit.c1': '연락처 메모 남기기 (통화 시 위 협상내용 참고)' },
    },
    { text: '주민·동대표·관리소 탐문', cat: 'evict', tab: 'win', group: 'visit', rows: ['pw.visit.c2', 'pw.visit.c3', 'pw.visit.c4'], labels: { 폐문부재연락부재: '주민·동대표·관리소' } },
    { text: '부동산 방문 - 낙찰당일', cat: 'proc', tab: 'win', group: 'visit', section: '부동산방문' },
  ],
  decide: [
    { text: '점유자 재방문 - 2차 방문', cat: 'evict', tab: 'evict', group: 'ev.revisit' },
    { text: '내부·관리비 확인', cat: 'evict', tab: 'win', group: 'visit', section: '내부확인' },
    { text: '훼손이 심하면 매각불허가 신청', cat: 'proc', tab: 'gdeny', group: 'gd.deny' },
    { text: '내용증명 - 1차(안내)', form: 'notice1', cat: 'evict', tab: 'win', group: 'visit', rows: ['pw.visit.c5'], labels: { 폐문부재연락부재: '내용증명' } },
  ],
  confirm: [
    { text: '이사 날짜 협의 및 확정', cat: 'evict', tab: 'evict', group: 'ev.move' },
    // 사업자등록이 먼저 — 대출 심사 서류에 사업자등록증이 들어간다
    { text: '사업자등록', cat: 'proc', tab: 'balance', group: 'ln.biz' },
    { text: '대출 심사 서류 준비', cat: 'loan', tab: 'balance', group: 'loan.screen', texts: {
      'ln.c3': '전년도 신용카드 내역서 — 카드사 홈페이지 · 앱',
      'ln.c4': '전년도 소득금액증명서 — 국세청 홈택스',
      'ln.c5': '올해 근로소득원천징수 서류 — 회사에 알리지 않고 국세청 홈택스(손택스 앱)에서 직접 발급(전년도분은 지급명세서 제출내역, 올해분은 간이지급명세서 조회)',
      'ln.c6': '2년간 배우자 소득금액증명서 — 본인(낙찰자) 소득이 없을 때만, 배우자 소득으로 심사',
    } },
    { text: '대출업체 비딩', cat: 'loan', tab: 'balance', group: 'loan.bid' },
  ],
  balance: [
    {
      text: '대출준비서류 챙기기', cat: 'loan', tab: 'balance', group: 'loan.docs',
      // 원본 표에 비어 있던 부수 — 웹 카드에서 채운다(앱 · 원본 표는 그대로)
      qtys: { 'ln.d1': '원본', 'ln.d2': '원본', 'ln.d13': '1부', 'ln.d14': '각 1부', 'ln.d17': '1부' },
      // 떼는 곳 — 인터넷으로 되는 서류는 기관 이름(링크), 안 되는 서류는 방문
      texts: {
        'ln.d3': '인감증명서 — 주민센터 방문(인터넷 발급 안 됨)',
        'ln.d4': '가족관계증명서(상세) — 대법원 전자가족관계등록시스템 · 정부24',
        'ln.d5': '주민등록등본 — 정부24',
        'ln.d6': '주민등록 원초본 — 정부24',
        'ln.d7': '국세완납증명서 — 국세청 홈택스',
        'ln.d8': '지방세완납증명서 — 위택스 · 정부24',
        'ln.d12': '지방세 세목별과세증명서(최근 2년) — 위택스 · 정부24',
        'ln.d13': '매매사업자등록증명원 — 국세청 홈택스',
        'ln.d14': '입찰보증금영수증 / 매각결정통지서 / 대금지급기한통지서 — 법원에서 받은 것',
        'ln.d15': '재직증명서(회사), 근로소득원천징수영수증(최근 2년) — 국세청 홈택스',
        'ln.d16': '건강보험자격득실확인서, 보험료납부확인서(최근 1년) — 국민건강보험공단 · 정부24',
        'ln.d17': '전입세대열람(낙찰받은 물건) — 주민센터 방문(인터넷 발급 안 됨)',
      },
      memos: { 'ln.d12': '유효기간 한 달', 'ln.d3': '' },
    },
    { text: '법무비용 확인', cat: 'loan', tab: 'balance', group: 'loan.legal' },
    // 잔금 납부 · 완납증명 · 취득세 · 등기 촉탁 · 인도명령 · 점유이전금지 가처분은 한 묶음 —
    // 법무사에 맡기면 법무사가 다 하고, 셀프일 때만 직접 한다. 그래서 한 줄로 묶고 창 맨 위에 그 안내를 단다
    {
      text: '잔금·등기·인도명령 - 법무사 or 셀프', cat: 'proc', tab: 'balance', group: 'loan.self',
      cardTitle: '잔금 납부 · 완납증명 · 취득세 · 등기 촉탁',
      cardNote: '법무사에 맡기면 이 카드와 아래 두 카드는 법무사가 다 합니다 — 셀프일 때만 직접 하세요',
      also: [{ group: 'ev.order', title: '인도명령 신청' }, { group: 'ev.hold', title: '점유이전금지 가처분(필요 시)' }],
    },
  ],
  order: [{ text: '내용증명 - 2차(최고)', form: 'notice2', cat: 'evict', tab: 'evict', group: 'ev.notice' }],
  serve: [{ text: '인도명령 결정문 송달 확인', cat: 'evict', tab: 'evict', group: 'ev.serve' }],
  // 이름은 '무엇 - 몇 차(목적)' — 같은 일을 여러 번 할 때 몇 번째 · 무엇 때문인지 바로 보이게
  warn: [
    { text: '내용증명 - 3차(최종통지)', form: 'notice3', cat: 'evict', tab: 'evict', group: 'ev.notice' },
    { text: '강제집행 신청', cat: 'evict', tab: 'evict', group: 'ev.execApply' },
  ],
  exec: [
    { text: '강제집행 실시', cat: 'evict', tab: 'evict', group: 'ev.exec' },
    { text: '미납 공과금 분리 청구', cat: 'evict', tab: 'evict', group: 'ev.util' },
  ],
  repairStart: [
    { text: '공사 범위·예산 정하기', cat: 'proc', tab: 'drepair', group: 'ri.plan' },
    { text: '인테리어 업체 비딩·계약', cat: 'proc', tab: 'drepair', group: 'ri.bid' },
  ],
  repairDone: [
    { text: '공사 진행·검수', cat: 'proc', tab: 'drepair', group: 'ri.work' },
    { text: '인테리어 비용 정리', cat: 'proc', tab: 'drepair', group: 'ri.cost' },
  ],
  list: [
    { text: '시세·가격 정하기', cat: 'proc', tab: 'dsell', group: 'se.price' },
    { text: '중개업소 의뢰·매물 내놓기', cat: 'proc', tab: 'dsell', group: 'se.list' },
  ],
  contract: [{ text: '매도·임대 계약', cat: 'proc', tab: 'dsell', group: 'se.deal' }],
  close: [{ text: '매도 잔금 받기·집 넘기기', cat: 'proc', tab: 'dsell', group: 'se.close' }],
  taxPre: [
    { text: '매매차익 예정신고·납부', cat: 'proc', tab: 'dtax', group: 'tx.pre' },
    { text: '부가가치세(해당 시)', cat: 'proc', tab: 'dtax', group: 'tx.vat' },
  ],
  taxFinal: [{ text: '종합소득세 확정신고', cat: 'proc', tab: 'dtax', group: 'tx.final' }],
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

/** 절차상세(웹)의 장 → 그 장에 담는 단계(차례대로). 장 안에서는 단계 머리 아래 큰일 카드가 붙는다 */
export const DETAIL_STEPS: Record<string, string[]> = {
  win: ['bid'],
  dpre: ['decide', 'confirm'],
  balance: ['balance'],
  evict: ['order', 'serve', 'warn', 'exec'],
  drepair: ['repairStart', 'repairDone'],
  dsell: ['list', 'contract', 'close'],
  dtax: ['taxPre', 'taxFinal'],
};
/** 절차상세의 단계 머리 */
export const STEP_TITLE: Record<string, string> = {
  bid: '입찰 기일 · 낙찰 당일',
  decide: '매각 결정 기일',
  confirm: '매각 허가 확정',
  balance: '잔금 납부',
  order: '인도명령 결정',
  serve: '결정문 송달',
  warn: '강제집행 계고',
  exec: '강제집행 완료',
  repairStart: '인테리어 시작',
  repairDone: '인테리어 완료',
  list: '매물 내놓기',
  contract: '매도·임대 계약',
  close: '매도 잔금',
  taxPre: '매매차익 예정신고',
  taxFinal: '종합소득세 확정신고',
};
