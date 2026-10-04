<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuctionStore } from '../stores/auctionStore';
import { useAuthStore } from '../stores/authStore';
import { loadUserPrefs } from '../services/userPrefsRepository';
import type { AuctionDetail, AuctionStatus } from '../types/auction';
import AppMobileHeader from '../components/AppMobileHeader.vue';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import AppToast from '../components/AppToast.vue';
import starIcon from '../assets/icones/memu/star_Main.png';
import searchIcon from '../assets/icones/searchs (1).png';
import chevronDownIcon from '../assets/icones/chevron-down (1).png';
import filesIcon from '../assets/icones/files (1).png';
import calendarDaysIcon from '../assets/icones/calendar-days (1).png';

const store = useAuctionStore();
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

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

// 정렬 — 입찰일정순(기본, 빠른 날짜부터) / 임장경로순(임장경로에서 계산한 동선 순서)
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

const removeItem = async (id: string, evt: MouseEvent) => {
  evt.stopPropagation();
  if (!confirm('목록에서 지우겠습니까?\n휴지통에서 복원할 수 있습니다. 단, 단계는 손품조사로 돌아갑니다.')) return;
  await store.deleteAuction(id);
};

// 화면에서만 감춘다 — Firestore 문서는 지우지 않는다
const removeAll = async () => {
  const targets = displayedAuctions.value;
  if (targets.length === 0) return;
  const scope = searchQuery.value.trim() ? '검색된 물건' : '선정물건';
  if (!confirm(`${scope} ${targets.length}건을 목록에서 모두 숨기시겠습니까?\n휴지통에서 복원할 수 있지만, 모든 물건의 단계가 손품조사로 돌아갑니다.`)) return;
  await store.hideAuctions(targets.map((item) => item.id));
};

// 숨긴 물건 — 목록을 펼쳐 고른 것만 되살린다
const hiddenOpen = ref(false);
const hiddenPicked = ref<Record<string, boolean>>({});
// 말풍선은 드롭다운 안에 두면 잘려서, 화면 좌표(fixed)로 띄운다
const hiddenBubble = ref<{ id: string; text: string; top: number; left: number } | null>(null);
const openHiddenBubble = (item: AuctionDetail, evt: MouseEvent) => {
  const row = (evt.currentTarget as HTMLElement).closest('.wlp-hidden-item') as HTMLElement | null;
  if (!row) return;
  const r = row.getBoundingClientRect();
  hiddenBubble.value = { id: item.id, text: item.address, top: r.bottom - 3, left: Math.max(8, r.left + 18) };
};
// 마우스가 없는 환경에서는 탭으로 열고 닫는다
const toggleHiddenBubble = (item: AuctionDetail, evt: MouseEvent) => {
  if (hiddenBubble.value?.id === item.id) {
    hiddenBubble.value = null;
    return;
  }
  openHiddenBubble(item, evt);
};
const toggleHiddenMenu = () => {
  hiddenOpen.value = !hiddenOpen.value;
  hiddenBubble.value = null;
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
  if (!confirm(`${ids.length}건을 완전히 삭제할까요?\n삭제하면 되살릴 수 없습니다.`)) return;
  await store.purgeAuctions(ids);
  hiddenPicked.value = {};
  hiddenBubble.value = null;
  if (store.hiddenAuctions.length === 0) hiddenOpen.value = false;
};

const restorePicked = async () => {
  const ids = pickedHiddenIds.value;
  if (ids.length === 0) return;
  await store.restoreHiddenAuctions(ids);
  hiddenPicked.value = {};
  hiddenBubble.value = null;
  hiddenOpen.value = false;
};

// 복사 알림 — 앱 공통 토스트(AppToast)로 띄운다
// 쓰레기통 아이콘 — 번들 PNG가 흰색 단색이라 보이지 않아 데이터 URI SVG를 직접 쓴다
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
type FilterKey = '' | 'court' | 'region' | 'type';
const filterOpen = ref<FilterKey>('');
const PROPERTY_TYPE_OPTIONS = ['아파트', '다세대·연립·도생', '다가구', '상가'];
const toggleFilter = (key: FilterKey) => {
  filterOpen.value = filterOpen.value === key ? '' : key;
};
const pickCourt = (v: string) => { store.setCourt(v); filterOpen.value = ''; };
const pickRegion = (v: string) => { store.setRegion(v); filterOpen.value = ''; };
const pickType = (v: string) => { store.setPropertyType(v); filterOpen.value = ''; };
/* 날짜 칸은 어디를 눌러도 달력이 열리게 한다 */
const openDatePicker = (evt: Event) => {
  const el = evt.currentTarget as HTMLInputElement & { showPicker?: () => void };
  el.showPicker?.();
};

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
  if (!confirm(`탈락 ${targets.length}건을 휴지통으로 옮기겠습니까?\n휴지통에서 복원할 수 있습니다. 단, 단계는 손품조사로 돌아갑니다.`)) return;
  await store.hideAuctions(targets.map((item) => item.id));
  flashToast(`${targets.length}건을 휴지통으로 옮겼습니다.`, 'success');
};

// 손품 물건을 한 번에 임장예정으로 — 스캔 직후 하나씩 누르는 번거로움을 없앤다
const deskItems = computed(() =>
  store.auctions.filter((item) => item.status === '손품' && !item.hidden),
);
const moveDeskToPlan = async () => {
  const targets = deskItems.value;
  if (targets.length === 0) return;
  if (!confirm(`손품조사 ${targets.length}건을 모두 임장예정으로 옮기겠습니까?\n임장경로에 주소가 추가됩니다.`)) return;
  for (const item of targets) await store.setStatus(item.id, '임장예정');
  flashToast(`${targets.length}건을 임장예정으로 옮겼습니다.`, 'success');
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
          placeholder="사건명/주소검색"
          aria-label="사건명/주소검색"
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

      <div v-if="!statsCollapsed" class="wlp-stats-grid">
        <button
          type="button"
          :class="['wlp-stat', 'tone-all', { on: store.activeStatus === '전체' }]"
          @click="showAllPhases"
        >
          <small class="wlp-stat-label">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>전체
          </small>
          <strong class="wlp-stat-num">{{ totalPhaseCount }}<em>건</em></strong>
        </button>
        <button
          v-for="p in PHASE_LABELS"
          :key="p.key"
          type="button"
          :class="['wlp-stat', `tone-${p.key}`, { on: isPhaseFiltered(p.key) }]"
          @click="filterByPhase(p.key)"
        >
          <small class="wlp-stat-label">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path v-for="(d, i) in p.paths" :key="i" :d="d" />
            </svg>{{ p.label }}
          </small>
          <strong class="wlp-stat-num">{{ phaseCounts[p.key] }}<em>건</em></strong>
        </button>
        <button
          type="button"
          :class="['wlp-stat', 'tone-running', { on: bidRunningOnly }]"
          @click="filterByBidRunning"
        >
          <small class="wlp-stat-label">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3v3M12 18v3M4.2 7.5l2.6 1.5M17.2 15l2.6 1.5M4.2 16.5l2.6-1.5M17.2 9l2.6-1.5" />
              <circle cx="12" cy="12" r="3.4" />
            </svg>입찰진행
          </small>
          <strong class="wlp-stat-num">{{ bidRunningCount }}<em>건</em></strong>
        </button>
      </div>

      <div v-if="!statsCollapsed" class="wlp-filter-bar">
        <div class="wlp-filter-cell">
          <button type="button" class="wlp-filter-btn" @click="toggleFilter('court')">
            {{ store.selectedCourt === '전체' ? '법원' : shortCourt(store.selectedCourt) }}
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
          <button type="button" class="wlp-filter-btn" @click="toggleFilter('region')">
            {{ store.selectedRegion === '전체' ? '지역' : store.selectedRegion }}
          </button>
          <template v-if="filterOpen === 'region'">
            <div class="wlp-filter-backdrop" @click="filterOpen = ''" />
            <ul class="wlp-filter-pop">
              <li
                v-for="opt in store.regionOptions"
                :key="opt"
                :class="['wlp-filter-opt', { on: store.selectedRegion === opt }]"
                @click="pickRegion(opt)"
              >{{ opt === '전체' ? '지역 전체' : opt }}</li>
            </ul>
          </template>
        </div>
        <div class="wlp-filter-cell wlp-filter-date">
          <input
            :value="store.selectedBidDate"
            :class="{ empty: !store.selectedBidDate }"
            type="date"
            aria-label="입찰일"
            @click="openDatePicker"
            @input="store.setBidDate(($event.target as HTMLInputElement).value)"
          />
          <span v-if="!store.selectedBidDate" class="wlp-filter-placeholder">날짜</span>
        </div>
        <div class="wlp-filter-cell">
          <button type="button" class="wlp-filter-btn" @click="toggleFilter('type')">
            {{ store.selectedPropertyType || '종류' }}
          </button>
          <template v-if="filterOpen === 'type'">
            <div class="wlp-filter-backdrop" @click="filterOpen = ''" />
            <ul class="wlp-filter-pop">
              <li
                :class="['wlp-filter-opt', { on: !store.selectedPropertyType }]"
                @click="pickType('')"
              >물건종류 전체</li>
              <li
                v-for="opt in PROPERTY_TYPE_OPTIONS"
                :key="opt"
                :class="['wlp-filter-opt', { on: store.selectedPropertyType === opt }]"
                @click="pickType(opt)"
              >{{ opt }}</li>
            </ul>
          </template>
        </div>
      </div>

      <p v-if="store.activeStatus === '손품' && deskItems.length > 0" class="wlp-legacy-note plan">
        손품조사 {{ deskItems.length }}건
        <button type="button" @click="moveDeskToPlan">모두 임장예정으로</button>
      </p>
      <p v-if="legacyFailed.length > 0" class="wlp-legacy-note">
        단계에서 <strong>탈락</strong>을 없앴습니다 — 남아 있는 {{ legacyFailed.length }}건
        <button type="button" @click="moveLegacyFailedToTrash">휴지통으로 옮기기</button>
      </p>
      <div class="wlp-list-title">
        <span class="wlp-list-title-left">
          <strong class="wlp-list-title-text">
            <span class="wlp-list-title-ico" :style="{ '--i': `url(${starIcon})` }" />선정물건리스트
          </strong>
        </span>
        <span class="wlp-list-actions">
          <span class="wlp-hidden-note">
            <button type="button" class="wlp-restore-btn" :title="`숨긴 물건 ${store.hiddenCount}건`" @click.stop="toggleHiddenMenu">
              <img :src="TRASH_ICON" alt="" class="wlp-restore-ico" /><em class="wlp-restore-x">×</em>{{ store.hiddenCount }}<span class="caret">▾</span>
            </button>
            <template v-if="hiddenOpen">
              <div class="wlp-hidden-backdrop" @click="hiddenOpen = false" />
              <div class="wlp-hidden-panel" @click.stop>
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
                    <span
                      class="addr"
                      @click.stop="toggleHiddenBubble(item, $event)"
                      @mouseenter="openHiddenBubble(item, $event)"
                      @mouseleave="hiddenBubble = null"
                    >{{ item.caseNumber }}</span>
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
          <button
            v-if="displayedAuctions.length > 0"
            type="button"
            class="wlp-clear-all"
            @click="removeAll"
          >전체삭제</button>
          <button
            type="button"
            :class="['wlp-sort-btn', { on: sortMode === 'route' }]"
            :title="sortMode === 'route' ? '임장경로 (누르면 입찰일순)' : '입찰일순 (누르면 임장경로)'"
            @click="toggleSortMode"
          >{{ sortMode === 'route' ? '임장경로' : '입찰일순' }}</button>
          <button type="button" class="wlp-add-btn" @click="router.push('/auctions/import')">+ 물건등록</button>
        </span>
      </div>
    </div>

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
            <span>{{ shortCourt(item.courtName) }}</span>
            <span class="wlp-meta-sep">·</span>
            <span>{{ item.caseNumber }}</span>
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
          <span v-if="propTypeMark(item.propertyType)" class="wlp-type-mark">{{ propTypeMark(item.propertyType) }}</span><span :class="{ done: item.status === '임장완료' }">{{ item.address }}</span>
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

    <Teleport to="body">
      <div
        v-if="hiddenBubble"
        class="wlp-addr-bubble"
        :style="{ top: `${hiddenBubble.top}px`, left: `${hiddenBubble.left}px` }"
        @click="hiddenBubble = null"
      >{{ hiddenBubble.text }}</div>
    </Teleport>

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
  background: #e1e3e7;
  overflow: hidden;
  z-index: 100;
}

.wlp-fixed-top {
  flex: 0 0 auto;
  background: #e1e3e7;
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
  margin: 0 0 6px;
  border: none;
  border-bottom: 1px solid #cbd5e1;
  border-radius: 0;
  padding: 10px 14px;
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
.wlp-stats-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 3px;
  padding: 4px 8px 8px;
}
.wlp-stat {
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 4px 1px 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  cursor: pointer;
  text-align: center;
  transition: border-color 0.15s, box-shadow 0.15s;
}
/* 이 상태로 걸러 보는 중 */
/* 입찰진행 — 단계 알약과 같은 붉은 계열 */
.wlp-stat.tone-running .wlp-stat-label { color: #c22e2e; }
.wlp-stat.tone-running.on { border-color: #ef6b6b; background: #ffdede; }
@media (max-width: 374px) {
  .wlp-stats-grid { gap: 2px; padding-left: 6px; padding-right: 6px; }
  .wlp-stat-label { font-size: 8.6px; letter-spacing: -0.6px; }
  .wlp-stat-label svg { width: 9px; height: 9px; }
  .wlp-stat-num { font-size: 13px; }
}
.wlp-stat.on {
  border-color: #2a5fbf;
  box-shadow: 0 0 0 1.5px rgba(42, 95, 191, 0.25);
}
.wlp-stat-label {
  display: flex; align-items: center; justify-content: center; gap: 1px;
  font-size: 9.2px;
  letter-spacing: -0.4px;
  color: #6b7280;
  font-weight: 400;
  white-space: nowrap;
}
.wlp-stat-label svg { width: 10px; height: 10px; flex-shrink: 0; }
/* 아이콘은 글자와 같은 회색으로 — 색을 빼 담백하게 */
.wlp-stat-label svg { flex-shrink: 0; }
.wlp-stat-num {
  text-align: center;
  font-size: 14px;
  font-weight: 800;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.wlp-stat-num em {
  font-size: 10px;
  font-style: normal;
  font-weight: 800;
  color: #111827;
  margin-left: 1px;
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
  padding: 4px 12px 8px;
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
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  align-items: stretch;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
  margin-left: 8px;
}
.wlp-list-actions > * { min-width: 0; }
.wlp-list-actions .wlp-restore-btn,
.wlp-list-actions .wlp-sort-btn,
.wlp-list-actions .wlp-clear-all,
.wlp-list-actions .wlp-add-btn {
  box-sizing: border-box;
  width: 100%;
  height: 29px;
  padding: 0 2px;
  font-size: 11.6px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
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
/* 정렬 전환 — 등록순 / 임장경로순 */
/* 기본(입찰일정순)은 초록, 임장경로순으로 바꾸면 파랑 */
.wlp-sort-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 3px;
  box-sizing: border-box; height: 26px;
  border: 1px solid #daefe3; background: #eefaf2; border-radius: 8px;
  padding: 0 8px; font-size: 12px; font-weight: 400; line-height: 1; color: #15803d;
  cursor: pointer; white-space: nowrap;
}
.wlp-sort-btn.on { border-color: #d2e2fb; background: #eaf1ff; color: #2b6df3; }
.wlp-clear-all {
  display: inline-flex; align-items: center; justify-content: center;
  box-sizing: border-box; height: 26px;
  border: 1px solid #f0d2d2; background: #fff; border-radius: 8px;
  padding: 0 10px; font-size: 12px; font-weight: 400; line-height: 1; color: #d14343;
  cursor: pointer;
}
.wlp-clear-all:active { background: #fdf2f2; }
/* 숨긴 물건 드롭다운 */
.wlp-hidden-note { position: relative; display: flex; min-width: 0; }
.wlp-restore-btn .caret { margin-left: 3px; font-size: 9px; }
/* 휴지통 × 7 — 숨긴 물건 수 */
.wlp-restore-ico { width: 14px; height: 14px; object-fit: contain; display: block; flex: 0 0 auto; }
.wlp-restore-x { font-style: normal; font-size: 9.5px; color: #9ca3af; margin: 0 1px 0 2px; }
.wlp-hidden-backdrop { position: fixed; inset: 0; z-index: 40; }
.wlp-hidden-panel {
  position: absolute; top: 100%; left: 0; z-index: 50;
  margin-top: 4px; width: 230px; max-width: 72vw;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
  overflow: hidden;
}
.wlp-hidden-head {
  display: flex; gap: 6px; margin: 0; padding: 6px;
  border-bottom: 1px solid #eef1f6; background: #fafafa;
}
.wlp-hidden-head button {
  flex: 1 1 0; min-width: 0; white-space: nowrap; border: 1px solid #d5dbe6; background: #fff;
  border-radius: 6px; padding: 5px 6px;
  font-size: 11px; font-weight: 700; color: #374151; cursor: pointer;
}
.wlp-hidden-head button.apply { background: #2b6df3; border-color: #2b6df3; color: #fff; }
.wlp-hidden-head button.purge { background: #fff; border-color: #f0d2d2; color: #d14343; }
.wlp-hidden-head button.apply:disabled { opacity: 0.45; }
.wlp-hidden-list { list-style: none; margin: 0; padding: 0; max-height: 240px; overflow-y: auto; overflow-x: visible; }
.wlp-hidden-item {
  position: relative;
  display: flex; align-items: center; gap: 6px;
  padding: 7px 8px; border-bottom: 1px solid #f1f3f7; cursor: pointer;
}
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
.wlp-hidden-panel { width: 200px; }

/* 제목 옆에 붙는 '숨긴 물건 N건 · 복원' */
.wlp-hidden-note {
  display: inline-flex; align-items: center;
  margin-left: 0; white-space: nowrap;
}
/* 정렬 버튼(임장경로순)과 같은 크기·글자 */
.wlp-restore-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 3px;
  box-sizing: border-box; height: 26px;
  border: 1px solid #d5dbe6; background: #f5f7fb; border-radius: 8px;
  padding: 0 8px; font-size: 12px; font-weight: 400; line-height: 1; color: #4b5563;
  cursor: pointer; white-space: nowrap;
}
.wlp-list-title-btn {
  border: none; background: transparent; padding: 2px;
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
}

/* ===== Scrollable list ===== */
.wlp-list-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 0 12px 220px;
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
  padding: 8px 10px 7px;
  margin-bottom: 5px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
  border: 1px solid #eef0f5;
  cursor: pointer;
  position: relative;
}
.wlp-card-compact {
  padding: 6px 10px;
}
.wlp-card-compact .wlp-card-top { margin-bottom: 2px; }
.wlp-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 3px;
}
.wlp-card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #4b5563;
  flex-wrap: wrap;
  flex: 1 1 auto;
  min-width: 0;
}
.wlp-meta-date { color: #111827; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; }
.wlp-meta-date-icon { width: 14px; height: 14px; object-fit: contain; flex-shrink: 0; }
.wlp-meta-sep { color: #cbd5e1; }
.wlp-card-actions {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  flex-shrink: 0;
  margin-left: auto;
}
.wlp-card-icon {
  width: 30px;
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
.wlp-card-icon img { width: 18px; height: 18px; object-fit: contain; display: block; }
.wlp-card-icon:active { background: #f1f5f9; }
.wlp-card-close { color: #6b7280; }
/* 중요도 별 — 채워지면 노란 별 안에 숫자를 얹는다 */
/* 중요도 — 작은 별 3개를 순서대로 채운다 */
.wlp-card-star {
  width: auto; height: 34px;
  display: inline-flex; align-items: center; gap: 1px;
}

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
  margin: 2px 0 5px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wlp-price-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
  margin-bottom: 5px;
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
  font-size: 9px;
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
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  background: transparent;
  padding: 2px 12px 6px;
  gap: 6px;
}
.wlp-filter-cell {
  position: relative;
  display: flex;
}
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
  padding: 9px 10px; border-radius: 7px; cursor: pointer;
  font-size: 12.5px; color: #374151; white-space: nowrap;
}
.wlp-filter-opt.on { color: #2a5fbf; }

.wlp-filter-btn,
.wlp-filter-cell select,
.wlp-filter-cell input {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.35;
  font-family: inherit;
  background: #fff;
  color: #6b7280;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%236b7280' d='M5 6L0 0h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  padding-right: 22px;
}
.wlp-filter-btn {
  text-align: left; cursor: pointer; font-weight: 400;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.wlp-filter-date input {
  background-image: none;
  padding-right: 8px;
}
/* 날짜 글자는 input 안쪽 pseudo 요소가 그린다 — 옆 칸과 같은 크기로 못 박는다 */
.wlp-filter-date input::-webkit-datetime-edit,
.wlp-filter-date input::-webkit-datetime-edit-fields-wrapper,
.wlp-filter-date input::-webkit-datetime-edit-text,
.wlp-filter-date input::-webkit-datetime-edit-year-field,
.wlp-filter-date input::-webkit-datetime-edit-month-field,
.wlp-filter-date input::-webkit-datetime-edit-day-field {
  font-size: 12px;
  font-weight: 400;
  font-family: inherit;
  color: #6b7280;
}
/* 날짜가 비었을 때 브라우저가 그리는 '연도-월-일'을 통째로 감춘다 — 우리 '입찰일'과 겹치지 않게.
   이 글자는 color가 아니라 내부 pseudo 요소로 그려져서 opacity로 지워야 한다 */
.wlp-filter-date input.empty { color: transparent; }
.wlp-filter-date input.empty::-webkit-datetime-edit { opacity: 0; }
.wlp-filter-date input.empty::-webkit-datetime-edit-fields-wrapper { opacity: 0; }
/* 옆 칸(법원·지역·물건종류)의 글자와 같은 크기·색 */
.wlp-filter-placeholder {
  position: absolute;
  left: 10px;
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
.wlp-filter-date input::-webkit-calendar-picker-indicator {
  opacity: 0.6;
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
