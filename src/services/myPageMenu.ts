// 머리글의 프로필 메뉴에 드는 줄.
// (보관함·휴지통·알림설정은 마이페이지 화면의 카드로 가 있어 여기서는 뺐다)
export interface MyPageItem {
  name: string;
  desc: string;
  /** 빈 값이면 아직 화면이 없는 항목 — 부르는 쪽이 '준비 중' 안내를 띄운다 */
  path: string;
  query?: Record<string, string>;
}

export const MY_PAGE_ITEMS: MyPageItem[] = [
  { name: '정보 수정', desc: '닉네임·계정 정보 보기', path: '/profile' },
  { name: '중개업체 관리', desc: '중개업체 리스트 — 상호·지역·연락처·평가 더하고 빼기', path: '/agencies' },
  { name: '3일 무료체험', desc: '무료로 먼저 써 보기 — 가입 즉시 지급', path: '/trial' },
  { name: '결제하기', desc: '이용 기간 고르고 결제 진행', path: '/billing' },
  { name: '결제관리', desc: '결제 내역·영수증 보기', path: '/payments' },
  { name: '포인트내역', desc: '등급·가진 포인트와 적립/사용 내역', path: '/point-history' },
  { name: '회원탈퇴', desc: '계정과 저장된 자료 삭제', path: '/withdraw' },
];
