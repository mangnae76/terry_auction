// 네이버 부동산 매물 보기 — 손품조사 총 매물수에서 쓴다.
// 그 동 위치 · 매매 · 물건 종류 필터가 걸린 채로 지도가 열리고, 지도 아래에 '매물 N'이 바로 보인다.
//
// 주소 꼴(2026-10 네이버 부동산 새 화면, fin.land.naver.com/map)
//   tradeTypes        A1 = 매매
//   realEstateTypes   빌라 A05-A06-A07-C02 (사용자가 필터를 걸어 확인) · 아파트 A01-A04 · 오피스텔 B01
//   center            경도-위도. 각 값 × 1e7 + 2e9 를 62진수(0-9a-zA-Z)로 — 서울시청 3zhF48-2AM354 로 맞춰 봤다
//   zoom              14.8 (동 하나가 다 들어오는 정도 — 네이버 '○○동만 보기' 주소의 값)
//   showOnlySelectedRegion=true  지도 가운데의 동만 보기 — 아래 '매물 N'이 화면 범위가 아니라 그 동 매물 수가 된다

export type NaverKind = 'villa' | 'apt' | 'officetel';

const REAL_ESTATE_TYPES: Record<NaverKind, string> = {
  villa: 'A05-A06-A07-C02',
  apt: 'A01-A04',
  officetel: 'B01',
};
const LAYER = 'NobwRAlgJmBcYAsD2BbApmANGAzmghgE4DGCACkfijnCAL50C6QA';
const B62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** 좌표 하나 → 네이버 center 조각 */
export const naverCoord = (v: number) => {
  let n = Math.round(v * 1e7) + 2e9;
  let s = '';
  while (n > 0) { s = B62[n % 62] + s; n = Math.floor(n / 62); }
  return s;
};

/** 그 자리 · 그 종류 매매 매물 지도 주소 */
export const naverListingUrl = (p: { lat: number; lng: number }, kind: NaverKind) =>
  `https://fin.land.naver.com/map?layer=${LAYER}&tradeTypes=A1&realEstateTypes=${REAL_ESTATE_TYPES[kind]}`
  + `&center=${naverCoord(p.lng)}-${naverCoord(p.lat)}&zoom=14.8&showOnlySelectedRegion=true`;

/** 자리를 알면 그 자리로, 모르면 '지역 동' 검색어를 복사하고 네이버 부동산 첫 화면을 연다 */
export const openNaverListing = (query: string, place?: { lat: number; lng: number } | null, kind: NaverKind = 'villa') => {
  if (place) { window.open(naverListingUrl(place, kind), '_blank'); return; }
  try { void navigator.clipboard?.writeText(query); } catch { /* 복사만 못 한다 */ }
  window.open('https://fin.land.naver.com/map', '_blank');
};
