<script setup lang="ts">
import { computed } from 'vue';
import type { AuctionDetail, AuctionStatus } from '../types/auction';
import { formatNumber } from '../utils/numberFormat';

const props = defineProps<{
  item: AuctionDetail;
}>();

const emit = defineEmits<{
  (e: 'set-status', status: AuctionStatus): void;
}>();

const phase1Active = computed(() => props.item.status === '임장예정' || props.item.status === '임장완료');
const phase2Active = computed(() => props.item.status === '입찰' || props.item.status === '보류');
const phase1Label = computed<AuctionStatus>(() => (props.item.status === '임장완료' ? '임장완료' : '임장예정'));
const phase2Label = computed<AuctionStatus>(() => (props.item.status === '보류' ? '보류' : '입찰'));

const togglePhase = (next: AuctionStatus, event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
  emit('set-status', next);
};

const onPhase1Click = (event: MouseEvent) => {
  const next: AuctionStatus = props.item.status === '임장예정' ? '임장완료' : '임장예정';
  togglePhase(next, event);
};

const onPhase2Click = (event: MouseEvent) => {
  const next: AuctionStatus = props.item.status === '입찰' ? '보류' : '입찰';
  togglePhase(next, event);
};

const toEok = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '-';
  return `${(value / 100000000).toFixed(2)}억`;
};

const bidRateText = computed(() => {
  const rate = props.item.metrics.bidRate;
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return `${formatNumber(rate, { minFractionDigits: 1, maxFractionDigits: 1 })}%`;
});

const hasMyBid = computed(() => Number.isFinite(props.item.metrics.myBidValue) && props.item.metrics.myBidValue > 0);

const highestBidText = computed(() => {
  const v = props.item.expectedSaleValue;
  if (!Number.isFinite(v) || v <= 0) return null;
  const rate = props.item.metrics.bidRate;
  const rateStr = Number.isFinite(rate) && rate > 0 ? ` (${rate.toFixed(1)}%)` : '';
  return `↗ 최고 ${toEok(v)}${rateStr}`;
});
</script>

<template>
  <article class="auction-card">
    <div class="card-top">
      <div class="card-meta">
        <span class="card-date">📅 {{ item.eventDate }}</span>
        <span class="sep">·</span>
        <span>{{ item.courtName }}</span>
        <span class="sep">·</span>
        <span>{{ item.caseNumber }}</span>
      </div>
      <div class="card-chips">
        <span v-if="item.auctionRound" class="card-chip">{{ item.auctionRound }}</span>
        <button
          :class="['card-chip', 'chip-toggle', { active: phase1Active }]"
          type="button"
          :title="phase1Label + ' (클릭 시 전환)'"
          @click="onPhase1Click"
        >{{ phase1Label }}</button>
        <button
          :class="['card-chip', 'chip-toggle', { active: phase2Active }]"
          type="button"
          :title="phase2Label + ' (클릭 시 전환)'"
          @click="onPhase2Click"
        >{{ phase2Label }}</button>
      </div>
    </div>

    <h3>{{ item.address }}</h3>

    <div class="value-row">
      <div>
        <small>감정가</small>
        <strong>{{ toEok(item.metrics.appraisalValue) }}</strong>
      </div>
      <div>
        <small>최저가</small>
        <strong>{{ toEok(item.metrics.minimumBidValue) }}</strong>
      </div>
      <div class="mine">
        <small>우리 입찰</small>
        <strong>{{ hasMyBid ? toEok(item.metrics.myBidValue) : '미입찰' }}</strong>
      </div>
    </div>

    <div class="card-bottom">
      <span>{{ highestBidText ?? '미입찰' }}</span>
      <span v-if="bidRateText" class="bid-rate">{{ bidRateText }}</span>
    </div>
  </article>
</template>
