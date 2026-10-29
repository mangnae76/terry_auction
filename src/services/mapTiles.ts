// 배경 지도 한 곳 — 랭킹지도 · 임장경로가 같이 쓴다.
// 브이월드(국토교통부) 일반 지도, 키 없이 열리는 타일 주소. 네이버 지도로 바꿀지는 개선 리스트 12번(Client ID 필요).
import L from 'leaflet';

export const addBaseTiles = (map: L.Map) => L.tileLayer('https://xdworld.vworld.kr/2d/Base/service/{z}/{x}/{y}.png', {
  attribution: '&copy; 브이월드(국토교통부)',
  maxZoom: 19,
}).addTo(map);
