// 낙찰이후 체크리스트 — 낙찰 당일에 할 일을 적어 둔 표.
// 글은 사용자가 쓰던 문서를 그대로 옮겼다. 항목 id 는 바뀌면 안 된다
// (물건마다 '했다/안 했다'를 이 id 로 저장한다).
//
// 표는 권리분석 표와 같은 꼴이다 — 왼쪽 분홍 칸에 '어디서/무엇을'(묶음 이름),
// 오른쪽에 할 일, 끝에 체크. 묶음 하나에 여러 줄이 달리면 이름 칸이 세로로 합쳐진다.

export interface CheckRow {
  id: string;
  /** 몇 번째 켜인지 — 0 은 그 묶음의 할 일, 1 은 그 아래 딸린 말 */
  depth: 0 | 1;
  text: string;
  /** 몇 부인지 — 적어 두면 설명 오른쪽에 제 칸으로 선다 */
  qty?: string;
  /** 비고 — 부수 오른쪽에 제 칸으로 선다 */
  memo?: string;
  /** 눈에 띄게 적어 둘 말 (빨강) */
  warn?: boolean;
}

/** 왼쪽 이름 칸 하나와 거기 달린 줄들 */
export interface CheckSection {
  label: string;
  /** 이름이 가리키는 곳 — 적어 두면 이름 칸이 그 자리로 가는 링크가 된다 */
  href?: string;
  rows: CheckRow[];
}

export interface CheckGroup {
  key: string;
  title: string;
  /** 제목 아래 한 줄 — 왜 하는지 */
  note?: string;
  sections: CheckSection[];
}

/** 이름 칸을 어떻게 보일지 — 글자로 알아보고 이름과 갈 곳을 정한다.
 *  손으로 고쳐 저장해 둔 표에도 그대로 걸리도록 자료가 아니라 코드에 둔다.
 *  (줄 id 로 찾던 때는 줄을 더하거나 옮기면 걸리지 않았다) */
const LABEL_RULES: Array<{ test: RegExp; label: string; href?: string }> = [
  // 열어 보면 /psp/index.on 으로 넘어간다 ('전자소송포털')
  { test: /전자소송/, label: '전자소송포털', href: 'https://ecfs.scourt.go.kr/' },
];

/** 화면에 보일 이름과 갈 곳 */
export const sectionView = (sec: CheckSection): { label: string; href: string } => {
  const raw = (sec.label ?? '').trim();
  const rule = LABEL_RULES.find((r) => r.test.test(raw.replace(/\s+/g, '')));
  return { label: rule?.label ?? raw, href: sec.href || rule?.href || '' };
};

/** 기본 글의 판. 글을 고쳐 내보낼 때 올린다 — 예전 판으로 저장해 둔 표는
 *  새 글로 갈아 끼운다(손으로 고친 것은 그때 사라진다). */
export const POST_WIN_VERSION = 5;

export const POST_WIN_DAY: CheckGroup[] = [
  {
    key: 'file',
    title: '경매사건 열람',
    note: '점유자 연락처, 공실상태 비번, 추가 인수사항 및 세금 확인 (당일 열람 가능 시)',
    sections: [
      {
        label: '법원(종합민원실)',
        rows: [
          { id: 'pw.file.court', depth: 0, text: '재판기록 열람 및 USB 복제' },
          { id: 'pw.file.docs', depth: 0, text: '준비서류 : 재판기록 열람복사신청서, 접수, 도장, 신청서, 수입인지' },
        ],
      },
      {
        // ecfs.scourt.go.kr → /psp/index.on 으로 넘어간다 ('전자소송포털')
        label: '전자소송포털',
        href: 'https://ecfs.scourt.go.kr/',
        rows: [{ id: 'pw.file.online', depth: 0, text: '재판기록 열람 및 복사 (온라인)' }],
      },
    ],
  },
  {
    // 첫통화든 방문이든 들고 가는 원칙은 같다 — 따로 세워 둔다
    key: 'rule',
    title: '명도협상 원칙',
    sections: [
      {
        label: '',
        rows: [
          { id: 'pw.visit.p1', depth: 0, text: '협상의 우위를 인지 시키는 것이 핵심' },
          { id: 'pw.visit.p2', depth: 0, text: '명도협상 시 잔금납부일 버퍼를 확보' },
          { id: 'pw.visit.p3', depth: 0, text: '협상마지노선은 잔금납부일까지' },
          { id: 'pw.visit.p4', depth: 0, text: '이사비는 X', warn: true },
        ],
      },
    ],
  },
  {
    key: 'visit',
    title: '유선연락 첫통화 or 물건지 방문',
    note: '빠른 명도를 위해 잔금납부 전 협상을 진행한다.',
    sections: [
      {
        label: '협상내용',
        rows: [
          { id: 'pw.visit.n1', depth: 0, text: '경매낙찰자임을 알림 > 동 호수 확인' },
          { id: 'pw.visit.n2', depth: 0, text: '잔금납부전 집을 비워야 하는 이유로 사전연락 했음을 알림' },
          { id: 'pw.visit.n3', depth: 0, text: '잔금납부가 빠르면 부당이득반환 청구를 할 수 있음을 고지' },
          { id: 'pw.visit.n4', depth: 0, text: '협상 마지노선은 잔금납부일까지 (5주)' },
          { id: 'pw.visit.n5', depth: 0, text: '5주가 지나가면 법적절차를 진행 할 수 있는 상황임을 알림' },
          { id: 'pw.visit.n6', depth: 0, text: '권리 없이 점유하고 있음을 알림 (전입, 점유, 계약, 점유기간확인)' },
          { id: 'pw.visit.n7', depth: 0, text: '도와줄 수 있는 부분은 잔금납부일을 미루어 주는것' },
          { id: 'pw.visit.n8', depth: 0, text: '이사를 도와주는 프레임으로 협상 > 계약서 작성 (절차대로)' },
        ],
      },
      {
        label: '내부확인',
        rows: [
          { id: 'pw.visit.in1', depth: 0, text: '집수리 내용 파악(누수 등) — 점유자·주민' },
          { id: 'pw.visit.in2', depth: 0, text: '미납관리비 확인 — 동 반장' },
          { id: 'pw.visit.in3', depth: 0, text: '파손이 심하면 매각불허가 준비', warn: true },
        ],
      },
      {
        // 문을 못 열었을 때와 연락이 닿지 않을 때 — 한 묶음으로 본다
        label: '폐문부재\n연락부재',
        rows: [
          { id: 'pw.visit.c1', depth: 0, text: '연락처 메모 남기기' },
          { id: 'pw.visit.c2', depth: 0, text: '탐문 (동 반장·주민) — 관리비·수도·전기·가스 확인' },
          { id: 'pw.visit.c3', depth: 0, text: '집수리 내용 파악(누수 등) — 주민·동 대표' },
          { id: 'pw.visit.c4', depth: 0, text: '미납관리비 확인 — 동 대표 연락처 탐문' },
          { id: 'pw.visit.c5', depth: 0, text: '내용증명 발송 — 우체국(오프) 또는 인터넷우체국(온라인)' },
        ],
      },
      {
        label: '부동산 방문',
        rows: [
          { id: 'pw.visit.agency', depth: 0, text: '시세 파악, 해당 물건 거래 기록 확인' },
          { id: 'pw.visit.a1', depth: 0, text: '집수리 내용 파악 (누수 등)' },
          { id: 'pw.visit.a2', depth: 0, text: '이전 점유자 정보 탐문' },
        ],
      },
    ],
  },
];

/** 묶음 안의 모든 줄 — 센 개수를 셀 때 쓴다 */
export const groupRows = (g: CheckGroup): CheckRow[] => g.sections.flatMap((s) => s.rows);
