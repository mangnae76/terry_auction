// 머리글의 프로필 메뉴에 드는 줄 — 두 가지뿐이다.
// 포인트내역·결제관리·결제하기는 메뉴 위쪽 회원정보 줄에서 바로 가고,
// 보관함·휴지통·알림설정·무료체험·회원탈퇴는 마이페이지 화면의 카드에 있다.
export interface MyPageItem {
  name: string;
  desc: string;
  /** 빈 값이면 아직 화면이 없는 항목 — 부르는 쪽이 '준비 중' 안내를 띄운다 */
  path: string;
  query?: Record<string, string>;
}

export const MY_PAGE_ITEMS: MyPageItem[] = [
  { name: '정보수정', desc: '닉네임·계정 정보 보기', path: '/profile' },
  { name: '결제관리', desc: '결제 내역·영수증 보기', path: '/payments' },
  { name: '중개업체 관리', desc: '중개업체 리스트 — 상호·지역·연락처·평가 더하고 빼기', path: '/agencies' },
];
