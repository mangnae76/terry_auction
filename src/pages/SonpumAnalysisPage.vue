<script setup lang="ts">
// 시장분석 › 손품분석 — 물건 하나를 골라(경매 카드) 그 물건 기준으로 수요분석 · 시세조사를 본다.
// 위 검색 줄은 없다: 주소 · 동 · 종류는 고른 물건에서 나온다. 여기서 다듬어 물건 상세의 손품조사로 옮길 화면이다.
import { computed, inject, provide, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAuctionStore } from '../stores/auctionStore';
import type { AuctionDetail } from '../types/auction';
import { resolveRegionFromAddress } from '../services/regionResolver';
import { REGION_GROUPS } from '../services/regionCodes';
import { fetchDongTradeDetails, tradeWindowOf, type DongTradeDetailRow } from '../services/publicDataApi';
import type { CasePropertyType } from '../services/caseTradeAnalysis';
import AdminRegionDemandPage from './AdminRegionDemandPage.vue';
import SonpumPricePage from './SonpumPricePage.vue';
import AuctionDetailPage from './AuctionDetailPage.vue';
import { areaUnit } from '../services/areaUnit';
import type { SonPriceOut } from '../services/priceAnalysis';

// 손품조사 화면을 손품분석 모드로 — 본건사진 · 입지/개별성만, 그 사이에 아래 수요분석을 끼운다
provide('sonpumMode', true);
/** 앱 물건상세 › 손품조사 — 웹 손품조사 화면을 그대로 띄운다(2026-11-12 사용자). 물건은 그 물건 하나로 고정, 지도는 뺀다 */
const props = defineProps<{ itemId?: string }>();
const sonApp = !!props.itemId;
provide('sonApp', sonApp);

const store = useAuctionStore();
const { auctions } = storeToRefs(store);

// ===== 경매 카드 — 어느 물건을 볼지 =====
const PICK_KEY = 'son.pick';
const TAB_KEY = 'son.tab';
const readLS = (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 그만 */ } };
const list = computed(() => [...auctions.value].sort((a, b) => String(b.eventDate || '').localeCompare(String(a.eventDate || ''))));
const pickId = ref(readLS(PICK_KEY));
const auction = computed<AuctionDetail | null>(() => (sonApp ? list.value.find((a) => a.id === props.itemId) ?? null : list.value.find((a) => a.id === pickId.value) ?? list.value[0] ?? null));
// 고른 물건을 적고 웹에 알린다 — 웹이 위 머리 카드를 그 물건으로 다시 그린다
watch(pickId, (v) => { if (sonApp) return; writeLS(PICK_KEY, v); window.dispatchEvent(new CustomEvent('son:pick', { detail: v })); });
// 고른 물건이 목록에 없으면(처음 · 지운 물건) 맨 앞 물건으로 — 고르는 칸이 비어 보이지 않게
watch(list, (l) => { if (l.length && !l.some((a) => a.id === pickId.value)) pickId.value = l[0].id; }, { immediate: true });
// 손품결론 탭은 뺐다(2026-11-02) — 결론은 가격분석의 실거래가 예상, 인근 매각사례는 물건정보 탭
// 웹 운영자 — 시세분석 오른쪽 '경매사례' 탭(시장분석 › 경매사례 화면을 이 물건으로, 웹이 #sonSaleSlot 에 그린다, 2026-11-07)
const saleOn = inject<boolean>('sonSaleTab', false);
type SonTab = 'demand' | 'price' | 'sale';
const TAB_LABEL: Record<SonTab, string> = { demand: '매매수요', price: '시세분석', sale: '매각분석' };   // 예전 이름 경매사례(2026-11-08)
const savedTab = readLS(TAB_KEY);
const tab = ref<SonTab>(savedTab === 'price' ? 'price' : savedTab === 'sale' && saleOn ? 'sale' : 'demand');
// 손품조사 화면이 지금 탭을 알게 — 손품결론 탭을 열 때만 결론 값을 받는다
provide('sonpumTab', tab);
// 시세분석 ④ 호가분석 자리(#sonAskSlot)가 생겼는지 — 손품조사 화면이 네이버 매물조사를 거기로 옮길지 정한다
const sonAskReady = ref(false);
provide('sonAskReady', sonAskReady);
// 면적 단위 — 고정카드 오른쪽 단추(services/areaUnit) 하나로 모든 탭이 같이(2026-11-11, 예전엔 이 탭 줄에 따로 있었다)
provide('sonAreaUnit', areaUnit);
/** 시세분석에서 고른 거래 · 예상가 → 아래 선정물건 호실 예상가의 기준가(2026-11-11 사용자 시안) */
const sonPriceOut = ref<SonPriceOut | null>(null);
provide('sonPriceOut', sonPriceOut);
const priceSeen = ref(false);
watch(tab, (v) => { if (v === 'price') priceSeen.value = true; }, { immediate: true });
// 웹 경로에 지금 탭 — '홈 › 시장분석 › 손품분석 › 수요분석'
const tellTab = () => !sonApp && window.dispatchEvent(new CustomEvent('adm:tab', { detail: { trail: ['손품조사', TAB_LABEL[tab.value]] } }));
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
  <section :class="['son', { 'son-app': sonApp }]">
    <p v-if="!list.length" class="son-empty">선정물건이 없습니다. 물건을 등록하면 여기서 손품조사를 할 수 있습니다.</p>
    <!-- 물건은 선정물건에서 마지막으로 연 물건(웹이 'son.pick' 에 적는다) — 위 머리 카드가 그 물건이라 따로 고르는 칸은 없다 -->
    <template v-else-if="auction">

      <!-- 탭 줄 — 지역분석과 같은 상자 탭(수요분석 · 시세조사), 오른쪽 끝에 물건 바꾸기 · 경로(#admCrumbSlot) -->
      <div class="adm-list-head adm-tabs-top son-tabbar">
        <nav class="adm-view-tabs" role="tablist">
          <button type="button" role="tab" :class="{ on: tab === 'demand' }" :aria-selected="tab === 'demand'" @click="tab = 'demand'">매매수요</button>
          <button type="button" role="tab" :class="{ on: tab === 'price' }" :aria-selected="tab === 'price'" @click="tab = 'price'">시세분석</button>
          <button v-if="saleOn" type="button" role="tab" :class="{ on: tab === 'sale' }" :aria-selected="tab === 'sale'" @click="tab = 'sale'">매각분석<span class="adm-chip">운영</span></button>
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
              <AdminRegionDemandPage v-if="demandEmbed && rows.length" :embed="demandEmbed" box-no="③" class="adm-supply" />
              <p v-else-if="!loading && region" class="son-msg">이 지역의 최근 12개월 거래가 없습니다.</p>
            </div>
          </template>
        </AuctionDetailPage>
      </div>
      <!-- 시세조사는 한 번 열면 띄워 둔다 — 탭을 오가도 다시 조회하지 않고 고른 줄 · 거르기가 그대로 남는다 -->
      <div v-if="casePreset && (tab === 'price' || priceSeen)" v-show="tab === 'price'" class="son-price">
        <SonpumPricePage :auction="auction" :kind="casePreset.kind" />
      </div>
      <!-- 선정물건 호실 예상가 — 매매수요에서 옮겨 왔다(2026-11-11 사용자 시안). 위 시세분석 예상가 × (1 + 개별성 보정). 아파트만 -->
      <div v-show="tab === 'price'" id="sonUnitSlot" class="app-detail tab-survey son-detail son-unit" />
      <!-- 네이버 매물조사 — 선정물건 손품조사의 그 단락(물건 값 그대로, 고치면 물건에 저장). 위 손품조사 화면이 여기로 옮겨 그린다 -->
      <div v-show="tab === 'price'" id="sonNaverSlot" class="app-detail tab-survey son-detail son-naver" />
      <!-- 경매사례 — 웹이 시장분석 › 경매사례 화면을 이 자리에 그린다(운영자만) -->
      <div v-if="saleOn" v-show="tab === 'sale'" id="sonSaleSlot" class="son-sale" />
    </template>
  </section>
</template>

<style scoped>
.son { display: flex; flex-direction: column; gap: 10px; }
.son-tabbar .adm-crumb-slot { margin-left: auto; }
.adm-crumb-slot { align-self: center; }
.son-empty, .son-msg { margin: 0; padding: 24px; border: 1px dashed #dde3ee; border-radius: 12px; background: #fff; color: #6b7280; font-size: 14px; text-align: center; }
.son-tabbar { position: relative; display: flex !important; align-items: flex-end; gap: 12px; }
/* 시세분석 상자 위치는 수요분석 첫 상자(본건사진)와 같다 — 둘 다 탭 줄에서 .son 줄 간격(10)만큼. 따로 띄우지 않는다(2026-11-04) */
</style>

<style>
/* ===== 앱 물건상세 › 손품조사(sonApp) — 웹 손품조사 화면을 폰 폭에 맞춘다(2026-11-12 사용자 '웹에 있는 거 그대로'). 웹(.son-app 없음)엔 닿지 않는다 ===== */
.son-app { gap: 10px; }
/* 안에 뜬 물건상세의 머리(사건번호 · 탭)는 바깥 앱 화면에 이미 있다 */
.son-app :is(.adp-sticky-head, .amb, .adp-field-next) { display: none !important; }
.son-app .son-detail :is(.adp-shell, .adp-body) { padding-left: 0 !important; padding-right: 0 !important; padding-top: 0 !important; min-height: 0 !important; background: none !important; }
/* 탭 줄 — 매매수요 · 시세분석(앱 하위 탭처럼 밑줄) */
.son-app .son-tabbar { display: flex; align-items: flex-end; margin: 0 12px; border-bottom: 1px solid #e3e8f0; }
.son-app .son-tabbar .adm-view-tabs { display: flex; gap: 4px; }
.son-app .son-tabbar .adm-view-tabs button { position: relative; height: 40px; padding: 0 14px; border: 0; border-radius: 0; background: none; color: #6b7280; font-size: 15px; font-weight: 700; }
.son-app .son-tabbar .adm-view-tabs button.on { color: #111827; }
.son-app .son-tabbar .adm-view-tabs button.on::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: -1px; height: 2px; background: #111827; }
.son-app .adm-crumb-slot { display: none; }
.son-app .adm-shell { min-height: 0 !important; background: none !important; }   /* 지역분석 화면 높이(100vh) — 손품조사 안에선 내용만큼 */
/* ① 실사용자 — 줄마다 이름 칸 폭 하나로 맞추고 세로 칸막이는 뺀다 */
.son-app .cmp-persona .sep { display: none; }
.son-app .cmp-persona .inner { display: grid; gap: 8px; }
.son-app .cmp-persona .grp { display: grid; grid-template-columns: 76px minmax(0, 1fr); align-items: center; justify-items: start; }
/* 상자 사이 · 상자 안 위 여백 — ①②③④ 모두 같게(사이 12, 안 위 14) */
.son-app .adp-dm-body.cmp-order { gap: 12px; }
.son-app .adp-dm-body.cmp-order > * { margin-top: 0 !important; margin-bottom: 0 !important; }
.son-app .cmp-persona.top { padding: 14px; }
.son-app .o-demand .adm-supply { margin-top: 0 !important; }
/* 상자 제목 — 첫 줄 번호 · 이름(② 는 오른쪽에 필터 기준 검색), 둘째 줄 물음 한 줄. 지역은 동 이름만(2026-11-12 사용자)
   ② 는 물음 · 동 이름 순(물음이 동 이름 왼쪽) */
.son-app .cmp-est-h { row-gap: 6px; column-gap: 6px; }
.son-app .cmp-est-h h3 { display: contents; }
.son-app .cmp-est-h .cmp-est-desc { order: 1; padding-right: 0; }
.son-app .cmp-est-h::after { content: ''; order: 2; flex-basis: 100%; height: 0; }
.son-app .cmp-est-h h3 > .cmp-q { order: 3; margin-left: 0 !important; font-size: 12px; font-weight: 400; white-space: nowrap; }
.son-app .cmp-est-h h3 > .cmp-scope-chip { order: 4; margin-left: 0 !important; font-size: 12px; }
.son-app .adm-nav-scope .box-no { margin-right: 10px; }
.son-app .sup-scope .cmp-no { margin-right: 10px; }   /* 번호 뒤 — ① · ② 상자 제목과 같은 간격 */
.son-app .adm-nav-scope .scope-q, .son-app .sup-scope .cmp-q { display: block; margin: 6px 0 0 !important; font-size: 12px; white-space: nowrap; }
/* 읍면동 수급분석 — 위 3칸은 그대로, 아래 지표 4칸은 2 × 2 */
.son-app .adm-nav.dm { margin: 0; padding: 15px; }
.son-app .o-demand .adm-body { padding: 0 !important; }   /* 회색 수급분석 상자 양끝을 위 ① · ② 테두리 상자와 같은 줄에 */
.son-app .adm-nav-scope { flex-wrap: wrap; font-size: 15px; row-gap: 4px; }
.son-app .dm-row { gap: 8px; }
.son-app .dm-row.c3 { margin-bottom: 8px; }
.son-app .dm-row.c3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.son-app .dm-row.c3 > .dm-cell:first-child { grid-column: 1 / -1; }   /* 거래량(연 · 월) 칸만 한 줄을 다 쓴다 */
.son-app .dm-row.c4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.son-app .dm-cell .dm-body b { flex-wrap: wrap; justify-content: center; white-space: normal; row-gap: 2px; }
.son-app .dm-cell .nbar { display: none; }
.son-app .dm-cell .pass { flex-basis: 100%; text-align: center; }
.son-app .dm-head { font-size: 13px; padding: 7px 4px; }
.son-app .dm-body { flex-wrap: wrap; gap: 4px; padding: 10px 4px; }
.son-app .dm-body b { font-size: 16px; }
.son-app .dm-input { width: 100%; max-width: 96px; font-size: 16px; }
.son-app .dm-opinion { padding: 12px 14px; }
.son-app .dm-opinion b { font-size: 15px; }
/* 매매수요 조사 제목 — 단계 단추(① 실사용자 …)는 제목 아래 줄로 */
.son-app .adp-survey-head { flex-wrap: wrap; row-gap: 8px; }
.son-app .adp-survey-head h2 { white-space: nowrap; }
.son-app .adp-survey-head .cmp-steps { order: 3; flex: 1 1 100%; margin: 0; }
/* 단지 입지비교 위 여섯 칸 — 셋씩 두 줄 */
.son-app .cmp-tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
/* ④ 단지 수급분석 — 거래량 한 줄, 세대수 · 해당평형 · 매물수 셋, 지표 넷은 2 × 2 */
.son-app .sup-row { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; margin-bottom: 8px; }
.son-app .sup-row > .sup-cell { grid-column: span 2; }
.son-app .sup-row:first-of-type > .sup-cell:first-child { grid-column: 1 / -1; }
.son-app .sup-row:not(:first-of-type) > .sup-cell { grid-column: span 3; }
.son-app .sup-h { font-size: 13px; padding: 7px 4px; }
.son-app .sup-b { flex-wrap: wrap; gap: 4px; padding: 10px 4px; }
.son-app .sup-b b { flex-wrap: wrap; justify-content: center; white-space: normal; row-gap: 2px; font-size: 16px; }
.son-app .sup-b b:has(.sup-pass) .sup-bar { display: none; }
.son-app .sup-pass { flex-basis: 100%; text-align: center; }
.son-app .sup-in { width: 100%; max-width: 96px; font-size: 16px; }
/* 빌라 · 단지 리스트 — 웹 칸 그대로 두고 옆으로 민다 */
.son-app .son-demand.sup-tbl .adm-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.son-app .o-est .son-demand.sup-tbl .adm-table { min-width: 860px; }
.son-app .o-unit .son-demand.sup-tbl .adm-table { min-width: 520px; }   /* 호실 예상가 개별성 표 — 고르는 단추가 잘리지 않게 */
</style>

