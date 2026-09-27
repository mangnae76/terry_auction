<script setup lang="ts">
import { computed, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import AuctionCard from '../components/AuctionCard.vue';
import { useAuctionStore } from '../stores/auctionStore';
import type { AuctionStatus } from '../types/auction';

const store = useAuctionStore();
const route = useRoute();

const STATUS_CHIPS: Array<{ key: AuctionStatus | '전체'; label: string }> = [
  { key: '전체', label: '전체' },
  { key: '임장예정', label: '임장예정' },
  { key: '임장완료', label: '임장완료' },
  { key: '입찰', label: '입찰' },
  { key: '보류', label: '보류' },
];

const displayedAuctions = computed(() =>
  store.filteredAuctions.filter((item) => !item.id.startsWith('onbid-')),
);

const toEok = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0억';
  return `${(value / 100000000).toFixed(2)}억`;
};

const onSetStatus = async (id: string, status: AuctionStatus) => {
  await store.setStatus(id, status);
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
  <section class="list-page">
    <header class="hero-card">
      <div>
        <small>{{ new Date().toLocaleDateString('ko-KR', { dateStyle: 'full' }) }}</small>
        <h1>부동산 경매 관리</h1>
        <p>인천/부천 지역 입찰 현황</p>
      </div>
      <div class="weather-box">
        <span>인천 23℃</span>
        <span>USD 1,385 <span class="usd-change">+3.2</span></span>
      </div>
    </header>

    <div class="kpi-grid">
      <article>
        <div class="kpi-icon icon-total">📋</div>
        <div class="kpi-body">
          <small>총 물건</small>
          <strong>{{ store.summary.totalItems }}건</strong>
        </div>
      </article>
      <article>
        <div class="kpi-icon icon-won">🏆</div>
        <div class="kpi-body">
          <small>낙찰</small>
          <strong>{{ store.summary.wonItems }}건</strong>
        </div>
      </article>
      <article>
        <div class="kpi-icon icon-bid">📌</div>
        <div class="kpi-body">
          <small>입찰 참여</small>
          <strong>{{ store.summary.activeBids }}건</strong>
        </div>
      </article>
      <article>
        <div class="kpi-icon icon-amount">💰</div>
        <div class="kpi-body">
          <small>총 입찰금액</small>
          <strong>{{ toEok(store.summary.totalBidAmount) }}</strong>
        </div>
      </article>
    </div>

    <div class="filter-toolbar">
      <div class="filter-controls">
        <div class="filter-field">
          <select
            :value="store.activeStatus"
            @change="store.setFilter(($event.target as HTMLSelectElement).value as AuctionStatus | '전체')"
          >
            <option v-for="chip in STATUS_CHIPS" :key="chip.key" :value="chip.key">
              {{ chip.key === '전체' ? '전체 상태' : chip.label }}
            </option>
          </select>
        </div>

        <label class="filter-field filter-date">
          <span class="filter-label">입찰일</span>
          <input
            :value="store.selectedBidDate"
            type="date"
            @input="store.setBidDate(($event.target as HTMLInputElement).value)"
          />
          <button
            v-if="store.selectedBidDate"
            class="filter-date-clear"
            type="button"
            aria-label="입찰일 초기화"
            @click="store.setBidDate('')"
          >×</button>
        </label>

        <div class="filter-field">
          <select
            :value="store.selectedCourt"
            @change="store.setCourt(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="opt in store.courtOptions" :key="opt" :value="opt">
              {{ opt === '전체' ? '전체 법원' : opt }}
            </option>
          </select>
        </div>

        <div class="filter-field">
          <select
            :value="store.selectedRegion"
            @change="store.setRegion(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="opt in store.regionOptions" :key="opt" :value="opt">
              {{ opt === '전체' ? '전체 지역' : opt }}
            </option>
          </select>
        </div>

        <div class="filter-field">
          <select
            :value="store.sortMode"
            @change="store.setSortMode(($event.target as HTMLSelectElement).value as 'latest' | 'court' | 'region')"
          >
            <option value="latest">기본(최신순)</option>
            <option value="court">법원순</option>
            <option value="region">지역순</option>
          </select>
        </div>

        <div class="filter-field filter-search">
          <span class="filter-search-icon">🔍</span>
          <input
            :value="store.searchKeyword"
            placeholder="주소 또는 사건번호 검색..."
            type="text"
            @input="store.setKeyword(($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>
    </div>

    <p v-if="store.storageWarning" class="warning">{{ store.storageWarning }}</p>

    <div class="card-grid">
      <RouterLink v-for="item in displayedAuctions" :key="item.id" :to="`/auctions/${item.id}`" class="card-link">
        <AuctionCard :item="item" @set-status="onSetStatus(item.id, $event)" />
      </RouterLink>
    </div>

    <p v-if="displayedAuctions.length === 0 && !store.loading" style="color: var(--text-secondary); text-align: center; padding: 40px 0;">
      표시할 물건이 없습니다.
    </p>
  </section>
</template>
