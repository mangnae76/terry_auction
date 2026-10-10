<script setup lang="ts">
import { Browser } from '@capacitor/browser';
import { Clipboard } from '@capacitor/clipboard';
import { Capacitor } from '@capacitor/core';
import L from 'leaflet';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { saveFieldTripPlan } from '../services/auctionRepository';
import { buildOptimizedRoute, parseAddressLines, reverseGeocode, type GeoPoint } from '../services/routeOptimizer';
import { fetchRouteForPath, type RouteLeg, type RouteMode } from '../services/roadRouting';
import { apiPath } from '../services/apiBase';
import { useAuctionStore } from '../stores/auctionStore';
import { AUCTION_STATUS_LABELS, type AuctionDetail } from '../types/auction';
import { useAuthStore } from '../stores/authStore';
import { loadUserPrefs, saveUserPrefs } from '../services/userPrefsRepository';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import AppConfirm from '../components/AppConfirm.vue';
import { skipsToday, type ConfirmBox } from '../services/confirmBox';
import AppToast from '../components/AppToast.vue';
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
import { updateStamp } from '../services/updateStamp';

const router = useRouter();
const routeListCollapsed = ref(false);
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
/** 주소로 선정물건을 찾는다 — 띄어쓰기 차이로 못 찾아 단계가 안 바뀌던 문제를 막는다 */
const auctionByAddress = (address: string) => {
  const key = addrKey(address);
  if (!key) return undefined;
  return store.auctions.find((item) => addrKey(item.address) === key);
};
/** 방문 여부는 '물건의 단계'가 기준이다. 선정물건에서 임장완료로 바꿔도 여기 바로 반영된다.
 *  선정물건에 없는 주소(직접 적은 주소)만 경로가 들고 있는 기록(visitedStops)으로 판단한다. */
const isVisited = (address: string) => {
  const target = String(address ?? '').trim();
  if (!target) return false;
  const matched = auctionByAddress(target);
  if (matched) return matched.status === '임장완료';
  return Boolean(visitedStops.value[target]);
};

// 방문물건 = 동선최적화 목록에 실제로 있는 물건 줄 수 (번호 줄 + ⊕ 대기 줄).
// 단계에서 역산하면 '경로에 없는 임장완료'가 방문물건과 경로제외물건에 두 번 세어진다.
const stopCount = computed(() => routedKeys.value.length + queuedRows.value.length);
// 방문완료 = 단계가 '임장완료'인 물건 수. 체크하면 번호 줄에서 아래로 내려가므로
// 경로에 남은 수(방문물건)와 겹치지 않는다.
// 방문완료 = 경로에 실린 물건 중 임장완료인 수.
// 방문물건도 '경로 안'을 세므로 기준을 맞춰야 '2곳 중 3곳 완료' 같은 조합이 안 생긴다.
const visitedCount = computed(
  () => fullPath.value.filter(
    (point) => (point.kind ?? 'stop') === 'stop' && isVisited(point.address),
  ).length,
);
// 관심(임장예정) 건수와 경로에 실린 건수가 다를 때 그 차이가 어디서 났는지 알려 준다.
// 중복 주소·형식 미달(6자 미만)은 parseAddressLines가, 방문완료는 optimizeRoute가 걸러 낸다.
const interestAddresses = computed(() =>
  store.auctions
    // '임장예정'만 가져온다 — 손품 단계 물건은 사용자가 임장예정으로 옮겨야 경로에 뜬다
    .filter((item) => item.status === '임장예정')
    .map((item) => (item.address ?? '').trim())
    .filter((address) => address.length > 0),
);
const routeSkipNote = computed(() => {
  const raw = interestAddresses.value;
  if (raw.length === 0) return '';
  const parsed = parseAddressLines(raw.join('\n'));
  const dropped = raw.length - parsed.length;
  const failed = failedAddresses.value.length;
  const parts: string[] = [];
  if (dropped > 0) parts.push(`중복·주소형식 ${dropped}건`);
  if (failed > 0) parts.push(`주소인식 실패 ${failed}건`);
  if (parts.length === 0) return '';
  return `관심 ${raw.length}건 중 ${parts.join(' · ')} 제외`;
});

// 주소를 비교할 때 쓰는 열쇠 — 주소칸/경로결과/물건주소를 같은 기준으로 본다.
// 띄어쓰기는 PDF마다 들쭉날쭉해서 무시한다(공백 한 칸 차이로 다른 물건이 되면 숫자가 안 맞는다).
const addrKey = (address: string) => {
  const raw = String(address ?? '').trim();
  return (parseAddressLines(raw)[0] ?? raw).replace(/\s+/g, '');
};
/** 선정물건리스트가 세는 기준과 똑같이 — 숨긴 물건·온비드 임시항목은 뺀다 */
const listedAuctions = computed(() =>
  store.auctions.filter((item) => !item.id.startsWith('onbid-')),
);
/** 휴지통까지 포함한 선정물건 전체 — 손으로 적은 주소와 가르는 데 쓴다 */
const everyAuction = computed(() => [...store.auctions, ...store.hiddenAuctions]);
const knownKeys = computed(() => new Set(everyAuction.value.map((item) => addrKey(item.address))));
/** 경로에 있을 수 있는 단계 — 임장예정과 임장완료.
 *  임장완료는 목록에서 내리지 않고 주소에 줄만 긋는다(다녀온 곳도 동선에 남아 있어야 읽힌다). */
const ROUTE_STAGES: readonly string[] = ['임장예정', '임장완료'];
const canRoute = (item: AuctionDetail) => ROUTE_STAGES.includes(item.status);
const plannedKeys = computed(
  () => new Set(listedAuctions.value.filter(canRoute).map((item) => addrKey(item.address))),
);
const failedKeys = computed(() => new Set(failedAddresses.value.map((address) => addrKey(address))));
/** 경로에 실려 있는 정차지 주소 */
const routedKeys = computed(
  () => fullPath.value
    .filter((point) => (point.kind ?? 'stop') === 'stop')
    .map((point) => addrKey(point.address)),
);

/** 카드에 붙는 단계 이름 — 입찰은 입찰상태에 따라 '입찰진행'까지 갈라 준다 */
const stageLabel = (item: AuctionDetail) => {
  if (item.status === '입찰') {
    return (item.bidStatus ?? '').replace(/^입찰/, '') === '진행' ? '입찰진행' : '입찰산정';
  }
  return AUCTION_STATUS_LABELS[item.status] ?? String(item.status);
};
/** 단계별 태그 색 — 선정물건 알약과 같은 뜻으로 읽히게 */
const stageTone = (item: AuctionDetail) => {
  if (item.status === '임장예정') return 'plan';
  if (item.status === '손품') return 'desk';
  if (item.status === '임장완료') return 'visited';
  if (item.status === '입찰') {
    return (item.bidStatus ?? '').replace(/^입찰/, '') === '진행' ? 'bidding' : 'bid';
  }
  return 'etc';
};

/** 경로제외물건 — 선정물건의 모든 단계가 여기로 내려온다.
 *  번호 줄 + 이 줄 = 선정물건 전체 건수(1:1). 한 물건이 두 군데 나오지 않는다. */
const missingPlanned = computed(() => {
  // 같은 주소에 사건이 둘일 수 있으니 번호 줄은 '먼저 온 임장예정'이 하나씩 차지한다
  const unclaimed = new Set(routedKeys.value);
  const rows: Array<{
    id: string;
    address: string;
    label: string;
    tone: string;
    failed: boolean;
  }> = [];
  for (const item of listedAuctions.value) {
    const key = addrKey(item.address);
    if (canRoute(item) && unclaimed.has(key)) {
      unclaimed.delete(key);
      continue; // 번호 줄로 올라가 있다
    }
    rows.push({
      id: item.id,
      address: item.address.trim(),
      label: stageLabel(item),
      tone: stageTone(item),
      failed: item.status === '임장예정' && failedKeys.value.has(key),
    });
  }
  return rows;
});
/** 임장예정인데 아직 번호를 못 받은 줄 — 동선최적화 목록 안(도착 줄 앞)에 '대기'로 선다.
 *  단계가 임장예정이면 그 자체가 '가 볼 곳'이라는 뜻이므로 따로 등록 버튼을 두지 않는다. */
const queuedRows = computed(() => missingPlanned.value.filter((row) => row.tone === 'plan'));
/** 경로에 있을 수 없는 단계 — 아래 '경로제외물건'으로 내려간다 */
const missingRows = computed(() => missingPlanned.value.filter((row) => row.tone !== 'plan'));
/** 경로에 있어야 할 주소 = 임장예정·임장완료 물건 + 손으로 적어 넣은 주소 */
const shouldRouteKeys = computed(() => {
  const keys = new Set(listedAuctions.value.filter(canRoute).map((item) => addrKey(item.address)));
  for (const line of parseAddressLines(rawAddresses.value)) {
    const key = addrKey(line);
    if (!knownKeys.value.has(key)) keys.add(key); // 선정물건에 없는 손입력 주소
  }
  return keys;
});
/** 계산에만 영향을 주는 설정 — 주소 목록과 따로 본다 */
const settingsSignature = computed(() =>
  JSON.stringify({
    startAddress: startAddress.value,
    endAddress: endAddress.value,
    travelMode: travelMode.value,
    useRoadRouting: useRoadRouting.value,
  }),
);
const lastSettingsSignature = ref('');
/** 계산이 끝난 뒤 경로에서 줄이 빠졌는가.
 *  빠지면 '있어야 할 집합'과 '실린 집합'이 둘 다 줄어 같아져 버려서, 집합 비교만으로는 못 잡는다.
 *  남은 곳들의 최적 순서·거리·시간은 그대로라 다시 계산해야 맞다. */
const routeDirty = ref(false);
/** 지도를 보고 손으로 순서를 고친 적이 있는가.
 *  동선최적화는 처음부터 다시 묶으므로, 그 판단이 말없이 지워지지 않게 한 번 묻는다. */
const manualOrder = ref(false);
/** 지금 보이는 경로가 낡았는가 — '다시 눌러야 맞는 경로가 나온다'는 뜻.
 *  주소칸 글자가 아니라 '물건의 집합'을 본다. 방문 체크처럼 경로가 그대로인 동작에는
 *  울리지 않고, 휴지통·새 임장예정처럼 실제로 갈 곳이 달라졌을 때만 울린다. */
const routeStale = computed(() => {
  if (loading.value) return false;
  // 좌표를 못 찾은 주소는 다시 눌러도 결과가 같다 — 계속 울리면 신호가 무뎌진다
  const want = new Set([...shouldRouteKeys.value].filter((key) => !failedKeys.value.has(key)));
  // 갈 곳이 아예 없으면 다시 계산할 것도 없다 — 재촉하지 않는다
  if (want.size === 0) return false;
  if (routeDirty.value) return true;
  const have = new Set(routedKeys.value);
  if (want.size !== have.size) return true;
  for (const key of want) {
    if (!have.has(key)) return true;
  }
  // 출발·도착지나 이동수단을 바꾸면 순서·시간이 달라진다
  return lastSettingsSignature.value !== '' && lastSettingsSignature.value !== settingsSignature.value;
});
/** 대기 줄을 끼워 넣을 자리 = 도착(E) 줄 앞. 도착이 없으면 -1(목록 끝에 붙인다) */
const queuedInsertIdx = computed(() => fullPath.value.findIndex((point) => point.kind === 'end'));

/** 주소칸·경로를 단계에 맞춘다. 두 방향 모두 한다.
 *   - 내리기: 경로에 있을 수 없는 단계(손품·입찰 등)는 경로와 주소칸에서 뺀다
 *   - 올리기: 임장예정인데 주소칸에 없으면 넣는다 (휴지통에서 복원한 물건도 여기서 돌아온다)
 *  덕분에 주소칸은 '단계 + 손으로 적은 주소'의 결과가 되고, 따로 등록할 일이 없다. */
const syncRouteWithStages = () => {
  if (everyAuction.value.length === 0) return;
  const keep = (address: string) => {
    const key = addrKey(address);
    // 선정물건에 없는 주소(손으로 적은 주소)는 건드리지 않는다
    if (!knownKeys.value.has(key)) return true;
    return plannedKeys.value.has(key);
  };
  let changed = false;
  const nextPath = fullPath.value.filter((point) => (point.kind ?? 'stop') !== 'stop' || keep(point.address));
  if (nextPath.length !== fullPath.value.length) {
    fullPath.value = nextPath;
    changed = true;
    routeDirty.value = true; // 계산된 경로에서 줄이 빠졌다
  }
  const nextOrdered = orderedStops.value.filter((point) => keep(point.address));
  if (nextOrdered.length !== orderedStops.value.length) { orderedStops.value = nextOrdered; changed = true; }
  const nextLines = rawAddresses.value.split('\n').filter((line) => {
    const normalized = parseAddressLines(line)[0] ?? '';
    return normalized.length === 0 || keep(normalized);
  });
  // 임장예정인데 주소칸에 없는 주소를 뒤에 더한다
  const have = new Set(parseAddressLines(nextLines.join('\n')).map((line) => addrKey(line)));
  const added: string[] = [];
  for (const item of listedAuctions.value) {
    if (item.status !== '임장예정') continue;
    const address = item.address.trim();
    const key = addrKey(address);
    if (!address || have.has(key)) continue;
    have.add(key);
    added.push(address);
  }
  const nextRaw = [...nextLines.filter((line) => line.trim().length > 0), ...added].join('\n');
  if (nextRaw !== rawAddresses.value) {
    rawAddresses.value = nextRaw;
    lastAutoFilledInput.value = nextRaw;
    changed = true;
  }
  // 단계에 맞춰 정리한 결과도 저장해 둬야 다시 들어왔을 때 같은 화면이 나온다
  if (changed) cacheCurrentPlanLocally();
};
// 선정물건의 단계가 바뀌면(어느 화면에서 바꿨든, 휴지통에서 복원했든) 경로를 바로 맞춘다
watch(
  () => everyAuction.value.map((item) => `${item.id}:${item.status}`).join('|'),
  () => { syncRouteWithStages(); },
);

/** 아래 줄의 ✓ — 임장완료를 임장예정으로 되돌린다 */
const undoVisited = async (id: string) => {
  if (loading.value) return;
  await store.setStatus(id, '임장예정');
  showToast('임장예정으로 되돌렸습니다. 동선최적화를 눌러 주세요.', 'success');
};

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

/** 경로 순서 그대로의 번호. 다녀온 곳도 제 번호를 지킨다 —
 *  다시 계산할 때 그 자리에 고정하므로 숫자가 흔들리지 않는다. */
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
  if (loading.value) return;
  const point = fullPath.value[idx];
  if (point?.kind !== 'stop') return;
  if (isVisited(point.address)) return; // 다녀온 줄은 순서를 바꿀 이유가 없다
  dragFromIdx.value = idx;
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
};
const onStopDragMove = (e: PointerEvent) => {
  if (dragFromIdx.value === null) return;
  e.preventDefault();
  const over = stopRowIndexFromPoint(e.clientX, e.clientY);
  // 출발(S)·도착(E) 줄은 자리를 내주지 않는다
  const target = fullPath.value[over ?? -1];
  if (over === null || over === dragFromIdx.value || target?.kind !== 'stop') return;
  if (isVisited(target.address)) return; // 다녀온 줄 자리는 내주지 않는다
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
const auctionIdByAddress = (address: string) => auctionByAddress(address)?.id ?? '';
const goDetailByAddress = (address: string) => {
  const id = auctionIdByAddress(address);
  if (!id) {
    showToast('연결된 물건을 찾지 못했습니다.', 'info');
    return;
  }
  router.push({ path: `/auctions/${id}`, query: { tab: 'survey' } });
};

const toggleVisited = async (address: string) => {
  // 계산 중에는 경로가 통째로 다시 만들어지는 중이라, 지금 바꾸면 결과와 어긋난다
  if (loading.value) return;
  const next = !isVisited(address);
  visitedStops.value = {
    ...visitedStops.value,
    [address]: next,
  };
  autoSavePlan();
  const matched = auctionByAddress(address);
  if (!matched) {
    // 조용히 넘어가면 경로에만 체크가 남고 선정물건 단계는 그대로여서 숫자가 어긋난다
    showToast('연결된 물건을 찾지 못해 단계가 바뀌지 않았습니다.', 'error');
    return;
  }
  // 방문 토글이 곧 '임장예정 ↔ 임장완료'다 — 글자가 뜻을 그대로 말해 준다
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
  observeMapSize();
};

// 지도 칸 크기가 바뀔 때마다 타일을 다시 채운다.
// (크기 토글의 transition, 화면 회전, 위쪽 패널이 접히고 펴지는 것까지 모두 여기서 잡힌다)
let mapResizeObserver: ResizeObserver | null = null;
let mapResizeRaf = 0;
const observeMapSize = () => {
  if (mapResizeObserver || typeof ResizeObserver === 'undefined') return;
  const el = document.getElementById('trip-map');
  if (!el) return;
  mapResizeObserver = new ResizeObserver(() => {
    if (mapResizeRaf) cancelAnimationFrame(mapResizeRaf);
    mapResizeRaf = requestAnimationFrame(() => {
      mapResizeRaf = 0;
      map?.invalidateSize({ animate: false });
    });
  });
  mapResizeObserver.observe(el);
};
onBeforeUnmount(() => {
  if (mapResizeRaf) cancelAnimationFrame(mapResizeRaf);
  mapResizeObserver?.disconnect();
  mapResizeObserver = null;
});

const makeBadgeIcon = (label: string, kind: 'start' | 'stop' | 'end', done = false) => {
  const cls = `trip-marker-badge tone-${kind}${done ? ' done' : ''}`;
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
      icon: makeBadgeIcon(label, kind, kind === 'stop' && isVisited(point.address)),
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
    const matched = auctionByAddress(stop.address);
    // 선정물건에 있는 주소는 단계를 그대로 따른다 — 옛 체크 기록이 되살아나지 않게
    nextVisited[stop.address] = matched
      ? matched.status === '임장완료'
      : Boolean(visitedStops.value[stop.address]);
  });
  visitedStops.value = nextVisited;
});

// 순서를 바꾸면 이전 도로 경로는 맞지 않는다 — 직선으로 되돌린 뒤 새 순서로 다시 조회한다
const refreshRouteAfterReorder = async () => {
  manualOrder.value = true;
  orderedStops.value = fullPath.value.filter((p) => p.kind === 'stop');
  roadLegs.value = [];
  roadGeometry.value = [];
  roadFailedLegs.value = [];
  await drawRouteMap();
  // 바뀐 순서를 바로 저장한다 — 선정물건의 '임장경로' 정렬이 이 값(fieldTripDraft.orderedStops)을 읽는다
  cacheCurrentPlanLocally();
  void savePlan({ silent: true });
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
    message.value = `바꾼 순서로 물건 ${orderedStops.value.length}곳을 다시 계산했습니다.`;
  } catch (error) {
    message.value = error instanceof Error ? `실도로 경로 실패: ${error.message}` : '실도로 경로 실패';
  } finally {
    loading.value = false;
    roadProgress.value = null;
    // 도로 경로까지 다시 계산한 결과로 한 번 더 갱신해 둔다
    cacheCurrentPlanLocally();
    void savePlan({ silent: true });
  }
};

// 확인창은 앱 전체가 같은 것을 쓴다 (AppConfirm)
const confirmBox = ref<ConfirmBox | null>(null);
const askConfirm = (box: ConfirmBox) => {
  if (skipsToday(box.skipKey)) { void box.run(); return; }
  confirmBox.value = box;
};

const optimizeRoute = async () => {
  // 손으로 맞춘 순서는 사용자가 지도를 보고 내린 판단이다 — 말없이 지우지 않는다
  if (manualOrder.value && fullPath.value.length > 0) {
    askConfirm({
      title: '새로 계산할까요?',
      desc: '지도를 보고 손으로 맞춘 순서가 있습니다. 새로 계산하면 그 순서는 사라집니다.',
      okLabel: '새로 계산',
      skipKey: 'ftp.skip.reorder',
      run: () => runOptimize(),
    });
    return;
  }
  await runOptimize();
};

const runOptimize = async () => {
  loading.value = true;
  message.value = '';
  saveMessage.value = '';
  // 새로 계산한 동선은 새 경로로 본다 — 이전 저장본을 덮어쓰지 않도록 ID를 새로 발급
  currentPlanId.value = '';
  // 계산 중에도 지금 경로를 그대로 둔다 — 비워 버리면 임장완료 줄이 잠깐
  // '경로제외물건'으로 내려갔다 올라와, 목록이 튀어 보인다.
  // (결과가 오면 아래에서 통째로 바꾼다)
  failedAddresses.value = [];
  roadProgress.value = null;
  // 계산 직전에 한 번 더 맞춘다 — 임장예정은 빠짐없이, 그 외 단계는 하나도 들어가지 않게
  syncRouteWithStages();
  try {
    const parsedAddresses = parseAddressLines(rawAddresses.value);
    // 방문완료한 곳도 경로에서 빼지 않는다 — 번호를 유지한 채 주소에만 줄을 긋는다.
    // (예전처럼 몰래 빼면 주소칸에서도 지워져 목록 수가 어긋났다)
    if (parsedAddresses.length === 0) {
      message.value = '경로에 올린 물건이 없습니다. 선정물건에서 임장예정으로 옮겨 주세요.';
      orderedStops.value = [];
      fullPath.value = [];
      // 계산할 게 없으면 '다시 계산해야 한다'는 표시도 내려야 한다 (안 그러면 영원히 쿵쿵거린다)
      routeDirty.value = false;
      manualOrder.value = false;
      return;
    }
    // 다녀온 곳은 이미 지나온 길이다 — 순서를 다시 묶지 않고 제자리에 그대로 둔다.
    // (번호·위치가 안 흔들려야 '내가 간 동선'으로 읽힌다)
    const prevStops = fullPath.value.filter((point) => (point.kind ?? 'stop') === 'stop');
    const frozen = new Map<number, GeoPoint>();
    prevStops.forEach((point, i) => {
      if (isVisited(point.address)) frozen.set(i, point);
    });
    const frozenKeys = new Set([...frozen.values()].map((point) => addrKey(point.address)));
    const addresses = parsedAddresses.filter((addr) => !frozenKeys.has(addrKey(addr)));
    if (addresses.length === 0) {
      message.value = '다녀온 곳만 남아 있습니다. 다시 계산할 곳이 없습니다.';
      routeDirty.value = false;
      manualOrder.value = false;
      return;
    }
    const result = await buildOptimizedRoute({
      stopAddresses: addresses,
      startAddress: startAddress.value,
      endAddress: endAddress.value,
      avgSpeedKmh: avgSpeedKmh.value,
      stayMinutesPerStop: stayMinutesPerStop.value,
    });
    // 고정한 줄을 원래 자리에 다시 꽂고, 빈 자리를 새로 묶은 순서로 채운다
    const merged: GeoPoint[] = [];
    const frozenSorted = [...frozen.entries()].sort((a, b) => a[0] - b[0]);
    const total = frozenSorted.length + result.orderedStops.length;
    let fi = 0;
    let pi = 0;
    for (let i = 0; merged.length < total; i += 1) {
      if (fi < frozenSorted.length && frozenSorted[fi][0] === i) {
        merged.push(frozenSorted[fi][1]);
        fi += 1;
      } else if (pi < result.orderedStops.length) {
        merged.push(result.orderedStops[pi]);
        pi += 1;
      } else if (fi < frozenSorted.length) {
        merged.push(frozenSorted[fi][1]); // 줄이 줄어 자리가 밀린 경우
        fi += 1;
      } else {
        break;
      }
    }
    const startPoint = result.fullPath.find((point) => point.kind === 'start');
    const endPoint = result.fullPath.find((point) => point.kind === 'end');
    orderedStops.value = merged;
    fullPath.value = [
      ...(startPoint ? [startPoint] : []),
      ...merged,
      ...(endPoint ? [endPoint] : []),
    ];
    failedAddresses.value = result.failedAddresses;
    totalDistanceKm.value = result.totalDistanceKm;
    driveMinutes.value = result.driveMinutes;
    stayMinutes.value = result.stayMinutes;
    totalMinutes.value = result.totalMinutes;
    message.value =
      `최적 순서 ${result.orderedStops.length}곳 계산 완료` +
      (frozenSorted.length > 0 ? ` (다녀온 ${frozenSorted.length}곳은 자리 유지)` : '');
    lastCalculatedAt.value = updateStamp();
    lastInputSignature.value = currentInputSignature.value;
    lastSettingsSignature.value = settingsSignature.value;
    routeDirty.value = false;
    manualOrder.value = false;

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
        // 구간(연결선) 수는 물건 수보다 늘 하나 많다 — 물건 수로 알려야 목록·통계와 숫자가 맞는다
        message.value = `${travelMode.value === 'car' ? '자동차' : '도보'} 경로 완료 · 물건 ${orderedStops.value.length}곳${
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
  lastSettingsSignature: lastSettingsSignature.value,
  routeDirty: routeDirty.value,
  manualOrder: manualOrder.value,
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
  if (typeof data.lastSettingsSignature === 'string') lastSettingsSignature.value = data.lastSettingsSignature;
  if (typeof data.routeDirty === 'boolean') routeDirty.value = data.routeDirty;
  if (typeof data.manualOrder === 'boolean') manualOrder.value = data.manualOrder;
  if (typeof data.savedAt === 'string') {
    // 토스트가 한 줄에 담기도록 저장 시각을 'M/D HH:MM'으로 짧게 적는다
    const at = new Date(data.savedAt);
    const stamp = `${at.getMonth() + 1}/${at.getDate()} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    saveMessage.value = `저장된 경로를 불러왔습니다 (${stamp})`;
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
  lastSettingsSignature.value = '';
  routeDirty.value = false;
  manualOrder.value = false;
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
  // 저장해 둔 경로가 그동안 바뀐 단계와 어긋날 수 있다 — 불러온 직후 한 번 맞춘다
  syncRouteWithStages();
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
  if (loading.value) return;
  const target = address.trim();
  // '탈락' 단계를 없앴으므로, 더 안 볼 물건은 휴지통으로 보낸다(복원 가능).
  const key = addrKey(target);
  const lines = rawAddresses.value.split('\n').filter((line) => {
    const normalized = parseAddressLines(line)[0] ?? '';
    return normalized.length === 0 || addrKey(normalized) !== key;
  });
  rawAddresses.value = lines.join('\n');
  lastAutoFilledInput.value = rawAddresses.value;

  const beforeLen = fullPath.value.length;
  fullPath.value = fullPath.value.filter(
    (p) => !(p.kind === 'stop' && addrKey(p.address) === key),
  );
  if (fullPath.value.length !== beforeLen) routeDirty.value = true;
  orderedStops.value = orderedStops.value.filter((p) => addrKey(p.address) !== key);

  autoSavePlan();
  const matched = auctionByAddress(target);
  if (matched) {
    await store.deleteAuction(matched.id);
    showToast('휴지통으로 옮겼습니다.', 'success');
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
    <div class="ftp-section-title is-page">
      <span>임장경로</span>
    </div>

    <div class="ftp-section-title">
      <span class="ftp-section-title-main">
        <svg class="ftp-sec-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>경로설정
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
        <button
          type="button"
          :class="['ftp-action', 'ftp-action-optimize', { needs: routeStale }]"
          :disabled="loading"
          :title="!routeStale ? '' : (manualOrder ? '목록이 바뀌었습니다 — 누르면 손으로 맞춘 순서가 사라집니다' : '목록이 바뀌었습니다 — 눌러서 다시 계산하세요')"
          @click="optimizeRoute"
        >
          <img :src="infoIcon" alt="" class="ftp-action-icon-img" />동선최적화
        </button>
      </div>
      <!-- 언제 계산한 경로인지 — 버튼 바로 아래 -->
      <p class="ftp-update-under">UPDATE : {{ formatLastUpdate }}</p>
      <p v-if="routeSkipNote" class="ftp-skip-note">{{ routeSkipNote }}</p>

    </div>

    <div class="ftp-update-bar">
      <strong class="ftp-update-title">
        <svg class="ftp-sec-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="6" cy="19" r="3" /><circle cx="18" cy="5" r="3" />
          <path d="M9 19h5a4 4 0 0 0 4-4V8M6 16V9a4 4 0 0 1 4-4h5" />
        </svg>동선최적화
      </strong>
      <button class="ftp-update-copy" type="button" aria-label="주소 일괄복사" @click="copyAddress(rawAddresses)">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="8" y="8" width="13" height="13" rx="2"/>
          <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>
        </svg>
      </button>
      <button
        type="button"
        class="ftp-collapse"
        :aria-expanded="!routeListCollapsed"
        aria-label="동선최적화 목록 접기"
        @click="routeListCollapsed = !routeListCollapsed"
      >
        <img :src="chevronDownIcon" alt="" :class="['ftp-chev-img', { up: routeListCollapsed }]" />
      </button>
      <span class="ftp-title-stats">
        <img :src="mapPinIcon" alt="" />방문 <b>{{ stopCount || 0 }}</b>건
        <img :src="mapPinPlusIcon" alt="" />완료 <b>{{ visitedCount }}</b>건
      </span>
    </div>

    </div>

      <div v-if="!routeListCollapsed" class="ftp-list">
        <template v-if="fullPath.length > 0">
          <template v-for="(stop, idx) in fullPath" :key="`${stop.kind ?? 'stop'}-${stop.address}`">
          <!-- 경로추가로 올라온 줄 — 도착(E) 바로 앞에 세워 둔다 -->
          <template v-if="idx === queuedInsertIdx">
            <article v-for="row in queuedRows" :key="`q-${row.id}`" class="ftp-stop ftp-stop-queued">
              <span class="ftp-stop-badge tone-queued"><svg
                :class="['ftp-badge-plus', { spin: loading }]"
                viewBox="0 0 24 24" width="11" height="11"
                fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"
              ><path d="M12 5v14M5 12h14" /></svg></span>
              <span class="ftp-stop-addr" :title="row.address">{{ row.address }}</span>
              <span v-if="loading" class="ftp-stage-tag tone-queued calc">계산중</span>
              <span v-else-if="row.failed" class="ftp-stage-tag is-failed" title="주소에서 좌표를 찾지 못해 순번을 매기지 못했습니다">주소실패</span>
              <span v-else class="ftp-stage-tag is-blank" aria-hidden="true" />
              <span class="ftp-stop-icon ftp-stop-spacer" aria-hidden="true" />
              <button
                type="button"
                class="ftp-stop-icon ftp-stop-delete"
                :disabled="loading"
                aria-label="휴지통으로"
                title="휴지통으로 보내기"
                @click="removeStop(row.address)"
              >
                <img :src="squareXIcon" alt="" class="ftp-stop-glyph-img" />
              </button>
            </article>
          </template>
          <article
            :data-idx="idx"
            :class="['ftp-stop', `kind-${stop.kind ?? 'stop'}`, {
              visited: stop.kind === 'stop' && isVisited(stop.address),
              dragging: dragFromIdx === idx,
            }]"
          >
            <span
              :class="['ftp-stop-badge', `tone-${stop.kind ?? 'stop'}`, {
                drag: stop.kind === 'stop' && !isVisited(stop.address),
                done: stop.kind === 'stop' && isVisited(stop.address),
              }]"
              :title="stop.kind === 'stop' && !isVisited(stop.address) ? '끌어서 순서 변경' : ''"
              @pointerdown="onStopDragStart(idx, $event)"
              @pointermove="onStopDragMove"
              @pointerup="onStopDragEnd"
              @pointercancel="onStopDragEnd"
            >
              <template v-if="stop.kind === 'start'">S</template>
              <template v-else-if="stop.kind === 'end'">E</template>
              <template v-else>{{ stopOrdinal(idx) }}<i
                v-if="isVisited(stop.address)"
                class="ftp-badge-done"
                aria-label="방문완료"
              >✓</i></template>
            </span>
            <span
              class="ftp-stop-addr"
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
              :class="{ checked: isVisited(stop.address) }"
              :disabled="loading"
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
              :disabled="loading"
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
          <!-- 도착 지점이 없는 경로면 목록 끝에 붙인다 -->
          <template v-if="queuedInsertIdx < 0">
            <article v-for="row in queuedRows" :key="`q-${row.id}`" class="ftp-stop ftp-stop-queued">
              <span class="ftp-stop-badge tone-queued"><svg
                :class="['ftp-badge-plus', { spin: loading }]"
                viewBox="0 0 24 24" width="11" height="11"
                fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"
              ><path d="M12 5v14M5 12h14" /></svg></span>
              <span class="ftp-stop-addr" :title="row.address">{{ row.address }}</span>
              <span v-if="loading" class="ftp-stage-tag tone-queued calc">계산중</span>
              <span v-else-if="row.failed" class="ftp-stage-tag is-failed" title="주소에서 좌표를 찾지 못해 순번을 매기지 못했습니다">주소실패</span>
              <span v-else class="ftp-stage-tag is-blank" aria-hidden="true" />
              <span class="ftp-stop-icon ftp-stop-spacer" aria-hidden="true" />
              <button
                type="button"
                class="ftp-stop-icon ftp-stop-delete"
                :disabled="loading"
                aria-label="휴지통으로"
                title="휴지통으로 보내기"
                @click="removeStop(row.address)"
              >
                <img :src="squareXIcon" alt="" class="ftp-stop-glyph-img" />
              </button>
            </article>
          </template>

        </template>
        <template v-else-if="queuedRows.length > 0">
            <article v-for="row in queuedRows" :key="`q-${row.id}`" class="ftp-stop ftp-stop-queued">
              <span class="ftp-stop-badge tone-queued"><svg
                :class="['ftp-badge-plus', { spin: loading }]"
                viewBox="0 0 24 24" width="11" height="11"
                fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"
              ><path d="M12 5v14M5 12h14" /></svg></span>
              <span class="ftp-stop-addr" :title="row.address">{{ row.address }}</span>
              <span v-if="loading" class="ftp-stage-tag tone-queued calc">계산중</span>
              <span v-else-if="row.failed" class="ftp-stage-tag is-failed" title="주소에서 좌표를 찾지 못해 순번을 매기지 못했습니다">주소실패</span>
              <span v-else class="ftp-stage-tag is-blank" aria-hidden="true" />
              <span class="ftp-stop-icon ftp-stop-spacer" aria-hidden="true" />
              <button
                type="button"
                class="ftp-stop-icon ftp-stop-delete"
                :disabled="loading"
                aria-label="휴지통으로"
                title="휴지통으로 보내기"
                @click="removeStop(row.address)"
              >
                <img :src="squareXIcon" alt="" class="ftp-stop-glyph-img" />
              </button>
            </article>
        </template>
        <p v-else-if="missingRows.length === 0" class="ftp-empty guide">선정물건에서 임장예정으로 옮기면 여기에 담깁니다.</p>

        <!-- 경로제외물건 — 선정물건의 모든 단계가 여기로 내려온다.
             번호 줄 + 이 줄 = 선정물건 전체 건수(1:1). 한 물건이 두 군데 나오지 않는다. -->
        <template v-if="missingRows.length > 0">
          <div class="ftp-pending-head">
            <strong class="ftp-pending-title">
              <svg class="ftp-sec-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5.5 5.5A7 7 0 0 0 5 8c0 5 7 13 7 13s1.6-1.8 3.2-4.3" />
                <path d="M9.9 4.2A7 7 0 0 1 19 8c0 1-.3 2.1-.8 3.2" />
                <circle cx="12" cy="8" r="2.4" />
                <line x1="3" y1="3" x2="21" y2="21" />
              </svg>경로제외물건 <em>{{ missingRows.length }}건</em>
            </strong>
          </div>
          <p class="ftp-pending-guide">선정물건에서 임장예정으로 바꾸면 경로에 올라갑니다</p>
          <!-- 표 머리 — 어느 칸이 무슨 뜻인지 한 번 적어 둔다 -->
          <div class="ftp-stop ftp-col-head ftp-pending-row" aria-hidden="true">
            <span class="ftp-stop-badge is-head" />
            <span class="ftp-stop-addr">주소</span>
            <span class="ftp-col-state">상태</span>
          </div>
          <article
            v-for="row in missingRows"
            :key="`p-${row.id}`"
            :class="['ftp-stop', 'ftp-stop-pending', 'ftp-pending-row', `stage-${row.tone}`]"
          >
            <span class="ftp-stop-badge tone-pending">·</span>
            <span class="ftp-stop-addr" :title="row.address">{{ row.address }}</span>
            <span v-if="row.failed" class="ftp-stage-tag is-failed" title="주소에서 좌표를 찾지 못했습니다">주소실패</span>
            <span v-else :class="['ftp-stage-tag', `tone-${row.tone}`]">{{ row.label }}</span>
            <button
              v-if="row.tone === 'visited'"
              style="margin-left: 4px"
              type="button"
              class="ftp-stop-icon"
              :disabled="loading"
              aria-label="임장예정으로 되돌리기"
              title="임장예정으로 되돌리기"
              @click="undoVisited(row.id)"
            >
              <img :src="squareCheckIcon" alt="" class="ftp-stop-glyph-img" />
            </button>
          </article>
        </template>
      </div>

      <div class="ftp-map-wrap">
        <div id="trip-map" class="ftp-map" />
        <!-- 확대는 처음부터 되고, 한 손가락 이동만 눌러서 켠다 -->
        <span v-if="!mapActive" class="ftp-map-hint">두 손가락으로 확대 · 한 번 눌러 지도 이동</span>
      </div>
    </div>

    <AppConfirm :box="confirmBox" @close="confirmBox = null" />

    <AppMobileBottomNav active="field-trip" />

    <AppToast :visible="toastVisible" :text="toastText" :tone="toastTone" />

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
  padding: 6px 14px 3px;
  font-size: 15.3px; font-weight: 800; color: #111827;
  background: #fff;
}
/* 화면 제목 — 물건상세·자금관리와 같은 크기 */
.ftp-section-title.is-page {
  font-size: 20px; padding-top: 9px; padding-bottom: 7px;
  /* 제목줄 아래 구분선 — 물건상세와 같게 */
  border-bottom: 1px solid #e5e7eb;
}
.ftp-section-title-main { display: inline-flex; align-items: center; gap: 5px; min-width: 0; }
.ftp-sec-ico { flex: 0 0 auto; color: #2a5fbf; }
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

.ftp-stat {
  background: #fdeeee;
  border: 1px solid #f3cfcf;
  border-radius: 10px;
  padding: 5px 6px;
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
  padding: 5px 12px 8px;
  border-bottom: 1px solid #eef0f5;
}
.ftp-nav-launch-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 6px;
}
.ftp-nav-launch-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border: 1.5px solid #cbd5e1; background: #fff; color: #1f2937;
  border-radius: 10px; padding: 5px 6px; font-size: 12px; font-weight: 700;
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
  display: flex; gap: 6px; margin-bottom: 6px;
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

/* 아직 경로에 넣지 않은 물건 — 계산된 줄과 확실히 구분되게 회색으로 */
.ftp-pending-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin: 10px 2px 5px; padding-top: 7px; border-top: 1px dashed #d5dbe6;
}
/* 동선최적화 제목과 같은 레벨로 읽히게 치수를 맞춘다 */
.ftp-pending-title {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 15.3px; font-weight: 800; color: #111827;
}
.ftp-pending-title em { font-style: normal; font-weight: 800; color: #2b6df3; margin-left: 3px; }
.ftp-pending-head button {
  flex: 0 0 auto; border: 1px solid #c7d7f7; border-radius: 7px; background: #fff;
  padding: 3px 9px; font-size: 11px; font-weight: 700; color: #2b6df3; cursor: pointer;
}
.ftp-pending-head button.is-run {
  border-color: #2b6df3; background: #2b6df3; color: #fff;
}
.ftp-pending-head button:disabled { opacity: 0.6; }
/* 위 제목은 규칙을, 여기는 할 일을 말한다 */
.ftp-pending-guide {
  margin: 0 2px 4px; font-size: 10px; font-weight: 400; color: #6b7280;
}
/* 표 머리 — 아래 줄들과 같은 칸 폭을 쓴다 */
.ftp-stop.ftp-col-head {
  background: #e8edf5; padding-top: 2px; padding-bottom: 2px;
  margin-bottom: 3px; cursor: default;
}
.ftp-col-head .ftp-stop-addr { font-size: 10.5px; font-weight: 800; color: #6b7280; text-align: center; }
.ftp-stop-badge.is-head { background: transparent; }
.ftp-col-state {
  flex: 0 0 auto; margin-left: auto;
  box-sizing: border-box; min-width: 58px; text-align: center;
  font-size: 10.5px; font-weight: 800; color: #6b7280;
}
/* 경로제외물건 줄 — 상태 태그를 상자 오른쪽 끝에 맞춘다. 빈 칸을 없애 주소가 더 나온다 */
.ftp-pending-row .ftp-stop-addr { flex: 1 1 auto; min-width: 0; }
.ftp-pending-row .ftp-stage-tag,
.ftp-pending-row .ftp-col-state { margin-left: auto; }
.ftp-stop.ftp-stop-pending {
  background: #f6f7f9;
  padding-top: 4px; padding-bottom: 4px; margin-bottom: 4px;
}
.ftp-stop-pending .ftp-stop-addr { color: #6b7280; font-weight: 600; }
.ftp-stop-badge.tone-pending { background: #d5dbe6; color: #fff; }
/* 주소칸에는 들어갔고 계산만 남은 줄 — 곧 번호가 붙는다는 뜻으로 파란 기운을 준다 */
.ftp-stop.ftp-stop-pending.queued { background: #eef3fd; }
.ftp-stop-pending.queued .ftp-stop-badge.tone-pending { background: #9db9ef; }
.ftp-stop-pending.queued .ftp-stop-addr { color: #41526b; }
.ftp-stop.ftp-stop-pending.calc { animation: ftp-pending-pulse 1.1s ease-in-out infinite; }
@keyframes ftp-pending-pulse {
  0%, 100% { background: #eef3fd; }
  50% { background: #dde8fb; }
}
/* 단계 태그 — 경로에 넣을 수 없는 단계는 지금 단계를 그대로 적어 준다 */
.ftp-stage-tag {
  flex: 0 0 auto; margin-left: auto;
  box-sizing: border-box; min-width: 58px; text-align: center;
  border: 1px solid #e5e7eb; border-radius: 5px; background: #fff;
  padding: 2px 7px; font-size: 9.5px; font-weight: 700; color: #6b7280;
  white-space: nowrap;
}
.ftp-stage-tag.tone-desk,
.ftp-stage-tag.tone-visited,
.ftp-stage-tag.tone-bid { border-color: #6b85f0; background: #dce5ff; color: #3850c2; }
.ftp-stage-tag.tone-bidding { border-color: #ef6b6b; background: #ffdede; color: #c22e2e; font-weight: 800; }
.ftp-stage-tag.is-failed { border-color: #e5e7eb; background: #f9fafb; color: #9ca3af; }
/* 경로추가로 올라와 계산만 기다리는 줄 — 번호 대신 '+' */
.ftp-stage-tag.tone-queued { border-color: #c7d7f7; background: #eef3fd; color: #2b6df3; }
/* 동선최적화가 도는 동안 — 멈춘 것처럼 보이지 않게 옅게 깜빡인다 */
.ftp-stage-tag.tone-queued.calc { animation: ftp-tag-pulse 1.1s ease-in-out infinite; }
@keyframes ftp-tag-pulse {
  0%, 100% { background: #eef3fd; }
  50% { background: #d9e6fd; }
}
.ftp-stop.ftp-stop-queued { background: #f7f9fe; }
.ftp-stop-queued .ftp-stop-addr { color: #41526b; font-weight: 600; }
/* 다녀온 곳 — 번호는 지키고 그 위에 작은 체크를 겹친다 */
.ftp-stop-badge.done { background: #cbd5e1; color: #fff; cursor: default; position: relative; }
.ftp-badge-done {
  position: absolute; right: -3px; bottom: -3px;
  width: 12px; height: 12px; border-radius: 50%;
  background: #2f7d4f; color: #fff; border: 1.5px solid #fff;
  font-style: normal; font-size: 8px; font-weight: 800; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center;
}
.ftp-stop-badge.tone-queued {
  background: #fff; color: #2b6df3; border: 1px dashed #9db9ef; font-weight: 800;
}
/* 계산하는 동안 '+'만 시계 방향으로 돈다 — 원(점선 테두리)은 그대로 둔다 */
.ftp-badge-plus { display: block; transform-origin: 50% 50%; }
.ftp-badge-plus.spin { animation: ftp-badge-spin 1.1s linear infinite; }
@keyframes ftp-badge-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
/* 관심 건수와 경로 건수가 왜 다른지 한 줄로 알려 준다 */
.ftp-skip-note {
  margin: 6px 0 0; text-align: center;
  font-size: 11px; font-weight: 600; color: #b45309;
}
/* 방문물건 · 방문예정 건수 · 동선최적화를 한 줄에 균등 배치 */
.ftp-action-row { display: block; }
.ftp-action {
  width: 100%;
  border: none; border-radius: 10px;
  padding: 12px 6px; font-size: 16px; font-weight: 800; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  color: #fff;
  white-space: nowrap;
  min-width: 0;
}
.ftp-action:disabled { opacity: 0.55; cursor: not-allowed; }
.ftp-action-optimize { background: #ef6b6b; }
/* 동선최적화 버튼 바로 아래 — 언제 계산한 경로인지 */
.ftp-update-under {
  margin: 4px 0 0; text-align: right;
  font-size: 10px; font-weight: 400; color: #2b6df3;
}
/* 아직 순번을 못 받은 물건이 있을 때 — 눌러야 한다는 신호 */
.ftp-action-optimize.needs {
  background: #ffdede; color: #c22e2e; border: 1.5px solid #ef6b6b;
  animation: ftp-needs-pulse 1.5s ease-in-out infinite;
}
.ftp-action-optimize.needs .ftp-action-icon-img { filter: none; }
@keyframes ftp-needs-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 107, 107, 0.45); }
  70% { box-shadow: 0 0 0 7px rgba(239, 107, 107, 0); }
}
/* 태그 자리를 비워 둬도 폭은 지켜야 줄 시작점이 맞는다 */
.ftp-stage-tag.is-blank { border-color: transparent; background: transparent; }
.ftp-action-icon { font-size: 13px; }
.ftp-action-icon-img { width: 19px; height: 19px; object-fit: contain; filter: brightness(0) invert(1); }
.ftp-action-optimize.needs .ftp-action-icon-img { filter: none; }

.ftp-update-bar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 6px 14px 4px;
  background: #f4f6fb;
}
/* 제목 아래 숫자 — '경로제외물건 8건'과 같은 치수 */
.ftp-title-stats {
  flex: 1 0 100%; margin-top: -1px;
  display: inline-flex; align-items: center; gap: 4px;
  min-width: 0; overflow: hidden; white-space: nowrap;
  font-size: 15.3px; font-weight: 800; color: #111827;
}
.ftp-title-stats img { width: 15px; height: 15px; object-fit: contain; flex: 0 0 auto; }
.ftp-title-stats img + img { margin-left: 10px; }
.ftp-title-stats b { font-weight: 800; color: #2b6df3; margin-left: 2px; }
.ftp-update-title { display: inline-flex; align-items: center; gap: 5px; font-size: 15.3px; font-weight: 800; color: #111827; flex: 0 0 auto; }

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
  padding: 12px 14px; border-radius: 14px;
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 700;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.35);
  /* 되도록 한 줄에 담기도록 폭을 넓게 쓴다 */
  z-index: 9999; max-width: 94vw; min-width: 200px;
  justify-content: center; text-align: center;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.ftp-toast-text { white-space: pre-wrap; word-break: keep-all; }
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
  padding: 0 12px 10px;
}
.ftp-empty {
  text-align: center; color: #9ca3af; font-size: 12px; padding: 20px 12px;
}
/* 안내 문구 — 눈에 잘 들어오게 파랗게 */
.ftp-empty.guide { color: #2b6df3; font-size: 12.5px; font-weight: 700; }
.ftp-empty.working { color: #2b6df3; font-size: 12.5px; font-weight: 700; }
.ftp-empty.working strong { font-weight: 800; }
/* 계산이 끝나 ⊕ 줄이 번호 줄로 바뀔 때 — 새 줄만 살짝 떠오르며 들어온다.
   (자리가 그대로인 줄은 요소를 다시 만들지 않으므로 움직이지 않는다) */
@keyframes ftp-row-in {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: none; }
}
@keyframes ftp-badge-in {
  from { transform: scale(0.55); opacity: 0.2; }
  to { transform: scale(1); opacity: 1; }
}
.ftp-stop {
  animation: ftp-row-in 0.24s ease both;
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
/* 마우스가 있는 환경에서만 hover로 연다 — 터치에서는 탭으로 연다.
   행 전체가 아니라 '주소 글자' 위에서만 뜬다 — 오른쪽 아이콘(물건상세 ~ 목록에서 제거)
   위를 지날 때 말풍선이 떠서 아랫줄 아이콘을 덮어 버리는 것을 막는다. */
@media (hover: hover) {
  .ftp-stop-addr:hover + .ftp-addr-bubble { display: block; pointer-events: none; }
}
.ftp-stop.kind-start { background: #e6f8ee; }
.ftp-stop.kind-end { background: #fff3e0; }
.ftp-stop.visited .ftp-stop-addr { text-decoration: line-through; color: #9ca3af; }
.ftp-stop-badge {
  animation: ftp-badge-in 0.26s cubic-bezier(0.2, 0.8, 0.2, 1) both;
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
/* 끌고 있는 동안에는 번호를 빨갛게 — 어느 줄을 옮기는 중인지 바로 구분된다 */
.ftp-stop.dragging .ftp-stop-badge { background: #dc2626; box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.18); }
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
  height: 900px; max-height: calc(100vh - 160px);
  margin: 0 12px 14px;
  transition: height 0.18s ease;
}
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

</style>
