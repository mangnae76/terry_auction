// 지도 한 벌 — 카카오맵이 열리면 카카오맵, 못 열면(키 없음 · 도메인 미등록 · 막힘) 지금처럼 브이월드(Leaflet).
// 화면은 여기 몇 가지(범위 맞추기 · 원 · 선 · 표식 · 지우기)만 부른다 — 지도를 바꿔도 화면 코드는 그대로.
// 표식은 상자(className)에 html 을 넣는다. size 가 없으면 크기 0 인 상자의 왼쪽 위가 그 좌표(화면 CSS 가 점 · 이름표를 놓는다),
// size 가 있으면 그 크기 상자의 한가운데가 그 좌표다.
import L from 'leaflet';
import { addBaseTiles } from './mapTiles';

export type LatLng = { lat: number; lng: number };
export type CircleStyle = { color: string; weight?: number; dash?: boolean; fillOpacity?: number };
export type LineStyle = { color: string; weight?: number; opacity?: number; dash?: boolean };
export type PinOpts = {
  className: string; html: string; z?: number;
  /** [가로, 세로] — 주면 상자 한가운데가 좌표 */
  size?: [number, number];
  onClick?: () => void;
  /** 누르면 위에 뜨는 말풍선 */
  popup?: { html: string; className?: string };
  /** false — 눌러도 아무 일 없게(화살표 같은 장식) */
  interactive?: boolean;
};
export type MapOpts = {
  center?: LatLng;
  /** Leaflet 확대 단계 기준(카카오는 비슷한 단계로 바꾼다) */
  zoom?: number;
  zoomControl?: 'topright' | 'topleft' | false;
  /** 브이월드(Leaflet)에만 — 휠 확대 세기 등 */
  leaflet?: L.MapOptions;
  /** 카카오맵 — 화면이 오른쪽 지도 도구 막대(components/KakaoMapTools)를 붙인다. 카카오 기본 확대 · 지도종류 단추는 막대 안으로 들어가 따로 달지 않는다 */
  kakaoTools?: boolean;
};
/** 찍은 표식 — 나중에 글 · 앞뒤 순서를 바꾼다 */
export interface PinHandle {
  el(): HTMLElement | null;
  setHtml(html: string): void;
  setZ(z: number): void;
}
export interface MapView {
  kind: 'kakao' | 'leaflet';
  /** 가운데에서 반지름 meters 가 다 보이게(조금 여유) */
  fitRadius(c: LatLng, meters: number): void;
  /** 점들이 다 보이게 — pad 는 가장자리 여백(px), maxZoom 보다 가까이는 가지 않는다. animate=false 면 확대 움직임 없이 바로 */
  fitPoints(points: LatLng[], pad?: number, maxZoom?: number, animate?: boolean): void;
  /** 그 점으로 옮기고, 지금보다 멀면 minZoom 까지 당긴다 */
  focus(p: LatLng, minZoom: number): void;
  circle(c: LatLng, meters: number, s: CircleStyle): void;
  line(points: LatLng[], s: LineStyle): void;
  pin(p: LatLng, o: PinOpts): PinHandle;
  clear(): void;
  /** true — 한 손가락 끌기 · 휠 확대를 막는다(두 손가락 · 두 번 눌러 확대는 그대로) */
  setLocked(locked: boolean): void;
  onClick(fn: () => void): void;
  /** 숨겨져 있던 칸이 보이거나 크기가 바뀔 때 — 다시 잰다 */
  relayout(): void;
  /** 지금 보이는 범위의 지도 조각을 다 받을 때까지 — 받을 것이 없으면 바로 */
  tilesReady(): Promise<void>;
  destroy(): void;
  /** 카카오맵일 때만 — 지도 도구 막대가 직접 다룬다(k = kakao.maps, map = 지도) */
  native?: { k: KakaoMaps; map: KakaoMaps };
}

// ===== 카카오맵 웹 SDK — 한 번만 불러온다. 6초 안에 못 열면 브이월드로 =====
const KAKAO_KEY = (import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY as string | undefined) ?? '';
type KakaoMaps = any;   // eslint-disable-line @typescript-eslint/no-explicit-any
let kakaoP: Promise<KakaoMaps | null> | null = null;
export const loadKakaoMaps = (): Promise<KakaoMaps | null> => {
  if (kakaoP) return kakaoP;
  kakaoP = new Promise((ok) => {
    const w = window as unknown as { kakao?: { maps?: KakaoMaps } };
    if (!KAKAO_KEY) { ok(null); return; }
    if (w.kakao?.maps?.LatLng) { ok(w.kakao.maps); return; }
    const done = (v: KakaoMaps | null) => { window.clearTimeout(t); ok(v); };
    const t = window.setTimeout(() => ok(null), 6000);
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_KEY)}&autoload=false&libraries=services`;   // services — 장소 · 주소 검색(지도 도구)
    s.async = true;
    s.onload = () => { try { w.kakao!.maps!.load(() => done(w.kakao!.maps!)); } catch { done(null); } };
    s.onerror = () => done(null);
    document.head.appendChild(s);
  });
  return kakaoP;
};

// 사이트 공통 img 규칙(max-width:100% 등)이 카카오 지도 조각을 찌그러뜨리지 않게, 말풍선 모양 — 한 번만 넣는다
let kakaoCss = false;
const addKakaoCss = () => {
  if (kakaoCss) return;
  kakaoCss = true;
  const st = document.createElement('style');
  st.textContent = [
    '.kmap-box img{max-width:none!important;max-height:none!important}',
    '.kpop{position:relative;margin-bottom:26px;background:#fff;border-radius:10px;box-shadow:0 3px 14px rgba(0,0,0,.25);padding:10px 14px;white-space:nowrap;font-size:13px;color:#111827}',
    '.kpop::after{content:"";position:absolute;left:50%;bottom:-7px;width:14px;height:14px;margin-left:-7px;background:#fff;transform:rotate(45deg);box-shadow:3px 3px 6px rgba(0,0,0,.12)}',
  ].join('');
  document.head.appendChild(st);
};

const box = (o: PinOpts) => {
  const el = document.createElement('div');
  el.className = `mv-pin ${o.className}`;   // mv-pin — 모든 지도 표식 공통(마우스 화살표, style.css)
  el.innerHTML = o.html;
  if (o.size) { el.style.width = `${o.size[0]}px`; el.style.height = `${o.size[1]}px`; }
  if (o.interactive === false) el.style.pointerEvents = 'none';
  return el;
};
const spanOf = (c: LatLng, meters: number) => {
  const dLat = meters / 111000;
  const dLng = meters / (111000 * Math.cos((c.lat * Math.PI) / 180));
  return { dLat, dLng };
};

const kakaoView = (k: KakaoMaps, el: HTMLElement, opts: MapOpts): MapView => {
  addKakaoCss();
  el.classList.add('kmap-box');
  const c0 = opts.center ?? { lat: 37.5, lng: 126.7 };
  // Leaflet 확대 단계 → 카카오 지도 단계(숫자가 작을수록 가깝다)
  const levelOf = (zoom: number) => Math.max(1, Math.min(14, Math.round(20 - zoom)));
  const map = new k.Map(el, { center: new k.LatLng(c0.lat, c0.lng), level: levelOf(opts.zoom ?? 15) });
  if (opts.zoomControl !== false && !opts.kakaoTools) {
    const at = opts.zoomControl === 'topleft' ? k.ControlPosition.TOPLEFT : k.ControlPosition.TOPRIGHT;
    map.addControl(new k.MapTypeControl(), at);   // 지도 · 스카이뷰(위성) 바꾸기 — 확대 단추 위에
    map.addControl(new k.ZoomControl(), at);
  }
  // 손바닥으로 끌어 옮기기 · 휠 / 두 번 눌러 확대 — 처음부터 다 켠다(잠그는 건 화면이 setLocked 로)
  map.setDraggable(true); map.setZoomable(true);
  // 카카오 로고 · 축척은 오른쪽 아래 — 왼쪽은 웹의 경로설정 · 통계 판, 가격분석 범례가 덮는다(로고는 가리면 안 된다)
  map.setCopyrightPosition(k.CopyrightPosition.BOTTOMRIGHT, true);
  let items: Array<{ setMap: (m: unknown) => void }> = [];
  let pop: { setMap: (m: unknown) => void } | null = null;
  const closePop = () => { pop?.setMap(null); pop = null; };
  k.event.addListener(map, 'click', closePop);
  const bounds = (points: LatLng[]) => { const b = new k.LatLngBounds(); points.forEach((p) => b.extend(new k.LatLng(p.lat, p.lng))); return b; };
  return {
    kind: 'kakao',
    native: { k, map },
    fitRadius(c, meters) {
      const { dLat, dLng } = spanOf(c, meters * 1.15);
      map.setBounds(bounds([{ lat: c.lat - dLat, lng: c.lng - dLng }, { lat: c.lat + dLat, lng: c.lng + dLng }]), 0, 0, 0, 0);
    },
    fitPoints(points, pad = 40, maxZoom) {
      if (!points.length) return;
      if (points.length === 1) map.setCenter(new k.LatLng(points[0].lat, points[0].lng));
      else map.setBounds(bounds(points), pad, pad, pad, pad);
      if (maxZoom != null && map.getLevel() < levelOf(maxZoom)) map.setLevel(levelOf(maxZoom));
    },
    focus(p, minZoom) {
      if (map.getLevel() > levelOf(minZoom)) map.setLevel(levelOf(minZoom));
      map.panTo(new k.LatLng(p.lat, p.lng));
    },
    circle(c, meters, s) {
      const o = new k.Circle({
        center: new k.LatLng(c.lat, c.lng), radius: meters,
        strokeWeight: s.weight ?? 1.6, strokeColor: s.color, strokeOpacity: 1, strokeStyle: s.dash ? 'dash' : 'solid',
        fillColor: s.color, fillOpacity: s.fillOpacity ?? 0.06,
      });
      o.setMap(map); items.push(o);
    },
    line(points, s) {
      const o = new k.Polyline({
        path: points.map((p) => new k.LatLng(p.lat, p.lng)),
        strokeWeight: s.weight ?? 4, strokeColor: s.color, strokeOpacity: s.opacity ?? 0.85, strokeStyle: s.dash ? 'shortdash' : 'solid',
      });
      o.setMap(map); items.push(o);
    },
    pin(p, o) {
      const content = box(o);
      content.style.position = 'relative';   // 안쪽 그림(절대 위치)이 이 상자를 기준으로 서게
      const at = new k.LatLng(p.lat, p.lng);
      if (o.onClick || o.popup) {
        content.addEventListener('click', (e) => {
          e.stopPropagation();
          o.onClick?.();
          if (!o.popup) return;
          closePop();
          const pe = document.createElement('div');
          pe.className = `kpop ${o.popup.className ?? ''}`;
          pe.innerHTML = o.popup.html;
          const next = new k.CustomOverlay({ position: at, content: pe, xAnchor: 0.5, yAnchor: 1, zIndex: 3000, clickable: true });
          next.setMap(map);
          pop = next;
        });
      }
      const ov = new k.CustomOverlay({
        // 누를 일이 있는 표식만 클릭을 잡는다 — 선정물건 같은 표식 위를 눌러도 지도(재기 · 반경 도구)로 간다
        position: at, content, zIndex: o.z ?? 1, clickable: o.interactive !== false && !!(o.onClick || o.popup),
        xAnchor: o.size ? 0.5 : 0, yAnchor: o.size ? 0.5 : 0,
      });
      ov.setMap(map); items.push(ov);
      return { el: () => content, setHtml: (h) => { content.innerHTML = h; }, setZ: (z) => ov.setZIndex(z) };
    },
    clear() { closePop(); items.forEach((x) => x.setMap(null)); items = []; },
    setLocked(locked) { map.setDraggable(!locked); map.setZoomable(!locked); },
    onClick(fn) { k.event.addListener(map, 'click', fn); },
    relayout() { map.relayout(); },
    tilesReady() { return new Promise<void>((res) => { let done = false; const fin = () => { if (!done) { done = true; res(); } }; k.event.addListener(map, 'tilesloaded', fin); window.setTimeout(fin, 1500); }); },
    destroy() { closePop(); items.forEach((x) => x.setMap(null)); items = []; el.innerHTML = ''; el.classList.remove('kmap-box'); },
  };
};

const leafletView = (el: HTMLElement, opts: MapOpts): MapView => {
  const c0 = opts.center ?? { lat: 37.5, lng: 126.7 };
  // 웹은 같은 칸에 지도를 또 만들면 있던 지도를 돌려준다(web/lib/shared.entry) — 그때 확대 단추 · 바닥 지도를 두 번 붙이지 않는다
  const reused = !!el.querySelector('.leaflet-pane');
  const map = L.map(el, { zoomControl: false, ...opts.leaflet }).setView([c0.lat, c0.lng], opts.zoom ?? 15);
  if (!reused && opts.zoomControl !== false) L.control.zoom({ position: opts.zoomControl ?? 'topright' }).addTo(map);
  if (!reused) addBaseTiles(map);
  const layer = L.layerGroup().addTo(map);
  const ll = (p: LatLng) => L.latLng(p.lat, p.lng);
  return {
    kind: 'leaflet',
    fitRadius(c, meters) { map.fitBounds(ll(c).toBounds(meters * 2.3), { animate: false }); },
    fitPoints(points, pad = 40, maxZoom, animate) {
      if (!points.length) return;
      const an = animate === false ? { animate: false } : {};
      if (points.length === 1) { map.setView(ll(points[0]), map.getZoom(), an); return; }
      map.fitBounds(L.latLngBounds(points.map(ll)), { padding: [pad, pad], ...(maxZoom != null ? { maxZoom } : {}), ...an });
    },
    focus(p, minZoom) { map.setView(ll(p), Math.max(map.getZoom(), minZoom), { animate: true }); },
    circle(c, meters, s) {
      L.circle(ll(c), { radius: meters, color: s.color, weight: s.weight ?? 1.6, dashArray: s.dash ? '7 5' : undefined, fillColor: s.color, fillOpacity: s.fillOpacity ?? 0.06 }).addTo(layer);
    },
    line(points, s) {
      L.polyline(points.map(ll), { color: s.color, weight: s.weight ?? 4, opacity: s.opacity ?? 0.85, dashArray: s.dash ? '6 6' : undefined }).addTo(layer);
    },
    pin(p, o) {
      const iconOf = (html: string) => L.divIcon({
        className: `mv-pin ${o.className}`, html,
        iconSize: o.size ?? [0, 0], ...(o.size ? { iconAnchor: [o.size[0] / 2, o.size[1] / 2] as [number, number] } : {}),
      });
      const icon = iconOf(o.html);
      const mk = L.marker(ll(p), { icon, keyboard: false, zIndexOffset: o.z ?? 0, interactive: o.interactive !== false });
      if (o.onClick) mk.on('click', o.onClick);
      if (o.popup) mk.bindPopup(o.popup.html, { maxWidth: 680, minWidth: 0, className: o.popup.className ?? '' });
      mk.addTo(layer);
      return { el: () => mk.getElement() ?? null, setHtml: (h) => { mk.setIcon(iconOf(h)); }, setZ: (z) => { mk.setZIndexOffset(z); } };
    },
    clear() { layer.clearLayers(); },
    setLocked(locked) {
      if (locked) { map.dragging.disable(); map.scrollWheelZoom.disable(); } else { map.dragging.enable(); map.scrollWheelZoom.enable(); }
      map.touchZoom.enable(); map.doubleClickZoom.enable();
    },
    onClick(fn) { map.on('click', fn); },
    relayout() { map.invalidateSize({ animate: false }); },
    tilesReady() {
      const loading: L.TileLayer[] = [];
      map.eachLayer((l) => { if (l instanceof L.TileLayer && l.isLoading()) loading.push(l); });
      return Promise.all(loading.map((l) => new Promise<void>((res) => { l.once('load', () => res()); }))).then(() => undefined);
    },
    destroy() { map.remove(); },
  };
};

// 어느 지도를 쓸지 — .env VITE_MAP_PROVIDER(kakao | vworld). 확인 전에는 vworld 로 두고,
// 시험할 때는 브라우저에서 localStorage.mapProvider = 'kakao' 로 그 브라우저만 바꿔 본다
const provider = (): string => {
  try { const v = localStorage.getItem('mapProvider'); if (v) return v; } catch { /* 그만 */ }
  return (import.meta.env.VITE_MAP_PROVIDER as string | undefined) ?? 'vworld';
};

/** el 에 지도를 만든다 — 카카오맵을 쓰기로 했으면 먼저 해 보고, 안 되면 브이월드 */
export const createMapView = async (el: HTMLElement, opts: MapOpts = {}): Promise<MapView> => {
  const k = provider() === 'kakao' ? await loadKakaoMaps() : null;
  if (k) {
    try { return kakaoView(k, el, opts); } catch { /* 카카오가 만들다 실패 — 브이월드로 */ }
  }
  return leafletView(el, opts);
};
