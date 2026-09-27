<script setup lang="ts">
import { Browser } from '@capacitor/browser';
import { Clipboard } from '@capacitor/clipboard';
import { Capacitor } from '@capacitor/core';
import L from 'leaflet';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { saveFieldTripPlan } from '../services/auctionRepository';
import { buildOptimizedRoute, parseAddressLines, reverseGeocode, type GeoPoint } from '../services/routeOptimizer';
import { fetchRouteForPath, type RouteLeg, type RouteMode } from '../services/roadRouting';
import { apiPath } from '../services/apiBase';
import { useAuctionStore } from '../stores/auctionStore';
import { useAuthStore } from '../stores/authStore';
import { loadUserPrefs, saveUserPrefs } from '../services/userPrefsRepository';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import mapPinIcon from '../assets/icones/mappin (1).png';
import flagIcon from '../assets/icones/flag (1).png';
import mapPinPlusIcon from '../assets/icones/map-pin-plus (1).png';
import mapPinnedIcon from '../assets/icones/map-pinned (1).png';
import squareCheckIcon from '../assets/icones/square-check (1).png';
import squareXIcon from '../assets/icones/square-x (1).png';
import infoIcon from '../assets/icones/info (1).png';
import arrowUpDownIcon from '../assets/icones/arrow-UPDOWN.png';
import chevronDownIcon from '../assets/icones/chevron-down (1).png';
import naverNaviIcon from '../assets/icones/navi/naver_navi.png';
import tmapNaviIcon from '../assets/icones/navi/TMAP_navi.png';
import kakaoNaviIcon from '../assets/icones/navi/kakaonavi.png';

const router = useRouter();
const summaryCollapsed = ref(false);
const settingsCollapsed = ref(false);

const DEFAULT_HUB_ADDRESS = '청라린스트라우스';
const store = useAuctionStore();

const rawAddresses = ref('');
const startAddress = ref(DEFAULT_HUB_ADDRESS);
const endAddress = ref(DEFAULT_HUB_ADDRESS);
const avgSpeedKmh = ref(28);
const stayMinutesPerStop = ref(20);
const lastAutoFilledInput = ref('');
const travelMode = ref<RouteMode>('car');
const selectedNav = ref<'naver' | 'tmap' | 'kakao'>('naver');

const orderedStops = ref<GeoPoint[]>([]);
const fullPath = ref<GeoPoint[]>([]);
const failedAddresses = ref<string[]>([]);
const totalDistanceKm = ref(0);
const driveMinutes = ref(0);
const stayMinutes = ref(0);
const totalMinutes = ref(0);
const roadLegs = ref<RouteLeg[]>([]);
const roadGeometry = ref<Array<[number, number]>>([]);
const roadFailedLegs = ref<Array<{ from: string; to: string; reason: string }>>([]);
const roadProgress = ref<{ done: number; total: number } | null>(null);
const useRoadRouting = ref(true);

const loading = ref(false);
const message = ref('');
const saveMessage = ref('');
const lastCalculatedAt = ref('');
const lastInputSignature = ref('');
const visitedStops = ref<Record<string, boolean>>({});

const stopCount = computed(() => orderedStops.value.length);
const pendingVisitCount = computed(
  () => store.auctions.filter((item) => item.status === '임장예정').length,
);
const defaultFieldTripInput = computed(() =>
  store.auctions
    .filter((item) => item.status === '임장예정')
    .map((item) => item.address.trim())
    .filter((address, index, arr) => address.length > 0 && arr.indexOf(address) === index)
    .join('\n'),
);
const currentInputSignature = computed(
  () =>
    JSON.stringify({
      rawAddresses: rawAddresses.value,
      startAddress: startAddress.value,
      endAddress: endAddress.value,
      avgSpeedKmh: avgSpeedKmh.value,
      stayMinutesPerStop: stayMinutesPerStop.value,
      travelMode: travelMode.value,
    }),
);

const stopOrdinal = (idx: number): number => {
  let count = 0;
  for (let i = 0; i <= idx; i += 1) {
    if (fullPath.value[i]?.kind === 'stop') count += 1;
  }
  return count;
};

// 목록에서 번호 배지를 끌어 순서를 바꾼다 — 지도도 같이 다시 그린다
const dragFromIdx = ref<number | null>(null);
const stopRowIndexFromPoint = (x: number, y: number): number | null => {
  const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('.ftp-stop') as HTMLElement | null;
  const idx = Number(el?.dataset.idx);
  return Number.isInteger(idx) ? idx : null;
};
const onStopDragStart = (idx: number, e: PointerEvent) => {
  if (fullPath.value[idx]?.kind !== 'stop') return;
  dragFromIdx.value = idx;
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
};
const onStopDragMove = (e: PointerEvent) => {
  if (dragFromIdx.value === null) return;
  e.preventDefault();
  const over = stopRowIndexFromPoint(e.clientX, e.clientY);
  // 출발(S)·도착(E) 줄은 자리를 내주지 않는다
  if (over === null || over === dragFromIdx.value || fullPath.value[over]?.kind !== 'stop') return;
  const next = [...fullPath.value];
  const [moved] = next.splice(dragFromIdx.value, 1);
  next.splice(over, 0, moved);
  fullPath.value = next;
  dragFromIdx.value = over;
};
const onStopDragEnd = async () => {
  if (dragFromIdx.value === null) return;
  dragFromIdx.value = null;
  await refreshRouteAfterReorder();
};

let map: L.Map | null = null;
let routeLayer: L.Polyline | null = null;
let markerLayer: L.LayerGroup | null = null;

// webFallback이 null이면 해당 서비스에 쓸 만한 웹 길찾기가 없다는 뜻이다.
const launchNativeScheme = (scheme: string, webFallback: string | null) => {
  if (!Capacitor.isNativePlatform()) {
    if (!webFallback) {
      showToast('티맵은 웹 길찾기를 제공하지 않습니다. 앱에서 사용하거나 네이버·카카오를 선택해 주세요.', 'info');
      return;
    }
    window.open(webFallback, '_blank');
    return;
  }
  let leftApp = false;
  const onVisibility = () => {
    if (document.hidden) leftApp = true;
  };
  document.addEventListener('visibilitychange', onVisibility);

  // 최상위 내비게이션으로 스킴을 던진다.
  // 예전의 숨은 iframe 방식은 최신 Android WebView가 외부 스킴 이동을 막아 조용히 실패한다.
  // Capacitor의 shouldOverrideUrlLoading이 이 이동을 가로채 Intent로 앱을 연다.
  try {
    window.location.href = scheme;
  } catch {
    // 이동 자체가 막히면 아래 타이머가 웹으로 대체한다
  }

  setTimeout(() => {
    document.removeEventListener('visibilitychange', onVisibility);
    if (leftApp || document.hidden) return;
    // 앱이 열리지 않았다 — 설치돼 있지 않은 경우다
    if (!webFallback) {
      showToast('티맵이 설치돼 있지 않습니다. 네이버·카카오를 선택해 주세요.', 'info');
      return;
    }
    void Browser.open({ url: webFallback });
  }, 1500);
};

const buildLegLaunch = (start: GeoPoint, end: GeoPoint): { scheme: string; webUrl: string } => {
  if (selectedNav.value === 'tmap') {
    const params = [
      `startx=${start.lng}`,
      `starty=${start.lat}`,
      `startname=${encodeURIComponent(start.address)}`,
      `goalx=${end.lng}`,
      `goaly=${end.lat}`,
      `goalname=${encodeURIComponent(end.address)}`,
    ];
    return {
      scheme: `tmap://route?${params.join('&')}`,
      webUrl: `https://tmap.life/route?startName=${encodeURIComponent(start.address)}&startX=${start.lng}&startY=${start.lat}&endName=${encodeURIComponent(end.address)}&endX=${end.lng}&endY=${end.lat}`,
    };
  }
  if (selectedNav.value === 'kakao') {
    const by = travelMode.value === 'walk' ? 'FOOT' : 'CAR';
    return {
      scheme: `kakaomap://route?sp=${start.lat},${start.lng}&ep=${end.lat},${end.lng}&by=${by}`,
      webUrl: `https://map.kakao.com/?sName=${encodeURIComponent(start.address)}&eName=${encodeURIComponent(end.address)}`,
    };
  }
  const toSegment = (p: GeoPoint) =>
    `${p.lng},${p.lat},${encodeURIComponent(p.address)},,PLACE_POI`;
  const naverMode = travelMode.value === 'walk' ? 'walk' : 'car';
  const nmapParams = [
    `slat=${start.lat}`,
    `slng=${start.lng}`,
    `sname=${encodeURIComponent(start.address)}`,
    `dlat=${end.lat}`,
    `dlng=${end.lng}`,
    `dname=${encodeURIComponent(end.address)}`,
    `appname=com.terry.auction`,
  ];
  return {
    scheme: `nmap://route/${naverMode}?${nmapParams.join('&')}`,
    webUrl: `https://map.naver.com/p/directions/${toSegment(start)}/${toSegment(end)}/-/${naverMode}`,
  };
};

const openLegNav = (idx: number) => {
  const path = fullPath.value;
  const end = path[idx];
  if (!end) return;
  const start = idx > 0 ? path[idx - 1] : null;
  if (!start) {
    message.value = '시작 지점에는 구간 네비를 사용할 수 없습니다.';
    return;
  }
  const { scheme, webUrl } = buildLegLaunch(start, end);
  launchNativeScheme(scheme, webUrl);
};

const NAVER_CHUNK_WINDOW = 7;
const currentChunkIdx = ref(0);

const buildNaverChunkUrl = (chunkPath: GeoPoint[], mode: 'car' | 'walk') => {
  const start = chunkPath[0];
  const end = chunkPath[chunkPath.length - 1];
  const waypoints = chunkPath.slice(1, -1);
  // 신형 map.naver.com/p/directions/... 형식은 좌표를 해석하지 못하고
  // 빈 "빠른길찾기" 화면으로 떨어진다. 구형 route.nhn은 좌표를 그대로 넘겨준다.
  const webUrl =
    `https://m.map.naver.com/route.nhn?menu=route` +
    `&sname=${encodeURIComponent(start.address)}&sx=${start.lng}&sy=${start.lat}` +
    `&ename=${encodeURIComponent(end.address)}&ex=${end.lng}&ey=${end.lat}` +
    `&pathType=${mode === 'walk' ? 2 : 0}&showMap=true`;
  const nmapParams: string[] = [
    `slat=${start.lat}`,
    `slng=${start.lng}`,
    `sname=${encodeURIComponent(start.address)}`,
    `dlat=${end.lat}`,
    `dlng=${end.lng}`,
    `dname=${encodeURIComponent(end.address)}`,
    `appname=com.terry.auction`,
  ];
  waypoints.forEach((wp, i) => {
    const n = i + 1;
    nmapParams.push(`v${n}lat=${wp.lat}`, `v${n}lng=${wp.lng}`, `v${n}name=${encodeURIComponent(wp.address)}`);
  });
  return { scheme: `nmap://route/${mode}?${nmapParams.join('&')}`, webUrl };
};

const computeNaverChunks = (path: GeoPoint[]): GeoPoint[][] => {
  if (path.length <= NAVER_CHUNK_WINDOW) return [path.slice()];
  const step = NAVER_CHUNK_WINDOW - 1;
  const chunks: GeoPoint[][] = [];
  for (let i = 0; i < path.length - 1; i += step) {
    chunks.push(path.slice(i, i + NAVER_CHUNK_WINDOW));
  }
  return chunks;
};

const naverChunks = computed<GeoPoint[][]>(() => {
  if (fullPath.value.length < 2) return [];
  return computeNaverChunks(fullPath.value);
});

watch(fullPath, () => {
  currentChunkIdx.value = 0;
});

const openTmapFullRoute = () => {
  const path = fullPath.value;
  if (path.length < 2) {
    message.value = '네비게이션을 열려면 최소 2개 지점이 필요합니다.';
    return;
  }
  const start = path[0];
  const end = path[path.length - 1];
  const params: string[] = [
    `startx=${start.lng}`,
    `starty=${start.lat}`,
    `startname=${encodeURIComponent(start.address)}`,
    `goalx=${end.lng}`,
    `goaly=${end.lat}`,
    `goalname=${encodeURIComponent(end.address)}`,
  ];
  const vias = path.slice(1, -1).slice(0, 5);
  vias.forEach((v, i) => {
    const n = i + 1;
    params.push(`via${n}x=${v.lng}`, `via${n}y=${v.lat}`, `via${n}name=${encodeURIComponent(v.address)}`);
  });
  const scheme = `tmap://route?${params.join('&')}`;
  // 기존 tmap.life/route는 poi.tmobiweb.com으로 넘어가며 "페이지를 찾을수 없습니다"가 뜬다.
  // 티맵은 쓸 만한 웹 길찾기가 없어 폴백 없이 안내만 한다.
  launchNativeScheme(scheme, null);
};

const openKakaoFullRoute = () => {
  const path = fullPath.value;
  if (path.length < 2) {
    message.value = '네비게이션을 열려면 최소 2개 지점이 필요합니다.';
    return;
  }
  const start = path[0];
  const end = path[path.length - 1];
  const by = travelMode.value === 'walk' ? 'FOOT' : 'CAR';
  const scheme = `kakaomap://route?sp=${start.lat},${start.lng}&ep=${end.lat},${end.lng}&by=${by}`;
  // ?sName=&eName= 형식은 좌표가 버려지고 카카오맵 첫 화면으로 튕긴다.
  // 공식 link/by 형식은 경유지까지 전달된다 (경유지 최대 5개).
  const mode = travelMode.value === 'walk' ? 'walk' : 'car';
  const toPoint = (p: GeoPoint) => `${encodeURIComponent(p.address)},${p.lat},${p.lng}`;
  const vias = path.slice(1, -1).slice(0, 5);
  const webUrl = `https://map.kakao.com/link/by/${mode}/${[start, ...vias, end].map(toPoint).join('/')}`;
  launchNativeScheme(scheme, webUrl);
};

const openNaverFullRoute = () => {
  const chunks = naverChunks.value;
  if (chunks.length === 0) {
    message.value = '네비게이션을 열려면 최소 2개 지점이 필요합니다.';
    return;
  }
  const naverMode: 'car' | 'walk' = travelMode.value === 'walk' ? 'walk' : 'car';

  // 네이버 웹 길찾기는 경유지를 못 받는다. 앱이 없으면 출발·도착만 열리므로 미리 알린다.
  // (구형 route.nhn에 경유지 파라미터가 없고, 신형 p/directions 형식은 좌표 자체를 해석하지 못한다)
  const warnWebDropsWaypoints = (chunk: GeoPoint[]) => {
    if (!Capacitor.isNativePlatform() && chunk.length > 2) {
      showToast('네이버 웹 길찾기는 경유지를 지원하지 않아 출발·도착만 표시됩니다. 전체 경로는 카카오를 이용해 주세요.', 'info');
    }
  };

  if (chunks.length === 1) {
    warnWebDropsWaypoints(chunks[0]);
    const { scheme, webUrl } = buildNaverChunkUrl(chunks[0], naverMode);
    launchNativeScheme(scheme, webUrl);
    return;
  }

  const idx = currentChunkIdx.value;
  const chunk = chunks[idx];
  if (!chunk || chunk.length < 2) return;
  warnWebDropsWaypoints(chunk);
  const { scheme, webUrl } = buildNaverChunkUrl(chunk, naverMode);
  launchNativeScheme(scheme, webUrl);

  if (idx + 1 >= chunks.length) {
    currentChunkIdx.value = 0;
    showToast('마지막 구간을 시작했습니다. 완주 후 다시 1구간부터 시작됩니다.', 'success');
  } else {
    currentChunkIdx.value = idx + 1;
    showToast(`${idx + 1}/${chunks.length} 구간 시작. 도착 후 다시 눌러 주세요.`, 'info');
  }
};

// 네이버·티맵·카카오 버튼은 앱 선택과 전체경로 내비 실행을 겸한다.
// 경로가 아직 없으면 선택만 하고 안내한다.
const chooseNavAndLaunch = (provider: 'naver' | 'tmap' | 'kakao') => {
  selectedNav.value = provider;
  if (fullPath.value.length < 2) {
    showToast('먼저 동선최적화를 실행해 주세요.', 'info');
    return;
  }
  if (provider === 'tmap') return openTmapFullRoute();
  if (provider === 'kakao') return openKakaoFullRoute();
  return openNaverFullRoute();
};

// 목록의 주소는 말줄임되므로 전체를 말풍선으로 보여준다.
// 데스크톱은 CSS hover, 모바일은 탭으로 연다 (모바일엔 hover가 없다).
const addrBubbleIdx = ref<number | null>(null);
const toggleAddrBubble = (idx: number) => {
  addrBubbleIdx.value = addrBubbleIdx.value === idx ? null : idx;
};

const copyAddress = async (address: string) => {
  if (Capacitor.isNativePlatform()) {
    await Clipboard.write({ string: address });
  } else {
    await navigator.clipboard.writeText(address);
  }
  message.value = '주소를 복사했습니다.';
};

// 목록 주소는 공백이 지워진 형태로 들어와서, 띄어쓰기를 무시하고 물건을 찾는다
const normalizeAddr = (address: string) => address.replace(/\s+/g, '');
const auctionIdByAddress = (address: string) => {
  const key = normalizeAddr(address);
  return store.auctions.find((item) => normalizeAddr(item.address ?? '') === key)?.id ?? '';
};
const goDetailByAddress = (address: string) => {
  const id = auctionIdByAddress(address);
  if (!id) {
    showToast('연결된 물건을 찾지 못했습니다.', 'info');
    return;
  }
  router.push(`/auctions/${id}`);
};

const toggleVisited = async (address: string) => {
  const next = !visitedStops.value[address];
  visitedStops.value = {
    ...visitedStops.value,
    [address]: next,
  };
  autoSavePlan();
  const matched = store.auctions.find((item) => item.address.trim() === address.trim());
  if (!matched) {
    return;
  }
  await store.setStatus(matched.id, next ? '임장완료' : '임장예정');
};

// 지도가 손가락을 가로채면 목록으로 되돌아가는 스크롤이 막힌다.
// 그래서 평소엔 잠가 두고, 한 번 눌렀을 때만 이동·확대가 되게 한다.
const mapActive = ref(false);
// 잠겨 있어도 두 손가락 확대와 더블탭 확대는 그대로 쓴다.
// 한 손가락 끌기(지도 이동)만 막아 두면 지도 위에서도 페이지가 스크롤된다.
const lockMap = () => {
  mapActive.value = false;
  if (!map) return;
  map.dragging.disable();
  map.scrollWheelZoom.disable();
  map.touchZoom.enable();
  map.doubleClickZoom.enable();
};
const unlockMap = () => {
  mapActive.value = true;
  if (!map) return;
  map.dragging.enable();
  map.touchZoom.enable();
  map.scrollWheelZoom.enable();
  map.doubleClickZoom.enable();
};
const mapBig = ref(false);
const toggleMapSize = async () => {
  mapBig.value = !mapBig.value;
  await nextTick();
  // 높이가 바뀌면 타일이 어긋나므로 다시 그려 준다
  map?.invalidateSize();
  if (routeLayer) map?.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });
};

const ensureMap = async () => {
  await nextTick();
  if (map) {
    return;
  }
  map = L.map('trip-map', {
    zoomControl: true,
  }).setView([37.545, 126.675], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  lockMap();
  map.on('click', unlockMap);
};

const makeBadgeIcon = (label: string, kind: 'start' | 'stop' | 'end') => {
  const cls = `trip-marker-badge tone-${kind}`;
  return L.divIcon({
    className: 'trip-marker',
    html: `<div class="${cls}"><span>${label}</span></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

const makeArrowIcon = (angleDeg: number) =>
  L.divIcon({
    className: 'trip-arrow',
    html: `<div class="trip-arrow-icon" style="transform:rotate(${angleDeg}deg)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

const drawRouteMap = async () => {
  await ensureMap();
  if (!map || !markerLayer) {
    return;
  }
  markerLayer.clearLayers();
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
  if (fullPath.value.length === 0) {
    return;
  }

  const hasRoadGeometry = roadGeometry.value.length > 1;
  const latlngs: L.LatLngTuple[] = hasRoadGeometry
    ? (roadGeometry.value as L.LatLngTuple[])
    : fullPath.value.map((point) => [point.lat, point.lng] as L.LatLngTuple);
  routeLayer = L.polyline(latlngs, {
    color: '#2563eb',
    weight: hasRoadGeometry ? 5 : 4,
    opacity: 0.85,
    dashArray: hasRoadGeometry ? '0' : '6 6',
  }).addTo(map);

  // Directional arrows: between stops for straight lines,
  // or along each road leg for road geometry.
  if (hasRoadGeometry) {
    roadLegs.value.forEach((leg) => {
      if (!leg.geometry || leg.geometry.length < 2) return;
      const midIdx = Math.floor(leg.geometry.length / 2);
      const a = leg.geometry[Math.max(midIdx - 1, 0)];
      const b = leg.geometry[midIdx];
      const angleDeg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      const arrow = L.marker([b[0], b[1]], {
        icon: makeArrowIcon(angleDeg),
        interactive: false,
        keyboard: false,
      });
      markerLayer!.addLayer(arrow);
    });
  } else {
    for (let i = 0; i < fullPath.value.length - 1; i += 1) {
      const a = fullPath.value[i];
      const b = fullPath.value[i + 1];
      const midLat = (a.lat + b.lat) / 2;
      const midLng = (a.lng + b.lng) / 2;
      const angleDeg =
        (Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180) / Math.PI;
      const arrow = L.marker([midLat, midLng], {
        icon: makeArrowIcon(angleDeg),
        interactive: false,
        keyboard: false,
      });
      markerLayer.addLayer(arrow);
    }
  }

  // Numbered badge markers
  fullPath.value.forEach((point, idx) => {
    let label: string;
    let kind: 'start' | 'stop' | 'end';
    if (point.kind === 'start') {
      label = 'S';
      kind = 'start';
    } else if (point.kind === 'end') {
      label = 'E';
      kind = 'end';
    } else {
      label = String(stopOrdinal(idx));
      kind = 'stop';
    }
    const marker = L.marker([point.lat, point.lng], {
      icon: makeBadgeIcon(label, kind),
    }).bindPopup(
      `<strong>${label}. ${point.address}</strong><br/>${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
    );
    markerLayer?.addLayer(marker);
  });

  // 끌고 있는 동안 화면이 튀지 않게 확대/이동은 놓은 뒤에만 맞춘다
  if (dragFromIdx.value === null) map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });
};

watch(fullPath, () => {
  void drawRouteMap();
  const nextVisited: Record<string, boolean> = {};
  fullPath.value.forEach((stop) => {
    if (stop.kind !== 'stop') {
      return;
    }
    nextVisited[stop.address] = Boolean(visitedStops.value[stop.address]);
  });
  visitedStops.value = nextVisited;
});

watch(
  defaultFieldTripInput,
  (nextInput) => {
    if (!nextInput) {
      return;
    }
    const current = rawAddresses.value.trim();
    const previousAuto = lastAutoFilledInput.value.trim();
    if (current.length === 0 || current === previousAuto) {
      rawAddresses.value = nextInput;
      lastAutoFilledInput.value = nextInput;
    }
  },
  { immediate: true },
);

// 순서를 바꾸면 이전 도로 경로는 맞지 않는다 — 직선으로 되돌린 뒤 새 순서로 다시 조회한다
const refreshRouteAfterReorder = async () => {
  orderedStops.value = fullPath.value.filter((p) => p.kind === 'stop');
  roadLegs.value = [];
  roadGeometry.value = [];
  roadFailedLegs.value = [];
  await drawRouteMap();
  if (!useRoadRouting.value || fullPath.value.length < 2) {
    message.value = '순서를 바꿨습니다.';
    return;
  }
  loading.value = true;
  try {
    message.value = `${travelMode.value === 'car' ? '도로' : '도보'} 경로 다시 조회 중...`;
    const road = await fetchRouteForPath(fullPath.value, travelMode.value, (done, total) => {
      roadProgress.value = { done, total };
    });
    roadLegs.value = road.legs;
    roadGeometry.value = road.geometry;
    roadFailedLegs.value = road.failedLegs;
    if (road.totalDistanceKm > 0) {
      totalDistanceKm.value = road.totalDistanceKm;
      driveMinutes.value = road.totalDurationMinutes;
      totalMinutes.value = driveMinutes.value + stayMinutes.value;
    }
    await drawRouteMap();
    message.value = `바꾼 순서로 ${road.legs.length}개 구간 다시 계산했습니다.`;
  } catch (error) {
    message.value = error instanceof Error ? `실도로 경로 실패: ${error.message}` : '실도로 경로 실패';
  } finally {
    loading.value = false;
    roadProgress.value = null;
  }
};

const optimizeRoute = async () => {
  loading.value = true;
  message.value = '';
  saveMessage.value = '';
  // 새로 계산한 동선은 새 경로로 본다 — 이전 저장본을 덮어쓰지 않도록 ID를 새로 발급
  currentPlanId.value = '';
  orderedStops.value = [];
  fullPath.value = [];
  failedAddresses.value = [];
  totalDistanceKm.value = 0;
  driveMinutes.value = 0;
  stayMinutes.value = 0;
  totalMinutes.value = 0;
  roadLegs.value = [];
  roadGeometry.value = [];
  roadFailedLegs.value = [];
  roadProgress.value = null;
  rawAddresses.value = defaultFieldTripInput.value;
  lastAutoFilledInput.value = rawAddresses.value;
  try {
    const parsedAddresses = parseAddressLines(rawAddresses.value);
    const visitedBefore = { ...visitedStops.value };
    const skippedVisited: string[] = [];
    const addresses = parsedAddresses.filter((addr) => {
      if (visitedBefore[addr]) {
        skippedVisited.push(addr);
        return false;
      }
      return true;
    });
    if (addresses.length < 2) {
      message.value =
        skippedVisited.length > 0
          ? `미방문 주소가 ${addresses.length}개뿐입니다. 방문 체크를 해제하거나 주소를 추가해 주세요.`
          : '최소 2개 이상의 임장 주소를 입력해 주세요.';
      orderedStops.value = [];
      fullPath.value = [];
      return;
    }
    if (skippedVisited.length > 0) {
      const skippedSet = new Set(skippedVisited);
      const kept = rawAddresses.value
        .split('\n')
        .filter((line) => {
          const normalized = parseAddressLines(line)[0] ?? '';
          return normalized.length === 0 || !skippedSet.has(normalized);
        });
      rawAddresses.value = kept.join('\n');
      const newVisited: Record<string, boolean> = {};
      for (const [addr, flag] of Object.entries(visitedStops.value)) {
        if (!skippedSet.has(addr)) newVisited[addr] = flag;
      }
      visitedStops.value = newVisited;
    }
    const result = await buildOptimizedRoute({
      stopAddresses: addresses,
      startAddress: startAddress.value,
      endAddress: endAddress.value,
      avgSpeedKmh: avgSpeedKmh.value,
      stayMinutesPerStop: stayMinutesPerStop.value,
    });
    orderedStops.value = result.orderedStops;
    fullPath.value = result.fullPath;
    failedAddresses.value = result.failedAddresses;
    totalDistanceKm.value = result.totalDistanceKm;
    driveMinutes.value = result.driveMinutes;
    stayMinutes.value = result.stayMinutes;
    totalMinutes.value = result.totalMinutes;
    message.value =
      `최적 순서 ${result.orderedStops.length}곳 계산 완료` +
      (skippedVisited.length > 0 ? ` (방문 완료 ${skippedVisited.length}곳 제외)` : '');
    lastCalculatedAt.value = new Date().toLocaleTimeString('ko-KR');
    lastInputSignature.value = currentInputSignature.value;

    if (useRoadRouting.value && fullPath.value.length >= 2) {
      try {
        message.value = `${travelMode.value === 'car' ? '도로' : '도보'} 경로 조회 중...`;
        const road = await fetchRouteForPath(fullPath.value, travelMode.value, (done, total) => {
          roadProgress.value = { done, total };
        });
        roadLegs.value = road.legs;
        roadGeometry.value = road.geometry;
        roadFailedLegs.value = road.failedLegs;
        if (road.totalDistanceKm > 0) {
          totalDistanceKm.value = road.totalDistanceKm;
          driveMinutes.value = road.totalDurationMinutes;
          totalMinutes.value = driveMinutes.value + stayMinutes.value;
        }
        await drawRouteMap();
        message.value = `${travelMode.value === 'car' ? '자동차' : '도보'} 경로 ${road.legs.length}개 구간 완료${
          road.failedLegs.length > 0 ? ` · 실패 ${road.failedLegs.length}건` : ''
        }`;
      } catch (roadError) {
        message.value =
          roadError instanceof Error ? `실도로 경로 실패: ${roadError.message}` : '실도로 경로 실패';
      } finally {
        roadProgress.value = null;
      }
    }
  } catch (error) {
    message.value = error instanceof Error ? error.message : '동선 계산 중 오류가 발생했습니다.';
  } finally {
    loading.value = false;
    // 동선 계산 결과를 세션 캐시에 저장 → 다른 메뉴 갔다 와도 복원
    if (fullPath.value.length > 0) {
      cacheCurrentPlanLocally();
      // 최적화가 끝나면 경로를 자동 저장한다 (경로저장 버튼을 대신)
      void savePlan({ silent: true });
    }
  }
};

// 사용자별 임장경로 draft + 즐겨찾기 — Firestore `userPrefs/{uid}`에 저장.
// 디바이스를 옮겨도, 다른 사용자로 로그인하면 안 보이고, 본인 데이터만 복원.
// Firestore는 배열의 배열을 거부하므로 [lat,lng] 튜플은 {lat,lng} 객체로 변환해 저장.
const tuplesToObjects = (arr: Array<[number, number]>) =>
  arr.map(([lat, lng]) => ({ lat, lng }));
const objectsToTuples = (raw: unknown): Array<[number, number]> => {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((p): Array<[number, number]> => {
    if (Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number') {
      return [[p[0], p[1]]];
    }
    if (p && typeof p === 'object' && typeof (p as { lat?: unknown }).lat === 'number' && typeof (p as { lng?: unknown }).lng === 'number') {
      return [[(p as { lat: number }).lat, (p as { lng: number }).lng]];
    }
    return [];
  });
};

const snapshotCurrentPlan = () => ({
  planId: currentPlanId.value,
  rawAddresses: rawAddresses.value,
  startAddress: startAddress.value,
  endAddress: endAddress.value,
  avgSpeedKmh: avgSpeedKmh.value,
  stayMinutesPerStop: stayMinutesPerStop.value,
  travelMode: travelMode.value,
  useRoadRouting: useRoadRouting.value,
  orderedStops: orderedStops.value,
  fullPath: fullPath.value,
  failedAddresses: failedAddresses.value,
  totalDistanceKm: totalDistanceKm.value,
  driveMinutes: driveMinutes.value,
  stayMinutes: stayMinutes.value,
  totalMinutes: totalMinutes.value,
  // Firestore 호환: 각 leg.geometry의 튜플 배열을 객체 배열로
  roadLegs: roadLegs.value.map((leg) => ({
    distanceKm: leg.distanceKm,
    durationMinutes: leg.durationMinutes,
    geometry: tuplesToObjects(leg.geometry),
  })),
  roadGeometry: tuplesToObjects(roadGeometry.value),
  roadFailedLegs: roadFailedLegs.value,
  visitedStops: visitedStops.value,
  lastCalculatedAt: lastCalculatedAt.value,
  lastInputSignature: lastInputSignature.value,
  savedAt: new Date().toISOString(),
});
const cacheCurrentPlanLocally = () => {
  // 명명은 그대로 유지 — 이제 Firestore에 저장 (디바이스 전체 공유 localStorage가 아님)
  const uid = authStore.uid;
  if (!uid) return;
  void saveUserPrefs(uid, { fieldTripDraft: snapshotCurrentPlan() });
};

const applyDraft = (data: Record<string, unknown> | null | undefined) => {
  if (!data || typeof data !== 'object') return;
  // 저장 ID까지 복원해야 새로고침 후의 자동 저장이 같은 문서를 덮어쓴다
  if (typeof data.planId === 'string') currentPlanId.value = data.planId;
  if (typeof data.rawAddresses === 'string') rawAddresses.value = data.rawAddresses;
  if (typeof data.startAddress === 'string') startAddress.value = data.startAddress;
  if (typeof data.endAddress === 'string') endAddress.value = data.endAddress;
  if (typeof data.avgSpeedKmh === 'number') avgSpeedKmh.value = data.avgSpeedKmh;
  if (typeof data.stayMinutesPerStop === 'number') stayMinutesPerStop.value = data.stayMinutesPerStop;
  if (data.travelMode === 'car' || data.travelMode === 'walk') travelMode.value = data.travelMode;
  if (typeof data.useRoadRouting === 'boolean') useRoadRouting.value = data.useRoadRouting;
  if (data.visitedStops && typeof data.visitedStops === 'object') visitedStops.value = data.visitedStops as Record<string, boolean>;
  if (Array.isArray(data.orderedStops)) orderedStops.value = data.orderedStops as typeof orderedStops.value;
  if (Array.isArray(data.fullPath)) fullPath.value = data.fullPath as typeof fullPath.value;
  if (Array.isArray(data.failedAddresses)) failedAddresses.value = data.failedAddresses as string[];
  if (typeof data.totalDistanceKm === 'number') totalDistanceKm.value = data.totalDistanceKm;
  if (typeof data.driveMinutes === 'number') driveMinutes.value = data.driveMinutes;
  if (typeof data.stayMinutes === 'number') stayMinutes.value = data.stayMinutes;
  if (typeof data.totalMinutes === 'number') totalMinutes.value = data.totalMinutes;
  if (Array.isArray(data.roadLegs)) {
    roadLegs.value = (data.roadLegs as Array<Record<string, unknown>>).map((leg) => ({
      distanceKm: typeof leg.distanceKm === 'number' ? leg.distanceKm : 0,
      durationMinutes: typeof leg.durationMinutes === 'number' ? leg.durationMinutes : 0,
      geometry: objectsToTuples(leg.geometry),
    }));
  }
  if (Array.isArray(data.roadGeometry)) roadGeometry.value = objectsToTuples(data.roadGeometry);
  if (Array.isArray(data.roadFailedLegs)) roadFailedLegs.value = data.roadFailedLegs as typeof roadFailedLegs.value;
  if (typeof data.lastCalculatedAt === 'string') lastCalculatedAt.value = data.lastCalculatedAt;
  if (typeof data.lastInputSignature === 'string') lastInputSignature.value = data.lastInputSignature;
  if (typeof data.savedAt === 'string') {
    saveMessage.value = `저장된 경로를 불러왔습니다 (${new Date(data.savedAt).toLocaleString('ko-KR')}).`;
  }
};

const resetCurrentPlanState = () => {
  rawAddresses.value = '';
  startAddress.value = '';
  endAddress.value = '';
  orderedStops.value = [];
  fullPath.value = [];
  failedAddresses.value = [];
  totalDistanceKm.value = 0;
  driveMinutes.value = 0;
  stayMinutes.value = 0;
  totalMinutes.value = 0;
  roadLegs.value = [];
  roadGeometry.value = [];
  roadFailedLegs.value = [];
  visitedStops.value = {};
  lastCalculatedAt.value = '';
  lastInputSignature.value = '';
  saveMessage.value = '';
  favorites.value = [];
};

const restoreUserPlanFromCloud = async (uid: string) => {
  if (!uid) {
    resetCurrentPlanState();
    return;
  }
  const prefs = await loadUserPrefs(uid);
  resetCurrentPlanState();
  if (!prefs) return;
  if (prefs.fieldTripDraft) applyDraft(prefs.fieldTripDraft);
  if (Array.isArray(prefs.fieldTripFavorites)) favorites.value = prefs.fieldTripFavorites;
};

const authStore = useAuthStore();

// 자동 저장은 같은 문서를 덮어쓴다. 클릭마다 새 ID를 만들면 fieldTrips에 문서가 쌓인다.
// 동선최적화를 다시 돌리면 새 경로로 보고 ID를 새로 발급한다.
const currentPlanId = ref('');
const ensurePlanId = (): string => {
  if (!currentPlanId.value) currentPlanId.value = `trip-${Date.now()}`;
  return currentPlanId.value;
};

const savePlan = async (options: { silent?: boolean } = {}) => {
  const { silent = false } = options;
  if (fullPath.value.length === 0) {
    if (silent) return;
    saveMessage.value = '저장할 경로가 없습니다. 먼저 동선 최적화를 실행해 주세요.';
    showToast('저장할 경로가 없습니다. 먼저 동선 최적화를 실행해 주세요.', 'error');
    return;
  }
  if (!authStore.uid) {
    if (silent) return;
    saveMessage.value = '로그인이 필요합니다.';
    showToast('로그인이 필요합니다.', 'error');
    return;
  }
  if (!silent) showToast('경로 저장 중...', 'info');
  try {
    const planId = ensurePlanId();
    await saveFieldTripPlan(planId, {
      uid: authStore.uid,
      title: `임장 동선 ${new Date().toLocaleDateString('ko-KR')}`,
      startAddress: startAddress.value.trim(),
      endAddress: endAddress.value.trim(),
      totalDistanceKm: totalDistanceKm.value,
      driveMinutes: driveMinutes.value,
      stayMinutes: stayMinutes.value,
      totalMinutes: totalMinutes.value,
      stopCount: orderedStops.value.length,
      stops: fullPath.value.map((stop, index) => ({
        order: index + 1,
        kind: stop.kind ?? 'stop',
        address: stop.address,
        lat: stop.lat,
        lng: stop.lng,
      })),
      createdAt: new Date().toISOString(),
    });
    if (!silent) {
      saveMessage.value = '경로를 저장했습니다. (Firestore)';
      showToast('경로를 저장했습니다.', 'success');
    }
    cacheCurrentPlanLocally();
  } catch (error) {
    const msg = error instanceof Error ? error.message : '경로 저장에 실패했습니다.';
    console.error('[FieldTrip] saveFieldTripPlan failed:', error);
    // 자동 저장이라도 실패는 알려야 한다. 조용히 넘기면 저장된 줄 알고 잃는다.
    saveMessage.value = `경로 저장 실패: ${msg}`;
    showToast(`경로 저장 실패: ${msg}`, 'error');
  }
};

// 체크·삭제를 연속으로 누를 때 매번 쓰지 않도록 잠깐 모았다가 한 번만 저장한다
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
const autoSavePlan = () => {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    void savePlan({ silent: true });
  }, 800);
};

// 현재 위치를 출발지로 넣는다.
// Capacitor가 navigator.geolocation의 권한 요청을 네이티브로 처리해주므로
// 별도 플러그인 없이 쓸 수 있다 (AndroidManifest의 위치 권한 선언은 필요).
const locating = ref(false);

const getCurrentCoords = (): Promise<GeolocationPosition> =>
  new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('이 기기에서는 위치 기능을 쓸 수 없습니다.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    });
  });

const useCurrentLocationAsStart = async () => {
  if (locating.value) return;
  locating.value = true;
  try {
    const pos = await getCurrentCoords();
    const { latitude, longitude } = pos.coords;
    const address = await reverseGeocode(latitude, longitude);
    if (!address) {
      showToast('현재 위치의 주소를 찾지 못했습니다.', 'error');
      return;
    }
    startAddress.value = address;
    startDropdownOpen.value = false;
    showToast(`출발지를 현재 위치로 설정했습니다: ${address}`, 'success');
  } catch (error) {
    // PERMISSION_DENIED(1) / POSITION_UNAVAILABLE(2) / TIMEOUT(3)
    const code = (error as GeolocationPositionError | undefined)?.code;
    if (code === 1) {
      showToast('위치 권한이 거부되었습니다. 설정에서 위치 접근을 허용해 주세요.', 'error');
    } else if (code === 3) {
      showToast('위치를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
    } else {
      showToast(error instanceof Error ? error.message : '현재 위치를 가져오지 못했습니다.', 'error');
    }
  } finally {
    locating.value = false;
  }
};

const swapStartEnd = () => {
  const tmp = startAddress.value;
  startAddress.value = endAddress.value;
  endAddress.value = tmp;
};

const favorites = ref<string[]>([]);
const showFavModal = ref(false);

const saveFavorites = () => {
  const uid = authStore.uid;
  if (!uid) return;
  void saveUserPrefs(uid, { fieldTripFavorites: favorites.value });
};
const addFavoriteAddress = (raw: string) => {
  const addr = raw.trim();
  if (!addr) {
    message.value = '주소를 입력해주세요.';
    return false;
  }
  if (favorites.value.includes(addr)) {
    message.value = '이미 즐겨찾기에 있습니다.';
    return false;
  }
  favorites.value = [addr, ...favorites.value];
  saveFavorites();
  message.value = '즐겨찾기에 추가되었습니다.';
  return true;
};
const addCurrentStartToFavorites = () => addFavoriteAddress(startAddress.value);
const addCurrentEndToFavorites = () => addFavoriteAddress(endAddress.value);

interface FavSuggestion {
  placeName: string;
  roadAddress: string;
  jibunAddress: string;
  category: string;
}
const favInput = ref('');
const favSuggestions = ref<FavSuggestion[]>([]);
const favSearching = ref(false);
let favSearchTimer: ReturnType<typeof setTimeout> | null = null;
let favSearchSeq = 0;

const KAKAO_REST_API_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY ?? '';
const KAKAO_BASE = import.meta.env.VITE_KAKAO_GEOCODE_BASE_URL ?? apiPath('/api-kakao');

const fetchFavSuggestions = async (keyword: string) => {
  const seq = ++favSearchSeq;
  if (!keyword || keyword.trim().length < 2) {
    favSuggestions.value = [];
    favSearching.value = false;
    return;
  }
  favSearching.value = true;
  try {
    const params = new URLSearchParams({ query: keyword.trim(), size: '10' });
    const res = await fetch(`${KAKAO_BASE}/v2/local/search/keyword.json?${params.toString()}`, {
      headers: !import.meta.env.DEV && KAKAO_REST_API_KEY
        ? { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` }
        : undefined,
    });
    if (seq !== favSearchSeq) return;
    if (!res.ok) {
      favSuggestions.value = [];
      return;
    }
    const json = (await res.json()) as { documents?: Array<{
      place_name?: string; address_name?: string; road_address_name?: string; category_group_name?: string;
    }> };
    favSuggestions.value = (json.documents ?? []).map((d) => ({
      placeName: d.place_name ?? '',
      roadAddress: d.road_address_name ?? '',
      jibunAddress: d.address_name ?? '',
      category: d.category_group_name ?? '',
    }));
  } catch {
    if (seq === favSearchSeq) favSuggestions.value = [];
  } finally {
    if (seq === favSearchSeq) favSearching.value = false;
  }
};

watch(favInput, (val) => {
  if (favSearchTimer) clearTimeout(favSearchTimer);
  favSearchTimer = setTimeout(() => fetchFavSuggestions(val), 250);
});

const pickFavSuggestion = (s: FavSuggestion) => {
  favInput.value = s.roadAddress || s.jibunAddress || s.placeName;
  favSuggestions.value = [];
};

const addManualFavorite = () => {
  if (addFavoriteAddress(favInput.value)) {
    favInput.value = '';
    favSuggestions.value = [];
  }
};

const applyFavoriteToStart = (addr: string) => {
  startAddress.value = addr;
  showFavModal.value = false;
};
const applyFavoriteToEnd = (addr: string) => {
  endAddress.value = addr;
  showFavModal.value = false;
};
const removeFavorite = (addr: string) => {
  favorites.value = favorites.value.filter((f) => f !== addr);
  saveFavorites();
};
const startDropdownOpen = ref(false);
const endDropdownOpen = ref(false);
const startFilteredFavorites = computed(() => favorites.value);
const endFilteredFavorites = computed(() => favorites.value);
const selectStartFromDropdown = (addr: string) => {
  startAddress.value = addr;
  startDropdownOpen.value = false;
};
const selectEndFromDropdown = (addr: string) => {
  endAddress.value = addr;
  endDropdownOpen.value = false;
};
const closeStartDropdown = () => {
  setTimeout(() => { startDropdownOpen.value = false; }, 150);
};
const closeEndDropdown = () => {
  setTimeout(() => { endDropdownOpen.value = false; }, 150);
};

const formatLastUpdate = computed(() => {
  if (!lastCalculatedAt.value) return '-';
  return lastCalculatedAt.value;
});

const removeStop = async (address: string) => {
  const target = address.trim();
  const lines = rawAddresses.value.split('\n').filter((line) => {
    const normalized = parseAddressLines(line)[0] ?? '';
    return normalized !== target;
  });
  rawAddresses.value = lines.join('\n');
  lastAutoFilledInput.value = rawAddresses.value;

  fullPath.value = fullPath.value.filter(
    (p) => !(p.kind === 'stop' && p.address.trim() === target),
  );
  orderedStops.value = orderedStops.value.filter((p) => p.address.trim() !== target);

  autoSavePlan();
  const matched = store.auctions.find((item) => item.address.trim() === target);
  if (matched) {
    await store.setStatus(matched.id, '보류');
    showToast(`동선최적화를 다시 실행하세요.`, 'info');
  } else {
    showToast('동선최적화를 다시 누르세요.', 'info');
  }
};

type ToastTone = 'info' | 'success' | 'error';
const toastVisible = ref(false);
const toastText = ref('');
const toastTone = ref<ToastTone>('info');
let toastTimer: ReturnType<typeof setTimeout> | null = null;
const showToast = (text: string, tone: ToastTone = 'info') => {
  if (!text) return;
  toastText.value = text;
  toastTone.value = tone;
  toastVisible.value = true;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastVisible.value = false; }, 2600);
};
const inferTone = (text: string): ToastTone => {
  if (/실패|오류|에러|없습니다|먼저/.test(text)) return 'error';
  if (/완료|저장|복사|불러|추가|성공/.test(text)) return 'success';
  return 'info';
};
watch(message, (val) => {
  if (val) showToast(val, inferTone(val));
});
watch(saveMessage, (val) => {
  if (val) showToast(val, inferTone(val));
});

onMounted(() => {
  void restoreUserPlanFromCloud(authStore.uid);
});
watch(() => authStore.uid, (newUid) => {
  void restoreUserPlanFromCloud(newUid);
});
</script>

<template>
  <section class="ftp-shell">
    <div class="ftp-scroll" @scroll.passive="mapActive && lockMap()">
    <div class="ftp-fixed-top">
    <div class="ftp-section-title">
      <span>임장경로</span>
      <button type="button" class="ftp-collapse" :aria-expanded="!summaryCollapsed" @click="summaryCollapsed = !summaryCollapsed">
        <img :src="chevronDownIcon" alt="" :class="['ftp-chev-img', { up: summaryCollapsed }]" />
      </button>
    </div>

    <div v-if="!summaryCollapsed" class="ftp-stats-grid">
      <article class="ftp-stat">
        <small>물건방문</small>
        <div class="ftp-stat-row">
          <img :src="mapPinIcon" alt="" class="ftp-stat-icon" />
          <strong>{{ stopCount || 0 }}<em>개</em></strong>
        </div>
      </article>
      <article class="ftp-stat">
        <small>방문예정 건수</small>
        <div class="ftp-stat-row">
          <img :src="mapPinPlusIcon" alt="" class="ftp-stat-icon" />
          <strong>{{ pendingVisitCount }}<em>건</em></strong>
        </div>
      </article>
    </div>

    <div class="ftp-section-title">
      <span class="ftp-section-title-main">
        경로설정
      </span>
      <button type="button" class="ftp-collapse" :aria-expanded="!settingsCollapsed" @click="settingsCollapsed = !settingsCollapsed">
        <img :src="chevronDownIcon" alt="" :class="['ftp-chev-img', { up: settingsCollapsed }]" />
      </button>
    </div>

    <div v-if="!settingsCollapsed" class="ftp-settings">
      <div class="ftp-nav-launch-row">
        <button
          type="button"
          :class="['ftp-nav-launch-btn', { active: selectedNav === 'naver' }]"
          aria-label="네이버 내비게이션 실행"
          @click="chooseNavAndLaunch('naver')"
        >
          <img :src="naverNaviIcon" alt="" class="ftp-nav-badge-img" />
          <span>네이버</span>
        </button>
        <button
          type="button"
          :class="['ftp-nav-launch-btn', { active: selectedNav === 'tmap' }]"
          aria-label="티맵 내비게이션 실행"
          @click="chooseNavAndLaunch('tmap')"
        >
          <img :src="tmapNaviIcon" alt="" class="ftp-nav-badge-img" />
          <span>티맵</span>
        </button>
        <button
          type="button"
          :class="['ftp-nav-launch-btn', { active: selectedNav === 'kakao' }]"
          aria-label="카카오맵 내비게이션 실행"
          @click="chooseNavAndLaunch('kakao')"
        >
          <img :src="kakaoNaviIcon" alt="" class="ftp-nav-badge-img" />
          <span>카카오</span>
        </button>
      </div>

      <div class="ftp-od-row">
        <div class="ftp-od-fields">
          <div class="ftp-od-field ftp-od-field-wrap">
            <img :src="flagIcon" alt="" class="ftp-od-flag-img" />
            <input
              v-model="startAddress"
              placeholder="출발지입력"
              @focus="startDropdownOpen = true"
              @blur="closeStartDropdown"
            />
            <button
              type="button"
              class="ftp-od-toggle"
              aria-label="저장된 출발지 보기"
              @mousedown.prevent
              @click="startDropdownOpen = !startDropdownOpen"
            >▾</button>
            <ul v-if="startDropdownOpen && startFilteredFavorites.length > 0" class="ftp-od-dropdown">
              <li
                v-for="addr in startFilteredFavorites"
                :key="'s-' + addr"
                class="ftp-od-dropdown-item"
                @mousedown.prevent="selectStartFromDropdown(addr)"
              >{{ addr }}</li>
            </ul>
          </div>
          <button type="button" class="ftp-od-swap" aria-label="출발/도착 교환" @click="swapStartEnd">
            <img :src="arrowUpDownIcon" alt="" class="ftp-od-swap-img" />
          </button>
          <div class="ftp-od-field ftp-od-field-wrap">
            <img :src="flagIcon" alt="" class="ftp-od-flag-img" />
            <input
              v-model="endAddress"
              placeholder="도착지입력"
              @focus="endDropdownOpen = true"
              @blur="closeEndDropdown"
            />
            <button
              type="button"
              class="ftp-od-toggle"
              aria-label="저장된 도착지 보기"
              @mousedown.prevent
              @click="endDropdownOpen = !endDropdownOpen"
            >▾</button>
            <ul v-if="endDropdownOpen && endFilteredFavorites.length > 0" class="ftp-od-dropdown">
              <li
                v-for="addr in endFilteredFavorites"
                :key="'e-' + addr"
                class="ftp-od-dropdown-item"
                @mousedown.prevent="selectEndFromDropdown(addr)"
              >{{ addr }}</li>
            </ul>
          </div>
        </div>
        <button
          type="button"
          class="ftp-fav ftp-gps-btn"
          :disabled="locating"
          aria-label="현재 위치를 출발지로"
          title="현재 위치를 출발지로"
          @click="useCurrentLocationAsStart"
        >
          <span class="ftp-gps-icon">{{ locating ? '…' : '◎' }}</span>
          <span class="ftp-fav-text">내 위치</span>
        </button>
        <button type="button" class="ftp-fav" aria-label="즐겨찾기" @click="showFavModal = true">
          <img :src="mapPinPlusIcon" alt="" class="ftp-fav-icon-img" />
          <span class="ftp-fav-text">즐겨찾기</span>
        </button>
      </div>

      <div class="ftp-action-row">
        <button type="button" class="ftp-action ftp-action-optimize" :disabled="loading" @click="optimizeRoute">
          <img :src="infoIcon" alt="" class="ftp-action-icon-img" />{{ loading ? '계산중' : '동선최적화' }}
        </button>
      </div>

    </div>

    <div class="ftp-update-bar">
      <strong class="ftp-update-title">동선최적화</strong>
      <span class="ftp-update-time">UPDATE : {{ formatLastUpdate }}</span>
      <button class="ftp-update-copy" type="button" aria-label="주소 일괄복사" @click="copyAddress(rawAddresses)">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="8" y="8" width="13" height="13" rx="2"/>
          <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>
        </svg>
      </button>
    </div>

    </div>

      <div class="ftp-list">
        <template v-if="fullPath.length > 0">
          <article
            v-for="(stop, idx) in fullPath"
            :key="`${stop.kind ?? 'stop'}-${stop.address}`"
            :data-idx="idx"
            :class="['ftp-stop', `kind-${stop.kind ?? 'stop'}`, {
              visited: stop.kind === 'stop' && visitedStops[stop.address],
              dragging: dragFromIdx === idx,
            }]"
          >
            <span
              :class="['ftp-stop-badge', `tone-${stop.kind ?? 'stop'}`, { drag: stop.kind === 'stop' }]"
              :title="stop.kind === 'stop' ? '끌어서 순서 변경' : ''"
              @pointerdown="onStopDragStart(idx, $event)"
              @pointermove="onStopDragMove"
              @pointerup="onStopDragEnd"
              @pointercancel="onStopDragEnd"
            >
              <template v-if="stop.kind === 'start'">S</template>
              <template v-else-if="stop.kind === 'end'">E</template>
              <template v-else>{{ stopOrdinal(idx) }}</template>
            </span>
            <span
              class="ftp-stop-addr"
              :title="stop.address"
              @click="toggleAddrBubble(idx)"
            >{{ stop.address }}</span>
            <div
              :class="['ftp-addr-bubble', { open: addrBubbleIdx === idx }]"
              @click.stop="addrBubbleIdx = null"
            >{{ stop.address }}</div>
            <button
              v-if="stop.kind === 'stop'"
              type="button"
              class="ftp-stop-icon"
              :disabled="!auctionIdByAddress(stop.address)"
              aria-label="물건상세"
              title="물건상세 보기"
              @click="goDetailByAddress(stop.address)"
            >
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            <span v-else class="ftp-stop-icon ftp-stop-spacer" aria-hidden="true" />
            <button
              v-if="idx > 0"
              type="button"
              class="ftp-stop-icon ftp-stop-nav"
              aria-label="네이버 네비게이션"
              title="이전 지점 → 여기 (네이버 네비)"
              @click="openLegNav(idx)"
            >
              <img :src="mapPinnedIcon" alt="" class="ftp-stop-glyph-img" />
            </button>
            <span v-else class="ftp-stop-icon ftp-stop-spacer" aria-hidden="true" />
            <button
              v-if="stop.kind === 'stop'"
              type="button"
              class="ftp-stop-icon"
              :class="{ checked: visitedStops[stop.address] }"
              aria-label="방문완료"
              title="방문 토글"
              @click="toggleVisited(stop.address)"
            >
              <img :src="squareCheckIcon" alt="" class="ftp-stop-glyph-img" />
            </button>
            <button
              v-if="stop.kind === 'stop'"
              type="button"
              class="ftp-stop-icon ftp-stop-delete"
              aria-label="삭제"
              title="목록에서 제거"
              @click="removeStop(stop.address)"
            >
              <img :src="squareXIcon" alt="" class="ftp-stop-glyph-img" />
            </button>
            <span v-if="stop.kind !== 'stop'" class="ftp-stop-icon ftp-stop-spacer" aria-hidden="true" />
            <span v-if="stop.kind !== 'stop'" class="ftp-stop-icon ftp-stop-spacer" aria-hidden="true" />
          </article>
        </template>
        <p v-else class="ftp-empty">관심리스트의 임장예정 주소를 자동으로 불러옵니다. 동선최적화를 누르세요.</p>
      </div>

      <div :class="['ftp-map-wrap', { big: mapBig }]">
        <div id="trip-map" class="ftp-map" />
        <!-- 확대는 처음부터 되고, 한 손가락 이동만 눌러서 켠다 -->
        <span v-if="!mapActive" class="ftp-map-hint">두 손가락으로 확대 · 한 번 눌러 지도 이동</span>
        <button type="button" class="ftp-map-top" :title="mapBig ? '지도 작게' : '지도 크게'" @click="toggleMapSize">
          {{ mapBig ? '지도 작게' : '지도 크게' }}
        </button>
      </div>
    </div>

    <AppMobileBottomNav active="field-trip" />

    <transition name="ftp-toast-anim">
      <div v-if="toastVisible" :class="['ftp-toast', `ftp-toast-${toastTone}`]" role="status">
        <span class="ftp-toast-dot" />
        <span class="ftp-toast-text">{{ toastText }}</span>
      </div>
    </transition>

    <div v-if="showFavModal" class="ftp-fav-modal" @click.self="showFavModal = false">
      <div class="ftp-fav-modal-card">
        <div class="ftp-fav-modal-head">
          <strong>즐겨찾기</strong>
          <button type="button" class="ftp-fav-modal-close" aria-label="닫기" @click="showFavModal = false">✕</button>
        </div>
        <div class="ftp-fav-modal-current">
          <div class="ftp-fav-modal-save-row">
            <button type="button" class="ftp-fav-modal-save" @click="addCurrentStartToFavorites">
              ＋ 현재 출발지 저장
            </button>
            <button type="button" class="ftp-fav-modal-save" @click="addCurrentEndToFavorites">
              ＋ 현재 도착지 저장
            </button>
          </div>
          <div class="ftp-fav-modal-manual-wrap">
            <div class="ftp-fav-modal-manual">
              <input
                v-model="favInput"
                type="text"
                class="ftp-fav-modal-manual-input"
                placeholder="직접 주소 입력 (예: 청라 웰카운티)"
                @keydown.enter.prevent="addManualFavorite"
              />
              <button type="button" class="ftp-fav-modal-manual-btn" @click="addManualFavorite">추가</button>
            </div>
            <ul v-if="favSuggestions.length > 0" class="ftp-fav-modal-suggest">
              <li
                v-for="(s, i) in favSuggestions"
                :key="`${s.placeName}-${i}`"
                class="ftp-fav-modal-suggest-item"
                @click="pickFavSuggestion(s)"
              >
                <div class="ftp-fav-modal-suggest-row">
                  <span class="ftp-fav-modal-suggest-name">{{ s.placeName || (s.roadAddress || s.jibunAddress) }}</span>
                  <span v-if="s.category" class="ftp-fav-modal-suggest-cat">{{ s.category }}</span>
                </div>
                <div class="ftp-fav-modal-suggest-addr">{{ s.roadAddress || s.jibunAddress }}</div>
              </li>
            </ul>
            <p v-else-if="favSearching" class="ftp-fav-modal-suggest-empty">검색 중…</p>
          </div>
        </div>
        <div class="ftp-fav-modal-list">
          <p v-if="favorites.length === 0" class="ftp-fav-modal-empty">저장된 즐겨찾기가 없습니다.</p>
          <div v-for="addr in favorites" :key="addr" class="ftp-fav-modal-item">
            <span class="ftp-fav-modal-item-addr">{{ addr }}</span>
            <div class="ftp-fav-modal-item-actions">
              <button type="button" class="ftp-fav-modal-apply ftp-fav-modal-apply-start" @click="applyFavoriteToStart(addr)">출발</button>
              <button type="button" class="ftp-fav-modal-apply ftp-fav-modal-apply-end" @click="applyFavoriteToEnd(addr)">도착</button>
              <button type="button" class="ftp-fav-modal-item-del" aria-label="삭제" @click="removeFavorite(addr)">✕</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ftp-shell {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #f4f6fb;
  overflow: hidden;
  z-index: 100;
}

.ftp-fixed-top { background: #fff; }
/* 목록이 길어도 어느 목록인지 보이게 '동선최적화 UPDATE' 줄만 위에 붙여 둔다 */
.ftp-update-bar { position: sticky; top: 0; z-index: 20; }
.ftp-scroll {
  flex: 1 1 auto; min-height: 0;
  overflow-y: auto;
  padding: 0 0 8px;
  -webkit-overflow-scrolling: touch;
}
.ftp-shell :deep(.amb) { position: relative; flex: 0 0 auto; }

.ftp-header {
  background: linear-gradient(135deg, #2b6df3 0%, #1f53d6 100%);
  color: #fff;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 10;
}
.ftp-brand { display: flex; align-items: center; gap: 10px; }
.ftp-brand-logo {
  width: 32px; height: 32px; border-radius: 7px; object-fit: contain;
  background: #fff; padding: 3px;
}
.ftp-brand-text { display: flex; flex-direction: column; line-height: 1.05; }
.ftp-brand-text strong { font-size: 16px; font-weight: 800; letter-spacing: 0.4px; }
.ftp-brand-text span { font-size: 10px; font-weight: 600; opacity: 0.85; letter-spacing: 1.2px; }
.ftp-header-icons { display: flex; align-items: center; gap: 4px; }
.ftp-icon-btn {
  width: 38px; height: 38px; border-radius: 50%;
  background: transparent; border: none;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; color: #fff;
}
.ftp-icon-btn svg { width: 22px; height: 22px; }
.ftp-icon-btn:active { background: rgba(255,255,255,0.15); }

.ftp-section-title {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px 4px;
  font-size: 14px; font-weight: 800; color: #111827;
  background: #fff;
}
.ftp-help {
  border: 1.5px solid #cbd5e1; background: #fff;
  width: 16px; height: 16px; border-radius: 50%;
  font-size: 10px; color: #6b7280; cursor: pointer;
  margin-left: 4px; line-height: 1;
}
.ftp-collapse {
  border: none; background: transparent; cursor: pointer; color: #6b7280;
  display: inline-flex; align-items: center; justify-content: center; padding: 4px;
}
.ftp-chev {
  font-size: 16px; display: inline-block; transition: transform 0.2s ease;
}
.ftp-chev.up { transform: rotate(180deg); }
.ftp-chev-img {
  width: 18px; height: 18px; object-fit: contain; display: block;
  transition: transform 0.2s ease;
}
.ftp-chev-img.up { transform: rotate(180deg); }

.ftp-stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding: 4px 10px 10px;
  background: #fff;
  border-bottom: 1px solid #eef0f5;
}
.ftp-stat {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 8px 6px;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  min-width: 0;
}
.ftp-stat small { font-size: 10px; color: #6b7280; font-weight: 600; }
.ftp-stat-row { display: inline-flex; align-items: center; gap: 4px; }
.ftp-stat-icon { width: 16px; height: 16px; object-fit: contain; flex-shrink: 0; }
.ftp-stat strong {
  font-size: 16px; font-weight: 800; color: #111827;
  white-space: nowrap;
}
.ftp-stat strong em {
  font-size: 11px; font-style: normal; font-weight: 700; color: #6b7280; margin-left: 1px;
}

.ftp-settings {
  background: #fff;
  padding: 8px 12px 12px;
  border-bottom: 1px solid #eef0f5;
}
.ftp-nav-launch-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 8px;
}
.ftp-nav-launch-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border: 1.5px solid #cbd5e1; background: #fff; color: #1f2937;
  border-radius: 10px; padding: 8px 6px; font-size: 12px; font-weight: 700;
  cursor: pointer; white-space: nowrap; min-width: 0;
}
.ftp-nav-launch-btn:hover:not(:disabled) { background: #f3f6fc; border-color: #9ca3af; }
.ftp-nav-launch-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ftp-nav-launch-btn.active {
  border-color: #2b6df3; background: #e9f0ff; color: #1f53d6;
}
.ftp-nav-badge-img {
  width: 22px; height: 22px; object-fit: contain; flex-shrink: 0;
  border-radius: 5px;
}
.ftp-section-title-main {
  display: inline-flex; align-items: baseline; gap: 6px; min-width: 0;
  flex: 1 1 auto;
}
.ftp-section-title-desc {
  font-size: 11px; font-weight: 500; color: #6b7280; font-style: normal;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.ftp-od-row {
  display: flex; gap: 6px; margin-bottom: 8px;
}
.ftp-od-fields {
  flex: 1 1 auto; min-width: 0; position: relative;
  display: flex; flex-direction: column; gap: 4px;
}
.ftp-od-field {
  display: flex; align-items: center; gap: 6px;
  border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px 10px; background: #fff;
  min-width: 0;
}
.ftp-od-flag { color: #6b7280; font-size: 13px; flex-shrink: 0; }
.ftp-od-flag-img { width: 14px; height: 14px; object-fit: contain; flex-shrink: 0; }
.ftp-od-swap-img { width: 22px; height: 22px; object-fit: contain; }
.ftp-od-field input {
  flex: 1 1 auto; border: none; outline: none; background: transparent;
  font-size: 12px; color: #111827; min-width: 0;
}
.ftp-od-field input::placeholder { color: #9ca3af; }
.ftp-od-field-wrap { position: relative; }
.ftp-gps-btn { color: #2b6df3; }
.ftp-gps-btn:disabled { opacity: 0.5; cursor: progress; }
.ftp-gps-btn:active { opacity: 0.6; }
.ftp-gps-icon { font-size: 18px; font-weight: 800; line-height: 1; }

.ftp-od-toggle {
  flex-shrink: 0; border: none; background: transparent; color: #6b7280;
  font-size: 15px; cursor: pointer; padding: 0 4px; line-height: 1;
}
/* 출발·도착 입력칸 사이의 경유지 미리보기 */
.ftp-via { margin: 2px 0; }
.ftp-via-head {
  width: 100%; border: none; background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: space-between;
  padding: 4px 6px; color: #4b5563; font-size: 12px; font-weight: 700;
}
.ftp-via-chev { font-size: 9px; color: #9ca3af; }
.ftp-via-excluded {
  margin-left: 6px; font-style: normal; font-size: 11px;
  color: #b45309; background: #fef3c7; border-radius: 6px; padding: 1px 6px;
}
.ftp-via-restore-row { padding: 4px 6px 2px 10px; }
.ftp-via-restore {
  border: none; background: transparent; cursor: pointer;
  color: #2b6df3; font-size: 11px; font-weight: 700; padding: 2px 0;
}
.ftp-via-list {
  margin: 0; padding: 0; list-style: none;
  border-left: 2px dotted #cbd5e1; margin-left: 12px;
}
.ftp-via-item {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 6px 5px 10px;
}
.ftp-via-dot {
  flex-shrink: 0; width: 7px; height: 7px; border-radius: 50%;
  background: #7aa2f7; margin-left: -14px;
}
.ftp-via-addr {
  flex: 1 1 auto; min-width: 0;
  font-size: 12px; color: #374151;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ftp-via-del {
  flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%;
  border: 1px solid #d1d5db; background: #fff; color: #6b7280;
  font-size: 13px; line-height: 1; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.ftp-via-del:active { opacity: 0.55; }


.ftp-od-gps {
  flex-shrink: 0; border: none; background: transparent; color: #2b6df3;
  font-size: 17px; cursor: pointer; padding: 0 4px; line-height: 1;
  font-weight: 800;
}
.ftp-od-gps:disabled { opacity: 0.5; cursor: progress; }
.ftp-od-gps:active { opacity: 0.55; }
.ftp-od-dropdown {
  position: absolute; left: 0; right: 0; top: calc(100% + 2px);
  background: #fff; border: 1px solid #cbd5e1; border-radius: 8px;
  margin: 0; padding: 4px 0; list-style: none;
  max-height: 180px; overflow: auto;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);
  z-index: 20;
}
.ftp-od-dropdown-item {
  padding: 7px 12px; font-size: 12px; color: #111827; cursor: pointer;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ftp-od-dropdown-item:hover, .ftp-od-dropdown-item:active { background: #f1f5f9; }
.ftp-od-swap {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 26px; height: 26px;
    background: transparent; border: none; padding: 0;
  color: #6b7280; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  z-index: 3;
}
.ftp-fav {
  flex: 0 0 80px;
  border: 1px solid #e5e7eb; background: #fff; border-radius: 10px;
  cursor: pointer; padding: 6px 4px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  color: #4b5563;
}
.ftp-fav-icon { font-size: 16px; }
.ftp-fav-icon sup { font-size: 11px; font-weight: 800; color: #2b6df3; }
.ftp-fav-icon-img { width: 20px; height: 20px; object-fit: contain; }
.ftp-fav-text { font-size: 11px; font-weight: 700; }

.ftp-action-row {
  display: flex; align-items: center; justify-content: center;
}
.ftp-action {
  border: none; border-radius: 12px;
  padding: 14px 40px; font-size: 16px; font-weight: 800; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  color: #fff;
  white-space: nowrap;
  min-width: 220px;
}
.ftp-action:disabled { opacity: 0.55; cursor: not-allowed; }
.ftp-action-optimize { background: #ef6b6b; }
.ftp-action-icon { font-size: 13px; }
.ftp-action-icon-img { width: 20px; height: 20px; object-fit: contain; filter: brightness(0) invert(1); }

.ftp-update-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px 6px;
  background: #f4f6fb;
}
.ftp-update-title { font-size: 13px; font-weight: 800; color: #111827; }
.ftp-update-time { font-size: 11px; color: #6b7280; }
.ftp-update-copy {
  margin-left: auto; border: none; background: transparent; cursor: pointer; color: #4b5563;
  padding: 6px;
  display: inline-flex; align-items: center; justify-content: center;
}
.ftp-update-copy svg { width: 26px; height: 26px; }
.ftp-update-copy:active { opacity: 0.55; }

.ftp-fav-modal {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 100; padding: 20px;
}
.ftp-fav-modal-card {
  background: #fff; border-radius: 14px; width: 100%; max-width: 380px;
  max-height: 80vh; display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.25);
}
.ftp-fav-modal-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-bottom: 1px solid #eef0f5;
}
.ftp-fav-modal-head strong { font-size: 15px; color: #111827; font-weight: 800; }
.ftp-fav-modal-close {
  border: none; background: transparent; font-size: 16px; color: #6b7280; cursor: pointer;
}
.ftp-fav-modal-current {
  padding: 10px 14px; background: #f8fafc; border-bottom: 1px solid #eef0f5;
  display: flex; flex-direction: column; gap: 6px;
  flex-shrink: 0;
}
.ftp-fav-modal-save-row { display: flex; gap: 6px; }
.ftp-fav-modal-save {
  flex: 1 1 0; border: 1.5px solid #2b6df3; background: #fff; color: #2b6df3;
  border-radius: 8px; padding: 8px; font-size: 11px; font-weight: 800; cursor: pointer;
}
.ftp-fav-modal-manual-wrap { margin-top: 8px; }
.ftp-fav-modal-manual { display: flex; gap: 6px; }
.ftp-fav-modal-manual-input {
  flex: 1 1 auto; min-width: 0;
  border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 7px 10px; font-size: 12px; color: #111827; background: #fff; outline: none;
}
.ftp-fav-modal-manual-input:focus { border-color: #2b6df3; }
.ftp-fav-modal-manual-btn {
  flex: 0 0 auto; border: none; background: #2b6df3; color: #fff;
  border-radius: 8px; padding: 7px 14px; font-size: 12px; font-weight: 800; cursor: pointer;
}
.ftp-fav-modal-suggest {
  list-style: none; margin: 4px 0 0; padding: 4px;
  max-height: 180px; overflow-y: auto; -webkit-overflow-scrolling: touch;
  border: 1px solid #e5e7eb; border-radius: 8px; background: #fff;
  overscroll-behavior: contain;
}
.ftp-fav-modal-suggest-item {
  padding: 8px 10px; border-radius: 6px; cursor: pointer;
}
.ftp-fav-modal-suggest-item:hover { background: #f3f6fc; }
.ftp-fav-modal-suggest-row { display: flex; align-items: baseline; gap: 6px; }
.ftp-fav-modal-suggest-name {
  font-size: 12px; font-weight: 700; color: #1d4ed8;
  flex: 1 1 auto; min-width: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ftp-fav-modal-suggest-cat { font-size: 10px; color: #9ca3af; flex-shrink: 0; }
.ftp-fav-modal-suggest-addr {
  font-size: 11px; color: #6b7280; margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ftp-fav-modal-suggest-empty {
  margin: 4px 0 0; font-size: 11px; color: #9ca3af; text-align: center;
}
.ftp-fav-modal-list { flex: 1 1 auto; overflow: auto; padding: 6px 8px 10px; }
.ftp-fav-modal-empty { text-align: center; color: #9ca3af; font-size: 12px; padding: 14px 0; margin: 0; }
.ftp-fav-modal-item {
  display: flex; align-items: center; gap: 6px;
  border: 1px solid #eef0f5; border-radius: 10px; margin-bottom: 6px; background: #fff;
  padding: 8px 10px;
}
.ftp-fav-modal-item-addr {
  flex: 1 1 auto; min-width: 0; font-size: 12px; color: #111827;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ftp-fav-modal-item-actions { display: inline-flex; gap: 8px; flex-shrink: 0; }
.ftp-fav-modal-apply {
  border: 1px solid #cbd5e1; background: #fff; color: #4b5563;
  border-radius: 6px; padding: 4px 8px; font-size: 11px; font-weight: 700; cursor: pointer;
}
.ftp-fav-modal-apply-start { border-color: #2b6df3; color: #2b6df3; }
.ftp-fav-modal-apply-end { border-color: #16a085; color: #16a085; }
.ftp-fav-modal-item-del {
  border: 1px solid #cbd5e1; background: #fff; color: #9ca3af;
  border-radius: 6px; padding: 4px 8px; font-size: 11px; font-weight: 700; cursor: pointer;
}

.ftp-nav-chip {
  display: inline-flex; align-items: center; justify-content: center;
  gap: 5px;
  font-size: 10.5px; font-weight: 600; color: #047857;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 6px;
  padding: 3px 9px;
  letter-spacing: 0.1px;
  white-space: nowrap; overflow: hidden;
}
.ftp-nav-chip::before {
  content: '';
  width: 5px; height: 5px; border-radius: 50%;
  background: #10b981;
  flex-shrink: 0;
}
.ftp-section-chip {
  flex: 1 1 auto; min-width: 0; max-width: 60%;
  margin: 0 6px;
}
.ftp-nav-chip-text {
  flex: 1 1 auto; min-width: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center;
}
.ftp-nav-chip-reset {
  flex-shrink: 0;
  border: none; background: transparent; cursor: pointer;
  color: #047857; font-size: 12px; line-height: 1; padding: 0 2px;
}

.ftp-toast {
  position: fixed; left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  background: rgba(17, 24, 39, 0.92); color: #fff;
  padding: 12px 18px; border-radius: 14px;
  display: inline-flex; align-items: center; gap: 10px;
  font-size: 13px; font-weight: 700;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.35);
  z-index: 9999; max-width: 84vw; min-width: 200px;
  justify-content: center; text-align: center;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.ftp-toast-text { white-space: pre-wrap; }
.ftp-toast-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  background: #60a5fa;
}
.ftp-toast-success .ftp-toast-dot { background: #34d399; }
.ftp-toast-error .ftp-toast-dot { background: #f87171; }
.ftp-toast-anim-enter-active, .ftp-toast-anim-leave-active {
  transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ftp-toast-anim-enter-from {
  opacity: 0; transform: translate(-50%, calc(-50% + 8px)) scale(0.96);
}
.ftp-toast-anim-leave-to {
  opacity: 0; transform: translate(-50%, calc(-50% - 4px)) scale(0.98);
}

.ftp-list {
  padding: 0 10px 10px;
}
.ftp-empty {
  text-align: center; color: #9ca3af; font-size: 12px; padding: 20px 12px;
}
.ftp-stop {
  position: relative;
  display: flex; align-items: center; gap: 8px;
  background: #f1f5fb; border-radius: 10px;
  padding: 8px 10px; margin-bottom: 6px;
  border: 1px solid transparent;
}

/* 잘린 주소 전체를 보여주는 말풍선.
   .ftp-stop-addr는 overflow:hidden이라 그 안에 두면 잘린다 — 행(.ftp-stop) 기준으로 띄운다. */
.ftp-addr-bubble {
  display: none;
  position: absolute; z-index: 20;
  left: 34px; right: 10px; top: calc(100% - 3px);
  background: #111827; color: #fff;
  font-size: 12px; font-weight: 600; line-height: 1.45;
  padding: 8px 10px; border-radius: 8px;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.28);
  word-break: break-all; cursor: pointer;
}
.ftp-addr-bubble::before {
  content: '';
  position: absolute; top: -5px; left: 16px;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 5px solid #111827;
}
.ftp-addr-bubble.open { display: block; }
/* 마우스가 있는 환경에서만 hover로 연다 — 터치에서는 탭으로 연다 */
@media (hover: hover) {
  .ftp-stop:hover .ftp-addr-bubble { display: block; }
}
.ftp-stop.kind-start { background: #e6f8ee; }
.ftp-stop.kind-end { background: #fff3e0; }
.ftp-stop.visited .ftp-stop-addr { text-decoration: line-through; color: #9ca3af; }
.ftp-stop-badge {
  flex-shrink: 0;
  width: 22px; height: 22px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 800; color: #fff;
  background: #2b6df3;
}
.ftp-stop-icon:disabled { opacity: 0.35; cursor: default; }
.ftp-stop-badge.drag { cursor: grab; touch-action: none; user-select: none; }
.ftp-stop-badge.drag:active { cursor: grabbing; }
.ftp-stop.dragging { border-color: #2b6df3; background: #e8f0ff; }
.ftp-stop-badge.tone-start { background: #16a085; }
.ftp-stop-badge.tone-end { background: #f59e0b; }
.ftp-stop-addr {
  flex: 1 1 auto; min-width: 0;
  font-size: 13px; font-weight: 700; color: #111827;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  cursor: pointer;
}
.ftp-stop-icon {
  flex-shrink: 0;
  width: 28px; height: 28px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #4b5563;
  border-radius: 0;
  padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
}
.ftp-stop-icon svg { width: 20px; height: 20px; display: block; }
.ftp-stop-glyph { font-size: 18px; line-height: 1; font-weight: 700; }
.ftp-stop-glyph-img { width: 22px; height: 22px; object-fit: contain; display: block; }
.ftp-stop-nav .ftp-stop-glyph { transform: rotate(-30deg); display: inline-block; }
.ftp-stop-icon.ftp-stop-spacer { pointer-events: none; }
.ftp-stop-icon:active { opacity: 0.55; transform: scale(0.88); }
/* 방문완료 — 옅은 초록 바탕에 초록 체크 정도로만 표시한다 */
.ftp-stop-icon.checked { background: #e3f5ee; border-radius: 8px; }
.ftp-stop-icon.checked .ftp-stop-glyph-img {
  filter: invert(48%) sepia(46%) saturate(729%) hue-rotate(118deg) brightness(93%) contrast(92%);
}

.ftp-map-wrap {
  position: relative; flex: 0 0 auto;
  height: 300px; margin: 0 10px 14px;
  transition: height 0.18s ease;
}
.ftp-map-wrap.big { height: 70vh; }
/* 잠김 안내 — 손가락을 가로채지 않게 표시만 한다 */
.ftp-map-hint {
  position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%);
  z-index: 500; pointer-events: none;
  background: rgba(255, 255, 255, 0.92); border-radius: 999px;
  padding: 3px 10px; font-size: 10.5px; font-weight: 700; color: #4b5563;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.18);
}
.ftp-map {
  height: 100%;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
}
/* 지도 크기 토글 — 지도 위에 항상 떠 있다 */
.ftp-map-top {
  position: absolute; top: 10px; right: 10px; z-index: 600;
  border: 1px solid #d5dbe6; border-radius: 999px;
  background: rgba(255, 255, 255, 0.95); color: #2b6df3;
  padding: 5px 11px; font-size: 11.5px; font-weight: 800; cursor: pointer;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.15);
}
.ftp-map-top:active { background: #eaf1ff; }

.ftp-bottom-nav {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  background: #fff;
  border-top: 1px solid #eef0f5;
  padding: 6px 0 max(6px, env(safe-area-inset-bottom));
  z-index: 11;
}
.ftp-nav-item {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px; border: none; background: transparent;
  font-size: 11px; color: #6b7280; cursor: pointer; padding: 4px 0;
}
.ftp-nav-icon { font-size: 18px; line-height: 1; }
.ftp-nav-item.active { color: #2b6df3; font-weight: 800; }

@media (min-width: 768px) {
  .ftp-shell { max-width: 480px; margin: 0 auto; box-shadow: 0 0 0 1px #e5e7eb; }
}
</style>
