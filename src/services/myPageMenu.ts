// 마이페이지 항목 — 더보기 화면과 상단 프로필 메뉴가 같은 목록을 쓴다.
// 항목을 더하거나 주소를 바꾸려면 여기 한 곳만 고치면 두 군데가 같이 바뀐다.
export interface MyPageItem {
  name: string;
  desc: string;
  /** 빈 값이면 아직 화면이 없는 항목 — 부르는 쪽이 '준비 중' 안내를 띄운다 */
  path: string;
  query?: Record<string, string>;
}

export const MY_PAGE_ITEMS: MyPageItem[] = [
  { name: '입찰 캘린더', desc: '선정물건 입찰일을 달력으로', path: '/bid-calendar' },
  { name: '나의 관심 물건', desc: '관심 단계로 담아 둔 물건', path: '/auctions/watchlist', query: { status: '임장예정' } },
  { name: '보관함', desc: '선정물건에서 치운 물건을 카드로 보고 되살리기', path: '/trash' },
  { name: '중개업소 관리', desc: '상담표 상호 목록 — 업소·연락처·평가 더하고 빼기', path: '/agencies' },
  { name: '결제 관리', desc: '구독·결제 내역 관리', path: '' },
  { name: '내 정보 수정', desc: '닉네임·비밀번호 변경', path: '' },
  { name: '알림 설정', desc: '입찰일·가격변동 알림 받기', path: '' },
  { name: '회원 탈퇴', desc: '계정과 저장된 자료 삭제', path: '' },
];
