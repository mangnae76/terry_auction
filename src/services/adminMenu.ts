// 운영 툴 메뉴 — 무엇을 운영에서 다룰지 적어 둔 목록.
// 화면(AdminBoardPage)은 이 목록을 그리기만 한다. 아직 만들지 않은 칸은 ready: false 로 두고
// '무엇을 하는 칸인지'와 '먼저 있어야 하는 것'을 적어 둔다.

export interface OpsItem {
  /** 메뉴 번호 — 글 상자는 BoardKind 와 같은 말을 쓴다 */
  key: string;
  label: string;
  /** 하는 일 한 줄 */
  desc: string;
  /** 아직 못 만드는 까닭 — 먼저 있어야 하는 것 */
  need?: string;
  /** 지금 쓸 수 있는가 */
  ready?: boolean;
}

export interface OpsGroup {
  title: string;
  items: OpsItem[];
}

export const OPS_MENU: OpsGroup[] = [
  {
    title: '글 관리',
    items: [
      {
        key: 'banner',
        label: '이벤트 배너 관리',
        desc: '이벤트 글 하나를 배너로 띄우거나 목록에 줄로 넣는다',
        ready: true,
      },
      { key: 'notice', label: '공지 관리', desc: '점검·정책처럼 알려야 하는 것', ready: true },
      { key: 'update', label: '업데이트 관리', desc: '새로 붙은 기능·고친 것', ready: true },
      { key: 'popup', label: '앱 시작 팝업', desc: '앱을 열 때 한 번 뜨는 안내', need: '배너 구조를 그대로 쓰면 됩니다' },
    ],
  },
  {
    title: '서비스 값',
    items: [
      { key: 'maintenance', label: '점검 모드', desc: '점검 중 안내를 띄우고 쓰기를 막는다', need: '점검 상태를 담을 자리 하나' },
      { key: 'plans', label: '요금제 관리', desc: '기준가와 기간별 할인율', need: '지금은 billingPlans.ts 에 적혀 있습니다' },
      { key: 'points', label: '포인트 정책 관리', desc: '적립률·등급 기준·쓰는 단위', need: '지금은 pointPolicy.ts 에 적혀 있습니다' },
      { key: 'trial', label: '무료체험 관리', desc: '체험 일수와 안내 글', need: '지금은 trialInfo.ts 에 적혀 있습니다' },
      { key: 'faq', label: 'FAQ 관리', desc: '고객센터 도움말 묶음', need: '지금은 supportFaq.ts 에 적혀 있습니다' },
      { key: 'legal', label: '약관 관리', desc: '이용약관·개인정보처리방침 판 올리기', need: '지금은 legalTerms.ts 에 적혀 있습니다' },
    ],
  },
  {
    title: '회원',
    items: [
      { key: 'members', label: '회원 관리', desc: '회원 목록·검색·상태 보기', need: '운영자용 읽기 규칙' },
      { key: 'access', label: '접근 권한 관리', desc: '쓸 수 있는 계정 더하고 빼기', need: '허용 계정 목록을 코드 밖으로' },
      { key: 'passes', label: '이용권 관리', desc: '기간 주기·늘리기·끊기', need: '결제 만료일 저장 (지금은 임시값)' },
      { key: 'pointLedger', label: '포인트 지급·회수', desc: '손으로 넣고 빼기, 사유 남기기', need: '포인트 원장 자리' },
      { key: 'coupons', label: '쿠폰 관리', desc: '쿠폰 만들고 뿌리고 쓴 내역 보기', need: '쿠폰 자리' },
      { key: 'leave', label: '탈퇴 처리', desc: '탈퇴 신청 확인과 자료 지우기', need: '탈퇴 절차' },
    ],
  },
  {
    title: '고객 응대',
    items: [
      { key: 'inquiries', label: '문의함', desc: '1:1 문의 받고 답하기', need: '문의 자리와 받는 창구' },
      { key: 'reports', label: '제보 처리', desc: '경공매 정보 오류 신고 받기', need: '제보 자리' },
    ],
  },
  {
    title: '결제 · 알림',
    items: [
      { key: 'payments', label: '결제 내역 조회', desc: '누가 언제 얼마 냈는지', need: 'PG 연동' },
      { key: 'refunds', label: '환불 처리', desc: '취소와 부분 환불', need: 'PG 연동' },
      { key: 'push', label: '푸시 발송', desc: '알림 보내기·예약 발송·이력', need: 'FCM' },
    ],
  },
  {
    title: '지표',
    items: [
      { key: 'stats', label: '사용 통계', desc: '가입·접속·물건 수와 글 조회수', need: '집계 자리' },
    ],
  },
];

/** 메뉴 하나 찾기 */
export const opsItem = (key: string): OpsItem | undefined =>
  OPS_MENU.flatMap((g) => g.items).find((i) => i.key === key);
