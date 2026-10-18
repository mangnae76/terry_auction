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

/** 이름 칸에서 열 곳 — 묶음 첫 줄의 id 로 찾는다.
 *  저장해 둔(손으로 고친) 표에도 그대로 걸리도록 자료가 아니라 코드에 둔다. */
export const SECTION_LINKS: Record<string, string> = {
  // 열어 보면 /psp/index.on 으로 넘어간다 ('전자소송포털')
  'pw.file.online': 'https://ecfs.scourt.go.kr/',
};
/** 이 묶음이 가리키는 곳 */
export const sectionHref = (sec: CheckSection): string =>
  sec.href || SECTION_LINKS[sec.rows[0]?.id ?? ''] || '';

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
        // '대법원'을 윗줄에 두고 '전자소송포털'을 아랫줄로 내린다
        label: '대법원\n전자소송포털',
        href: 'https://ecfs.scourt.go.kr/',
        rows: [{ id: 'pw.file.online', depth: 0, text: '재판기록 열람 및 복사 (온라인)' }],
      },
    ],
  },
  {
    key: 'visit',
    title: '물건지 방문',
    note: '빠른 명도를 위해 잔금 납부 전에 협상을 진행한다',
    sections: [
      {
        label: '방문',
        rows: [
          { id: 'pw.visit.meet', depth: 0, text: '점유자 미팅 — 협상의 우위를 간접적으로 인지' },
          { id: 'pw.visit.name', depth: 0, text: '점유자 이름과 임대차 계약 정보 — 우편물·전기·수도로 확인' },
        ],
      },
      {
        label: '유선연락',
        rows: [
          { id: 'pw.visit.call', depth: 0, text: '점유자 연락처로 유선 연락' },
          { id: 'pw.visit.deal', depth: 0, text: '잔금 납부 일정 협의로 이사일 협상, 납부 뒤에는 불법 점유 법적 절차를 고지' },
          { id: 'pw.visit.deal1', depth: 1, text: '잔금 납부일을 최대한 미뤄 이사를 도와주는 틀로 협상' },
          { id: 'pw.visit.deal2', depth: 1, text: '깔세는 보증금이 거의 없고 월세도 미납 가능성이 크다' },
          { id: 'pw.visit.deal3', depth: 1, text: '권리 없이 점유 중임을 알린다 (전입·점유·계약·점유기간 확인)' },
          { id: 'pw.visit.deal4', depth: 1, text: '잔금 납부가 빠르면 부당이득반환을 청구할 수 있다' },
          { id: 'pw.visit.deal5', depth: 1, text: '협상 마지노선은 잔금 납부일까지 (4~5주)' },
          { id: 'pw.visit.deal6', depth: 1, text: '잔금 납부는 미루되 퇴거 날짜 협상을 요청 → 계약서 작성' },
          { id: 'pw.visit.deal7', depth: 1, text: '이사비는 먼저 꺼내지 않는다', warn: true },
        ],
      },
      {
        label: '내부 확인',
        rows: [
          { id: 'pw.visit.in1', depth: 0, text: '집수리 내용 파악(누수 등) — 점유자·주민' },
          { id: 'pw.visit.in2', depth: 0, text: '미납관리비 확인 — 동 반장' },
          { id: 'pw.visit.in3', depth: 0, text: '파손이 심하면 매각불허가 준비', warn: true },
        ],
      },
      {
        label: '폐문부재',
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
