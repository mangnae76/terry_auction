<script setup lang="ts">
// 시장분석 › 손품분석 — 물건 하나를 골라(경매 카드) 그 물건 기준으로 수요분석 · 시세조사를 본다.
// 위 검색 줄은 없다: 주소 · 동 · 종류는 고른 물건에서 나온다. 여기서 다듬어 물건 상세의 손품조사로 옮길 화면이다.
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAuctionStore } from '../stores/auctionStore';
import type { AuctionDetail } from '../types/auction';
import { resolveRegionFromAddress } from '../services/regionResolver';
import { REGION_GROUPS } from '../services/regionCodes';
import { fetchDongTradeDetails, tradeWindowOf, type DongTradeDetailRow } from '../services/publicDataApi';
import type { CasePropertyType } from '../services/caseTradeAnalysis';
import AdminRegionDemandPage from './AdminRegionDemandPage.vue';
import AdminCaseTradePage from './AdminCaseTradePage.vue';

const store = useAuctionStore();
const { auctions } = storeToRefs(store);

// ===== 경매 카드 — 어느 물건을 볼지 =====
const PICK_KEY = 'son.pick';
const TAB_KEY = 'son.tab';
const readLS = (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 그만 */ } };
const list = computed(() => [...auctions.value].sort((a, b) => String(b.eventDate || '').localeCompare(String(a.eventDate || ''))));
const pickId = ref(readLS(PICK_KEY));
const auction = computed<AuctionDetail | null>(() => list.value.find((a) => a.id === pickId.value) ?? list.value[0] ?? null);
// 고른 물건을 적고 웹에 알린다 — 웹이 위 머리 카드를 그 물건으로 다시 그린다
watch(pickId, (v) => { writeLS(PICK_KEY, v); window.dispatchEvent(new CustomEvent('son:pick', { detail: v })); });
// 고른 물건이 목록에 없으면(처음 · 지운 물건) 맨 앞 물건으로 — 고르는 칸이 비어 보이지 않게
watch(list, (l) => { if (l.length && !l.some((a) => a.id === pickId.value)) pickId.value = l[0].id; }, { immediate: true });
const tab = ref<'demand' | 'price'>(readLS(TAB_KEY) === 'price' ? 'price' : 'demand');
watch(tab, (v) => writeLS(TAB_KEY, v));

const kindOf = (t: string): CasePropertyType => (/아파트/.test(t) ? 'apt' : /오피스텔/.test(t) ? 'officetel' : 'villa');

// ===== 지역 — 물건 주소에서 시도 · 시군구 · 동을 푼다 =====
const region = ref<{ sido: string; districtCode: string; dong: string; label: string } | null>(null);
const regionErr = ref('');
watch(() => auction.value?.address, async (addr) => {
  region.value = null; regionErr.value = '';
  if (!addr) return;
  const r = await resolveRegionFromAddress(addr).catch(() => null);
  if (!r) { regionErr.value = '물건 주소에서 지역을 찾지 못했습니다.'; return; }
  const sido = REGION_GROUPS.find((g) => g.districts.some((d) => d.lawdCode === r.lawdCd5))?.sido ?? r.sido;
  const gu = REGION_GROUPS.flatMap((g) => g.districts).find((d) => d.lawdCode === r.lawdCd5)?.label ?? r.sigungu;
  region.value = { sido, districtCode: r.lawdCd5, dong: r.dong, label: `${sido} ${gu}` };
}, { immediate: true });

// ===== 수요분석 — 그 구의 최근 12개월 거래를 받아 수요분석 화면에 넘긴다 =====
const rows = ref<DongTradeDetailRow[]>([]);
const asOf = ref(0);
const loading = ref(false);
const token = ref(0);
watch(() => [region.value?.districtCode, auction.value?.propertyType], async () => {
  rows.value = [];
  const r = region.value; const a = auction.value;
  if (!r || !a) return;
  loading.value = true;
  try {
    const res = await fetchDongTradeDetails({ lawdCd5: r.districtCode, propertyType: kindOf(a.propertyType), months: 12, dealKind: 'sale' });
    const w = tradeWindowOf(Date.now(), 12);
    rows.value = res.rows.filter((x) => !x.dealTime || (x.dealTime >= w.start.getTime() && x.dealTime <= w.end.getTime()));
    asOf.value = Date.now(); token.value += 1;
  } finally {
    loading.value = false;
  }
}, { immediate: true });
const demandEmbed = computed(() => (region.value && auction.value ? {
  sido: region.value.sido, districtCode: region.value.districtCode, dong: region.value.dong, kind: kindOf(auction.value.propertyType),
  dealKind: 'sale' as const, months: 12, token: token.value, rows: rows.value, asOf: asOf.value, label: region.value.label,
} : null));

// ===== 시세조사 — 물건 주소 · 종류로 바로 조회 =====
const casePreset = computed(() => (auction.value?.address ? { address: auction.value.address, kind: kindOf(auction.value.propertyType) } : null));
</script>

<template>
  <section class="son">
    <p v-if="!list.length" class="son-empty">선정물건이 없습니다. 물건을 등록하면 여기서 손품분석을 할 수 있습니다.</p>
    <template v-else-if="auction">

      <nav class="son-tabs" role="tablist">
        <button type="button" role="tab" :class="{ on: tab === 'demand' }" :aria-selected="tab === 'demand'" @click="tab = 'demand'">수요분석</button>
        <button type="button" role="tab" :class="{ on: tab === 'price' }" :aria-selected="tab === 'price'" @click="tab = 'price'">시세조사</button>
        <span class="son-where">{{ region ? `${region.label} ${region.dong}` : regionErr || '지역을 찾는 중…' }}</span>
        <!-- 물건 바꾸기 — 위 머리 카드(웹이 그린다)도 같이 바뀐다 -->
        <label class="son-pick">
          <span>물건 바꾸기</span>
          <select v-model="pickId">
            <option v-for="a in list" :key="a.id" :value="a.id">{{ a.caseNumber }} · {{ (a.address || '').split(' ').slice(1, 4).join(' ') }}</option>
          </select>
        </label>
      </nav>

      <div v-show="tab === 'demand'" class="app-market son-demand" data-k="dong">
        <p v-if="loading" class="son-msg">{{ region?.label }} 최근 12개월 거래를 받는 중입니다…</p>
        <AdminRegionDemandPage v-if="demandEmbed && rows.length" :embed="demandEmbed" class="adm-supply" />
        <p v-else-if="!loading && region" class="son-msg">이 지역의 최근 12개월 거래가 없습니다.</p>
      </div>
      <div v-if="tab === 'price' && casePreset" class="adm-case-in app-market son-price" data-k="case">
        <AdminCaseTradePage in-dong :preset="casePreset" />
      </div>
    </template>
  </section>
</template>

<style scoped>
.son { display: flex; flex-direction: column; gap: 14px; padding-top: 14px; }
.son-empty, .son-msg { margin: 0; padding: 24px; border: 1px dashed #dde3ee; border-radius: 12px; background: #fff; color: #6b7280; font-size: 14px; text-align: center; }
.son-pick { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: #6b7280; }
.son-pick select { height: 36px; max-width: 360px; padding: 0 10px; border: 1px solid #dde3ee; border-radius: 8px; background: #fff; font-family: inherit; font-size: 13px; color: #111827; }
.son-tabs { display: flex; align-items: flex-end; gap: 6px; border-bottom: 1px solid #dfe4ec; }
.son-tabs button { height: 40px; padding: 0 22px; border: 1px solid #dde3ee; border-bottom: 0; border-radius: 10px 10px 0 0; background: #eef1f6; font-family: inherit; font-size: 15px; font-weight: 700; color: #6b7280; cursor: pointer; }
.son-tabs button.on { background: #fff; color: #2b6df3; border-color: #c9d6f5; }
.son-where { margin-left: auto; padding-bottom: 10px; font-size: 13px; color: #6b7280; }
.son-pick { padding-bottom: 6px; display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: #6b7280; }
.son-pick select { height: 34px; max-width: 320px; padding: 0 10px; border: 1px solid #dde3ee; border-radius: 8px; background: #fff; font-family: inherit; font-size: 13px; color: #111827; }
</style>
