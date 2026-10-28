// 낙찰이후 · 서식(웹) — 메모 · 내용증명 · 합의서 · 위임장 · 명도확인서.
// 고른 물건의 사건번호 · 법원 · 주소는 자동으로 채우고, 사람 이름 · 날짜는 창에서 적는다.
// 글은 일반적인 실무 문구다 — 물건마다 창에서 고쳐 쓴다.

/** 서식에 채워 넣는 값 */
export interface FormCtx {
  caseNo: string;
  court: string;
  address: string;
  /** 낙찰자(매수인) 이름 · 연락처 — 한 번 적으면 기억한다 */
  winner: string;
  phone: string;
  /** 점유자 · 임차인 이름 — 물건마다 */
  occupant: string;
  /** 잔금 납부일 · 인도 기한 · 강제집행 신청 예정일 · 이사 날짜 */
  balanceDate: string;
  deadline: string;
  execDate: string;
  moveDate: string;
  /** 이사비 */
  amount: string;
  today: string;
}
export type FormField = 'occupant' | 'balanceDate' | 'deadline' | 'execDate' | 'moveDate' | 'amount';
export const FIELD_LABEL: Record<FormField, string> = {
  occupant: '점유자 이름',
  balanceDate: '잔금 납부일',
  deadline: '인도 기한',
  execDate: '강제집행 신청 예정일',
  moveDate: '이사 날짜',
  amount: '이사비(원)',
};

export type FormKey = 'memo' | 'notice1' | 'notice2' | 'notice3' | 'moveAgree' | 'proxy' | 'handover' | 'denySale' | 'cancelSale';
export interface FormDef {
  key: FormKey;
  title: string;
  /** 창에서 적게 할 칸 */
  fields: FormField[];
  body: (c: FormCtx) => string;
}

/** 비어 있으면 밑줄 자리로 */
const v = (s: string, blank = '__________') => (s || '').trim() || blank;
const caseLine = (c: FormCtx) => `${v(c.court, '')} ${v(c.caseNo)}`.trim();

const noticeHead = (c: FormCtx, title: string) => [
  `제목  ${title}`,
  '',
  `수신  ${v(c.occupant)} 귀하`,
  `      ${v(c.address)}`,
  `발신  ${v(c.winner)} (낙찰자 · 매수인)  연락처 ${v(c.phone)}`,
  `사건  ${caseLine(c)}`,
  '',
  '',
].join('\n');
const signOff = (c: FormCtx) => ['', '', `${v(c.today)}`, '', `발신인  ${v(c.winner)}  (인)`].join('\n');

export const FORMS: Record<FormKey, FormDef> = {
  memo: {
    key: 'memo',
    title: '방문 메모',
    fields: [],
    body: (c) => [
      '안녕하세요.',
      `이 집(${v(c.address)}) 경매 사건(${caseLine(c)})의 낙찰자 ${v(c.winner)}입니다.`,
      '이사 일정 등 상의드릴 일이 있어 찾아왔습니다.',
      '이 메모를 보시면 편하신 때에 연락 부탁드립니다.',
      '',
      `연락처  ${v(c.phone)}`,
      v(c.today),
    ].join('\n'),
  },
  notice1: {
    key: 'notice1',
    title: '내용증명 1차 (안내)',
    fields: ['occupant', 'balanceDate'],
    body: (c) => noticeHead(c, '낙찰 사실 안내 및 이사 협의 요청') + [
      `1. 귀하가 점유하고 있는 위 부동산은 ${caseLine(c)} 경매 사건에서 본인이 매수인으로 낙찰받았음을 알려 드립니다.`,
      `2. 본인은 ${v(c.balanceDate)}경 매각대금(잔금)을 납부할 예정이며, 납부와 동시에 소유권을 취득합니다.`,
      '3. 원만한 해결을 위해 이사 일정을 협의하고자 하오니 위 연락처로 연락 주시기 바랍니다. 잔금 납부일까지 이사해 주시기를 요청드립니다.',
      '4. 협의가 이루어지지 않을 경우 부득이 부동산인도명령 등 법적 절차를 진행할 수밖에 없음을 양해 바랍니다.',
    ].join('\n') + signOff(c),
  },
  notice2: {
    key: 'notice2',
    title: '내용증명 2차 (최고)',
    fields: ['occupant', 'balanceDate', 'deadline'],
    body: (c) => noticeHead(c, '부동산 인도 최고') + [
      `1. 본인은 ${v(c.balanceDate)} 매각대금을 완납하여 위 부동산의 소유권을 취득하였습니다.`,
      `2. 귀하는 현재 아무런 권원 없이 위 부동산을 점유하고 있으므로 ${v(c.deadline)}까지 부동산을 인도(이사)하여 주시기 바랍니다.`,
      '3. 위 기한까지 인도하지 않을 경우 부동산인도명령에 따른 강제집행을 진행하며, 소유권 취득일부터 인도일까지의 부동산 사용에 따른 부당이득(차임 상당액)과 집행 비용을 청구할 것임을 알려 드립니다.',
      '4. 기한 전에 협의를 원하시면 언제든 연락 주십시오.',
    ].join('\n') + signOff(c),
  },
  notice3: {
    key: 'notice3',
    title: '내용증명 3차 (최종 통지)',
    fields: ['occupant', 'execDate', 'deadline'],
    body: (c) => noticeHead(c, '강제집행 신청 예정 통지') + [
      '1. 본인은 귀하에게 앞서 내용증명으로 부동산 인도를 요청하였으나 현재까지 인도되지 않았습니다.',
      `2. 이에 ${v(c.execDate)}경 관할 법원 집행관사무소에 부동산 인도 강제집행을 신청할 예정입니다.`,
      '3. 강제집행에 드는 비용(노무비, 짐 운반 · 보관비 등)과 소유권 취득일 이후의 부당이득은 모두 귀하에게 청구됩니다.',
      `4. 강제집행 전에 스스로 이사하신다면 최대한 협의하겠으니 ${v(c.deadline)}까지 연락 주시기 바랍니다.`,
    ].join('\n') + signOff(c),
  },
  moveAgree: {
    key: 'moveAgree',
    title: '명도 합의서',
    fields: ['occupant', 'moveDate', 'amount'],
    body: (c) => [
      '명도 합의서',
      '',
      `부동산  ${v(c.address)}`,
      `사건    ${caseLine(c)}`,
      '',
      `갑(낙찰자)  ${v(c.winner)}`,
      `을(점유자)  ${v(c.occupant)}  생년월일 __________  연락처 __________`,
      '            (신분증으로 확인)',
      '',
      '갑과 을은 위 부동산의 인도에 관하여 다음과 같이 합의한다.',
      '',
      `1. 을은 ${v(c.moveDate)}까지 위 부동산에서 짐을 모두 옮기고 갑에게 부동산을 인도한다.`,
      `2. 갑은 을이 위 날짜에 부동산을 인도하고 갑이 이를 확인한 때 이사비 금 ${v(c.amount)}원을 지급한다. (이사비가 없으면 이 항을 지운다)`,
      '3. 을은 인도일까지의 관리비 · 공과금을 정산한다.',
      '4. 을이 인도한 뒤 남긴 물건은 을이 소유권을 포기한 것으로 보고, 갑이 처분하여도 을은 이의를 제기하지 않는다.',
      '5. 을이 위 날짜까지 인도하지 않으면 제2항의 이사비는 지급하지 않으며, 갑은 법적 절차를 진행할 수 있다.',
      '',
      v(c.today),
      '',
      `갑  ${v(c.winner)}  (서명)`,
      `을  ${v(c.occupant)}  (서명)`,
    ].join('\n'),
  },
  proxy: {
    key: 'proxy',
    title: '위임장',
    fields: [],
    body: (c) => [
      '위 임 장',
      '',
      `위임인  ${v(c.winner)}  (연락처 ${v(c.phone)})`,
      '수임인  성명 __________  주소 ______________________  연락처 __________',
      '',
      `사건    ${caseLine(c)}`,
      `부동산  ${v(c.address)}`,
      '',
      '위임인은 위 사건에 관하여 다음 사항을 수임인에게 위임합니다.',
      '',
      '1. 매각대금 납부 및 이에 따른 서류 제출 · 수령',
      '2. 소유권이전등기 촉탁 신청',
      '3. 부동산인도명령 신청 및 이에 따른 서류 제출 · 수령',
      '',
      v(c.today),
      '',
      `위임인  ${v(c.winner)}  (인)`,
      '',
      '첨부  위임인 인감증명서 1통',
    ].join('\n'),
  },
  denySale: {
    key: 'denySale',
    title: '매각불허가 신청서',
    fields: [],
    body: (c) => [
      '매각불허가 신청서',
      '',
      `사건      ${caseLine(c)}`,
      `신청인    ${v(c.winner)} (최고가매수신고인)  연락처 ${v(c.phone)}`,
      `부동산    ${v(c.address)}`,
      '',
      '신 청 취 지',
      '위 사건에 관하여 매각을 허가하지 아니한다는 결정을 구합니다.',
      '',
      '신 청 이 유',
      '1. 신청인은 위 사건의 매각기일에 최고가매수신고인이 되었습니다.',
      '2. 매각 후 현장을 확인한 결과 위 부동산에 다음과 같은 중대한 훼손(또는 흠)이 있음을 알게 되었습니다.',
      '   - 내용: ______________________________________________',
      '   - 확인한 날: __________',
      '3. 이는 신청인이 책임질 수 없는 사유로 매각물건명세서 등에 나타나지 않은 것으로, 민사집행법 제121조에 따라 매각을 허가하지 아니한다는 결정을 구합니다.',
      '',
      '첨부  훼손 사진 · 동영상, 수리 견적서, 관리사무소 확인서 등',
      '',
      v(c.today),
      '',
      `신청인  ${v(c.winner)}  (인)`,
      '',
      `${v(c.court, '○○지방법원')} 귀중`,
    ].join('\n'),
  },
  cancelSale: {
    key: 'cancelSale',
    title: '매각허가결정 취소 신청서',
    fields: [],
    body: (c) => [
      '매각허가결정 취소 신청서',
      '',
      `사건      ${caseLine(c)}`,
      `신청인    ${v(c.winner)} (매수인)  연락처 ${v(c.phone)}`,
      `부동산    ${v(c.address)}`,
      '',
      '신 청 취 지',
      '위 사건에 관하여 귀원이 한 매각허가결정을 취소한다는 결정을 구합니다.',
      '',
      '신 청 이 유',
      '1. 신청인은 위 사건에서 매각허가결정을 받은 매수인으로, 아직 매각대금을 내지 않았습니다.',
      '2. 매각허가결정 뒤 위 부동산이 다음과 같이 크게 훼손된 사실을 알게 되었습니다.',
      '   - 내용: ______________________________________________',
      '   - 확인한 날: __________',
      '3. 이는 신청인이 책임질 수 없는 사유이므로 민사집행법 제127조에 따라 매각허가결정의 취소를 구합니다.',
      '',
      '첨부  훼손 사진 · 동영상, 수리 견적서, 관리사무소 확인서 등',
      '',
      v(c.today),
      '',
      `신청인  ${v(c.winner)}  (인)`,
      '',
      `${v(c.court, '○○지방법원')} 귀중`,
    ].join('\n'),
  },
  handover: {
    key: 'handover',
    title: '명도확인서',
    fields: ['occupant'],
    body: (c) => [
      '명 도 확 인 서',
      '',
      `사건번호  ${caseLine(c)}`,
      `부동산    ${v(c.address)}`,
      `임차인    ${v(c.occupant)}`,
      '',
      '위 사건에서 위 임차인은 그 점유 부동산을 매수인에게 명도하였음을 확인합니다.',
      '',
      '첨부  매수인 인감증명서 1통',
      '',
      v(c.today),
      '',
      `매수인  ${v(c.winner)}  (인)`,
      `연락처  ${v(c.phone)}`,
    ].join('\n'),
  },
};

/** 체크리스트 줄 → 그 줄에서 여는 서식(여럿이면 탭) */
export const FORMS_OF_ROW: Record<string, FormKey[]> = {
  'pw.visit.c1': ['memo'],
  'ev.rev.v2': ['memo'],
  'pw.visit.c5': ['notice1', 'notice2', 'notice3'],
  'ev.notice.s1': ['notice1', 'notice2', 'notice3'],
  'ev.move.d1': ['moveAgree'],
  'ev.order.a3': ['proxy'],
  'ev.move.m3': ['handover'],
  'ev.exe.a2': ['handover'],
  'pw.visit.in3': ['denySale', 'cancelSale'],
  'gd.deny.p3': ['denySale', 'cancelSale'],
};

/** 줄 옆 단추 이름 — 서식 이름 그대로, 단추라 붙여 쓴다 */
export const FORM_TAB: Record<FormKey, string> = {
  memo: '메모', notice1: '1차(안내)', notice2: '2차(최고)', notice3: '3차(최종통지)', moveAgree: '명도합의서', proxy: '위임장', handover: '명도확인서', denySale: '불허가신청', cancelSale: '허가취소신청',
};
export const FORM_BTN: Record<FormKey, string> = {
  memo: '메모',
  notice1: '내용증명',
  notice2: '내용증명',
  notice3: '내용증명',
  moveAgree: '명도합의서',
  proxy: '위임장',
  handover: '명도확인서',
  denySale: '매각불허가',
  cancelSale: '매각불허가',
};

// ===== 자리표 — 서식 글 속 {사건번호} 같은 자리에 위쪽 칸의 값이 들어간다 =====
// 사용자가 서식을 고쳐 저장해도 자리표만 남겨 두면 물건마다 값이 채워진다
export const TOKENS: Array<[string, keyof FormCtx, string]> = [
  ['사건번호', 'caseNo', '사건번호'],
  ['법원', 'court', '법원'],
  ['주소', 'address', '주소'],
  ['낙찰자', 'winner', '낙찰자 이름'],
  ['연락처', 'phone', '낙찰자 연락처'],
  ['점유자', 'occupant', '점유자 이름'],
  ['잔금납부일', 'balanceDate', '잔금 납부일'],
  ['인도기한', 'deadline', '인도 기한'],
  ['집행예정일', 'execDate', '강제집행 신청 예정일'],
  ['이사날짜', 'moveDate', '이사 날짜'],
  ['이사비', 'amount', '이사비(원)'],
  ['오늘', 'today', '작성일'],
];
const TOKEN_KEY = new Map(TOKENS.map(([t, k]) => [t, k]));
/** 기본 서식 — 값 자리에 자리표를 넣어 만든다 */
export const defaultTemplate = (key: FormKey): string => {
  const ctx = Object.fromEntries(TOKENS.map(([t, k]) => [k, `{${t}}`])) as unknown as FormCtx;
  return FORMS[key].body(ctx);
};
/** 서식에 값 채우기 — 빈 값은 밑줄 자리로 */
export const fillTemplate = (tpl: string, ctx: FormCtx): string => tpl.replace(/\{([^{}\n]+)\}/g, (m, name: string) => {
  const k = TOKEN_KEY.get(name.trim());
  // 법원은 비면 그냥 뺀다('__________ 2024타경…'처럼 보이지 않게)
  return k ? (String(ctx[k] ?? '').trim() || (k === 'court' ? '' : '__________')) : m;
});
/** 서식에 쓰인 자리표(차례대로) */
export const tokensIn = (tpl: string): Array<keyof FormCtx> => {
  const seen: Array<keyof FormCtx> = [];
  for (const m of tpl.matchAll(/\{([^{}\n]+)\}/g)) {
    const k = TOKEN_KEY.get(m[1].trim());
    if (k && !seen.includes(k)) seen.push(k);
  }
  // 칸은 늘 같은 차례(사건번호 · 법원 · 주소 · 낙찰자 …)로
  return TOKENS.map(([, k]) => k).filter((k) => seen.includes(k));
};
