<script setup lang="ts">
// 카카오맵 지도 도구 막대 — 지도 오른쪽에 세로로. 확대 · 로드뷰 · 지적도 · 겹침 · 거리재기 · 면적재기 · 반경표시 · 검색 · 교육(학교) · 인쇄.
// 카카오맵 기능만 쓴다(학군 경계 · 개발 정보는 카카오에 없어 넣지 않았다). 지도는 부르는 화면이 만들어 k(kakao.maps) · map 으로 넘긴다.
// 재기 · 반경은 지도를 눌러 점을 찍고, 오른쪽 클릭이나 [끝내기]로 마친다. 같은 단추를 다시 누르면 그린 것을 지운다.
import { onBeforeUnmount, ref } from 'vue';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** near — 주어지면 '주변' 단추가 생긴다(그 점 둘레 500m · 1km 안 지하철 · 버스 · 병원 · 약국 · 마트 · 편의점 · 공원 · 관공서). 웹 시세분석만 넘긴다 */
/** nearCenter — 내 물건이 없는 지도(랭킹지도)는 지금 지도에 보이는 동네 전체에서 '주변'을 찾는다. 지도를 옮기면 다시 찾는다 */
const props = defineProps<{ k: any; map: any; near?: { lat: number; lng: number } | null; nearCenter?: boolean }>();
const hasNear = () => !!props.near || !!props.nearCenter;
const nearPoint = (): { lat: number; lng: number } | null => {
  if (props.near) return props.near;
  if (!props.nearCenter) return null;
  const c = map.getCenter(); return { lat: c.getLat(), lng: c.getLng() };
};
const { k, map } = props;

type Tool = '' | 'dist' | 'area' | 'radius' | 'rv';
const tool = ref<Tool>('');
const hint = ref('');
const layerOpen = ref(false);
const searchOpen = ref(false);
const layers = ref({ district: false, sky: false, terrain: false, traffic: false, bicycle: false });
const school = ref(false);
const root = ref<HTMLElement | null>(null);

// ===== 그린 것 · 듣는 것 정리 =====
let drawn: any[] = [];          // 재기 · 반경 · 검색 · 학교 표식
let listeners: Array<[string, (e: any) => void]> = [];
const on = (type: string, fn: (e: any) => void) => { k.event.addListener(map, type, fn); listeners.push([type, fn]); };
const offAll = () => { listeners.forEach(([t, fn]) => k.event.removeListener(map, t, fn)); listeners = []; };
const clearDrawn = () => { drawn.forEach((o) => o.setMap(null)); drawn = []; };
const keep = <T,>(o: T): T => { drawn.push(o); return o; };

const fmtLen = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)}km` : `${Math.round(m)}m`);
const fmtArea = (m2: number) => `${Math.round(m2).toLocaleString('ko-KR')}㎡ (${(m2 / 3.305785).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}평)`;
const label = (pos: any, html: string, cls = '') => keep(new k.CustomOverlay({ map, position: pos, content: `<div class="kt-lbl ${cls}">${html}</div>`, xAnchor: 0, yAnchor: 1.4, zIndex: 50 }));
const dot = (pos: any) => keep(new k.CustomOverlay({ map, position: pos, content: '<span class="kt-dot"></span>', xAnchor: 0.5, yAnchor: 0.5, zIndex: 40 }));
const lenOf = (path: any[]) => new k.Polyline({ path }).getLength();

// 재는 동안은 지도 위 핀이 클릭을 가로채지 않게(핀 위를 눌러도 점이 찍히게) — 지도 상자에 표시
const measuring = (onOff: boolean) => { (root.value?.closest('.map') as HTMLElement | null)?.classList.toggle('kt-measuring', onOff); };

// ===== 확대 =====
const zoom = (d: number) => map.setLevel(Math.max(1, Math.min(14, map.getLevel() + d)), { animate: true });

// ===== 거리 · 면적 · 반경 =====
let path: any[] = [];
let live: any = null;          // 마우스를 따라오는 선 · 면 · 원
let liveLbl: any = null;
let first: any = null;         // 반경 가운데
let shape: any = null;         // 그리는 중인 선 · 면
const stopDraw = () => {
  live?.setMap(null); live = null;
  liveLbl?.setMap(null); liveLbl = null;
  path = []; shape = null; first = null;
};
const finish = () => {
  if (tool.value === 'dist' && path.length > 1) label(path[path.length - 1], `총거리 <b>${fmtLen(lenOf(path))}</b> · 도보 약 ${Math.max(1, Math.round(lenOf(path) / 67))}분`, 'end');
  if (tool.value === 'area' && path.length > 2) label(path[path.length - 1], `면적 <b>${fmtArea(new k.Polygon({ path }).getArea())}</b>`, 'end');
  if (shape && tool.value === 'area' && path.length < 3) shape.setMap(null);
  stopDraw();
};
const startTool = (t: Tool) => {
  offAll(); stopDraw(); clearDrawn();
  if (tool.value === 'rv') { map.removeOverlayMapTypeId(k.MapTypeId.ROADVIEW); rvClose(); }
  if (tool.value === t) { tool.value = ''; hint.value = ''; measuring(false); return; }   // 같은 단추 — 끄면서 지운다
  tool.value = t;
  measuring(t === 'dist' || t === 'area' || t === 'radius');
  layerOpen.value = false; searchOpen.value = false;
  if (t === 'dist') {
    hint.value = '지도를 눌러 점을 찍으세요 · 오른쪽 클릭이나 [끝내기]로 마칩니다';
    on('click', (e) => {
      const p = e.latLng;
      if (!shape) { shape = keep(new k.Polyline({ map, path: [p], strokeWeight: 3, strokeColor: '#e03e3e', strokeOpacity: 0.9 })); path = [p]; }
      else { path.push(p); shape.setPath(path); label(p, fmtLen(lenOf(path))); }
      dot(p);
    });
    on('mousemove', (e) => {
      if (!shape) return;
      const seg = [path[path.length - 1], e.latLng];
      if (!live) live = new k.Polyline({ map, path: seg, strokeWeight: 3, strokeColor: '#e03e3e', strokeOpacity: 0.5, strokeStyle: 'dash' });
      else live.setPath(seg);
      const total = lenOf(path) + lenOf(seg);
      if (!liveLbl) liveLbl = new k.CustomOverlay({ map, position: e.latLng, content: '<div class="kt-lbl live"></div>', xAnchor: 0, yAnchor: 1.4, zIndex: 60 });
      liveLbl.setPosition(e.latLng);
      liveLbl.setContent(`<div class="kt-lbl live">${fmtLen(total)}</div>`);
    });
    on('rightclick', finish);
  } else if (t === 'area') {
    hint.value = '지도를 눌러 꼭짓점을 찍으세요 · 오른쪽 클릭이나 [끝내기]로 마칩니다';
    on('click', (e) => {
      path.push(e.latLng);
      if (!shape) shape = keep(new k.Polygon({ map, path, strokeWeight: 2, strokeColor: '#2b6df3', strokeOpacity: 0.9, fillColor: '#2b6df3', fillOpacity: 0.15 }));
      else shape.setPath(path);
      dot(e.latLng);
    });
    on('mousemove', (e) => {
      if (!path.length) return;
      const p = [...path, e.latLng];
      if (!live) live = new k.Polygon({ map, path: p, strokeWeight: 1, strokeColor: '#2b6df3', strokeStyle: 'dash', fillColor: '#2b6df3', fillOpacity: 0.08 });
      else live.setPath(p);
      if (!liveLbl) liveLbl = new k.CustomOverlay({ map, position: e.latLng, content: '', xAnchor: 0, yAnchor: 1.4, zIndex: 60 });
      liveLbl.setPosition(e.latLng);
      liveLbl.setContent(`<div class="kt-lbl live">${p.length > 2 ? fmtArea(new k.Polygon({ path: p }).getArea()) : '점을 더 찍으세요'}</div>`);
    });
    on('rightclick', finish);
  } else if (t === 'radius') {
    hint.value = '가운데를 누르고, 반경 끝을 한 번 더 누르세요';
    on('click', (e) => {
      if (!first) { first = e.latLng; dot(first); return; }
      const r = lenOf([first, e.latLng]);
      keep(new k.Circle({ map, center: first, radius: r, strokeWeight: 2, strokeColor: '#f4700a', strokeOpacity: 0.9, strokeStyle: 'dash', fillColor: '#f4700a', fillOpacity: 0.08 }));
      keep(new k.Polyline({ map, path: [first, e.latLng], strokeWeight: 2, strokeColor: '#f4700a' }));
      label(e.latLng, `반경 <b>${fmtLen(r)}</b>`, 'end');
      stopDraw();
    });
    on('mousemove', (e) => {
      if (!first) return;
      const r = lenOf([first, e.latLng]);
      if (!live) live = new k.Circle({ map, center: first, radius: r, strokeWeight: 1, strokeColor: '#f4700a', strokeStyle: 'dash', fillColor: '#f4700a', fillOpacity: 0.05 });
      else live.setOptions({ radius: r });
      if (!liveLbl) liveLbl = new k.CustomOverlay({ map, position: e.latLng, content: '', xAnchor: 0, yAnchor: 1.4, zIndex: 60 });
      liveLbl.setPosition(e.latLng);
      liveLbl.setContent(`<div class="kt-lbl live">반경 ${fmtLen(r)}</div>`);
    });
  } else if (t === 'rv') {
    hint.value = '파란 길을 누르면 그 자리 로드뷰가 열립니다';
    map.addOverlayMapTypeId(k.MapTypeId.ROADVIEW);
    on('click', (e) => rvOpen(e.latLng));
  }
};

// ===== 로드뷰 =====
const rvEl = ref<HTMLElement | null>(null);
const rvShown = ref(false);
const rvMsg = ref('');
let rv: any = null;
let rvMark: any = null;
const rvClient = new k.RoadviewClient();
const rvOpen = (pos: any) => {
  rvShown.value = true; rvMsg.value = '';
  requestAnimationFrame(() => {
    if (!rvEl.value) return;
    if (!rv) rv = new k.Roadview(rvEl.value);
    rvClient.getNearestPanoId(pos, 60, (panoId: number | null) => {
      if (!panoId) { rvMsg.value = '이 근처에는 로드뷰가 없습니다 — 파란 길 위를 눌러 주세요.'; return; }
      rv.setPanoId(panoId, pos);
      rv.relayout();
      rvMark?.setMap(null);
      rvMark = new k.CustomOverlay({ map, position: pos, content: '<span class="kt-rv-at"></span>', xAnchor: 0.5, yAnchor: 0.5, zIndex: 70 });
    });
  });
};
const rvClose = () => { rvShown.value = false; rvMark?.setMap(null); rvMark = null; };

// ===== 지적도 · 겹침 =====
const OVER: Record<'district' | 'terrain' | 'traffic' | 'bicycle', string> = { district: 'USE_DISTRICT', terrain: 'TERRAIN', traffic: 'TRAFFIC', bicycle: 'BICYCLE' };
const toggleLayer = (key: keyof typeof layers.value) => {
  const nowOn = !layers.value[key];
  layers.value = { ...layers.value, [key]: nowOn };
  if (key === 'sky') { map.setMapTypeId(nowOn ? k.MapTypeId.HYBRID : k.MapTypeId.ROADMAP); return; }
  const id = k.MapTypeId[OVER[key]];
  if (nowOn) map.addOverlayMapTypeId(id); else map.removeOverlayMapTypeId(id);
};

// ===== 검색 =====
const places = new k.services.Places();
const q = ref('');
const results = ref<Array<{ name: string; addr: string; x: string; y: string }>>([]);
const searchMsg = ref('');
let found: any = null;
const runSearch = () => {
  const text = q.value.trim();
  if (!text) return;
  searchMsg.value = '찾는 중…';
  // 상태 값이 비어 올 때가 있다 — 결과 목록이 있는지로 본다
  places.keywordSearch(text, (data: any[], status: string) => {
    if (!Array.isArray(data) || !data.length) {
      results.value = [];
      const failed = status && status !== k.services.Status.OK && status !== k.services.Status.ZERO_RESULT;
      searchMsg.value = failed ? '검색을 하지 못했습니다 — 잠시 뒤 다시 해 주세요.' : '찾는 곳이 없습니다.';
      if (failed) console.warn('[지도 검색]', status);
      return;
    }
    searchMsg.value = '';
    results.value = data.slice(0, 8).map((d) => ({ name: d.place_name, addr: d.road_address_name || d.address_name, x: d.x, y: d.y }));
  }, { location: map.getCenter() });
};
const goPlace = (r: { name: string; x: string; y: string }) => {
  const pos = new k.LatLng(Number(r.y), Number(r.x));
  found?.setMap(null);
  found = new k.CustomOverlay({ map, position: pos, content: `<div class="kt-found"><b>${r.name.replace(/[&<>"]/g, '')}</b></div>`, xAnchor: 0.5, yAnchor: 1.15, zIndex: 80 });
  map.setLevel(3); map.panTo(pos);
};

// ===== 교육 — 지금 보이는 곳의 학교 =====
let schoolMarks: any[] = [];
let schoolTimer = 0;
/* 카카오는 한 번에 15곳 · 정확도 순이라 대학교만 먼저 차고 초 · 중 · 고가 빠졌다 — 지도 가운데에서 가까운 순으로 세 쪽(45곳)까지 받고,
   초 · 중 · 고 · 대학을 그림으로 가른다 */
const schoolMark = (name: string) => (/어린이집/.test(name) ? '🧒' : /유치원/.test(name) ? '🧸' : /대학교|대학|캠퍼스/.test(name) ? '🎓' : '🏫');   /* 그림만 — 종류 말은 이름에 이미 있다(토마토어린이집) */
let schoolRun = 0;
const drawSchools = () => {
  const run = ++schoolRun;
  const center = map.getCenter(); const b = map.getBounds();
  // 지금 보이는 범위의 반지름(가운데 → 모서리), 카카오 한도 20km
  const r = Math.min(20000, Math.round(new k.Polyline({ path: [center, b.getNorthEast()] }).getLength()));
  let acc: any[] = [];
  const done = () => {
    if (run !== schoolRun) return;
    schoolMarks.forEach((m) => m.setMap(null)); schoolMarks = [];
    if (!school.value) return;
    const seen = new Set<string>();
    schoolMarks = acc.filter((d) => { const key = d.id || `${d.x},${d.y}`; if (seen.has(key)) return false; seen.add(key); return true; }).map((d) => new k.CustomOverlay({
      map, position: new k.LatLng(Number(d.y), Number(d.x)), xAnchor: 0.5, yAnchor: 1, zIndex: 30,
      content: `<div class="kt-school">${schoolMark(String(d.place_name))} ${String(d.place_name).replace(/[&<>"]/g, '')}</div>`,
    }));
  };
  // 어린이집 · 유치원만(분류 PS3) — 초 · 중 · 고는 카카오 지도 바탕에 이미 이름이 나와 있다
  let left = 1;
  const opt = { location: center, radius: r, sort: k.services.SortBy.DISTANCE };
  const take = (keep: (d: any) => boolean) => (data: any[], status: string, pg: any) => {
    void status;
    if (run !== schoolRun) return;
    if (Array.isArray(data)) acc = acc.concat(data.filter(keep));
    if (pg && pg.hasNextPage && pg.current < 3) pg.nextPage(); else if (--left === 0) done();
  };
  places.categorySearch('PS3', take((d) => /유치원|어린이집/.test(String(d.place_name))), opt);
};
const onIdle = () => { window.clearTimeout(schoolTimer); schoolTimer = window.setTimeout(drawSchools, 250); };
const toggleSchool = () => {
  school.value = !school.value;
  if (school.value) { k.event.addListener(map, 'idle', onIdle); drawSchools(); }
  else { k.event.removeListener(map, 'idle', onIdle); schoolMarks.forEach((m) => m.setMap(null)); schoolMarks = []; }
};

// ===== 주변 — 선정물건 500m 안 생활시설(카카오 장소 검색). 종류마다 색 · 그림, 고르기 창에서 켜고 끈다 =====
/* 묶음 셋 — 교육 · 교통 · 인프라. code 는 카카오 업종 분류로 찾기, word 는 이름으로 찾기(cat 분류 안에서), keep 은 이름으로 한 번 더 거르기 */
type NearKind = { key: string; group: 'edu' | 'move' | 'infra'; label: string; ic: string; color: string; code?: string; word?: string; cat?: string; keep?: RegExp; skip?: RegExp; keepCat?: RegExp };
const NEAR_GROUPS: Array<[NearKind['group'], string]> = [['edu', '교육'], ['move', '교통'], ['infra', '인프라']];
const NEAR_KINDS: NearKind[] = [
  { key: 'daycare', group: 'edu', label: '어린이집', ic: '🧒', color: '#a855f7', word: '어린이집', cat: 'PS3', keep: /어린이집/ },
  { key: 'kinder', group: 'edu', label: '유치원', ic: '🧸', color: '#9333ea', word: '유치원', cat: 'PS3', keep: /유치원/, skip: /어린이집/ },
  { key: 'elem', group: 'edu', label: '초등학교', ic: '🏫', color: '#7c3aed', word: '초등학교', cat: 'SC4', keep: /초등학교/ },
  { key: 'middle', group: 'edu', label: '중학교', ic: '🏫', color: '#6d28d9', word: '중학교', cat: 'SC4', keep: /중학교/ },
  { key: 'high', group: 'edu', label: '고등학교', ic: '🏫', color: '#5b21b6', word: '고등학교', cat: 'SC4', keep: /고등학교/ },
  { key: 'subway', group: 'move', label: '지하철', ic: '🚇', color: '#2563eb', code: 'SW8' },
  { key: 'bus', group: 'move', label: '버스정류장', ic: '🚌', color: '#0891b2', word: '버스정류장' },
  /* 기차역(KTX · 일반철도) — 카카오에 업종 분류가 따로 없어 이름으로 찾고, 카카오 분류 이름(…> 기차역)으로 한 번 더 거른다 */
  { key: 'train', group: 'move', label: '기차역', ic: '🚆', color: '#1e40af', word: '기차역', keepCat: /기차역|철도역/ },
  { key: 'hospital', group: 'infra', label: '병원', ic: '🏥', color: '#dc2626', code: 'HP8' },
  { key: 'pharmacy', group: 'infra', label: '약국', ic: '💊', color: '#db2777', code: 'PM9' },
  { key: 'mart', group: 'infra', label: '마트', ic: '🛒', color: '#ea580c', code: 'MT1' },
  { key: 'conv', group: 'infra', label: '편의점', ic: '🏪', color: '#16a34a', code: 'CS2' },
  { key: 'park', group: 'infra', label: '공원', ic: '🌳', color: '#15803d', word: '공원' },
  { key: 'public', group: 'infra', label: '관공서', ic: '🏛', color: '#6b7280', code: 'PO3' },
];
const kindsOf = (g: NearKind['group']) => NEAR_KINDS.filter((x) => x.group === g);
/** 찾는 거리 — 카카오 장소 검색은 20km 까지 되지만 걸어서 볼 생활권만 고른다 */
const NEAR_RADII = [500, 1000];
const nearRadius = ref(500);
const nearOn = ref(false);
const nearOpen = ref(false);
/* 처음엔 아무것도 안 켠다 — 하나씩 체크하며 본다(개수는 미리 보인다) */
const nearShow = ref<Record<string, boolean>>(Object.fromEntries(NEAR_KINDS.map((x) => [x.key, false])));
const nearCount = ref<Record<string, number>>({});
const nearMarks: Record<string, any[]> = {};
const clearNear = (key?: string) => { (key ? [key] : Object.keys(nearMarks)).forEach((kk) => { (nearMarks[kk] ?? []).forEach((m) => m.setMap(null)); nearMarks[kk] = []; }); };
const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, '');
const drawNear = () => {
  const c = nearPoint(); if (!c) return;
  const loc = new k.LatLng(c.lat, c.lng);
  // 내 물건이 있으면 그 둘레 500m · 1km, 없는 지도(랭킹지도)는 지금 보이는 동네 전체
  const byArea = !props.near;
  const R = byArea ? Infinity : nearRadius.value;
  const opt: any = byArea ? { useMapBounds: true } : { location: loc, radius: R, sort: k.services.SortBy.DISTANCE };
  NEAR_KINDS.forEach((kind) => {
    // 카카오는 한 쪽에 15곳 — 세 쪽(45곳)까지 받아 모은다
    let acc: any[] = [];
    const page = (data: any[], status: string, pg: any) => {
      void status;
      if (Array.isArray(data)) acc = acc.concat(data);
      if (pg && pg.hasNextPage && pg.current < 3) pg.nextPage(); else done(acc);
    };
    const done = (data: any[]) => {
      clearNear(kind.key);
      const rows = (Array.isArray(data) ? data : []).filter((d) => (byArea || !d.distance || Number(d.distance) <= R)
        && (!kind.keep || kind.keep.test(String(d.place_name))) && (!kind.skip || !kind.skip.test(String(d.place_name)))
        && (!kind.keepCat || kind.keepCat.test(String(d.category_name))));
      nearCount.value = { ...nearCount.value, [kind.key]: rows.length };
      if (!nearOn.value || !nearShow.value[kind.key]) return;
      nearMarks[kind.key] = rows.map((d) => new k.CustomOverlay({
        map, position: new k.LatLng(Number(d.y), Number(d.x)), xAnchor: 0.5, yAnchor: 1, zIndex: 32,
        content: `<div class="kt-near" style="--c:${kind.color}" title="${esc(d.place_name)} · ${esc(d.distance)}m">${kind.ic} ${esc(d.place_name)}</div>`,
      }));
    };
    if (kind.code) places.categorySearch(kind.code, page, opt);
    else places.keywordSearch(kind.word, page, kind.cat ? { ...opt, category_group_code: kind.cat } : opt);
  });
};
let nearIdleTimer = 0;
const onNearIdle = () => { window.clearTimeout(nearIdleTimer); nearIdleTimer = window.setTimeout(drawNear, 350); };
const toggleNear = () => {
  nearOn.value = !nearOn.value;
  nearOpen.value = nearOn.value;
  if (nearOn.value) {
    layerOpen.value = false; searchOpen.value = false; drawNear();
    if (props.nearCenter && !props.near) k.event.addListener(map, 'idle', onNearIdle);   // 지도 가운데 기준 — 옮기면 다시
  } else { clearNear(); k.event.removeListener(map, 'idle', onNearIdle); }
};
const toggleNearKind = (key: string) => { nearShow.value = { ...nearShow.value, [key]: !nearShow.value[key] }; drawNear(); };
/** 묶음 — 다 켜져 있으면 다 끄고, 아니면 다 켠다 */
const groupState = (g: NearKind['group']) => { const ks = kindsOf(g); const n = ks.filter((x) => nearShow.value[x.key]).length; return n === 0 ? 'off' : n === ks.length ? 'on' : 'some'; };
const toggleNearGroup = (g: NearKind['group']) => { const turn = groupState(g) !== 'on'; const next = { ...nearShow.value }; kindsOf(g).forEach((x) => { next[x.key] = turn; }); nearShow.value = next; drawNear(); };
const groupCount = (g: NearKind['group']) => kindsOf(g).reduce((a, x) => a + (nearCount.value[x.key] ?? 0), 0);
const setNearRadius = (r: number) => { if (nearRadius.value === r) return; nearRadius.value = r; nearCount.value = {}; drawNear(); };
const radText = (r: number) => (r >= 1000 ? `${r / 1000}km` : `${r}m`);

// ===== 인쇄 — 이 지도만 =====
let printCss = false;
const printMap = () => {
  const box = root.value?.closest('.map') as HTMLElement | null;
  if (!box) { window.print(); return; }
  if (!printCss) {
    printCss = true;
    const st = document.createElement('style');
    st.textContent = '@media print{body.kt-printing *{visibility:hidden!important}body.kt-printing .kt-print-area,body.kt-printing .kt-print-area *{visibility:visible!important}'
      + 'body.kt-printing .kt-print-area{position:absolute!important;left:0!important;top:0!important}body.kt-printing .kt-noprint{display:none!important}}';
    document.head.appendChild(st);
  }
  document.body.classList.add('kt-printing'); box.classList.add('kt-print-area');
  const done = () => { document.body.classList.remove('kt-printing'); box.classList.remove('kt-print-area'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  window.setTimeout(done, 1500);
};

onBeforeUnmount(() => {
  measuring(false);
  offAll(); stopDraw(); clearDrawn();
  if (school.value) k.event.removeListener(map, 'idle', onIdle);
  schoolMarks.forEach((m) => m.setMap(null)); found?.setMap(null); rvMark?.setMap(null);
  clearNear(); k.event.removeListener(map, 'idle', onNearIdle);
});
</script>

<template>
  <div ref="root" class="kt kt-noprint" @click.stop @mousedown.stop @wheel.stop>
    <div class="kt-g">
      <button type="button" title="확대" @click="zoom(-1)"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></button>
      <button type="button" title="축소" @click="zoom(1)"><svg viewBox="0 0 24 24"><path d="M5 12h14" /></svg></button>
    </div>
    <div class="kt-g">
      <button type="button" :class="{ on: tool === 'rv' }" @click="startTool('rv')"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.2" /><path d="M9 21l1.5-7L8 12l2-4h4l2 4-2.5 2L15 21" /></svg><span>로드뷰</span></button>
      <button type="button" :class="{ on: layers.district }" @click="toggleLayer('district')"><svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="1.5" /><path d="M3.5 9.5h17M3.5 15h17M9.5 3.5v17M15 3.5v17" /></svg><span>지적도</span></button>
      <button type="button" :class="{ on: layerOpen || layers.sky || layers.terrain || layers.traffic || layers.bicycle }" @click="layerOpen = !layerOpen; searchOpen = false"><svg viewBox="0 0 24 24"><path d="M12 3 2.5 8 12 13l9.5-5L12 3Z" /><path d="m2.5 12.5 9.5 5 9.5-5M2.5 17l9.5 5 9.5-5" /></svg><span>겹침</span></button>
    </div>
    <div class="kt-g">
      <button type="button" :class="{ on: tool === 'dist' }" @click="startTool('dist')"><svg viewBox="0 0 24 24"><rect x="2.5" y="8" width="19" height="8" rx="1.5" /><path d="M6.5 8v3M10.5 8v4M14.5 8v3M18.5 8v4" /></svg><span>거리재기</span></button>
      <button type="button" :class="{ on: tool === 'area' }" @click="startTool('area')"><svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" stroke-dasharray="3 2.5" /><path d="M4 20 20 4" /></svg><span>면적재기</span></button>
      <button type="button" :class="{ on: tool === 'radius' }" @click="startTool('radius')"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 12h8.5" /><circle cx="12" cy="12" r="1.2" /></svg><span>반경표시</span></button>
    </div>
    <div class="kt-g">
      <button type="button" :class="{ on: searchOpen }" @click="searchOpen = !searchOpen; layerOpen = false"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg><span>검색</span></button>
      <button v-if="!hasNear()" type="button" :class="{ on: school }" @click="toggleSchool"><svg viewBox="0 0 24 24"><path d="M12 4 2 9l10 5 10-5-10-5Z" /><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" /></svg><span>교육</span></button>
      <button v-if="hasNear()" type="button" :class="{ on: nearOn }" :title="props.near ? '선정물건 둘레 생활시설' : '지도에 보이는 곳의 생활시설'" @click="toggleNear"><svg viewBox="0 0 24 24"><path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10Z" /><circle cx="12" cy="11" r="2.2" /></svg><span>주변</span></button>
    </div>
    <div class="kt-g">
      <button type="button" @click="printMap"><svg viewBox="0 0 24 24"><path d="M7 8V3.5h10V8" /><rect x="3.5" y="8" width="17" height="8" rx="1.5" /><path d="M7 13.5h10v7H7z" /></svg><span>인쇄</span></button>
    </div>

    <!-- 겹침 고르기 -->
    <div v-if="layerOpen" class="kt-pop kt-layers">
      <b>겹쳐 보기</b>
      <label><input type="checkbox" :checked="layers.sky" @change="toggleLayer('sky')" />스카이뷰(위성)</label>
      <label><input type="checkbox" :checked="layers.terrain" @change="toggleLayer('terrain')" />지형도</label>
      <label><input type="checkbox" :checked="layers.traffic" @change="toggleLayer('traffic')" />교통정보</label>
      <label><input type="checkbox" :checked="layers.bicycle" @change="toggleLayer('bicycle')" />자전거길</label>
      <label><input type="checkbox" :checked="layers.district" @change="toggleLayer('district')" />지적편집도</label>
    </div>
    <!-- 주변 — 종류 켜고 끄기 · 500m 안 개수 -->
    <div v-if="nearOpen" class="kt-pop kt-nearpop">
      <b>{{ props.near ? `주변 ${radText(nearRadius)}` : '지도에 보이는 곳' }} <button type="button" class="kt-x" aria-label="닫기" @click="nearOpen = false">✕</button></b>
      <span v-if="props.near" class="kt-nr" role="radiogroup" aria-label="찾는 거리"><button v-for="r in NEAR_RADII" :key="r" type="button" role="radio" :aria-checked="nearRadius === r" :class="{ on: nearRadius === r }" @click="setNearRadius(r)">{{ radText(r) }}</button></span>
      <div v-for="[g, gl] in NEAR_GROUPS" :key="g" class="kt-ng">
        <label class="kt-ngh"><input type="checkbox" :checked="groupState(g) === 'on'" :indeterminate.prop="groupState(g) === 'some'" @change="toggleNearGroup(g)" />{{ gl }}<em>{{ groupCount(g) }}</em></label>
        <label v-for="n in kindsOf(g)" :key="n.key" class="kt-ngi"><input type="checkbox" :checked="nearShow[n.key]" @change="toggleNearKind(n.key)" /><i :style="{ background: n.color }" />{{ n.ic }} {{ n.label }}<em>{{ nearCount[n.key] ?? '…' }}</em></label>
      </div>
    </div>
    <!-- 검색 -->
    <div v-if="searchOpen" class="kt-pop kt-search">
      <form @submit.prevent="runSearch"><input v-model="q" type="search" placeholder="장소 · 주소 검색" autofocus /><button type="submit">찾기</button></form>
      <p v-if="searchMsg" class="kt-msg">{{ searchMsg }}</p>
      <button v-for="r in results" :key="`${r.x},${r.y},${r.name}`" type="button" class="kt-res" @click="goPlace(r)"><b>{{ r.name }}</b><small>{{ r.addr }}</small></button>
    </div>
  </div>

  <!-- 재기 안내 -->
  <div v-if="hint" class="kt-hint kt-noprint" @click.stop>
    {{ hint }}
    <button v-if="tool === 'dist' || tool === 'area'" type="button" @click="finish">끝내기</button>
    <button type="button" @click="startTool(tool)">지우기</button>
  </div>
  <!-- 로드뷰 -->
  <div v-show="rvShown" class="kt-rv" @click.stop @mousedown.stop @wheel.stop>
    <div ref="rvEl" class="kt-rv-in" />
    <p v-if="rvMsg" class="kt-rv-msg">{{ rvMsg }}</p>
    <button type="button" class="kt-rv-x" aria-label="로드뷰 닫기" @click="rvClose">✕</button>
  </div>
</template>

<style scoped>
.kt { position: absolute; right: 10px; top: 10px; z-index: 600; display: flex; flex-direction: column; gap: 6px; }
.kt-g { display: flex; flex-direction: column; background: #fff; border: 1px solid #d7deea; border-radius: 9px; box-shadow: 0 1px 4px rgba(17, 24, 39, .14); overflow: hidden; }
.kt-g button { width: 48px; height: 36px; border: 0; border-top: 1px solid #edf0f6; background: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 0; cursor: pointer; color: #374151; font-family: inherit; }
.kt-g button:first-child { border-top: 0; }
.kt-g button:hover { background: #f4f7ff; }
.kt-g button.on { background: #eaf0ff; color: #2b6df3; }
.kt-g svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.kt-g span { font-size: 9.5px; font-weight: 700; line-height: 1; letter-spacing: -0.3px; }
.kt-pop { position: absolute; right: 56px; top: 0; width: 260px; background: #fff; border: 1px solid #d7deea; border-radius: 10px; box-shadow: 0 10px 28px rgba(17, 24, 39, .18); padding: 10px 12px; display: grid; gap: 6px; font-size: 13px; }
.kt-layers { top: 94px; width: 170px; }
.kt-layers b { font-size: 12.5px; }
.kt-layers label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.kt-search { top: 214px; max-height: 300px; overflow: auto; }
.kt-search form { display: flex; gap: 6px; }
.kt-search input { flex: 1; min-width: 0; height: 32px; border: 1px solid #d5dbe6; border-radius: 7px; padding: 0 10px; font-family: inherit; font-size: 13px; }
.kt-search form button { height: 32px; padding: 0 12px; border: 0; border-radius: 7px; background: #1f3a72; color: #fff; font-family: inherit; font-weight: 700; cursor: pointer; }
.kt-msg { margin: 0; color: #6b7280; font-size: 12px; }
.kt-res { text-align: left; border: 0; border-top: 1px solid #f1f3f7; background: none; padding: 7px 2px; cursor: pointer; display: grid; gap: 2px; font-family: inherit; }
.kt-res b { font-size: 13px; color: #111827; }
.kt-res small { font-size: 11.5px; color: #6b7280; }
.kt-res:hover b { color: #2b6df3; }
.kt-hint { position: absolute; left: 50%; top: 10px; transform: translateX(-50%); z-index: 600; display: flex; align-items: center; gap: 8px; background: rgba(17, 24, 39, .82); color: #fff; border-radius: 999px; padding: 6px 8px 6px 14px; font-size: 12.5px; white-space: nowrap; }
.kt-hint button { height: 24px; padding: 0 10px; border: 0; border-radius: 999px; background: #fff; color: #111827; font-family: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.kt-rv { position: absolute; left: 0; right: 66px; bottom: 0; height: 58%; z-index: 650; background: #111; border-top: 2px solid #2b6df3; }
.kt-rv-in { position: absolute; inset: 0; }
.kt-rv-msg { position: absolute; inset: 0; margin: 0; display: grid; place-items: center; color: #fff; font-size: 13px; background: rgba(17, 24, 39, .7); }
.kt-rv-x { position: absolute; right: 8px; top: 8px; z-index: 2; width: 30px; height: 30px; border: 0; border-radius: 8px; background: rgba(255, 255, 255, .92); font-size: 14px; cursor: pointer; }
/* 지도 위 표식(카카오가 지도 안에 그린다 — :deep 없이 전역 이름이라 kt- 로 묶는다) */
:global(.kt-measuring .pa-pin), :global(.kt-measuring .pa-pin *), :global(.kt-measuring .trip-marker), :global(.kt-measuring .trade-map-marker-wrap) { pointer-events: none !important; }
:global(.kt-lbl) { background: #fff; border: 1px solid #e03e3e; border-radius: 6px; padding: 3px 8px; font-size: 12px; color: #111827; white-space: nowrap; box-shadow: 0 1px 4px rgba(17, 24, 39, .2); }
:global(.kt-lbl.live) { border-color: #9ca3af; color: #4b5563; }
:global(.kt-lbl.end) { border-width: 2px; font-size: 12.5px; }
:global(.kt-dot) { display: block; width: 9px; height: 9px; border-radius: 50%; background: #fff; border: 2px solid #e03e3e; }
:global(.kt-rv-at) { display: block; width: 16px; height: 16px; border-radius: 50%; background: #2b6df3; border: 3px solid #fff; box-shadow: 0 0 0 2px #2b6df3; }
:global(.kt-found) { background: #e03e3e; color: #fff; border-radius: 8px; padding: 5px 10px; font-size: 12.5px; white-space: nowrap; box-shadow: 0 2px 8px rgba(17, 24, 39, .3); }
:global(.kt-near) { background: #fff; border: 1.5px solid var(--c); color: var(--c); border-radius: 6px; padding: 2px 7px; font-size: 11.5px; font-weight: 700; white-space: nowrap; box-shadow: 0 1px 4px rgba(17, 24, 39, .15); }
.kt-nearpop { display: grid; gap: 6px; min-width: 170px; }
.kt-nearpop b { display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
.kt-nearpop .kt-x { width: 22px; height: 22px; border: 0; background: none; color: #6b7280; cursor: pointer; }
.kt-nr { display: flex; gap: 2px; padding: 2px; border-radius: 7px; background: #f1f4f9; }
.kt-nr button { flex: 1; height: 24px; border: 0; border-radius: 5px; background: none; font: inherit; font-size: 12px; color: #6b7280; cursor: pointer; }
.kt-nr button.on { background: #fff; color: #2b6df3; font-weight: 700; box-shadow: inset 0 0 0 1px #2b6df3; }
.kt-ng { display: grid; gap: 4px; padding-top: 6px; border-top: 1px solid #edf0f6; }
.kt-ngh { font-weight: 800 !important; color: #111827 !important; }
.kt-ngi { padding-left: 18px; }
.kt-nearpop label { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #374151; cursor: pointer; }
.kt-nearpop label i { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.kt-nearpop label em { margin-left: auto; font-style: normal; font-weight: 700; color: #111827; }
:global(.kt-school) { background: #fff; border: 1px solid #7c3aed; color: #5b21b6; border-radius: 6px; padding: 2px 7px; font-size: 11.5px; font-weight: 700; white-space: nowrap; }
</style>
