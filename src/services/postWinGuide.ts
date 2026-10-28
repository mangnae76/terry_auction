// 낙찰이후 · 가이드(웹) — 체크할 일이 아니라 읽어 두는 글. 코드에 둔 기본 글이다.
import type { CheckGroup } from './postWinChecklist';

export const GUIDE_DENY: CheckGroup[] = [
  {
    key: 'gd.deny',
    title: '매각불허가 신청',
    note: '낙찰 뒤 매각결정기일(보통 7일 뒤) 전까지 낸다 — 그 뒤에는 매각허가결정 취소 신청 · 즉시항고로',
    noCheck: true,
    sections: [
      {
        label: '언제',
        rows: [
          { id: 'gd.deny.w1', depth: 0, text: '매각결정기일 전까지 — 낙찰 후 약 1주' },
          { id: 'gd.deny.w2', depth: 0, text: '매각허가결정이 났으면 잔금 전까지 매각허가결정 취소 신청, 또는 결정 후 1주 안에 즉시항고(매각대금 10% 보증 공탁)' },
        ],
      },
      {
        label: '되는 사유',
        rows: [
          { id: 'gd.deny.r1', depth: 0, text: '내 책임이 아닌 사유로 집이 크게 훼손된 것을 낙찰 뒤 알았을 때 — 화재 · 누수 · 붕괴 등' },
          { id: 'gd.deny.r2', depth: 0, text: '매각물건명세서 · 현황조사서에 중대한 잘못이 있을 때 — 권리 · 점유 관계 누락 등' },
          { id: 'gd.deny.r3', depth: 0, text: '경매 중 중대한 권리관계가 바뀐 것이 드러났을 때' },
          { id: 'gd.deny.r4', depth: 0, text: '단순 수리비 · 시세를 잘못 본 것은 사유가 되지 않는다', warn: true },
        ],
      },
      {
        label: '준비',
        rows: [
          { id: 'gd.deny.p1', depth: 0, text: '훼손 사진 · 동영상(날짜가 보이게)' },
          { id: 'gd.deny.p2', depth: 0, text: '수리 견적서 · 관리사무소 확인서 · 이웃 진술 등' },
          { id: 'gd.deny.p3', depth: 0, text: '신청서를 써서 경매계에 제출 — 전자소송포털로도 낼 수 있다' },
        ],
      },
      {
        label: '결과',
        rows: [
          { id: 'gd.deny.o1', depth: 0, text: '불허가 결정이 나면 입찰보증금을 돌려받는다' },
          { id: 'gd.deny.o2', depth: 0, text: '기각되면 잔금 일정대로 진행 — 즉시항고 여부를 검토한다' },
        ],
      },
    ],
  },
];

/** 가이드 › 명도 — 명도확인서와 명도합의서는 이름이 비슷해 자주 헷갈린다 */
export const GUIDE_EVICT_DOCS: CheckGroup[] = [
  {
    key: 'gd.docs',
    title: '명도확인서와 명도합의서 차이',
    note: '명도확인서는 법원에 내는 \'이사했다\'는 확인, 명도합의서는 둘 사이의 \'언제 · 얼마에 나간다\'는 약속',
    noCheck: true,
    sections: [
      {
        label: '명도확인서',
        rows: [
          { id: 'gd.docs.h1', depth: 0, text: '낙찰자(매수인)가 임차인에게 써 준다' },
          { id: 'gd.docs.h2', depth: 0, text: '임차인이 법원에서 배당금을 받을 때 꼭 낸다 — 최선순위라도 배당을 요구했으면 필요' },
          { id: 'gd.docs.h3', depth: 0, text: '임차인이 짐을 다 빼고 이사한 것을 확인한 뒤에 써 준다' },
          { id: 'gd.docs.h4', depth: 0, text: '낙찰자 인감증명서 1통을 함께 준다' },
          { id: 'gd.docs.h5', depth: 0, text: '이사 전에 미리 써 주면 배당만 받고 나가지 않을 수 있다', warn: true },
        ],
      },
      {
        label: '명도합의서',
        rows: [
          { id: 'gd.docs.a1', depth: 0, text: '낙찰자와 점유자(임차인 · 채무자 · 불법점유자 누구든)가 함께 쓰고 서명한다' },
          { id: 'gd.docs.a2', depth: 0, text: '이사 날짜 · 이사비 · 남은 짐 처리 · 관리비 정산을 문서로 정해 둔다' },
          { id: 'gd.docs.a3', depth: 0, text: '협의가 되면 바로 쓴다 — 이사비를 줄 때는 꼭' },
          { id: 'gd.docs.a4', depth: 0, text: '신분증으로 점유자 인적사항(이름 · 생년월일 · 연락처)을 확인해 적는다' },
          { id: 'gd.docs.a5', depth: 0, text: '법원에 내는 서류는 아니다 — 약속을 어기면 증거로 쓴다' },
        ],
      },
      {
        label: '한눈에',
        rows: [
          { id: 'gd.docs.s1', depth: 0, text: '임차인이 배당받는다 → 이사 확인 뒤 명도확인서' },
          { id: 'gd.docs.s2', depth: 0, text: '이사 날짜 · 이사비를 정한다 → 명도합의서(필요하면 둘 다)' },
        ],
      },
    ],
  },
];
