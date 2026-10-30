<script setup lang="ts">
// 시장분석 › 손품분석 — 물건 하나를 골라(경매 카드) 그 물건 기준으로 수요분석 · 시세조사를 본다.
// 위 검색 줄은 없다: 주소 · 동 · 종류는 고른 물건에서 나온다. 여기서 다듬어 물건 상세의 손품조사로 옮길 화면이다.
import { computed, provide, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAuctionStore } from '../stores/auctionStore';
import type { AuctionDetail } from '../types/auction';
import { resolveRegionFromAddress } from '../services/regionResolver';
import { REGION_GROUPS } from '../services/regionCodes';
import { fetchDongTradeDetails, tradeWindowOf, type DongTradeDetailRow } from '../services/publicDataApi';
import type { CasePropertyType } from '../services/caseTradeAnalysis';
import AdminRegionDemandPage from './AdminRegionDemandPage.vue';
import AdminCaseTradePage from './AdminCaseTradePage.vue';
import AuctionDetailPage from './AuctionDetailPage.vue';

// 손품조사 화면을 손품분석 모드로 — 본건사진 · 입지/개별성만, 그 사이에 아래 수요분석을 끼운다
provide('sonpumMode', true);

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
type SonTab = 'demand' | 'price' | 'conc';
const TAB_LABEL: Record<SonTab, string> = { demand: '수요분석', price: '시세분석', conc: '손품결론' };
const savedTab = readLS(TAB_KEY);
const tab = ref<SonTab>(savedTab === 'price' || savedTab === 'conc' ? savedTab : 'demand');
// 손품조사 화면이 지금 탭을 알게 — 손품결론 탭을 열 때만 결론 값을 받는다
provide('sonpumTab', tab);
// 시세분석 ④ 호가분석 자리(#sonAskSlot)가 생겼는지 — 손품조사 화면이 네이버 매물조사를 거기로 옮길지 정한다
const sonAskReady = ref(false);
provide('sonAskReady', sonAskReady);
const priceSeen = ref(false);
watch(tab, (v) => { if (v === 'price') priceSeen.value = true; }, { immediate: true });
// 웹 경로에 지금 탭 — '홈 › 시장분석 › 손품분석 › 수요분석'
const tellTab = () => window.dispatchEvent(new CustomEvent('adm:tab', { detail: { trail: ['손품조사', TAB_LABEL[tab.value]] } }));
watch(tab, (v) => { writeLS(TAB_KEY, v); tellTab(); }, { immediate: true });

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
// 열쇠는 글 하나로 — 배열로 두면 물건을 저장할 때마다(새 객체) 같은 값인데도 다시 받아 '받는 중'이 깜빡였다
watch(() => `${region.value?.districtCode ?? ''}|${auction.value?.propertyType ?? ''}`, async () => {
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
// id — 시세조사에서 고른 값을 이 물건 문서에 남긴다(웹 · 앱 · 다른 기기에서 같게)
const casePreset = computed(() => (auction.value?.address ? { address: auction.value.address, kind: kindOf(auction.value.propertyType), id: auction.value.id } : null));
</script>

<template>
  <section class="son">
    <p v-if="!list.length" class="son-empty">선정물건이 없습니다. 물건을 등록하면 여기서 손품조사를 할 수 있습니다.</p>
    <!-- 물건은 선정물건에서 마지막으로 연 물건(웹이 'son.pick' 에 적는다) — 위 머리 카드가 그 물건이라 따로 고르는 칸은 없다 -->
    <template v-else-if="auction">

      <!-- 탭 줄 — 지역분석과 같은 상자 탭(수요분석 · 시세조사), 오른쪽 끝에 물건 바꾸기 · 경로(#admCrumbSlot) -->
      <div class="adm-list-head adm-tabs-top son-tabbar">
        <nav class="adm-view-tabs" role="tablist">
          <button type="button" role="tab" :class="{ on: tab === 'demand' }" :aria-selected="tab === 'demand'" @click="tab = 'demand'">수요분석</button>
          <button type="button" role="tab" :class="{ on: tab === 'price' }" :aria-selected="tab === 'price'" @click="tab = 'price'">시세분석</button>
          <button type="button" role="tab" :class="{ on: tab === 'conc' }" :aria-selected="tab === 'conc'" @click="tab = 'conc'">손품결론</button>
        </nav>
        <div id="admCrumbSlot" class="adm-crumb-slot" />
      </div>

      <!-- 수요분석 — 손품조사 그대로(본건사진 → 지역분석 수요분석 → 2. 입지/개별성) -->
      <!-- 늘 띄워 둔다(v-show) — 이 화면이 시세조사 탭 아래 네이버 매물조사(#sonNaverSlot)도 그린다 -->
      <div v-show="tab === 'demand'" class="app-detail tab-survey son-detail">
        <AuctionDetailPage :key="auction.id" mode="view" :id="auction.id">
          <template #son-demand>
            <div class="son-demand">
              <p v-if="loading" class="son-msg">{{ region?.label }} 최근 12개월 거래를 받는 중입니다…</p>
              <AdminRegionDemandPage v-if="demandEmbed && rows.length" :embed="demandEmbed" class="adm-supply" />
              <p v-else-if="!loading && region" class="son-msg">이 지역의 최근 12개월 거래가 없습니다.</p>
            </div>
          </template>
        </AuctionDetailPage>
      </div>
      <!-- 시세조사는 한 번 열면 띄워 둔다 — 탭을 오가도 다시 조회하지 않고 고른 줄 · 거르기가 그대로 남는다 -->
      <div v-if="casePreset && (tab === 'price' || priceSeen)" v-show="tab === 'price'" class="adm-case-in app-market son-price" data-k="case">
        <AdminCaseTradePage in-dong :preset="casePreset" />
      </div>
      <!-- 네이버 매물조사 — 선정물건 손품조사의 그 단락(물건 값 그대로, 고치면 물건에 저장). 위 손품조사 화면이 여기로 옮겨 그린다 -->
      <div v-show="tab === 'price'" id="sonNaverSlot" class="app-detail tab-survey son-detail son-naver" />
      <!-- 손품결론 — 선정물건 손품조사의 손품결론 카드 그대로(위 손품조사 화면이 여기로 옮겨 그린다) -->
      <div v-show="tab === 'conc'" id="sonConcSlot" class="app-detail tab-survey son-detail son-conc" />
    </template>
  </section>
</template>

<style scoped>
.son { display: flex; flex-direction: column; gap: 10px; }
.son-tabbar .adm-crumb-slot { margin-left: auto; }
.adm-crumb-slot { align-self: center; }
.son-empty, .son-msg { margin: 0; padding: 24px; border: 1px dashed #dde3ee; border-radius: 12px; background: #fff; color: #6b7280; font-size: 14px; text-align: center; }
.son-tabbar { position: relative; display: flex !important; align-items: flex-end; gap: 12px; }
</style>
