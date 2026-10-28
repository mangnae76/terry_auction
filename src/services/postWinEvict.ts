// 낙찰이후 · 명도 — 절차와 시기별 할 일, 협상하는 법.
// 꼴은 다른 탭과 같다(묶음 이름 | 내용). 절차·협상은 읽어 두는 글이라 체크가 없고,
// 시기별 진행내용만 챙길 일이라 체크를 둔다.
import type { CheckGroup } from './postWinChecklist';

/** 기본 글의 판 — 글을 고쳐 내보낼 때 올린다 */
export const POST_WIN_EVICT_VERSION = 22;

export const POST_WIN_EVICT: CheckGroup[] = [
  {
    key: 'ev.flow',
    title: '명도절차',
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
    // 때마다 할 일이 다르다 — 그림으로 적는다
    noCheck: true,
    branches: [{
      pill: '낙찰 당일',
      head: '낙찰 당일 당황하지 말고 1, 2번을 실행합니다.',
      steps: [
        {
          no: '1',
          label: '관리소 방문\n동대표 탐문',
          items: ['내 전화번호 남기고, 점유자에게 전화요청하기', '미납관리비 최신화 (공용부/전용부 구분)'],
        },
        {
          no: '2',
          label: '경매물건\n세대방문',
          items: ['낙찰자임을 알리는 포스트잇 붙이기', '주변세대(위·아래·옆) 방문 후 점유 상태 확인', '점유자 만나 당일 협상 내용 고지'],
        },
      ],
      notes: [
        '낙찰 받고 당장 내용증명 보내기 등을 하실 필요 없습니다.',
        "잔금 납부 전까지 낙찰자는 '소유자'가 아닙니다.",
        '점유자를 만났다면 당일 협상 내용을 고지합니다.',
      ],
    }, {
      pill: '잔금 납부 전',
      head: "잔금 납부 전까지는 '소통'만 하시면 됩니다.",
      steps: [
        {
          no: '1',
          label: '연락 기다리기',
          items: [
            '세대 앞에 남긴 연락처로 연락 주기를 기다린다',
            '다시 한번 세대 방문을 해도 좋다',
          ],
        },
        {
          no: '2',
          label: '쪽지 남기기',
          items: ['쪽지 한 번 더 남기기'],
        },
      ],
      notes: ['아직은 기다리는 것이 베스트입니다. 일단 잔금 납부까지 기다려보세요'],
    }, {
      pill: '잔금 납부 후',
      head: '이제는 소통 + 법적 절차를 동시 진행합니다.',
      steps: [
        {
          no: '1',
          label: '인도명령 신청하기',
          items: ['잔금 납부와 동시에 인도명령 반드시 신청', '인도명령은 법무사 선택 후 서비스로 부탁'],
        },
        {
          no: '2',
          label: '내용증명 발송',
          items: ['점유자에게 법적 절차가 공식적으로 진행된다는 내용 공지'],
        },
      ],
      notes: [
        '연락처를 안다면 연락처로, 모르면 내용증명을 보내서 소통을 계속합니다.',
        '소통과 동시에 법적 절차를 동시 진행하세요 (보험)',
      ],
    }, {
      pill: '잔금 납부 후',
      head: '이제는 소통 + 법적 절차를 동시 진행합니다.',
      steps: [
        {
          no: '3',
          label: '인도명령\n결정문 송달',
          items: ['인도명령 신청 후 1~2주 안에 결정문 나옴', '결정문은 낙찰자 / 점유자 모두에게 전달됨'],
        },
        {
          no: '4',
          label: '강제집행 신청',
          items: [
            '인도명령 결정문이 양측에 송달되어야 강제집행 신청 가능',
            '일단 계고 진행',
          ],
        },
      ],
      notes: [
        '강제집행 계고부터는 실제 집행관님이 현장에 출두하여 개문합니다.',
        '아무리 연락 안되던 점유자라도, 이 단계에서 95%는 명도 협의가 됩니다.',
      ],
    }, {
      pill: '잔금 납부 후',
      head: '이제는 소통 + 법적 절차를 동시 진행합니다.',
      steps: [
        {
          no: '5',
          label: '강제집행 실시',
          items: ['여기까지 진행되는 경우는 5% 내외', '강제집행은 집행관 + 노무 인원이 진행'],
        },
      ],
    }],
    sections: [],
  },
  {
    // 틀만 둔다 — 내용은 사용자가 그림/글로 채운다
    key: 'ev.deal',
    title: '명도 협상 방법',
    noCheck: true,
    grid: {
      chip: '명도 협상의 기본',
      cols: [
        {
          title: '점유자 파악',
          items: ['채무자', '임차인', '제3의 정체 불명인', '거주형태 (1인/2인)', '의사소통 난이도'],
        },
        {
          title: '점유자 상황 파악\n(원하는 바)',
          items: ['이사비', '이사기간'],
        },
        {
          title: '점유자 반응 파악',
          items: ['순응적', '적대적', '회피형'],
        },
      ],
    },
    stacks: [{
      chip: '명도 협상의 기술',
      items: [
        '공동 투자자 불러오기',
        '3자화법 (너무 유명)',
        '얼리버드 전략',
        '제안에 대해 무반응 → 상한선 제시',
        '협의점이 안 보일 경우, 강제 계고까지 스피드 하게 진행',
      ],
    }],
    sections: [],
  },
  {
    // 절차진행 '점유자 다시 연락 · 재방문' (웹만) — 첫날 못 만났거나 연락이 없을 때
    key: 'ev.revisit',
    title: '점유자 다시 연락 · 재방문',
    note: "잔금 납부 전까지는 '소통'만 — 만날 때까지 여러 번 나눠 찾아간다",
    webOnly: true,
    sections: [
      {
        label: '기다리기',
        rows: [
          { id: 'ev.rev.w1', depth: 0, text: '남긴 연락처로 연락 오는지 며칠 기다리기' },
          { id: 'ev.rev.w2', depth: 0, text: '관리소 · 동대표에게 점유자 연락 부탁' },
        ],
      },
      {
        label: '다시 찾아가기',
        rows: [
          { id: 'ev.rev.v1', depth: 0, text: '시간을 바꿔 방문(저녁 · 주말)' },
          { id: 'ev.rev.v2', depth: 0, text: '못 만나면 쪽지 · 연락처 다시 남기기' },
          { id: 'ev.rev.v3', depth: 0, text: '만나면 협상내용대로 고지(이사는 잔금 납부일까지)' },
        ],
      },
      {
        label: '그래도 안 되면',
        rows: [
          { id: 'ev.rev.n1', depth: 0, text: '내용증명 준비 → 잔금 납부와 함께 인도명령 신청', warn: true },
        ],
      },
    ],
  },
  {
    // 절차진행 '이사 날짜 협의 및 확정'의 체크리스트 (웹만) — 협의 → 확정 → 이사 당일
    key: 'ev.move',
    title: '이사 날짜 협의 및 확정',
    webOnly: true,
    sections: [
      {
        label: '협의',
        rows: [
          { id: 'ev.move.t1', depth: 0, text: '잔금 납부일을 알리고 그 전에 이사하도록 요청' },
          { id: 'ev.move.t2', depth: 0, text: '이사 희망일 · 이사 갈 곳 확인' },
          { id: 'ev.move.t3', depth: 0, text: '이사비 요구 시 조건 정리 — 지급은 집을 비운 뒤', warn: true },
        ],
      },
      {
        label: '확정',
        rows: [
          { id: 'ev.move.d1', depth: 0, text: '이사 날짜 합의서 작성 · 서명' },
          { id: 'ev.move.d2', depth: 0, text: '관리비 · 공과금 정산 날짜 맞추기' },
        ],
      },
      {
        label: '이사 당일',
        rows: [
          { id: 'ev.move.m1', depth: 0, text: '집 상태 확인(파손 · 짐 남김)' },
          { id: 'ev.move.m2', depth: 0, text: '열쇠 · 출입카드 인수, 명도확인서 받기' },
        ],
      },
    ],
  },
  {
    // 절차진행 '인도명령 신청' (웹만)
    key: 'ev.order',
    title: '인도명령 신청',
    note: '잔금을 낸 날부터 6개월 안에 신청할 수 있다 — 잔금 납부와 함께 내는 것이 가장 빠르다',
    webOnly: true,
    sections: [
      {
        label: '준비',
        rows: [
          { id: 'ev.order.p1', depth: 0, text: '상대방(점유자) 확정 — 채무자 · 소유자 · 대항력 없는 임차인 등' },
          { id: 'ev.order.p2', depth: 0, text: '점유자 이름 · 주소는 매각물건명세서 · 현황조사서로 확인' },
        ],
      },
      {
        label: '신청',
        rows: [
          { id: 'ev.order.a1', depth: 0, text: '전자소송포털 또는 경매계에 부동산인도명령 신청서 제출' },
          { id: 'ev.order.a2', depth: 0, text: '인지대 · 송달료 납부(상대방 수만큼)' },
          { id: 'ev.order.a3', depth: 0, text: '법무사에 맡길 때는 잔금 · 등기와 함께 의뢰' },
        ],
      },
      {
        label: '확인',
        rows: [
          { id: 'ev.order.c1', depth: 0, text: '사건번호 받아 두기 — 진행은 전자소송 · 대법원 사건검색으로' },
          { id: 'ev.order.c2', depth: 0, text: '심문서 · 보정명령이 오면 기한 안에 답하기', warn: true },
        ],
      },
    ],
  },
  {
    // 절차진행 '내용증명 발송' (웹만)
    key: 'ev.notice',
    title: '내용증명 발송',
    note: '법적 절차를 시작했다는 것을 문서로 남긴다 — 협상을 앞당기는 효과가 크다',
    webOnly: true,
    sections: [
      {
        label: '적을 내용',
        rows: [
          { id: 'ev.notice.w1', depth: 0, text: '낙찰 · 잔금 납부로 소유권을 얻은 사실' },
          { id: 'ev.notice.w2', depth: 0, text: '집을 비워 달라는 요청과 기한(날짜)' },
          { id: 'ev.notice.w3', depth: 0, text: '기한을 넘기면 강제집행 · 점유 기간 사용료(부당이득) 청구' },
          { id: 'ev.notice.w4', depth: 0, text: '연락처 — 협의는 언제든 열려 있다는 한 줄' },
        ],
      },
      {
        label: '보내기',
        rows: [
          { id: 'ev.notice.s1', depth: 0, text: '3부 작성(받는 사람 · 우체국 · 내 보관)' },
          { id: 'ev.notice.s2', depth: 0, text: '우체국 창구 또는 인터넷우체국으로 발송' },
          { id: 'ev.notice.s3', depth: 0, text: '배달 결과(수령 · 반송) 확인하고 사본 보관' },
        ],
      },
    ],
  },
  {
    // 절차진행 '인도명령 결정문 송달 확인' (웹만)
    key: 'ev.serve',
    title: '인도명령 결정문 송달',
    note: '결정문이 점유자에게 닿아야 강제집행을 신청할 수 있다',
    webOnly: true,
    sections: [
      {
        label: '확인',
        rows: [
          { id: 'ev.serve.c1', depth: 0, text: '송달 결과 확인 — 전자소송 송달내역 또는 사건검색' },
        ],
      },
      {
        label: '안 닿을 때',
        rows: [
          { id: 'ev.serve.f1', depth: 0, text: '폐문부재면 특별송달(야간 · 휴일) 신청' },
          { id: 'ev.serve.f2', depth: 0, text: '그래도 안 되면 공시송달 신청', warn: true },
        ],
      },
      {
        label: '집행 준비',
        rows: [
          { id: 'ev.serve.d1', depth: 0, text: '송달증명원 발급' },
          { id: 'ev.serve.d2', depth: 0, text: '결정문 정본에 집행문 부여 신청' },
        ],
      },
    ],
  },
  {
    // 절차진행 '강제집행 신청' (웹만)
    key: 'ev.execApply',
    title: '강제집행 신청',
    note: '집행관사무소에 접수하면 현장 확인 뒤 계고(자진 퇴거 안내)부터 한다',
    webOnly: true,
    sections: [
      {
        label: '서류',
        rows: [
          { id: 'ev.exa.d1', depth: 0, text: '집행문을 붙인 인도명령 결정문 정본' },
          { id: 'ev.exa.d2', depth: 0, text: '송달증명원' },
          { id: 'ev.exa.d3', depth: 0, text: '강제집행 신청서 · 신분증 · 도장' },
        ],
      },
      {
        label: '접수',
        rows: [
          { id: 'ev.exa.a1', depth: 0, text: '관할 법원 집행관사무소에 접수' },
          { id: 'ev.exa.a2', depth: 0, text: '집행 예납금 납부' },
          { id: 'ev.exa.a3', depth: 0, text: '계고 날짜 · 집행관 연락처 받아 두기' },
        ],
      },
    ],
  },
  {
    // 절차진행 '강제집행 실시' (웹만)
    key: 'ev.exec',
    title: '강제집행 실시',
    note: '계고 뒤에도 나가지 않으면 집행일이 잡힌다 — 그 전까지도 협의는 계속한다',
    webOnly: true,
    sections: [
      {
        label: '집행 전',
        rows: [
          { id: 'ev.exe.b1', depth: 0, text: '집행일 · 노무 인원 · 비용 예납 확인' },
          { id: 'ev.exe.b2', depth: 0, text: '참관할 증인(성인 2명) 준비' },
          { id: 'ev.exe.b3', depth: 0, text: '짐 보관 창고 정하기' },
        ],
      },
      {
        label: '집행 당일',
        rows: [
          { id: 'ev.exe.d1', depth: 0, text: '집행관과 함께 참관, 짐 목록 · 사진 남기기' },
          { id: 'ev.exe.d2', depth: 0, text: '열쇠 교체 · 집 상태 확인' },
        ],
      },
      {
        label: '집행 뒤',
        rows: [
          { id: 'ev.exe.a1', depth: 0, text: '보관한 짐 처리 절차 진행(찾아가지 않으면 법원 절차로)', warn: true },
          { id: 'ev.exe.a2', depth: 0, text: '관리비 · 공과금 정산, 명의 변경' },
        ],
      },
    ],
  },
];
