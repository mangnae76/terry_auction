<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuctionStore } from '../stores/auctionStore';
import { useAuthStore } from '../stores/authStore';
import { loadUserPrefs } from '../services/userPrefsRepository';
import type { AuctionDetail, AuctionStatus } from '../types/auction';
import { AUCTION_STATUS_LABELS } from '../types/auction';
import AppMobileHeader from '../components/AppMobileHeader.vue';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import AppToast from '../components/AppToast.vue';
import AppConfirm from '../components/AppConfirm.vue';
import { skipsToday, type ConfirmBox } from '../services/confirmBox';
import { addressWithName } from '../utils/addressName';
import searchIcon from '../assets/icones/searchs (1).png';
import chevronDownIcon from '../assets/icones/chevron-down (1).png';
import filesIcon from '../assets/icones/files (1).png';
import calendarDaysIcon from '../assets/icones/calendar-days (1).png';

const store = useAuctionStore();
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
/** 카드에 보여 줄 주소 — 주소에 건물명이 없는 물건은 정보요약에 적어 둔 이름을 끼워 준다 */
const cardAddress = (item: AuctionDetail) =>
  addressWithName(item.address ?? '', item.basicSummary?.['sum.buildingName']);

const listCollapsed = ref(false);
const statsCollapsed = ref(false); // 기본은 펴 둔다 — 단계별 건수가 먼저 보여야 한다
// 상태 카드 6개와 아래 필터 줄을 한 번에 접는다 (접을 때 열린 드롭다운도 닫는다)
const toggleStats = () => {
  statsCollapsed.value = !statsCollapsed.value;
  if (statsCollapsed.value) filterOpen.value = '';
};
const searchQuery = ref('');

// 주소 앞 동그란 종류 배지 — PDF 표기가 '다세대(빌라)', '도시형생활주택'처럼 제각각이라 패턴으로 한 글자만 뽑는다.
// 도시형생활주택이 '주택'·'(다세대)'를 달고 오므로 먼저 검사한다.
const PROP_TYPE_MARKS: Array<[RegExp, string]> = [
  [/아파트/, 'A'],
  [/도시형|도생/, '도'],
  [/다세대|빌라/, '다'],
  [/근린|상가|점포/, '상'],
  [/연립/, '연'],
  [/오피스텔/, '오'],
  [/단독|주택/, '단'],
];
const propTypeMark = (raw?: string) => {
  const t = raw ?? '';
  if (!t.trim()) return '';
  return PROP_TYPE_MARKS.find(([re]) => re.test(t))?.[1] ?? t.trim()[0];
};

// 목록에서는 '인천지방법원'처럼 긴 이름 대신 '인천법원'으로 짧게 보여 준다.
// 지원이 붙은 곳('인천지방법원 부천지원')은 지원 이름을 쓴다.
const shortCourt = (raw?: string) => {
  const name = (raw ?? '').trim();
  if (!name) return '';
  const branch = name.match(/([가-힣]+)\s*지원\s*$/);
  if (branch) return `${branch[1]}법원`;
  const m = name.match(/^(.*?)(?:지방|가정|행정|회생)?법원/);
  return m?.[1] ? `${m[1]}법원` : name;
};

const formatWon = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0';
  return Math.round(value).toLocaleString('ko-KR');
};

// 정렬 — 날짜순(기본, 입찰일이 빠른 것부터) / 임장순(임장경로에서 계산한 동선 순서)
const SORT_MODE_KEY = 'wlp.sortMode';
const readSortMode = (): 'reg' | 'route' => {
  try {
    return localStorage.getItem(SORT_MODE_KEY) === 'route' ? 'route' : 'reg';
  } catch {
    return 'reg';
  }
};
const sortMode = ref<'reg' | 'route'>(readSortMode());
// 다른 화면에 갔다 와도 고른 정렬이 유지되게 기기에 적어 둔다
watch(sortMode, (mode) => {
  try { localStorage.setItem(SORT_MODE_KEY, mode); } catch { /* 저장 못 해도 화면은 그대로 동작한다 */ }
});
const normAddr = (address: string | undefined) => (address ?? '').replace(/\s+/g, '');
/** 입찰진행 — 단계는 '입찰'이고 입찰상태가 '진행'인 물건 */
const isBidRunning = (item: AuctionDetail) =>
  item.status === '입찰' && (item.bidStatus ?? '').replace(/^입찰/, '') === '진행';
const routeOrder = ref<string[]>([]);
const loadRouteOrder = async () => {
  const prefs = await loadUserPrefs(authStore.uid);
  const draft = prefs?.fieldTripDraft as { orderedStops?: Array<{ address?: string }> } | null | undefined;
  routeOrder.value = (draft?.orderedStops ?? []).map((stop) => normAddr(stop.address)).filter(Boolean);
};
const toggleSortMode = async () => {
  sortMode.value = sortMode.value === 'reg' ? 'route' : 'reg';
  if (sortMode.value === 'route') await loadRouteOrder();
};
onMounted(() => { void loadRouteOrder(); });
watch(() => authStore.uid, () => { void loadRouteOrder(); });

/** 입찰진행은 단계(status)가 아니라 입찰상태라서, 스토어 필터 위에 한 겹 더 건다 */
const bidRunningOnly = ref(false);
const displayedAuctions = computed<AuctionDetail[]>(() => {
  const base = store.filteredAuctions
    .filter((item) => !item.id.startsWith('onbid-'))
    .filter((item) => !bidRunningOnly.value || isBidRunning(item));
  const q = searchQuery.value.replace(/\s+/g, '').toLowerCase();
  const found = !q
    ? base
    : base.filter((item) => {
      const haystack = `${item.caseNumber ?? ''}${item.address ?? ''}${item.courtName ?? ''}`
        .replace(/\s+/g, '')
        .toLowerCase();
      return haystack.includes(q);
    });
  if (sortMode.value !== 'route' || routeOrder.value.length === 0) {
    // 입찰일정순 — 입찰일이 빠른 물건부터, 날짜가 없으면 뒤로
    const dateKey = (raw: string | undefined) => {
      const digits = (raw ?? '').replace(/\D/g, '');
      return digits.length >= 8 ? digits.slice(0, 8) : '99999999';
    };
    return [...found].sort((a, b) => dateKey(a.eventDate).localeCompare(dateKey(b.eventDate)));
  }
  // 동선에 없는 물건은 뒤로 보내고, 그 안에서는 원래 순서를 지킨다
  const rank = new Map(routeOrder.value.map((address, i) => [address, i]));
  return [...found].sort(
    (a, b) => (rank.get(normAddr(a.address)) ?? Infinity) - (rank.get(normAddr(b.address)) ?? Infinity),
  );
});

// 별표 중요도 — 누를 때마다 1 → 2 → 3 → 빈 별 로 돌아간다
// 입찰일이 지난 물건은 목록에 날짜를 띄우지 않는다
const todayKey = (() => {
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
})();
const bidPassed = (item: AuctionDetail) => {
  const digits = (item.eventDate ?? '').replace(/\D/g, '');
  return digits.length >= 8 && digits.slice(0, 8) < todayKey;
};

const cyclePriority = async (item: AuctionDetail, evt: MouseEvent) => {
  evt.stopPropagation();
  const next = ((item.priority ?? 0) + 1) % 4;
  await store.saveAuction({ ...item, priority: next });
};

const goDetail = (id: string) => {
  router.push(`/auctions/${id}`);
};

// 확인창은 한 벌로 쓴다 — 브라우저 기본 confirm 에는 체크상자를 넣을 수 없어 직접 만들었다.
// '오늘 하루 보지 않기'는 종류마다 따로 기억한다(하나를 꺼도 다른 것은 그대로 뜬다).
const confirmBox = ref<ConfirmBox | null>(null);
const askConfirm = (box: ConfirmBox) => {
  if (skipsToday(box.skipKey)) { void box.run(); return; }
  confirmBox.value = box;
};

const removeItem = (id: string, evt: MouseEvent) => {
  evt.stopPropagation();
  askConfirm({
    title: '목록에서 지우겠습니까?',
    desc: '보관함에서 복원할 수 있습니다. 단, 단계는 손품조사로 돌아갑니다.',
    okLabel: '삭제',
    skipKey: 'wlp.skip.removeOne',
    run: () => store.deleteAuction(id),
  });
};

// 화면에서만 감춘다 — Firestore 문서는 지우지 않는다
const removeAll = async () => {
  const targets = displayedAuctions.value;
  if (targets.length === 0) return;
  const scope = searchQuery.value.trim() ? '검색된 물건' : '선정물건';
  askConfirm({
    title: `${scope} ${targets.length}건을 모두 지우겠습니까?`,
    desc: '보관함에서 복원할 수 있지만, 모든 물건의 단계가 손품조사로 돌아갑니다.',
    okLabel: '전체삭제',
    skipKey: 'wlp.skip.removeAll',
    run: () => store.hideAuctions(targets.map((item) => item.id)),
  });
};

// 숨긴 물건 — 목록을 펼쳐 고른 것만 되살린다
const hiddenOpen = ref(false);
const hiddenPicked = ref<Record<string, boolean>>({});
const toggleHiddenMenu = () => {
  hiddenOpen.value = !hiddenOpen.value;
  if (hiddenOpen.value) hiddenPicked.value = {};
};
const toggleHiddenPick = (id: string) => {
  hiddenPicked.value = { ...hiddenPicked.value, [id]: !hiddenPicked.value[id] };
};
const pickedHiddenIds = computed(() => Object.keys(hiddenPicked.value).filter((id) => hiddenPicked.value[id]));
const allHiddenPicked = computed(
  () => store.hiddenAuctions.length > 0 && pickedHiddenIds.value.length === store.hiddenAuctions.length,
);
const toggleAllHidden = () => {
  if (allHiddenPicked.value) {
    hiddenPicked.value = {};
    return;
  }
  const map: Record<string, boolean> = {};
  store.hiddenAuctions.forEach((item) => { map[item.id] = true; });
  hiddenPicked.value = map;
};
// 고른 숨긴 물건을 완전히 지운다 (되살릴 수 없음)
const purgePicked = async () => {
  const ids = pickedHiddenIds.value;
  if (ids.length === 0) return;
  askConfirm({
    title: `${ids.length}건을 완전히 삭제할까요?`,
    desc: '삭제하면 되살릴 수 없습니다. 이 확인은 건너뛸 수 없습니다.',
    okLabel: '완전삭제',
    skipKey: '',
    run: async () => {
      await store.purgeAuctions(ids);
      hiddenPicked.value = {};
      if (store.hiddenAuctions.length === 0) hiddenOpen.value = false;
    },
  });
};

const restorePicked = async () => {
  const ids = pickedHiddenIds.value;
  if (ids.length === 0) return;
  await store.restoreHiddenAuctions(ids);
  hiddenPicked.value = {};
  hiddenOpen.value = false;
};

// 복사 알림 — 앱 공통 토스트(AppToast)로 띄운다
// 쓰레기통 아이콘 — 번들 PNG가 흰색 단색이라 보이지 않아 데이터 URI SVG를 직접 쓴다
// 숨긴 물건 보관함 — 담긴 '곳'이라 상자, 버리는 '동작'인 휴지통과 구분한다
const BOX_ICON = 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27%236b7280%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Crect%20x%3D%272.5%27%20y%3D%274%27%20width%3D%2719%27%20height%3D%275%27%20rx%3D%271%27%2F%3E%3Cpath%20d%3D%27M4.5%209v9.5a1.5%201.5%200%200%200%201.5%201.5h12a1.5%201.5%200%200%200%201.5-1.5V9%27%2F%3E%3Cpath%20d%3D%27M10%2013h4%27%2F%3E%3C%2Fsvg%3E';
const TRASH_ICON = 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27%236b7280%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpath%20d%3D%27M3%206h18%27%2F%3E%3Cpath%20d%3D%27M8%206V4a1%201%200%200%201%201-1h6a1%201%200%200%201%201%201v2%27%2F%3E%3Cpath%20d%3D%27M19%206v14a2%202%200%200%201-2%202H7a2%202%200%200%201-2-2V6%27%2F%3E%3Cpath%20d%3D%27M10%2011v6%27%2F%3E%3Cpath%20d%3D%27M14%2011v6%27%2F%3E%3C%2Fsvg%3E';
const toastText = ref('');
const toastTone = ref<'info' | 'success' | 'error'>('success');
const flashToast = (text: string, tone: 'info' | 'success' | 'error' = 'success') => {
  toastTone.value = tone;
  toastText.value = text;
  window.setTimeout(() => { toastText.value = ''; }, 1600);
};
const copyItem = async (item: AuctionDetail, evt: MouseEvent) => {
  evt.stopPropagation();
  try {
    await navigator.clipboard.writeText(item.address);
    flashToast('주소가 복사되었습니다.', 'success');
  } catch {
    flashToast('복사에 실패했습니다.', 'error');
  }
};

type PhaseKey = 'desk' | 'plan' | 'visited' | 'bid';

/** 보관함 목록의 단계 태그 — 더보기 > 보관함 화면과 같은 규칙을 쓴다 */
const stageLabel = (item: AuctionDetail) => {
  if (item.status === '입찰') {
    return (item.bidStatus ?? '').replace(/^입찰/, '') === '진행' ? '입찰진행' : '입찰산정';
  }
  return AUCTION_STATUS_LABELS[item.status] ?? String(item.status);
};
const stageTone = (item: AuctionDetail) =>
  (item.status === '입찰' && (item.bidStatus ?? '').replace(/^입찰/, '') === '진행' ? 'bidding' : 'normal');

const PHASE_TO_STATUS: Record<PhaseKey, AuctionStatus> = {
  desk: '손품',
  plan: '임장예정',
  visited: '임장완료',
  bid: '입찰',
};

// 상태 칸 — 이름과 어울리는 아이콘(선 그림)을 같이 둔다
/** 상단 상태 카드 — 누르면 그 상태만 걸러 보여 준다 (한 번 더 누르면 전체) */
const filterByPhase = (key: PhaseKey) => {
  const status = PHASE_TO_STATUS[key];
  const was = store.activeStatus === status && !bidRunningOnly.value;
  bidRunningOnly.value = false;
  store.setFilter(was ? '전체' : status);
};
const isPhaseFiltered = (key: PhaseKey) =>
  store.activeStatus === PHASE_TO_STATUS[key] && !bidRunningOnly.value;
/** 전체 — 필터를 풀고 모두 보여 준다 */
const showAllPhases = () => {
  bidRunningOnly.value = false;
  store.setFilter('전체');
};

/* 하단 필터 — 기본 select는 화면 아래쪽에서 목록이 가려져, 위로 펼쳐지는 목록을 직접 만든다 */
type FilterKey = '' | 'court' | 'type';
const filterOpen = ref<FilterKey>('');
const PROPERTY_TYPE_OPTIONS = ['아파트', '다세대·연립', '다가구', '상가'];
// 드롭다운 옵션 앞에 붙는 작은 그림 — 24x24 좌표의 path만 모아 둔다 ('' 는 '전체')
const TYPE_ICON_PATHS: Record<string, string[]> = {
  '': ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  아파트: ['M4 21V4h11v17', 'M15 21V10h5v11', 'M3 21h18', 'M7 8h2', 'M11 8h1', 'M7 13h2', 'M11 13h1', 'M7 17h2', 'M11 17h1'],
  '다세대·연립': ['M3 21V9l6-4 6 4v12', 'M15 21V12h5v9', 'M3 21h18', 'M6 12h2', 'M11 12h1', 'M6 16h2', 'M11 16h1'],
  다가구: ['M3 10.5 12 4l9 6.5', 'M5 9.5V21h14V9.5', 'M9.5 21v-6h5v6'],
  상가: ['M3 9h18l-2-5H5L3 9z', 'M5 9v12h14V9', 'M9 21v-6h6v6'],
};
const typeIcon = (opt: string) => TYPE_ICON_PATHS[opt] ?? [];
const toggleFilter = (key: FilterKey) => {
  filterOpen.value = filterOpen.value === key ? '' : key;
};
const pickCourt = (v: string) => { store.setCourt(v); filterOpen.value = ''; };
const pickType = (v: string) => { store.setPropertyType(v); filterOpen.value = ''; };

const PHASE_LABELS: Array<{ key: PhaseKey; label: string; paths: string[] }> = [
  // 손품 — 집게손가락으로 짚어 보는 모양
  { key: 'desk', label: '손품조사', paths: ['M8 13V5.5a1.5 1.5 0 0 1 3 0V12', 'M11 11.5v-2a1.5 1.5 0 0 1 3 0V12', 'M14 11.5v-1a1.5 1.5 0 0 1 3 0V12', 'M17 12a1.5 1.5 0 0 1 3 0v3a6 6 0 0 1-6 6h-2a7 7 0 0 1-5-2.1L5 16a1.5 1.5 0 0 1 2.1-2.1L8 14.5'] },
  // 지도 핀 — 갈 곳
  { key: 'plan', label: '임장예정', paths: ['M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z', 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'] },
  // 체크 — 다녀옴
  { key: 'visited', label: '임장완료', paths: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'm8.5 12 2.5 2.5 4.5-5'] },
  // 입찰표
  { key: 'bid', label: '입찰산정', paths: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 13h8', 'M8 17h5'] },
];
// 상태별 건수 — 숨긴 물건과 온비드 임시항목은 빼고 센다
const totalPhaseCount = computed(
  () => store.auctions.filter((item) => !item.id.startsWith('onbid-')).length,
);
const phaseCounts = computed<Record<PhaseKey, number>>(() => {
  const counts: Record<PhaseKey, number> = { desk: 0, plan: 0, visited: 0, bid: 0 };
  store.auctions
    .filter((item) => !item.id.startsWith('onbid-'))
    .forEach((item) => {
      // 입찰진행은 아래 전용 카드가 센다 — 여기서 빼야 다섯 칸 합이 전체와 맞는다
      if (isBidRunning(item)) return;
      const hit = PHASE_LABELS.find((p) => PHASE_TO_STATUS[p.key] === item.status);
      if (hit) counts[hit.key] += 1;
    });
  return counts;
});
const bidRunningCount = computed(
  () => store.auctions.filter((item) => !item.id.startsWith('onbid-') && isBidRunning(item)).length,
);
/** 입찰진행 카드 — 단계 필터를 '입찰'로 두고 그 위에 진행만 남긴다 */
const filterByBidRunning = () => {
  if (bidRunningOnly.value) {
    bidRunningOnly.value = false;
    store.setFilter('전체');
    return;
  }
  bidRunningOnly.value = true;
  store.setFilter('입찰');
};

const phaseClass = (status: AuctionStatus, target: PhaseKey) =>
  status === PHASE_TO_STATUS[target] ? 'phase-active' : '';

// 네 번째 알약은 '입찰예정'에서 시작해, 입찰가산정의 입찰상태를 그대로 비춘다
const bidStatusOf = (item: AuctionDetail) => (item.bidStatus ?? '').replace(/^입찰/, '');
/** 4번째 알약 — 늘 '입찰산정'. 누르면 입찰가산정 화면으로 간다.
 *  입찰진행이 켜져 있으면 '지금 단계'는 5번째이므로 여기는 꺼 둔다 (한 번에 하나만 켜진다) */
const bidPhaseTone = (item: AuctionDetail) =>
  item.status === '입찰' && bidStatusOf(item) !== '진행' ? 'phase-active' : '';
/** 5번째 알약 — '입찰진행' 하나. 켜져 있으면 빨간 알약 */
const bidResultTone = (item: AuctionDetail) =>
  item.status === '입찰' && bidStatusOf(item) === '진행' ? 'phase-bidding' : '';
/** 마지막 단계 표시 — 화면을 옮기지 않고 그 자리에서 켜고 끈다 */
const toggleBidRunning = async (item: AuctionDetail, evt: MouseEvent) => {
  evt.stopPropagation();
  const on = bidStatusOf(item) !== '진행';
  await store.saveAuction({
    ...item,
    bidStatus: on ? '진행' : '',
    status: on ? '입찰' : item.status,
  });
};
const onBidPhaseClick = async (item: AuctionDetail, evt: MouseEvent) => {
  evt.stopPropagation();
  const running = bidStatusOf(item) === '진행';
  if (item.status === '입찰' && !running) return;
  await store.saveAuction({
    ...item,
    status: '입찰',
    bidStatus: running ? '대기' : (item.bidStatus ?? ''),
  });
};

// 단계에서 '탈락'을 없앤 뒤 남아 있는 옛 물건들 — 조용히 감추지 않고 알린 뒤 옮긴다
const legacyFailed = computed(() =>
  store.auctions.filter((item) => item.status === '보류' && !item.hidden),
);
const moveLegacyFailedToTrash = async () => {
  const targets = legacyFailed.value;
  if (targets.length === 0) return;
  askConfirm({
    title: `탈락 ${targets.length}건을 보관함으로 옮기겠습니까?`,
    desc: '보관함에서 복원할 수 있습니다. 단, 단계는 손품조사로 돌아갑니다.',
    okLabel: '옮기기',
    skipKey: 'wlp.skip.legacyFailed',
    run: async () => {
      await store.hideAuctions(targets.map((item) => item.id));
      flashToast(`${targets.length}건을 보관함으로 옮겼습니다.`, 'success');
    },
  });
};

const setPhase = async (item: AuctionDetail, target: PhaseKey, evt: MouseEvent) => {
  evt.stopPropagation();
  // 입찰진행 해제는 스토어의 setStatus 가 함께 처리한다
  await store.setStatus(item.id, PHASE_TO_STATUS[target]);
};

watch(
  () => [route.name, route.query.status] as const,
  ([name, status]) => {
    if (name !== 'auction-watchlist') return;
    store.resetListFilters();
    // 더보기 > 마이페이지에서 ?status=… 로 들어오면 그 단계만 걸러 준다
    if (typeof status === 'string' && status) {
      store.setFilter(status as AuctionStatus | '전체');
    }
  },
  { immediate: true },
);
</script>

<template>
  <section class="wlp-shell">
    <div class="wlp-fixed-top">
      <AppMobileHeader />

      <div class="wlp-search-row">
        <img :src="searchIcon" alt="" class="wlp-search-icon" />
        <input
          v-model="searchQuery"
          type="search"
          class="wlp-search-input"
          placeholder="선정물건리스트의 주소,사건명 검색..."
          aria-label="선정물건리스트의 주소, 사건명 검색"
        />
        <button
          type="button"
          class="wlp-search-chev-btn"
          :aria-expanded="!statsCollapsed"
          aria-label="상태 카드·필터 접기"
          @click="toggleStats"
        >
          <img :src="chevronDownIcon" alt="" :class="['wlp-search-chev', { up: statsCollapsed }]" />
        </button>
      </div>

      <div v-if="!statsCollapsed" class="wlp-filter-bar">
        <div class="wlp-filter-cell">
          <button
            type="button"
            :class="['wlp-filter-btn', { on: !!store.selectedPropertyType }]"
            @click="toggleFilter('type')"
          >
            <svg class="wlp-filter-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path v-for="(d, i) in typeIcon(store.selectedPropertyType)" :key="i" :d="d" />
            </svg>
            <span class="wlp-filter-txt">{{ store.selectedPropertyType || '전체' }}</span>
          </button>
          <template v-if="filterOpen === 'type'">
            <div class="wlp-filter-backdrop" @click="filterOpen = ''" />
            <ul class="wlp-filter-pop">
              <li
                :class="['wlp-filter-opt', { on: !store.selectedPropertyType }]"
                @click="pickType('')"
              >
                <svg class="wlp-opt-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path v-for="(d, i) in typeIcon('')" :key="i" :d="d" />
                </svg>
                <span>전체</span>
              </li>
              <li
                v-for="opt in PROPERTY_TYPE_OPTIONS"
                :key="opt"
                :class="['wlp-filter-opt', { on: store.selectedPropertyType === opt }]"
                @click="pickType(opt)"
              >
                <svg class="wlp-opt-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path v-for="(d, i) in typeIcon(opt)" :key="i" :d="d" />
                </svg>
                <span>{{ opt }}</span>
              </li>
            </ul>
          </template>
        </div>
        <div class="wlp-filter-cell">
          <button
            type="button"
            :class="['wlp-filter-btn', { on: store.selectedCourt !== '전체' }]"
            @click="toggleFilter('court')"
          >
            <svg class="wlp-filter-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 21h18M12 3 3 9h18L12 3ZM6 9v9M10 9v9M14 9v9M18 9v9" />
            </svg>
            <span class="wlp-filter-txt">{{ store.selectedCourt === '전체' ? '법원' : shortCourt(store.selectedCourt) }}</span>
          </button>
          <template v-if="filterOpen === 'court'">
            <div class="wlp-filter-backdrop" @click="filterOpen = ''" />
            <ul class="wlp-filter-pop">
              <li
                v-for="opt in store.courtOptions"
                :key="opt"
                :class="['wlp-filter-opt', { on: store.selectedCourt === opt }]"
                @click="pickCourt(opt)"
              >{{ opt === '전체' ? '법원 전체' : opt }}</li>
            </ul>
          </template>
        </div>
        <div class="wlp-filter-cell">
          <button
            type="button"
            :class="['wlp-sort-btn', { on: sortMode === 'route' }]"
            :title="sortMode === 'route' ? '임장순 (누르면 날짜순)' : '날짜순 (누르면 임장순)'"
            :aria-label="sortMode === 'route' ? '정렬: 임장순. 누르면 날짜순으로 바뀝니다' : '정렬: 날짜순. 누르면 임장순으로 바뀝니다'"
            @click="toggleSortMode"
          >
            <svg class="wlp-sort-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <!-- 임장순은 길 위의 핀, 날짜순은 큰 것부터 줄 세운 모양 -->
              <template v-if="sortMode === 'route'">
                <path d="M12 22s6.5-5.4 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 16.6 12 22 12 22Z" />
                <circle cx="12" cy="11" r="2.3" />
              </template>
              <template v-else>
                <path d="M4 6h11M4 12h7M4 18h4" />
                <path d="M18.5 4v15M18.5 19l-2.5-2.6M18.5 19l2.5-2.6" />
              </template>
            </svg>
            <span>{{ sortMode === 'route' ? '임장순' : '날짜순' }}</span>
          </button>
        </div>
        <div class="wlp-filter-cell fixed">
          <span class="wlp-hidden-note">
            <button type="button" class="wlp-restore-btn" :title="`숨긴 물건 ${store.hiddenCount}건`" @click.stop="toggleHiddenMenu">
              <img :src="BOX_ICON" alt="" class="wlp-restore-ico" /><em class="wlp-restore-x">×</em>{{ store.hiddenCount }}
            </button>
            <template v-if="hiddenOpen">
              <div class="wlp-hidden-backdrop" @click="hiddenOpen = false" />
              <div class="wlp-hidden-panel" @click.stop>
                <p class="wlp-hidden-title">
                  보관함 <span class="x">×</span> {{ store.hiddenCount }}건
                  <button type="button" class="close" aria-label="닫기" @click="hiddenOpen = false">×</button>
                </p>
                <p class="wlp-hidden-head">
                  <button type="button" @click="toggleAllHidden">{{ allHiddenPicked ? '전체해제' : '전체선택' }}</button>
                  <button
                    type="button"
                    class="apply"
                    :disabled="pickedHiddenIds.length === 0"
                    @click="restorePicked"
                  >복원 {{ pickedHiddenIds.length > 0 ? `(${pickedHiddenIds.length})` : '' }}</button>
                  <button
                    type="button"
                    class="purge"
                    :disabled="pickedHiddenIds.length === 0"
                    @click="purgePicked"
                  >완전삭제</button>
                </p>
                <p v-if="store.hiddenAuctions.length === 0" class="wlp-hidden-empty">숨긴 물건이 없습니다.</p>
                <ul class="wlp-hidden-list">
                  <li
                    v-for="item in store.hiddenAuctions"
                    :key="item.id"
                    class="wlp-hidden-item"
                    @click="toggleHiddenPick(item.id)"
                  >
                    <input type="checkbox" :checked="hiddenPicked[item.id] === true" @click.stop="toggleHiddenPick(item.id)" />
                    <span class="wlp-hidden-texts">
                      <span class="case">
                        {{ item.caseNumber }}
                        <em :class="['wlp-hidden-tag', `tone-${stageTone(item)}`]">{{ stageLabel(item) }}</em>
                      </span>
                      <span class="addr">{{ cardAddress(item) || '주소 없음' }}</span>
                    </span>
                  </li>
                </ul>
                <button
                  type="button"
                  class="wlp-hidden-more"
                  @click="hiddenOpen = false; router.push('/trash')"
                >카드로 자세히 보기<span class="arr">›</span></button>
              </div>
            </template>
          </span>
        </div>
        <div class="wlp-filter-cell fixed">
          <button
            type="button"
            class="wlp-clear-all"
            :disabled="displayedAuctions.length === 0"
            :title="displayedAuctions.length > 0 ? `전체삭제 (${displayedAuctions.length}건)` : '지울 물건이 없습니다'"
            :aria-label="`보이는 물건 ${displayedAuctions.length}건 모두 삭제`"
            @click="removeAll"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 6h18" />
              <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          </button>
        </div>
      </div>

      <!-- 단계 — 카드 대신 한 줄 글자 띠로. 흐름(▶)이 그대로 보인다 -->
      <div v-if="!statsCollapsed" class="wlp-steps">
        <button
          type="button"
          :class="['wlp-step', 'st-all', { on: store.activeStatus === '전체' }]"
          @click="showAllPhases"
        >전체 <em>({{ totalPhaseCount }})</em></button>
        <template v-for="p in PHASE_LABELS" :key="p.key">
          <span class="wlp-step-arrow">▶</span>
          <button
            type="button"
            :class="['wlp-step', `st-${p.key}`, { on: isPhaseFiltered(p.key) }]"
            @click="filterByPhase(p.key)"
          >{{ p.label }} <em>({{ phaseCounts[p.key] }})</em></button>
        </template>
        <span class="wlp-step-arrow">▶</span>
        <button
          type="button"
          :class="['wlp-step', 'st-running', { on: bidRunningOnly }]"
          @click="filterByBidRunning"
        >입찰진행 <em>({{ bidRunningCount }})</em></button>
      </div>

      <p v-if="legacyFailed.length > 0" class="wlp-legacy-note">
        단계에서 <strong>탈락</strong>을 없앴습니다 — 남아 있는 {{ legacyFailed.length }}건
        <button type="button" @click="moveLegacyFailedToTrash">휴지통으로 옮기기</button>
      </p>
    </div>

    <button type="button" class="wlp-fab" @click="router.push('/auctions/import')">
      <span class="wlp-fab-plus">+</span> 선정물건등록
    </button>

    <div class="wlp-list-scroll">
      <p v-if="store.storageWarning" class="wlp-warning">{{ store.storageWarning }}</p>
      <article
        v-for="item in displayedAuctions"
        :key="item.id"
        :class="['wlp-card', { 'wlp-card-compact': listCollapsed, 'wlp-card-past': bidPassed(item) }]"
        @click="goDetail(item.id)"
      >
        <span v-if="bidPassed(item)" class="wlp-ribbon" aria-label="갱신 필요" title="갱신 필요">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" /><path d="M20.5 3.5V9H15" />
          </svg>
        </span>
        <div class="wlp-card-top">
          <div class="wlp-card-meta">
            <span class="wlp-meta-date">
              <img :src="calendarDaysIcon" alt="" class="wlp-meta-date-icon" />
              {{ item.eventDate }}
            </span>
            <span class="wlp-meta-sep">·</span>
            <span class="wlp-meta-court">{{ shortCourt(item.courtName) }}</span>
            <span class="wlp-meta-sep">·</span>
            <span class="wlp-meta-case">{{ item.caseNumber }}</span>
          </div>
          <div class="wlp-card-actions">
            <button
              type="button"
              class="wlp-card-icon wlp-card-star"
              :aria-label="`중요도 ${item.priority ?? 0}`"
              title="중요도 (1→2→3)"
              @click="cyclePriority(item, $event)"
            >
              <svg
                v-for="n in 3"
                :key="n"
                viewBox="0 0 24 24"
                width="15"
                height="15"
                :fill="(item.priority ?? 0) >= n ? '#facc15' : 'none'"
                :stroke="(item.priority ?? 0) >= n ? '#eab308' : '#a8adb8'"
                stroke-width="2"
                stroke-linejoin="round"
              >
                <polygon points="12 2.6 15 9 22 9.8 17 14.5 18.3 21.4 12 18 5.7 21.4 7 14.5 2 9.8 9 9" />
              </svg>
            </button>
            <button type="button" class="wlp-card-icon" aria-label="주소복사" title="주소복사" @click="copyItem(item, $event)">
              <img :src="filesIcon" alt="" />
            </button>
            <button type="button" class="wlp-card-icon wlp-card-close" aria-label="숨기기" title="목록에서 숨기기" @click="removeItem(item.id, $event)">
              <img :src="TRASH_ICON" alt="" />
            </button>
          </div>
        </div>

        <h3 v-if="!listCollapsed" class="wlp-address">
          <span v-if="propTypeMark(item.propertyType)" class="wlp-type-mark">{{ propTypeMark(item.propertyType) }}</span><span :class="{ done: item.status === '임장완료' }">{{ cardAddress(item) }}</span>
        </h3>

        <div v-if="!listCollapsed" class="wlp-price-row">
          <div class="wlp-price-box">
            <small>감정가</small>
            <strong>{{ formatWon(item.metrics.appraisalValue) }}<em>원</em></strong>
          </div>
          <div class="wlp-price-box">
            <small>{{ item.auctionRound || '최저' }}</small>
            <strong>{{ formatWon(item.metrics.minimumBidValue) }}<em>원</em></strong>
          </div>
          <div class="wlp-price-box wlp-price-mine">
            <small>입찰가</small>
            <strong>{{ formatWon(item.metrics.myBidValue) }}<em>원</em></strong>
          </div>
        </div>

        <div class="wlp-phase-row">
          <button type="button" :class="['wlp-phase', phaseClass(item.status, 'desk')]" @click="setPhase(item, 'desk', $event)">손품조사</button>
          <span class="wlp-phase-arrow">▶</span>
          <button type="button" :class="['wlp-phase', phaseClass(item.status, 'plan')]" @click="setPhase(item, 'plan', $event)">임장예정</button>
          <span class="wlp-phase-arrow">▶</span>
          <button type="button" :class="['wlp-phase', phaseClass(item.status, 'visited')]" @click="setPhase(item, 'visited', $event)">임장완료</button>
          <span class="wlp-phase-arrow">▶</span>
          <button
            type="button"
            :class="['wlp-phase', bidPhaseTone(item)]"
            title="입찰산정 단계로"
            @click="onBidPhaseClick(item, $event)"
          >입찰산정</button>
          <span class="wlp-phase-arrow">▶</span>
          <button
            type="button"
            :class="['wlp-phase', bidResultTone(item)]"
            :title="bidResultTone(item) ? '누르면 입찰진행을 해제합니다' : '누르면 입찰진행으로 표시합니다'"
            @click="toggleBidRunning(item, $event)"
          >입찰진행</button>
        </div>
      </article>

      <p v-if="displayedAuctions.length === 0 && !store.loading" class="wlp-empty">
        표시할 물건이 없습니다.
      </p>
    </div>

    <AppConfirm :box="confirmBox" @close="confirmBox = null" />

    <AppMobileBottomNav active="watchlist" />
    <AppToast :visible="!!toastText" :text="toastText" :tone="toastTone" />
  </section>
</template>

<style scoped>
.wlp-shell {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  /* 아래쪽(카드 목록) 바탕 — 물건정보 본문(.adp-shell)과 같은 값 */
  background: #dcdee3;
  overflow: hidden;
  z-index: 100;
}

.wlp-fixed-top {
  flex: 0 0 auto;
  /* 위쪽 — 물건정보 고정 카드(.adp-prop-head)와 같은 값 */
  background: #f1f3f7;
}

/* ===== Top header (blue) ===== */
.wlp-header {
  background: linear-gradient(135deg, #2b6df3 0%, #1f53d6 100%);
  color: #fff;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.wlp-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.wlp-brand-logo {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  object-fit: contain;
  background: #fff;
  padding: 4px;
}
.wlp-brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.05;
}
.wlp-brand-text strong {
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.4px;
}
.wlp-brand-text span {
  font-size: 11px;
  font-weight: 600;
  opacity: 0.85;
  letter-spacing: 1.2px;
}
.wlp-header-icons {
  display: flex;
  align-items: center;
  gap: 6px;
}
.wlp-icon-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: transparent;
  border: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #fff;
}
.wlp-icon-btn svg { width: 28px; height: 28px; }
.wlp-icon-btn:active {
  background: rgba(255, 255, 255, 0.15);
}

/* ===== Search row ===== */
.wlp-search-row {
  background: #fff;
  margin: 0 0 4px;
  border: none;
  border-bottom: 1px solid #cbd5e1;
  border-radius: 0;
  padding: 8px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.wlp-search-icon { width: 20px; height: 20px; object-fit: contain; flex-shrink: 0; }
.wlp-search-input {
  flex: 1 1 auto;
  border: none;
  outline: none;
  background: transparent;
  font-size: 15px;
  color: #111827;
  min-width: 0;
}
.wlp-search-input::placeholder { color: #9ca3af; }
.wlp-search-chev-btn {
  border: none; background: transparent; cursor: pointer; padding: 4px;
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.wlp-search-chev { width: 16px; height: 16px; object-fit: contain; opacity: 0.7; flex-shrink: 0; transition: transform 0.2s ease; }
.wlp-search-chev.up { transform: rotate(180deg); }

.wlp-collapse {
  /* 왼쪽 끝 — 법원 드롭박스 시작점과 같은 선에 둔다 */
  margin-left: -2px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #6b7280;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
}
.wlp-chev {
  font-size: 18px;
  display: inline-block;
  transition: transform 0.2s ease;
}
.wlp-chev.up { transform: rotate(180deg); }

/* ===== Stats grid (outline cards) ===== */
/* 여섯 칸을 한 줄에 — 390px에서 칸당 약 59px이라 글자·아이콘을 그 폭에 맞춘다 */
/* 단계 띠 — 한 줄에 쭉 늘어놓고 넘치면 가로로 민다 */
.wlp-steps {
  display: flex; align-items: center; justify-content: space-between; gap: 0;
  padding: 2px 5px 9px;   /* 좌우 5px — 필터 줄·카드와 같은 선 */
  overflow: hidden;
}
.wlp-steps::-webkit-scrollbar { display: none; }
.wlp-step {
  flex: 0 1 auto;
  min-width: 0;
  border: none; background: transparent; border-radius: 6px;
  padding: 5px 4px;
  font-family: inherit; font-size: 11.5px; font-weight: 400; line-height: 1.45;
  letter-spacing: -0.5px; white-space: nowrap; cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}
.wlp-step em { font-style: normal; font-weight: 400; opacity: 0.95; }
.wlp-step.on em { opacity: 0.85; }
/* 고른 단계는 알약으로 채운다 — 글자색이 흰색으로 뒤집힌다.
   흰색은 단계별 색 규칙과 자릿수가 같아 밀리므로 .st-*.on 쪽에 같이 적는다 */
/* 단계가 이어진다는 표시 — 카드의 단계 화살표(▶ 10px)와 같은 모양에 절반 크기 */
.wlp-step-arrow { flex: 0 0 auto; color: #9ca3af; font-size: 4px; margin: 0 -1px; }

.wlp-step.st-all { color: #64748b; }
.wlp-step.st-all.on { background: #64748b; color: #fff; }
.wlp-step.st-desk { color: #2563eb; }
.wlp-step.st-desk.on { background: #2563eb; color: #fff; }
.wlp-step.st-plan { color: #16a34a; }
.wlp-step.st-plan.on { background: #16a34a; color: #fff; }
.wlp-step.st-visited { color: #15803d; }
.wlp-step.st-visited.on { background: #15803d; color: #fff; }
.wlp-step.st-bid { color: #dda40c; }
.wlp-step.st-bid.on { background: #ca8a04; color: #fff; }
.wlp-step.st-running { color: #dc2626; }
.wlp-step.st-running.on { background: #dc2626; color: #fff; }
@media (max-width: 374px) {
  .wlp-step { font-size: 10.8px; padding: 5px 3px; letter-spacing: -0.7px; }
}
/* ===== List title ===== */
/* '탈락' 단계를 없앤 뒤 남은 물건 안내 — 한 번 옮기면 사라진다 */
.wlp-legacy-note {
  margin: 0 12px 6px; padding: 7px 10px;
  background: #fff7ed; border: 1px solid #fde4c7; border-radius: 8px;
  font-size: 11px; font-weight: 400; color: #b45309; line-height: 1.45;
}
.wlp-legacy-note strong { font-weight: 800; }
/* 손품 일괄 이동 — 안내가 아니라 동작이라 파란 계열로 구분 */
.wlp-legacy-note.plan { background: #f2f7ff; border-color: #c7d7f7; color: #2b6df3; }
.wlp-legacy-note.plan button { border-color: #c7d7f7; color: #2b6df3; }
.wlp-legacy-note button {
  margin-left: 6px; border: 1px solid #f0c694; border-radius: 7px; background: #fff;
  padding: 3px 8px; font-size: 11px; font-weight: 700; color: #b45309; cursor: pointer;
}
.wlp-list-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 4px;
  font-size: 14px;
  font-weight: 800;
  color: #111827;
}
.wlp-list-title-left {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
}
.wlp-list-title-text {
  display: inline-flex; align-items: center; gap: 4px;
  min-width: 0; overflow: hidden; text-overflow: ellipsis;
  font-size: 13.5px; font-weight: 800; color: #111827; white-space: nowrap;
}
/* 하단 메뉴와 같은 별 — PNG를 마스크로 찍어 색만 입힌다 */
.wlp-list-title-ico {
  width: 14px; height: 14px; flex-shrink: 0; display: block;
  background-color: #2a5fbf;
  -webkit-mask: var(--i) center/contain no-repeat;
  mask: var(--i) center/contain no-repeat;
}
.wlp-list-title-drive { width: 20px; height: 20px; object-fit: contain; display: block; }
/* 제목 옆 남은 폭을 네 버튼이 균등 분할한다.
   폭이 모자라면 버튼이 아니라 제목이 먼저 줄어들어 카드 밖으로 밀려나지 않는다. */
.wlp-list-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  margin-left: auto;
}
.wlp-list-actions > * { min-width: 0; }
/* 떠 있는 + 물건등록 — 최초판(a4e8b7b)의 왼쪽 아래 좌표 그대로 */
.wlp-fab {
  position: absolute;
  left: 14px;
  bottom: 116px;
  background: #2b6df3;
  color: #fff;
  border: none;
  border-radius: 999px;
  padding: 11px 18px;
  font-size: 13px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  box-shadow: 0 4px 12px rgba(43, 109, 243, 0.35);
  cursor: pointer;
  z-index: 5;
}
.wlp-fab-plus { font-size: 16px; line-height: 1; font-weight: 900; }
.wlp-restore-btn:disabled { opacity: 0.45; cursor: default; }
/* 드롭다운은 사건번호만 보여 준다 — 자세한 카드는 휴지통 화면으로 */
.wlp-hidden-more {
  width: 100%; margin-top: 4px; padding: 7px 8px;
  border: none; border-top: 1px solid #eef0f5; background: transparent;
  display: flex; align-items: center; justify-content: center; gap: 4px;
  font-size: 11.5px; font-weight: 700; color: #2b6df3; cursor: pointer;
}
.wlp-hidden-more .arr { font-size: 13px; line-height: 1; }
.wlp-hidden-more:active { background: #f6f8fc; }
.wlp-hidden-empty { margin: 0; padding: 18px 8px; text-align: center; font-size: 11.5px; color: #9ca3af; }
/* 정렬 전환 — 날짜순 / 임장순 */
/* 기본(날짜순)은 초록, 임장순으로 바꾸면 파랑 */
.wlp-sort-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 3px;
  box-sizing: border-box; height: 26px;
  border: 1px solid #daefe3; background: #eefaf2; border-radius: 8px;
  padding: 0 8px; font-size: 12px; font-weight: 400; line-height: 1; color: #15803d;
  cursor: pointer; white-space: nowrap;
}
.wlp-sort-btn.on { border-color: #d2e2fb; background: #eaf1ff; color: #2b6df3; }
/* 필터 줄에 놓인 정렬 버튼 — 옆 칸들과 높이·폭을 맞춘다 */
.wlp-filter-cell .wlp-sort-btn { width: 100%; height: auto; padding: 5px 6px; gap: 2px; line-height: 1.35; }
/* 그림은 글자와 같은 색을 따라간다 (날짜순 초록 → 임장순 파랑) */
.wlp-sort-ico { flex: 0 0 auto; width: 13px; height: 13px; }
/* 누르면 바뀌는 칸이라는 표시 — 오른쪽에 맞바꿈 화살표를 둔다.
   옆 칸들이 펼침 화살표(▼)를 다는 자리와 같아서 '누를 수 있다'가 바로 읽힌다 */
.wlp-filter-cell .wlp-sort-btn {
  position: relative;
  padding-right: 21px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='10' viewBox='0 0 12 10'%3E%3Cpath d='M1 3h9M7.6 0.6 10.4 3 7.6 5.4' fill='none' stroke='%2315803d' stroke-width='1.3' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M11 7H2M4.4 4.6 1.6 7 4.4 9.4' fill='none' stroke='%2315803d' stroke-width='1.3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
}
.wlp-filter-cell .wlp-sort-btn.on {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='10' viewBox='0 0 12 10'%3E%3Cpath d='M1 3h9M7.6 0.6 10.4 3 7.6 5.4' fill='none' stroke='%232b6df3' stroke-width='1.3' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M11 7H2M4.4 4.6 1.6 7 4.4 9.4' fill='none' stroke='%232b6df3' stroke-width='1.3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
}
/* 전체삭제 — 글자도 상자도 떼고 빨간 휴지통만 (카드의 삭제와 같은 그림, 색으로 무게를 준다) */
.wlp-clear-all {
  display: inline-flex; align-items: center; justify-content: center;
  box-sizing: border-box; height: 30px; width: 32px;
  border: 1px solid #f0d2d2; background: #fff; border-radius: 8px;
  padding: 0; line-height: 1; color: #d14343;
  cursor: pointer;
}
.wlp-clear-all svg { width: 18px; height: 18px; }
.wlp-clear-all:active { opacity: 0.55; }
/* 지울 것이 없어도 칸은 비우지 않는다 — 사라지면 옆 상자들이 들썩인다 */
.wlp-clear-all:disabled { opacity: 0.35; cursor: default; }
/* 숨긴 물건 드롭다운 */
.wlp-hidden-note { position: relative; display: flex; min-width: 0; }
/* 보관함 × 7 — 숨긴 물건 수 */
.wlp-restore-ico { width: 20px; height: 20px; object-fit: contain; display: block; flex: 0 0 auto; }
.wlp-restore-x { font-style: normal; font-size: 9.5px; color: #9ca3af; margin: 0 1px 0 2px; }
.wlp-hidden-backdrop { position: fixed; inset: 0; z-index: 40; background: rgba(15, 23, 42, 0.45); }
/* 보관함 — 버튼 아래 드롭다운이면 화면 밖으로 밀려나서 가운데 팝업으로 띄운다 */
.wlp-hidden-panel {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  z-index: 50;
  width: min(92vw, 420px);
  max-height: 76vh;
  display: flex; flex-direction: column;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.28);
  overflow: hidden;
}
.wlp-hidden-title {
  display: flex; align-items: center; gap: 6px; margin: 0;
  padding: 11px 12px; border-bottom: 1px solid #eef1f6;
  font-size: 14px; font-weight: 800; color: #111827;
}
.wlp-hidden-title .x { font-weight: 400; color: #9ca3af; }
.wlp-hidden-title .close {
  margin-left: auto; border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #6b7280; padding: 0 2px;
}
/* 사건번호는 굵게, 주소는 아랫줄에 회색으로 — 좁아서 못 보던 것을 다 보여 준다 */
.wlp-hidden-texts { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.wlp-hidden-texts .case { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #111827; }
/* 단계 태그 — 더보기 > 보관함 화면(.trs-stage)과 같은 모양.
   오른쪽 끝에 붙여 '완전삭제' 버튼 끝과 줄을 맞춘다 */
.wlp-hidden-tag {
  flex: 0 0 auto; margin-left: auto; font-style: normal;
  border: 1px solid #6b85f0; background: #dce5ff; color: #3850c2;
  border-radius: 5px; padding: 2px 7px;
  font-size: 9.5px; font-weight: 700; white-space: nowrap;
}
.wlp-hidden-tag.tone-bidding { border-color: #ef6b6b; background: #ffdede; color: #c22e2e; font-weight: 800; }
.wlp-hidden-texts .addr { font-size: 11.5px; font-weight: 400; color: #6b7280; line-height: 1.3; }
.wlp-hidden-head {
  display: flex; gap: 6px; margin: 0; padding: 8px 12px; flex: 0 0 auto;
  border-bottom: 1px solid #eef1f6; background: #fafafa;
}
.wlp-hidden-head button {
  flex: 1 1 0; min-width: 0; white-space: nowrap; border: 1px solid #d5dbe6; background: #fff;
  border-radius: 6px; padding: 0 6px; height: 30px; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center;
  font-family: inherit; font-size: 11px; font-weight: 700; color: #374151; cursor: pointer;
}
.wlp-hidden-head button.apply { background: #2b6df3; border-color: #2b6df3; color: #fff; }
.wlp-hidden-head button.purge { background: #fff; border-color: #f0d2d2; color: #d14343; }
.wlp-hidden-head button.apply:disabled { opacity: 0.45; }
.wlp-hidden-list { list-style: none; margin: 0; padding: 0; flex: 1 1 auto; overflow-y: auto; }
.wlp-hidden-item {
  position: relative;
  display: flex; align-items: flex-start; gap: 8px;
  padding: 9px 12px; border-bottom: 1px solid #f1f3f7; cursor: pointer;
}
.wlp-hidden-item input { margin-top: 2px; flex: 0 0 auto; }
/* 주소 말풍선 — 임장경로 목록과 같은 모양. 드롭다운 밖으로 나와야 해서 화면 기준으로 띄운다 */
.wlp-addr-bubble {
  position: fixed; z-index: 9999;
  /* 주소는 접지 않고 한 줄로 길게 */
  white-space: nowrap; max-width: none;
  background: #111827; color: #fff;
  font-size: 12px; font-weight: 600; line-height: 1.45;
  padding: 7px 10px; border-radius: 8px;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.28);
  pointer-events: none;
}
.wlp-addr-bubble::before {
  content: '';
  position: absolute; top: -5px; left: 16px;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 5px solid #111827;
}

.wlp-hidden-item:last-child { border-bottom: none; }
.wlp-hidden-item .addr {
  flex: 1 1 auto; min-width: 0; font-size: 11.5px; color: #111827;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* 제목 옆에 붙는 '숨긴 물건 N건 · 복원' */
.wlp-hidden-note {
  display: inline-flex; align-items: center;
  margin-left: 0; white-space: nowrap;
}
/* 정렬 버튼(임장경로순)과 같은 크기·글자 */
/* 보관함 — 필터 줄에 들어가며 옆 상자와 같은 규격을 쓴다 */
.wlp-restore-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 3px;
  box-sizing: border-box; height: 30px;
  border: 1px solid #e5e7eb; background: #fff; border-radius: 8px;
  padding: 0 7px; font-size: 12px; font-weight: 400; line-height: 1; color: #111827;
  cursor: pointer; white-space: nowrap;
}
.wlp-restore-btn:active { opacity: 0.55; }
.wlp-list-title-btn {
  border: none; background: transparent; padding: 2px;
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
}

/* ===== Scrollable list ===== */
.wlp-list-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
  /* 좌우 5px · 위 8px — 물건정보 본문(.adp-body)과 같은 여백 */
  padding: 8px 5px 220px;
  -webkit-overflow-scrolling: touch;
}
.wlp-warning {
  background: #fef2f2;
  color: #b91c1c;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  margin: 0 0 8px;
}
.wlp-empty {
  text-align: center;
  color: #9ca3af;
  padding: 40px 0;
  font-size: 14px;
}

/* ===== Card ===== */
.wlp-card {
  background: #fff;
  border-radius: 10px;
  padding: 8px;
  /* 줄 간격을 margin 제각각이 아니라 gap 하나로 — 모든 카드가 같은 간격이 된다 */
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
  border: 1px solid #eef0f5;
  cursor: pointer;
  position: relative;
}
.wlp-card-compact {
  padding: 6px 10px;
}
.wlp-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
/* 첫 줄은 무슨 일이 있어도 한 줄 — 줄바꿈을 허용하면 사건번호가 내려가
   카드마다 높이가 달라진다. 좁으면 법원 → 사건번호 차례로 줄임표로 접는다 */
.wlp-card-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #4b5563;
  flex-wrap: nowrap;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
}
.wlp-meta-date { color: #111827; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto; }
/* 법원이 먼저 양보하고(shrink 3), 사건번호는 되도록 지킨다 */
.wlp-meta-court { flex: 0 3 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wlp-meta-case { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wlp-meta-date-icon { width: 14px; height: 14px; object-fit: contain; flex-shrink: 0; }
.wlp-meta-sep { color: #cbd5e1; flex: 0 0 auto; }
.wlp-card-actions {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  flex-shrink: 0;
  margin-left: auto;
}
.wlp-card-icon {
  width: 24px;
  height: 30px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #6b7280;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  padding: 0;
  flex-shrink: 0;
}
.wlp-card-icon img { width: 16px; height: 16px; object-fit: contain; display: block; }
.wlp-card-icon svg { width: 16px; height: 16px; display: block; }
.wlp-card-icon:active { background: #f1f5f9; }
.wlp-card-close { color: #6b7280; }
/* 중요도 별 — 채워지면 노란 별 안에 숫자를 얹는다 */
/* 중요도 — 작은 별 3개를 순서대로 채운다 */
.wlp-card-star {
  width: auto; height: 34px;
  display: inline-flex; align-items: center; gap: 1px;
  /* 별 묶음과 옆 아이콘 사이가 별 사이 간격보다 넓어야 묶여 보인다 */
  margin-right: 2px;
}
/* 별도 복사·휴지통과 같은 16px — 셋이 같은 크기로 보여야 한다 */
.wlp-card-star svg { width: 16px; height: 16px; }

.wlp-type-mark {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 50%;
  background: #2b6df3; color: #fff;
  font-size: 11px; font-weight: 800; line-height: 1;
  margin-right: 5px; vertical-align: middle;
}
/* 입찰일이 지난 물건 — 배경은 그대로 두고 안의 요소만 아주 흐리게 */
.wlp-card-past { background: #fff; overflow: hidden; }
/* 왼쪽 위 모서리를 꽉 채우는 빨간 삼각형 */
.wlp-card-past::before {
  content: '';
  position: absolute; top: 0; left: 0; z-index: 1;
  width: 0; height: 0;
  border-top: 30px solid #b91c1c;
  border-right: 30px solid transparent;
}
/* 그 위에 얹는 새로고침 아이콘 */
.wlp-ribbon {
  position: absolute; z-index: 2;
  top: 2px; left: 2px;
  display: inline-flex; pointer-events: none;
}
.wlp-card-past .wlp-ribbon svg { stroke: #fff !important; }
.wlp-card-past *,
.wlp-card-past .wlp-address span,
.wlp-card-past .wlp-price-box strong,
.wlp-card-past .wlp-price-box small { color: #c9ced9 !important; }
.wlp-card-past img { filter: grayscale(1) brightness(0) invert(0.84); }
/* 삭제(×) 버튼만은 원래 모습 그대로 */
.wlp-card-past .wlp-card-close { color: #6b7280 !important; }
.wlp-card-past .wlp-card-close img { filter: none; }
.wlp-card-past svg { stroke: #dbdfe7 !important; fill: none !important; }
.wlp-card-past .wlp-type-mark { background: #e4e8ef !important; color: #fff !important; }
.wlp-card-past .wlp-price-box { background: #fbfcfe !important; }
/* 입찰일이 지난 카드는 알약도 색을 빼 담담하게 — '지난 카드' 안에서만 적용된다 */
.wlp-card-past .wlp-phase,
.wlp-card-past .wlp-phase.phase-active,
.wlp-card-past .wlp-phase.phase-bidding {
  background: #fff !important; border-color: #ebeef3 !important; color: #9ca3af !important;
}
/* 이 알약은 다른 화면으로 넘어간다는 신호 — 선택된 칸에서만 파랗게 */
.wlp-phase-go { margin-left: 4px; font-size: 9px; color: #9ca3af; vertical-align: 1px; }
.wlp-phase-go.on { color: #2b6df3; }

/* 임장경로에서 방문 체크한 물건은 여기서도 주소에 줄을 긋는다 */
.wlp-address span.done { text-decoration: line-through; color: #9ca3af; }
.wlp-address {
  font-size: 13px;
  font-weight: 800;
  color: #111827;
  margin: 0;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wlp-price-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
}
.wlp-price-box {
  background: #f8fafc;
  border-radius: 8px;
  padding: 4px 7px;
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}
.wlp-price-box small {
  font-size: 10px;
  color: #6b7280;
  font-weight: 400;
  flex-shrink: 0;
}
.wlp-price-box strong {
  font-size: 11px;
  font-weight: 800;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1 1 auto;
  text-align: right;
}
.wlp-price-box strong em {
  font-style: normal;
  /* '원'은 '감정가·입찰가' 라벨과 같은 크기로 — 보조 글자끼리 한 값으로 묶는다 */
  font-size: 10px;
  font-weight: 400;
  color: #6b7280;
  margin-left: 1px;
}
.wlp-price-mine {
  background: #eff6ff;
}
.wlp-price-mine strong { color: #1d4ed8; }

.wlp-phase-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  flex-wrap: nowrap;
}
.wlp-phase-row .wlp-phase {
  flex: 1 1 0;
  text-align: center;
  padding: 2px 6px;
}
.wlp-phase {
  border: 1.5px solid #cbd5e1;
  background: #fff;
  color: #6b7280;
  border-radius: 999px;
  /* 알약이 다섯 개라 한 단계 작게 — 390px에서 잘리지 않는 치수 */
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  line-height: 1.4;
}
.wlp-phase.phase-active {
  border-color: #6b85f0;
  background: #dce5ff;
  color: #3850c2;
}
/* 입찰진행 — 옆의 파란 알약(#6b85f0 / #dce5ff / #3850c2)과 같은 농도 구조의 빨강 */
.wlp-phase.phase-bidding {
  border-color: #ef6b6b;
  background: #ffdede;
  color: #c22e2e;
  font-weight: 800;
}
/* 입찰대기·입찰포기 — 회색 알약에 테두리가 보이게 */
.wlp-phase.phase-closed {
  border-color: #cbd5e1; background: #f3f4f6; color: #6b7280; font-weight: 700;
}
.wlp-phase-arrow {
  font-size: 10px;
  color: #cbd5e1;
  flex-shrink: 0;
}
.wlp-phase-arrow.swap { color: #94a3b8; }

/* ===== Floating + 물건등록 ===== */
/* 선정물건 등록 — 목록 제목 자리에 둔다 */
.wlp-add-btn {
  background: #2b6df3;
  color: #fff;
  border: none;
  /* 전체삭제 버튼과 같은 실루엣 — 높이 26px, 라운드 8px */
  border-radius: 8px;
  box-sizing: border-box;
  height: 26px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 400;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(43, 109, 243, 0.3);
  cursor: pointer;
  z-index: 5;
}

/* ===== Filter bar ===== */
/* 상단 상태 카드 바로 아래로 올린 필터 줄 */
.wlp-filter-bar {
  display: flex;
  align-items: center;
  /* 물건종류 · 법원 · 정렬 · 보관함 · 전체삭제 — 앞 셋이 남는 폭을 나눠 갖는다 */
  background: transparent;
  padding: 3px 5px 4px;   /* 좌우 5px — 아래 카드와 같은 선에 세운다 */
  gap: 7px;
}
.wlp-filter-cell {
  position: relative;
  display: flex;
  flex: 1 1 0;
  min-width: 0;
}
/* 아이콘만 든 칸은 늘어나지 않는다 */
.wlp-filter-cell.fixed { flex: 0 0 auto; }
.wlp-filter-cell.fixed .wlp-hidden-note { display: flex; }
/* 위로 펼쳐지는 필터 */
.wlp-filter-backdrop { position: fixed; inset: 0; z-index: 40; }
.wlp-filter-pop {
  position: absolute; top: calc(100% + 6px); left: 0; z-index: 50;
  min-width: 100%; max-width: 62vw; max-height: 240px; overflow-y: auto;
  list-style: none; margin: 0; padding: 4px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.16);
}
.wlp-filter-opt {
  display: flex; align-items: center; gap: 7px;
  padding: 9px 10px; border-radius: 7px; cursor: pointer;
  font-size: 12.5px; color: #374151; white-space: nowrap;
}
.wlp-opt-ico { flex: 0 0 auto; width: 14px; height: 14px; color: #9ca3af; }
/* 고른 줄은 그림도 같이 물든다 */
.wlp-filter-opt.on .wlp-opt-ico { color: currentColor; }
.wlp-filter-opt.on { color: #2a5fbf; }

/* 바로 아래 자식만 — 안쪽 팝업의 체크박스까지 상자로 그려지면 안 된다 */
.wlp-filter-btn,
.wlp-filter-cell > select,
.wlp-filter-cell > input {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.35;
  font-family: inherit;
  background: #fff;
  color: #111827;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%236b7280' d='M5 6L0 0h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  padding-right: 22px;
}
.wlp-filter-btn {
  display: flex; align-items: center; gap: 5px;
  text-align: left; cursor: pointer; font-weight: 400;
  overflow: hidden;
}
/* 무엇으로 걸러지고 있는지 한눈에 — 고른 칸만 파랗게 띄운다 */
.wlp-filter-btn.on,
.wlp-filter-date input.on {
  border-color: #2a5fbf;
  background-color: #eef3ff;
  color: #2a5fbf;
}
.wlp-filter-btn.on {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%232a5fbf' d='M5 6L0 0h10z'/%3E%3C/svg%3E");
}
.wlp-filter-btn.on .wlp-filter-ico,
.wlp-filter-ico.on { color: #2a5fbf; }
/* 글자만 줄임표로 자른다 — 아이콘은 줄어들지 않게 */
.wlp-filter-txt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wlp-filter-ico { flex: 0 0 auto; width: 13px; height: 13px; color: #9ca3af; }
.wlp-filter-date input {
  background-image: none;
  padding-right: 8px;
  padding-left: 28px;   /* 겹쳐 둔 달력 아이콘 자리 */
}
/* input 안에는 아이콘을 넣을 수 없어 칸 위에 얹는다 */
.wlp-filter-date .wlp-filter-ico {
  position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
  pointer-events: none; z-index: 1;
}
/* 날짜 글자는 input 안쪽 pseudo 요소가 그린다 — 옆 칸과 같은 크기로 못 박는다 */
.wlp-filter-date input.on::-webkit-datetime-edit,
.wlp-filter-date input.on::-webkit-datetime-edit-fields-wrapper,
.wlp-filter-date input.on::-webkit-datetime-edit-text,
.wlp-filter-date input.on::-webkit-datetime-edit-year-field,
.wlp-filter-date input.on::-webkit-datetime-edit-month-field,
.wlp-filter-date input.on::-webkit-datetime-edit-day-field {
  color: #2a5fbf;
}
.wlp-filter-date input::-webkit-datetime-edit,
.wlp-filter-date input::-webkit-datetime-edit-fields-wrapper,
.wlp-filter-date input::-webkit-datetime-edit-text,
.wlp-filter-date input::-webkit-datetime-edit-year-field,
.wlp-filter-date input::-webkit-datetime-edit-month-field,
.wlp-filter-date input::-webkit-datetime-edit-day-field {
  font-size: 12px;
  font-weight: 400;
  font-family: inherit;
  color: #111827;
}
/* 날짜가 비었을 때 브라우저가 그리는 '연도-월-일'을 통째로 감춘다 — 우리 '입찰일'과 겹치지 않게.
   이 글자는 color가 아니라 내부 pseudo 요소로 그려져서 opacity로 지워야 한다 */
.wlp-filter-date input.empty { color: transparent; }
.wlp-filter-date input.empty::-webkit-datetime-edit { opacity: 0; }
.wlp-filter-date input.empty::-webkit-datetime-edit-fields-wrapper { opacity: 0; }
/* 옆 칸(법원·지역·물건종류)의 글자와 같은 크기·색 */
.wlp-filter-placeholder {
  position: absolute;
  left: 28px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.35;
  font-family: inherit;
  color: #111827;
  pointer-events: none;
  padding: 0;
}
/* 왼쪽에 달력 그림을 두었으니 브라우저가 오른쪽에 그리는 것은 치운다.
   (지워도 칸 아무 데나 누르면 달력이 열린다 — openDatePicker가 받는다) */
.wlp-filter-date input::-webkit-calendar-picker-indicator {
  display: none;
  -webkit-appearance: none;
}

/* ===== Bottom nav ===== */
.wlp-bottom-nav {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  background: #fff;
  border-top: 1px solid #eef0f5;
  padding: 6px 0 max(6px, env(safe-area-inset-bottom));
  z-index: 4;
}
.wlp-nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: none;
  background: transparent;
  font-size: 11px;
  color: #6b7280;
  cursor: pointer;
  padding: 4px 0;
}
.wlp-nav-icon {
  font-size: 18px;
  line-height: 1;
}
.wlp-nav-item.active {
  color: #2b6df3;
  font-weight: 800;
}

/* ===== Wider screens ===== */
@media (min-width: 768px) {
  .wlp-shell { max-width: 480px; margin: 0 auto; box-shadow: 0 0 0 1px #e5e7eb; }
}

@media (max-width: 640px) {
  .wlp-collapse { padding: 2px; }
  .wlp-chev { font-size: 13px; }
  .wlp-list-title {
    padding: 4px 12px 6px;
    font-size: 13px;
  }
  .wlp-search-row { padding: 8px 10px; }
}
</style>
