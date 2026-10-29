// 네이버 부동산 매물 보기 — 손품조사 총 매물수 · 웹 수요분석 동 줄이 같이 쓴다.
// 필터(매매 · 종류)와 동 위치를 담은 주소 꼴을 알게 되면 여기 한 곳만 바꾼다.

/** '인천광역시 서구 검암동' 같은 검색어를 클립보드에 넣고 네이버 부동산을 연다 */
export const openNaverListing = (query: string) => {
  try { void navigator.clipboard?.writeText(query); } catch { /* 복사만 못 한다 */ }
  window.open('https://m.land.naver.com/', '_blank');
};
