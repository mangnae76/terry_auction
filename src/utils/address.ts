// 주소 줄이기 — 카드·알림처럼 한 줄에 들어가야 하는 자리에서 같이 쓴다.
//
// 시·도·구까지 다 적으면 길어서 정작 어느 집인지가 안 보인다.
// 동부터 끊어 '동 + 지번 + 건물명 + 동호수' 를 남기면 알아보는 데 넉넉하다.
// (동을 못 찾으면 뒤 두 토막만 남긴다)
export const shortAddr = (address?: string): string => {
  const parts = String(address ?? '').trim().split(/\s+/).filter(Boolean);
  const dong = parts.findIndex((v) => /[동읍면리]\d*$/.test(v) && !/^\d/.test(v));
  return (dong >= 0 ? parts.slice(dong) : parts.slice(-2)).join(' ');
};
