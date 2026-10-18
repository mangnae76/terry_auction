// 낙찰이후 · 명도 — 절차와 시기별 할 일, 협상하는 법.
// 꼴은 다른 탭과 같다(묶음 이름 | 내용). 절차·협상은 읽어 두는 글이라 체크가 없고,
// 시기별 진행내용만 챙길 일이라 체크를 둔다.
import type { CheckGroup } from './postWinChecklist';

/** 기본 글의 판 — 글을 고쳐 내보낼 때 올린다 */
export const POST_WIN_EVICT_VERSION = 9;

export const POST_WIN_EVICT: CheckGroup[] = [
  {
    key: 'ev.flow',
    title: '명도 절차',
    noCheck: true,
    timeline: {
      chip: '낙찰 이후 명도프로세스',
      // 앞쪽을 좁혀 왼쪽으로 몰고, Day 45 오른쪽에 계고·집행 상자를 얹는다
      cols: '0.72fr 0.86fr 1.5fr 0.92fr',
      points: [
        { day: 'Day 1', label: '낙찰' },
        { day: 'Day 15', label: '매각확정' },
        { day: 'Day 45', label: '잔금 납부 → 소유권 이전\n인도명령 신청' },
        { label: '명도' },
      ],
      span: { from: 2, to: 3, text: '강제 계고 → 강제 집행' },
    },
    // 명도의 시작 — 알약 셋을 화살표로 잇는다
    boxes: {
      chip: '명도시작은 언제부터?',
      items: ['낙찰 당일', '잔금 납부 전', '잔금 납부 후'],
    },
    sections: [],
  },
  {
    key: 'ev.step',
    title: '명도 시기별 진행내용',
    note: '낙찰 받고 당장 무엇을 할지 — 때마다 할 일이 다르다.',
    sections: [
      {
        label: '낙찰 당일\n관리사무소',
        rows: [
          { id: 'ev.s1', depth: 0, text: '내 전화번호를 남기고, 점유자에게 전화를 요청해 둔다' },
          { id: 'ev.s2', depth: 0, text: '미납관리비 최신화 — 공용부 / 전용부를 나눠 확인' },
        ],
      },
      {
        label: '낙찰 당일\n세대 방문',
        rows: [
          { id: 'ev.s3', depth: 0, text: '낙찰자임을 알리는 포스트잇을 붙인다' },
          { id: 'ev.s4', depth: 0, text: '주변 세대(위·아래·앞)를 돌며 점유 상태를 확인한다' },
          { id: 'ev.s5', depth: 0, text: '낙찰 받고 당장 내용증명을 보낼 필요는 없다' },
          { id: 'ev.s6', depth: 0, text: '잔금 납부 전까지 낙찰자는 아직 소유자가 아니다', warn: true },
          { id: 'ev.s7', depth: 0, text: '잔금 납부까지는 기다리는 편이 낫다' },
        ],
      },
      {
        label: '잔금 납부 후\n① 인도명령',
        rows: [
          { id: 'ev.s8', depth: 0, text: '잔금 납부와 동시에 인도명령을 반드시 신청한다', warn: true },
          { id: 'ev.s9', depth: 0, text: '인도명령은 법원 앞 법무사에게 대리로 맡겨도 된다' },
        ],
      },
      {
        label: '② 내용증명',
        rows: [
          { id: 'ev.s10', depth: 0, text: '이제부터는 점유자에게 법적 절차가 진행된다는 것을 알린다' },
          { id: 'ev.s11', depth: 0, text: '연락처를 알면 연락으로, 모르면 내용증명으로 소통을 이어 간다' },
          { id: 'ev.s12', depth: 0, text: '소통과 법적 절차는 함께 간다 — 법적 절차가 보험이다' },
        ],
      },
      {
        label: '③ 결정문\n송달',
        rows: [
          { id: 'ev.s13', depth: 0, text: '인도명령 신청 뒤 1~2주 안에 결정문이 나온다' },
          { id: 'ev.s14', depth: 0, text: '결정문은 낙찰자·점유자 모두에게 전달된다' },
        ],
      },
      {
        label: '④ 강제집행\n신청',
        rows: [
          { id: 'ev.s15', depth: 0, text: '결정문이 양쪽에 모두 송달되어야 신청할 수 있다' },
          { id: 'ev.s16', depth: 0, text: '신청한다고 바로 집행하지 않는다 — 먼저 계고가 나간다' },
          { id: 'ev.s17', depth: 0, text: '계고부터는 집행관이 실제로 현장에 나와 문을 연다' },
          { id: 'ev.s18', depth: 0, text: '연락이 닿지 않던 점유자도 이 단계에서 95%는 협의가 된다' },
        ],
      },
      {
        label: '⑤ 강제집행\n실시',
        rows: [
          { id: 'ev.s19', depth: 0, text: '여기까지 가는 경우는 5% 안팎이다' },
          { id: 'ev.s20', depth: 0, text: '집행관과 노무 인원이 출동해 진행한다' },
        ],
      },
    ],
  },
  {
    key: 'ev.deal',
    title: '명도 협상을 하는 방법',
    note: '무엇을 알고 들어가는지가 값을 가른다.',
    noCheck: true,
    sections: [
      {
        label: '협상의 기본\n점유자 파악',
        rows: [
          { id: 'ev.d1', depth: 0, text: '누구인가 — 채무자 / 임차인 / 제3의 정체 불명인' },
          { id: 'ev.d2', depth: 0, text: '거주형태(1인·2인) · 의사소통 난이도' },
        ],
      },
      {
        label: '점유자 상황\n(원하는 바)',
        rows: [
          { id: 'ev.d3', depth: 0, text: '이사비' },
          { id: 'ev.d4', depth: 0, text: '이사기간' },
        ],
      },
      {
        label: '점유자 반응',
        rows: [
          { id: 'ev.d5', depth: 0, text: '순응적 / 적대적 / 회피형' },
        ],
      },
      {
        label: '협상의 기술',
        rows: [
          { id: 'ev.d6', depth: 0, text: '공동 투자자 불러오기' },
          { id: 'ev.d7', depth: 0, text: '3자 화법' },
          { id: 'ev.d8', depth: 0, text: '얼리버드 전략 — 빨리 비울수록 좋은 조건' },
          { id: 'ev.d9', depth: 0, text: '제안에 무반응이면 → 상한선을 제시한다' },
          { id: 'ev.d10', depth: 0, text: '협의점이 보이지 않으면 강제 계고까지 빠르게 진행한다' },
        ],
      },
    ],
  },
];
