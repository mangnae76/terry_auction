<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useScheduleStore } from '../stores/scheduleStore';
import { useAuctionStore } from '../stores/auctionStore';
import type { CourtDeptGroup, ScheduleEntry } from '../types/courtAuction';
import { formatNumber } from '../utils/numberFormat';

const store = useScheduleStore();
const auctionStore = useAuctionStore();
const router = useRouter();

const drawerOpen = ref(false);
const drawerDate = ref('');
const drawerGroup = ref<CourtDeptGroup | null>(null);

const weekLabel = computed(() => {
  const start = store.weekStart;
  const week = store.currentWeek;
  const end = week?.weekEnd ?? '';
  if (!start) return '';
  const [sy, sm, sd] = start.split('-');
  if (!end) return `${sy}년 ${Number(sm)}월 ${Number(sd)}일`;
  const [, em, ed] = end.split('-');
  return `${sy}년 ${Number(sm)}월 ${Number(sd)}일 ~ ${Number(em)}월 ${Number(ed)}일`;
});

const myCaseSet = computed(() => {
  const set = new Set<string>();
  auctionStore.auctions.forEach((a) => {
    if (a.caseNumber) set.add(a.caseNumber.trim());
  });
  return set;
});

const isMyCase = (entry: ScheduleEntry): boolean => myCaseSet.value.has(entry.caseNo);

const groupHasMine = (group: CourtDeptGroup): boolean => group.entries.some(isMyCase);

const shortCourtName = (name: string): string => {
  if (!name) return '';
  return name.replace('지방법원', '').replace('본원', '본원').replace(/\s+/g, '');
};

const openDrawer = (date: string, group: CourtDeptGroup) => {
  drawerDate.value = date;
  drawerGroup.value = group;
  drawerOpen.value = true;
};

const closeDrawer = () => {
  drawerOpen.value = false;
  drawerGroup.value = null;
};

const openCase = (entry: ScheduleEntry) => {
  const match = auctionStore.auctions.find((a) => a.caseNumber === entry.caseNo);
  if (match) {
    router.push({ name: 'auction-view', params: { id: match.id } });
    return;
  }
  const url = `https://www.courtauction.go.kr/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ159F00.xml&userCsNo=${encodeURIComponent(entry.caseNo)}`;
  window.open(url, '_blank', 'noopener');
};

const refresh = async () => {
  await store.loadWeek({ force: true });
};

const onCourtChange = async (event: Event) => {
  const code = (event.target as HTMLSelectElement).value;
  await store.setCourt(code);
};

onMounted(async () => {
  await store.loadOffices();
  await store.loadWeek();
});
</script>

<template>
  <section class="schedule-page">
    <header class="schedule-header">
      <div class="week-nav">
        <button type="button" class="ghost" @click="store.prevWeek()">◀ 이전주</button>
        <div class="week-label">{{ weekLabel }}</div>
        <button type="button" class="ghost" @click="store.nextWeek()">다음주 ▶</button>
        <button type="button" class="ghost" @click="store.goThisWeek()">이번주</button>
      </div>
      <div class="schedule-filters">
        <label class="court-select">
          <span>법원</span>
          <select :value="store.selectedCourtCode" @change="onCourtChange">
            <option v-for="o in store.offices" :key="o.code || 'all'" :value="o.code">
              {{ o.name }}
            </option>
          </select>
        </label>
        <button type="button" class="ghost refresh" :disabled="store.loading" @click="refresh">
          {{ store.loading ? '불러오는 중…' : '🔄 새로고침' }}
        </button>
      </div>
    </header>

    <div v-if="store.error" class="error-banner">
      {{ store.error }}
      <button type="button" class="ghost" @click="refresh">다시 시도</button>
    </div>

    <div v-if="store.loading && !store.currentWeek" class="loading-banner">
      주간 기일 정보를 불러오는 중입니다…
    </div>

    <div v-if="store.currentWeek" class="week-grid">
      <div v-for="day in store.currentWeek.days" :key="day.date" class="day-column">
        <div class="day-head">
          <div class="day-main">
            <span class="day-date">{{ Number(day.date.slice(8, 10)) }}</span>
            <span class="day-weekday">({{ day.weekday }})</span>
          </div>
          <span class="day-count">{{ day.totalCount }}건</span>
        </div>
        <div v-if="day.byCourt.length === 0" class="day-empty">기일 없음</div>
        <ul v-else class="court-list">
          <li
            v-for="group in day.byCourt"
            :key="`${day.date}-${group.courtCode}-${group.deptName}-${group.bidTime}`"
            class="court-row"
            :class="{ 'has-mine': groupHasMine(group) }"
            @click="openDrawer(day.date, group)"
          >
            <span class="court-name">{{ shortCourtName(group.courtName) }}</span>
            <span class="court-dept">{{ group.deptName }}</span>
            <span class="court-time" v-if="group.bidTime">({{ group.bidTime }})</span>
            <span class="court-count">({{ group.count }})</span>
            <span v-if="groupHasMine(group)" class="mine-star" title="내 관심 물건 포함">★</span>
          </li>
        </ul>
      </div>
    </div>

    <div v-if="drawerOpen" class="drawer-backdrop" @click.self="closeDrawer">
      <aside class="drawer">
        <header class="drawer-head">
          <div>
            <strong>{{ drawerGroup?.courtName }} {{ drawerGroup?.deptName }}</strong>
            <small>{{ drawerDate }} {{ drawerGroup?.bidTime }} · {{ drawerGroup?.count }}건</small>
          </div>
          <button type="button" class="ghost" @click="closeDrawer">✕</button>
        </header>
        <div class="drawer-body">
          <table class="entry-table">
            <thead>
              <tr>
                <th>사건번호</th>
                <th>물건</th>
                <th>용도</th>
                <th>주소</th>
                <th>최저가</th>
                <th>회차</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="entry in drawerGroup?.entries ?? []"
                :key="`${entry.caseNo}-${entry.itemNo}`"
                :class="{ 'row-mine': isMyCase(entry) }"
                @click="openCase(entry)"
              >
                <td class="case-no">
                  {{ entry.caseNo }}
                  <span v-if="isMyCase(entry)" class="mine-star">★</span>
                </td>
                <td>{{ entry.itemNo || '-' }}</td>
                <td>{{ entry.usage || entry.propertyType || '-' }}</td>
                <td class="addr-cell">{{ entry.address || '-' }}</td>
                <td class="num-cell">{{ entry.minPrice ? formatNumber(entry.minPrice) : '-' }}</td>
                <td>{{ entry.round ? `${entry.round}회` : '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.schedule-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 20px 48px;
}

.schedule-header {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 12px;
}

.week-nav {
  display: flex;
  align-items: center;
  gap: 10px;
}

.week-label {
  font-size: 17px;
  font-weight: 700;
  min-width: 220px;
  text-align: center;
}

.schedule-filters {
  display: flex;
  align-items: center;
  gap: 10px;
}

.court-select {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
}
.court-select select {
  padding: 6px 10px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  background: var(--color-surface, #fff);
  color: var(--color-text, #111827);
  font-size: 13px;
}

.ghost {
  padding: 6px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  background: transparent;
  color: var(--color-text, #111827);
  cursor: pointer;
  font-size: 13px;
}
.ghost:hover { background: var(--color-hover, #f3f4f6); }
.ghost[disabled] { opacity: 0.5; cursor: default; }

.error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: #fee2e2;
  color: #991b1b;
  border-radius: 10px;
}

.loading-banner {
  padding: 16px;
  text-align: center;
  color: var(--color-text-muted, #6b7280);
}

.week-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.day-column {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 280px;
}

.day-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--color-subtle, #f9fafb);
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}

.day-main {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}
.day-date { font-size: 18px; font-weight: 700; }
.day-weekday { font-size: 13px; color: var(--color-text-muted, #6b7280); }
.day-count {
  font-size: 12px;
  color: #1d4ed8;
  background: #dbeafe;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 600;
}

.day-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted, #9ca3af);
  font-size: 13px;
}

.court-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  overflow-y: auto;
  max-height: 520px;
}

.court-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
  padding: 7px 12px;
  font-size: 12.5px;
  cursor: pointer;
  border-bottom: 1px dashed var(--color-border, #f1f5f9);
}
.court-row:last-child { border-bottom: none; }
.court-row:hover { background: var(--color-hover, #f3f4f6); }
.court-row.has-mine { background: #fef3c7; }
.court-row.has-mine:hover { background: #fde68a; }

.court-name { font-weight: 600; }
.court-dept { color: var(--color-text-muted, #374151); }
.court-time { color: var(--color-text-muted, #6b7280); font-variant-numeric: tabular-nums; }
.court-count { color: #1d4ed8; font-weight: 600; }
.mine-star { color: #d97706; }

.drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  justify-content: flex-end;
  z-index: 50;
}

.drawer {
  background: var(--color-surface, #fff);
  width: min(760px, 92vw);
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
}

.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}
.drawer-head strong { font-size: 15px; }
.drawer-head small { display: block; color: var(--color-text-muted, #6b7280); font-size: 12px; margin-top: 2px; }

.drawer-body {
  overflow: auto;
  padding: 10px 0;
}

.entry-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.entry-table th, .entry-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border, #f1f5f9);
  text-align: left;
  vertical-align: top;
}
.entry-table th {
  background: var(--color-subtle, #f9fafb);
  font-weight: 600;
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}
.entry-table tbody tr { cursor: pointer; }
.entry-table tbody tr:hover { background: var(--color-hover, #f3f4f6); }
.entry-table tr.row-mine { background: #fef3c7; }
.case-no { font-weight: 600; white-space: nowrap; }
.addr-cell { max-width: 260px; }
.num-cell { text-align: right; font-variant-numeric: tabular-nums; }

@media (max-width: 900px) {
  .week-grid {
    grid-template-columns: 1fr;
  }
  .day-column { min-height: auto; }
  .court-list { max-height: none; }
}
</style>
