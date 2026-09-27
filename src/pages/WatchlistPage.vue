<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuctionStore } from '../stores/auctionStore';
import { useAuthStore } from '../stores/authStore';
import { loadUserPrefs } from '../services/userPrefsRepository';
import type { AuctionDetail, AuctionStatus } from '../types/auction';
import AppMobileHeader from '../components/AppMobileHeader.vue';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import searchIcon from '../assets/icones/searchs (1).png';
import chevronDownIcon from '../assets/icones/chevron-down (1).png';
import buildingStatIcon from '../assets/icones/hotel (1).png';
import chartStatIcon from '../assets/icones/chart-no-axes-combined (1).png';
import trophyStatIcon from '../assets/icones/trophy (1).png';
import walletStatIcon from '../assets/icones/wallet-card (1).png';
import starTitleIcon from '../assets/icones/memu/star_Main.png';
import filesIcon from '../assets/icones/files (1).png';
import squareXIcon from '../assets/icones/square-x (1).png';
import calendarDaysIcon from '../assets/icones/calendar-days (1).png';

const store = useAuctionStore();
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

const listCollapsed = ref(false);
const statsCollapsed = ref(false);
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

// 정렬 — 등록순(기본) / 임장경로순(임장경로에서 계산한 동선 순서)
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

const displayedAuctions = computed<AuctionDetail[]>(() => {
  const base = store.filteredAuctions.filter((item) => !item.id.startsWith('onbid-'));
  const q = searchQuery.value.replace(/\s+/g, '').toLowerCase();
  const found = !q
    ? base
    : base.filter((item) => {
      const haystack = `${item.caseNumber ?? ''}${item.address ?? ''}${item.courtName ?? ''}`
        .replace(/\s+/g, '')
        .toLowerCase();
      return haystack.includes(q);
    });
  if (sortMode.value !== 'route' || routeOrder.value.length === 0) return found;
  // 동선에 없는 물건은 뒤로 보내고, 그 안에서는 원래 순서를 지킨다
  const rank = new Map(routeOrder.value.map((address, i) => [address, i]));
  return [...found].sort(
    (a, b) => (rank.get(normAddr(a.address)) ?? Infinity) - (rank.get(normAddr(b.address)) ?? Infinity),
  );
});

const wonItemsCount = computed(
  () => store.auctions.filter((item) => item.status === '낙찰').length,
);

const bidItemsCount = computed(
  () => store.auctions.filter((item) => item.status === '입찰').length,
);

// 별표 중요도 — 누를 때마다 1 → 2 → 3 → 빈 별 로 돌아간다
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
  if (!confirm('이 물건을 목록에서 숨기시겠습니까?\n(기록은 남아 있어 언제든 복원할 수 있습니다)')) return;
  await store.deleteAuction(id);
};

// 화면에서만 감춘다 — Firestore 문서는 지우지 않는다
const removeAll = async () => {
  const targets = displayedAuctions.value;
  if (targets.length === 0) return;
  const scope = searchQuery.value.trim() ? '검색된 물건' : '선정물건';
  if (!confirm(`${scope} ${targets.length}건을 목록에서 모두 숨기시겠습니까?\n(기록은 남아 있어 언제든 복원할 수 있습니다)`)) return;
  await store.hideAuctions(targets.map((item) => item.id));
};

const restoreHidden = async () => {
  if (!confirm(`숨긴 물건 ${store.hiddenCount}건을 다시 목록에 표시할까요?`)) return;
  await store.restoreHiddenAuctions();
};

const copyItem = async (item: AuctionDetail, evt: MouseEvent) => {
  evt.stopPropagation();
  try {
    await navigator.clipboard.writeText(item.address);
  } catch {
    /* ignore */
  }
};

type PhaseKey = 'interest' | 'visit' | 'bid' | 'won' | 'fail';

const PHASE_TO_STATUS: Record<PhaseKey, AuctionStatus> = {
  interest: '임장예정',
  visit: '임장완료',
  bid: '입찰',
  won: '낙찰',
  fail: '보류',
};

const phaseClass = (status: AuctionStatus, target: PhaseKey) =>
  status === PHASE_TO_STATUS[target] ? 'phase-active' : '';

const setPhase = async (item: AuctionDetail, target: PhaseKey, evt: MouseEvent) => {
  evt.stopPropagation();
  await store.setStatus(item.id, PHASE_TO_STATUS[target]);
};

watch(
  () => route.name,
  (name) => {
    if (name === 'auction-watchlist') {
      store.resetListFilters();
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
          aria-label="통계 카드 접기"
          @click="statsCollapsed = !statsCollapsed"
        >
          <img :src="chevronDownIcon" alt="" :class="['wlp-search-chev', { up: statsCollapsed }]" />
        </button>
      </div>

      <div v-if="!statsCollapsed" class="wlp-stats-grid">
        <article class="wlp-stat">
          <small class="wlp-stat-label">총 물건</small>
          <div class="wlp-stat-row">
            <img :src="buildingStatIcon" alt="" class="wlp-stat-icon-img" />
            <strong class="wlp-stat-num">{{ store.summary.totalItems }}<em>건</em></strong>
          </div>
        </article>
        <article class="wlp-stat">
          <small class="wlp-stat-label">입찰물건</small>
          <div class="wlp-stat-row">
            <img :src="chartStatIcon" alt="" class="wlp-stat-icon-img" />
            <strong class="wlp-stat-num">{{ bidItemsCount }}<em>건</em></strong>
          </div>
        </article>
        <article class="wlp-stat">
          <small class="wlp-stat-label">낙찰물건</small>
          <div class="wlp-stat-row">
            <img :src="trophyStatIcon" alt="" class="wlp-stat-icon-img" />
            <strong class="wlp-stat-num">{{ wonItemsCount }}<em>건</em></strong>
          </div>
        </article>
        <article class="wlp-stat">
          <small class="wlp-stat-label">총입찰금</small>
          <div class="wlp-stat-row">
            <img :src="walletStatIcon" alt="" class="wlp-stat-icon-img" />
            <strong class="wlp-stat-num amount" :title="formatWon(store.summary.totalBidAmount) + '원'">{{ formatWon(store.summary.totalBidAmount) }}</strong>
          </div>
        </article>
      </div>

      <div class="wlp-list-title">
        <span class="wlp-list-title-left">
          <img :src="starTitleIcon" alt="" class="wlp-list-title-star" />
          선정물건리스트
          <span v-if="store.hiddenCount > 0" class="wlp-hidden-note">
            숨긴 물건 {{ store.hiddenCount }}건
            <button type="button" class="wlp-restore-btn" @click="restoreHidden">복원</button>
          </span>
        </span>
        <span class="wlp-list-title-right">
          <button
            type="button"
            :class="['wlp-sort-btn', { on: sortMode === 'route' }]"
            :title="sortMode === 'route' ? '임장경로순 (누르면 등록순)' : '등록순 (누르면 임장경로순)'"
            @click="toggleSortMode"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 4v16" /><path d="M4 7l3-3 3 3" /><path d="M17 20V4" /><path d="M14 17l3 3 3-3" />
            </svg>
            {{ sortMode === 'route' ? '임장경로순' : '등록순' }}
          </button>
          <button
            v-if="displayedAuctions.length > 0"
            type="button"
            class="wlp-clear-all"
            @click="removeAll"
          >전체 삭제</button>
          <button type="button" class="wlp-collapse" :aria-expanded="!listCollapsed" @click="listCollapsed = !listCollapsed">
            <svg v-if="!listCollapsed" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          </button>
        </span>
      </div>
    </div>

    <div class="wlp-list-scroll">
      <p v-if="store.storageWarning" class="wlp-warning">{{ store.storageWarning }}</p>
      <article
        v-for="item in displayedAuctions"
        :key="item.id"
        :class="['wlp-card', { 'wlp-card-compact': listCollapsed }]"
        @click="goDetail(item.id)"
      >
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
              :class="['wlp-card-icon', 'wlp-card-star', { on: (item.priority ?? 0) > 0 }]"
              :aria-label="`중요도 ${item.priority ?? 0}`"
              title="중요도 (1→2→3)"
              @click="cyclePriority(item, $event)"
            >
              <svg viewBox="0 0 24 24" width="26" height="26" :fill="(item.priority ?? 0) > 0 ? '#facc15' : 'none'" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
                <polygon points="12 2.6 15 9 22 9.8 17 14.5 18.3 21.4 12 18 5.7 21.4 7 14.5 2 9.8 9 9" />
              </svg>
              <span v-if="(item.priority ?? 0) > 0" class="wlp-card-star-num">{{ item.priority }}</span>
            </button>
            <button type="button" class="wlp-card-icon" aria-label="주소복사" title="주소복사" @click="copyItem(item, $event)">
              <img :src="filesIcon" alt="" />
            </button>
            <button type="button" class="wlp-card-icon wlp-card-close" aria-label="삭제" title="삭제" @click="removeItem(item.id, $event)">
              <img :src="squareXIcon" alt="" />
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
          <button type="button" :class="['wlp-phase', phaseClass(item.status, 'interest')]" @click="setPhase(item, 'interest', $event)">관심</button>
          <span class="wlp-phase-arrow">▶</span>
          <button type="button" :class="['wlp-phase', phaseClass(item.status, 'visit')]" @click="setPhase(item, 'visit', $event)">임장</button>
          <span class="wlp-phase-arrow">▶</span>
          <button type="button" :class="['wlp-phase', phaseClass(item.status, 'bid')]" @click="setPhase(item, 'bid', $event)">입찰</button>
          <span class="wlp-phase-arrow">▶</span>
          <button type="button" :class="['wlp-phase wlp-phase-won', phaseClass(item.status, 'won')]" @click="setPhase(item, 'won', $event)">낙찰</button>
          <span class="wlp-phase-arrow swap">⇄</span>
          <button type="button" :class="['wlp-phase wlp-phase-fail', phaseClass(item.status, 'fail')]" @click="setPhase(item, 'fail', $event)">탈락</button>
        </div>
      </article>

      <p v-if="displayedAuctions.length === 0 && !store.loading" class="wlp-empty">
        표시할 물건이 없습니다.
      </p>
    </div>

    <button type="button" class="wlp-fab" @click="router.push('/auctions/import')">
     + 선정물건등록
    </button>

    <div class="wlp-filter-bar">
      <div class="wlp-filter-cell">
        <select
          :value="store.selectedCourt"
          @change="store.setCourt(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="opt in store.courtOptions" :key="opt" :value="opt">
            {{ opt === '전체' ? '법원' : opt }}
          </option>
        </select>
      </div>
      <div class="wlp-filter-cell">
        <select
          :value="store.selectedRegion"
          @change="store.setRegion(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="opt in store.regionOptions" :key="opt" :value="opt">
            {{ opt === '전체' ? '지역' : opt }}
          </option>
        </select>
      </div>
      <div class="wlp-filter-cell wlp-filter-date">
        <input
          :value="store.selectedBidDate"
          type="date"
          aria-label="입찰일"
          @input="store.setBidDate(($event.target as HTMLInputElement).value)"
        />
        <span v-if="!store.selectedBidDate" class="wlp-filter-placeholder">입찰일</span>
      </div>
      <div class="wlp-filter-cell">
        <select
          :value="store.activeStatus"
          @change="store.setFilter(($event.target as HTMLSelectElement).value as AuctionStatus | '전체')"
        >
          <option value="전체">상태</option>
          <option value="임장예정">관심</option>
          <option value="임장완료">임장</option>
          <option value="입찰">입찰</option>
          <option value="낙찰">낙찰</option>
          <option value="보류">탈락</option>
        </select>
      </div>
    </div>

    <AppMobileBottomNav active="watchlist" />
  </section>
</template>

<style scoped>
.wlp-shell {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #f4f6fb;
  overflow: hidden;
  z-index: 100;
}

.wlp-fixed-top {
  flex: 0 0 auto;
  background: #f4f6fb;
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
.wlp-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  padding: 4px 8px 8px;
}
.wlp-stat {
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 8px 6px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.wlp-stat-label {
  font-size: 11px;
  color: #6b7280;
  font-weight: 600;
  text-align: center;
}
.wlp-stat-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
}
.wlp-stat-icon-img {
  width: 22px;
  height: 22px;
  object-fit: contain;
  flex-shrink: 0;
}
.wlp-stat-num {
  font-size: 22px;
  font-weight: 800;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.wlp-stat-num em {
  font-size: 15px;
  font-style: normal;
  font-weight: 700;
  color: #111827;
  margin-left: 1px;
}
.wlp-stat-num.amount {
  font-size: 22px;
  letter-spacing: -0.3px;
}

/* ===== List title ===== */
.wlp-list-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 14px 8px;
  font-size: 14px;
  font-weight: 800;
  color: #111827;
}
.wlp-list-title-left {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.wlp-list-title-star { width: 18px; height: 18px; object-fit: contain; }
.wlp-list-title-drive { width: 20px; height: 20px; object-fit: contain; display: block; }
.wlp-list-title-right { display: inline-flex; align-items: center; gap: 4px; }
/* 정렬 전환 — 등록순 / 임장경로순 */
.wlp-sort-btn {
  display: inline-flex; align-items: center; gap: 3px;
  border: 1px solid #d5dbe6; background: #fff; border-radius: 8px;
  padding: 4px 8px; font-size: 12px; font-weight: 700; color: #4b5563;
  cursor: pointer; white-space: nowrap;
}
.wlp-sort-btn.on { border-color: #2b6df3; background: #eaf1ff; color: #2b6df3; }
.wlp-clear-all {
  border: 1px solid #f0d2d2; background: #fff; border-radius: 8px;
  padding: 4px 10px; font-size: 12px; font-weight: 700; color: #d14343;
  cursor: pointer;
}
.wlp-clear-all:active { background: #fdf2f2; }
/* 제목 옆에 붙는 '숨긴 물건 N건 · 복원' */
.wlp-hidden-note {
  display: inline-flex; align-items: center; gap: 5px;
  margin-left: 6px; padding: 2px 4px 2px 8px;
  background: #f3f4f6; border-radius: 999px;
  font-size: 11px; font-weight: 600; color: #6b7280; white-space: nowrap;
}
.wlp-restore-btn {
  border: 1px solid #d1d5db; background: #fff; border-radius: 999px;
  padding: 2px 8px; font-size: 11px; font-weight: 700; color: #374151; cursor: pointer;
}
.wlp-list-title-btn {
  border: none; background: transparent; padding: 2px;
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
}

/* ===== Scrollable list ===== */
.wlp-list-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 0 10px 220px;
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
.wlp-card-star { position: relative; width: 34px; height: 34px; color: #9ca3af; }
.wlp-card-star.on { color: #eab308; }
.wlp-card-star-num {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -28%);
  font-size: 12px; font-weight: 800; color: #7c4a03; pointer-events: none;
}

.wlp-type-mark {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 50%;
  background: #2b6df3; color: #fff;
  font-size: 11px; font-weight: 800; line-height: 1;
  margin-right: 5px; vertical-align: middle;
}
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
  font-weight: 600;
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
  font-weight: 700;
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
  padding: 2px 14px;
  font-size: 11px;
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
.wlp-phase-arrow {
  font-size: 10px;
  color: #cbd5e1;
  flex-shrink: 0;
}
.wlp-phase-arrow.swap { color: #94a3b8; }

/* ===== Floating + 물건등록 ===== */
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
.wlp-fab-plus {
  font-size: 16px;
  line-height: 1;
  font-weight: 900;
}

/* ===== Filter bar (fixed bottom) ===== */
.wlp-filter-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 56px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  background: #fff;
  border-top: 1px solid #eef0f5;
  padding: 8px 8px;
  gap: 6px;
  z-index: 4;
}
.wlp-filter-cell {
  position: relative;
  display: flex;
}
.wlp-filter-cell select,
.wlp-filter-cell input {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 12px;
  background: #fff;
  color: #111827;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%236b7280' d='M5 6L0 0h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  padding-right: 22px;
}
.wlp-filter-date input {
  background-image: none;
  padding-right: 8px;
}
.wlp-filter-placeholder {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 12px;
  color: #6b7280;
  pointer-events: none;
  background: #fff;
  padding: 0 2px;
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
  .wlp-stat-num { font-size: 17px; }
  .wlp-stat-num em { font-size: 13px; }
  .wlp-stat-num.amount { font-size: 17px; }
  .wlp-search-row { padding: 8px 10px; }
}
</style>
