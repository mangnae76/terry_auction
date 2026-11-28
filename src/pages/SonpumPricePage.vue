<script setup lang="ts">
import { clampAroundBase } from '../services/rangeClamp';
import RangeInputBox from '../components/RangeInputBox.vue';
import SimRangeBox from '../components/SimRangeBox.vue';
import SearchFilterBar, { type SearchFilter } from '../components/SearchFilterBar.vue';
import { userMessage } from '../services/userMessage';
// 손품조사 › 시세분석 — 선정물건 둘레(반경) · 비슷한 조건(유사도)의 실거래로 「실거래가 예상」을 낸다.
// 위→아래: ⓪ 조회 줄 → Ⓐ 실거래가 예상 띠 → Ⓑ 지도 · 조건 줄 · 유사물건 표 → Ⓒ 시세종합 → Ⓓ 호가 입력.
// 셈은 services/priceAnalysis.ts, 이 화면은 자료를 모으고 그린다. 고른 조건 · 결과는 물건(marketPicks)에 남아 손품결론이 읽는다.
import { computed, inject, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, watch, type Ref, shallowRef, markRaw } from 'vue';
import type { AuctionDetail, MarketPickRow, MarketPicks, PriceView } from '../types/auction';
import { analyzeAddress, floorOfHo, pickCaseTrade, type CasePropertyType, type CaseTradeResult, type CaseTradeRow } from '../services/caseTradeAnalysis';
import {
  PY, HUG_RATE, RADII, PERIODS, radText, periodText, simCond, simDefText, groupOf, floorNum, matchUnit, unitLabelOf, inRange,
  estStats, jeonseEstimate, distM, visitOrder, areaIn, matchCond, type PriceCond, type PriceRow,
  type SonPriceOut,
} from '../services/priceAnalysis';
import { fetchApartUnits, type ApartUnit } from '../services/vworldApi';
import { dongShapeOf, parcelShapeOf } from '../services/zoning';
import { getComplexAreas, type ComplexAreas } from '../services/complexAreas';
import { areaUnit, aptAreaText } from '../services/areaUnit';
import { browserCacheGet, browserCachePut } from '../services/browserCache';
import { geocodeAddress } from '../services/routeOptimizer';
import { getBuildingFacts } from '../services/buildingFacts';
import { tradeWindowOf } from '../services/publicDataApi';
import { createMapView, type MapView } from '../services/mapView';
import KakaoMapTools from '../components/KakaoMapTools.vue';
import { openNaverSpot, openPlanetSpot } from '../services/naverListing';
import { REGION_GROUPS } from '../services/regionCodes';
import { updateStamp } from '../services/updateStamp';
import { useColumnFilters, type ColumnDef } from '../composables/useColumnFilters';
import ColumnFilterPanel from '../components/ColumnFilterPanel.vue';
import InfoTip from '../components/InfoTip.vue';
import type { TipRow } from '../services/tipRows';
import { useAuctionStore } from '../stores/auctionStore';
import { useAuthStore } from '../stores/authStore';
import { isAdminEmail } from '../services/accessControl';
import { auctionsOfDong, type AucRec } from '../services/auctionNear';

/** loose — 시장분석 › 시세예측처럼 선정물건이 아닌 검색 주소로 볼 때. 적어 둘 물건이 없어 저장 · 임장경로 넣기는 감추고 '선정물건'은 '검색주소'로 */
/** months — 기간을 바깥 줄(시세예측 주소 줄)이 고를 때. 이 화면의 기간 · 조회는 감춘다 */
/** app — 앱 물건상세 › 손품+현장 › 시세조사(2026-11-09 시안 price-mock). 내용은 웹과 같고(매도가 예상 · 제외 체크 · 저장 단추),
 *  폰 폭에 맞춰 지도는 접어 두고(한 줄 '지도 보기'), 거르기는 반경 · 거래 · 엘베 · 층 · 기준 → 바로 아래 면적 · 건축 막대 차례로 쌓는다. 전체화면은 없다 */
/** dongOnly — 시세예측 지역으로(동까지만, 기준 물건 없음, 2026-11-29 시안 v7): 반경은 동전체 · 기준은 직접범위 · 층은 층별, 선정물건 줄 · 핀 없음, 결론은 '○○동 시세' */
/** aucTab — 시세예측 › 낙찰사례(운영 전용, 2026-11-29 시안 v7): 같은 지도 · 필터 위에 결론 · 표만 낙찰로 */
const props = defineProps<{ auction: AuctionDetail; kind: CasePropertyType; loose?: boolean; months?: number; app?: boolean; dongOnly?: boolean; aucTab?: boolean }>();
// 칩 · 범례 — 선정물건 손품조사는 '선정물건', 시장분석 › 시세예측(주소로 조회)은 '조회물건'(2026-11-14 사용자 — '검색주소'는 알아보기 어려웠다)
const meName = computed(() => (props.loose ? '조회물건' : '선정물건'));
const store = useAuctionStore();

const n0 = (w: number) => Math.round(w).toLocaleString('ko-KR');
const eok = (w: number) => `${n0(w)}원`;   // 원까지 다(1.5억 아님, 2026-11-17 사용자 — 손품조사 · 시세예측 시세분석 · 앱 같게)
const man = (w: number) => `${Math.round(w / 1e4).toLocaleString('ko-KR')}만/평`;
const squash = (v: string) => String(v ?? '').replace(/\s+/g, '').toLowerCase();
const KIND_LABEL: Record<CasePropertyType, string> = { villa: '연립다세대', apt: '아파트', officetel: '오피스텔' };
const KINDS = ['매매', '전세', '월세'] as const;
type Kind = typeof KINDS[number];

// ===== 남겨 둔 조건(물건 문서) — 다시 열면 그대로 =====
const saved = (): PriceView | undefined => store.auctions.find((x) => x.id === props.auction.id)?.marketPicks?.price;
const sv = saved();
const months = ref<number>(props.months ?? (sv?.months && (PERIODS as readonly number[]).includes(sv.months) ? sv.months : 12));
const loadedMonths = ref(months.value);
const radius = ref<number>(props.dongOnly ? -1 : sv?.radius ?? 500);   // -1 = 동전체(아래 DONG)
const kindF = ref<Kind>(sv?.kind ?? '매매');
const simMode = ref<'sim' | 'range'>(props.dongOnly ? 'range' : sv?.simMode ?? 'sim');
const sim = ref<number>(sv?.sim ?? 80);
const rangeCond = ref<PriceCond>(props.dongOnly ? { mMin: 0, mMax: 0, yMin: 0, yMax: 0, floor: null } : sv?.cond ?? { mMin: 0, mMax: 0, yMin: 0, yMax: 0, floor: null });
const typedPub = ref<number>(sv?.typedPub ?? 0);

// ===== ⓪ 조회 — 시군구 실거래(국토부)를 기간만큼 받아 이 동만 쓴다 =====
const loading = ref(false);
const errorMsg = ref('');
const res = ref<CaseTradeResult | null>(null);
const fetchedAt = ref(0);
let runId = 0;
const run = async () => {
  if (loading.value || !props.auction.address) return;
  const id = ++runId;
  loading.value = true; errorMsg.value = '';
  // 지도는 실거래를 기다리지 않는다 — 이 물건 위치만 찾으면 지도 · 빨간 점 · 반경부터 띄우고, 파란 점은 거래가 들어오는 대로(2026-11-10)
  if (!mySpot.value) {
    const addr = props.auction.address;
    void geocodeAddress(addr).then((p) => { if (props.auction.address === addr && !mySpot.value && p) mySpot.value = p; }).catch(() => undefined);
  }
  try {
    const out = await analyzeAddress({ address: props.auction.address, propertyType: props.kind, years: Math.ceil(months.value / 12) }, props.dongOnly ? { dongOnly: true } : undefined);
    if (id !== runId) return;
    if (out.error) errorMsg.value = out.error;
    res.value = out; loadedMonths.value = months.value; fetchedAt.value = Date.now();
    sameRaw2y.value = [];
    // 빌라 — 경매지번 매매가 자동 고르기: 고른 기간에 그 건물 매매가 없으면 2년까지(아파트는 사용자가 리스트에서 고른다)
    if (!isAptKind && !props.dongOnly && months.value < 24 && !(out.rows ?? []).some((r) => (r.kind === '매매' || r.kind === '직거래') && r.price > 0)) {
      void analyzeAddress({ address: props.auction.address, propertyType: props.kind, years: 2 }).then((o2) => { if (id === runId) sameRaw2y.value = o2.rows ?? []; }).catch(() => undefined);
    }
    // 층은 고른(저장한) 그대로 — 11-10 에 여기서 '전체'로 되돌리게 바꿔, 유사도에서 고른 '같은 층'이 새로고침하면 풀렸다(2026-11-11 사용자)
    if (!rangeCond.value.mMax && !props.dongOnly) rangeCond.value = { ...simCond(sim.value, me.value), floor: rangeCond.value.floor === 0 ? 0 : null };
    void enrich(id);
  } catch (err) {
    errorMsg.value = userMessage(err);
  } finally {
    if (id === runId) loading.value = false;
  }
};
const dirty = computed(() => months.value !== loadedMonths.value);

const region = computed(() => res.value?.region ?? null);
/** 앱 화면(앱 시세분석 · 앱 손품조사 탭이 띄운 시세분석)인가 */
const inAppView = !!props.app || inject<boolean>('sonApp', false);
const regionText = computed(() => {
  const r = region.value;
  if (!r) return '';
  const sido = REGION_GROUPS.find((g) => g.districts.some((d) => d.lawdCode === r.lawdCd5))?.sido ?? r.sido;
  const gu = REGION_GROUPS.flatMap((g) => g.districts).find((d) => d.lawdCode === r.lawdCd5)?.label ?? r.sigungu;
  // 앱 — 시도(경기도)는 빼고 시군구부터. 필터 줄이 한 줄에 들어오게(2026-11-15 사용자)
  return inAppView ? `${gu} ${r.dong}` : `${sido} ${gu} ${r.dong}`;
});
const lot = computed(() => res.value?.parts.lot ?? '');

// ===== 선정물건 — 전용 · 건축년 · 층 · 공시가 =====
const sameRaw = computed(() => res.value?.rows ?? []);
/** 빌라 경매지번 매매가 — 그 건물 매매가 고른 기간(1년 등) 안에 없으면 2년까지 찾는다. 2년 넘게는 안 본다(2026-11-15 사용자) */
const sameRaw2y = ref<typeof sameRaw.value>([]);
const me = computed(() => {
  // 아파트는 물건 자료 전용(다른 탭 · 고정카드와 같은 84.39)이 먼저 — 실거래에서 고른 값(84.40)과 끝자리가 달라 직접범위 끝이 84.4 로 보였다(2026-11-11)
  const areaM2 = (props.kind === 'apt' ? Number(props.auction.buildingAreaM2) || 0 : 0) || res.value?.baseAreaM2 || props.auction.buildingAreaM2 || 0;
  const year = Number(String(props.auction.approvalDate ?? '').slice(0, 4)) || sameRaw.value.find((r) => r.buildYear)?.buildYear || 0;
  return { areaM2, year, floor: floorOfHo(res.value?.parts.ho ?? '') };
});
const myPy = computed(() => me.value.areaM2 / PY);
// 아파트 면적 — '공급㎡ (전용)' 한 줄(2026-11-11 규칙), 단위는 웹 고정카드 단추(앱은 ㎡). 공급은 이 단지 건축물대장(같은 전용의 가장 많은 공급) —
// 다른 단지 거래는 공급을 몰라 '전용 59.99㎡'(추정하지 않는다)
const isAptKind = props.kind === 'apt';
const myAreas = shallowRef<ComplexAreas | null>(null);
watch(() => props.auction.id, async () => { myAreas.value = null; if (!isAptKind) return; myAreas.value = await getComplexAreas(props.auction.address).catch(() => null); }, { immediate: true });
const t2s = (n: number) => (Math.floor(n * 100 + 1e-6) / 100).toFixed(2);
const supplyOfEx = (ex: number) => {
  // 실거래 전용(73.93)과 건축물대장 전용(73.94)이 끝자리에서 다를 수 있어 ±0.015 안이면 같은 평형으로 본다
  const gs = (myAreas.value?.groups ?? []).filter((g) => (t2s(g.exclusive) === t2s(ex) || Math.abs(g.exclusive - ex) < 0.015) && g.supply - g.exclusive > 0.5).sort((a, b) => b.count - a.count);
  return gs[0]?.supply ?? null;
};
const aptUnit = () => (webEmbed && !props.app ? areaUnit.value : 'm2');
/** 표 면적 칸 두 줄 — '115.64㎡' 위, '(84.39)' 아래(칸을 좁혀 간격을 고르게, 2026-11-11 사용자) */
const areaLines = (t: string) => { const i = t.indexOf(' ('); return i > 0 ? [t.slice(0, i), t.slice(i + 1)] : [t, '']; };
// 다른 단지 거래도 그 단지 건축물대장의 공급면적(같은 전용 호실 중 가장 많은 값) — '전용 84.99㎡'만 나오던 것(2026-11-11 사용자). 단지마다 한 번씩만 받는다
const otherAreas = shallowRef<Record<string, ComplexAreas | null>>({});
const areasAsked = new Set<string>();
const supplyIn = (groups: ComplexAreas['groups'] | undefined, ex: number) => {
  const gs = (groups ?? []).filter((g) => (t2s(g.exclusive) === t2s(ex) || Math.abs(g.exclusive - ex) < 0.015) && g.supply - g.exclusive > 0.5).sort((a, b) => b.count - a.count);
  return gs[0]?.supply ?? null;
};
const aptRowArea = (ex: number, same: boolean, r?: { umdNm: string; jibun: string }) => aptAreaText(same ? supplyOfEx(ex) : r ? supplyIn(otherAreas.value[`${r.umdNm}|${r.jibun}`]?.groups, ex) : null, ex, aptUnit());
const aptMyArea = computed(() => { const ex = Number(props.auction.buildingAreaM2) || me.value.areaM2; return aptAreaText(myAreas.value?.mine?.supply ?? supplyOfEx(ex), ex, aptUnit()); });   // 전용은 물건 자료 값(다른 탭과 같은 59.98)
const myPub = computed(() => res.value?.price?.price ?? 0);
const pubMissing = computed(() => !!res.value && !myPub.value);
const curPub = computed(() => (pubMissing.value ? typedPub.value : myPub.value));
const myElev = computed(() => elevs.value[lot.value] ?? null);
/** 지도 빨간 이름표 — 건물명 · 동 · 호(못 찾으면 지번 주소). '선정물건' · '검색주소' 대신 실제 이름(2026-11-14 사용자) */
const myLabel = computed(() => {
  const p = res.value?.parts; const nm = res.value?.price?.name || sameRaw.value[0]?.name || '';
  const dong = p?.buildingDong && !nm.includes(`${p.buildingDong}동`) ? `${p.buildingDong}동` : '';
  const ho = p?.ho ? `${p.ho}호` : '';
  return [nm || [region.value?.dong, lot.value].filter(Boolean).join(' '), dong, ho].filter(Boolean).join(' ');
});
// 선정물건 동도 — 주소의 '101동'(유사물건 줄처럼 동 · 호, 2026-11-15 사용자)
const myAddr = computed(() => [region.value?.dong, lot.value, res.value?.price?.name || sameRaw.value[0]?.name, myDong.value ? `${myDong.value}동` : '', res.value?.parts.ho ? `${res.value.parts.ho}호` : ''].filter(Boolean).join(' '));

// ===== 좌표 · 공시가 호실 · 엘베 — 지번마다 한 번(값은 각 서비스가 저장해 둔다) =====
type Spot = { lat: number; lng: number } | null;
const mySpot = ref<Spot>(null);
const spots = ref<Record<string, Spot>>({});
const units = ref<Record<string, ApartUnit[]>>({});
const elevs = ref<Record<string, number | null>>({});
const progress = ref({ done: 0, total: 0 });
const lotAddr = (umd: string, jibun: string) => `${region.value?.sido ?? ''} ${region.value?.sigungu ?? ''} ${umd} ${jibun}`.trim();
const limit = async <T>(items: T[], n: number, fn: (x: T) => Promise<void>, id: number) => {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length && id === runId) { const x = items[i]; i += 1; await fn(x).catch(() => undefined); }
  }));
};
// 지번마다 찾은 위치 · 엘베 · 공시가 호실을 동 하나로 묶어 이 브라우저에 둔다 — 새로고침해도 한 번 읽으면 끝(못 찾은 위치도 「없음」으로 둔다)
type LotCache = { at: number; spots: Record<string, Spot>; elevs: Record<string, number | null>; units: Record<string, ApartUnit[]> };
const LOT_TTL = 30 * 24 * 60 * 60 * 1000;
const RETRY_MISS = 7 * 24 * 60 * 60 * 1000;   // 못 찾은 위치는 일주일 뒤에 다시 찾아 본다
const lotKey = () => `paLots_${region.value?.bCode10 ?? ''}`;
// 조회 뒤 위치 · 공시가 · 엘베를 받는 동안 — 값이 0.5초마다 조금씩 바뀐다. 이때는 저장 · 표 칸 재기를 쉬고, 끝나면 한 번만 한다
// (예전에는 받을 때마다 물건을 서버에 다시 쓰고 표 칸을 다시 재서 — 통신이 계속 오가고 칸이 줄었다 늘었다 했다)
const enriching = ref(false);
const enrich = async (id: number) => {
  enriching.value = true;
  try { await enrichNow(id); } finally { if (id === runId) enriching.value = false; }
};
const enrichNow = async (id: number) => {
  const r = region.value;
  if (!r) return;
  // 저장해 둔 값은 길어야 1.5초만 기다린다 — 브라우저 저장소가 늦어도 조회는 이어 간다
  const cacheP = Promise.race([browserCacheGet<LotCache>(lotKey(), LOT_TTL), new Promise<null>((ok) => { window.setTimeout(() => ok(null), 1500); })]);
  const cache = await cacheP;
  if (id !== runId) return;
  // 선정물건 건물(같은 지번)의 공시가 · 엘베를 맨 먼저 — 예전엔 주변 지번 위치를 다 찾은 뒤에 받아, F5 하면 한참 '조회 중' · 엘베 '-'이고 엘베 조건도 안 걸렸다(2026-11-11 사용자)
  const myLot = lot.value; const myUmd = region.value?.dong ?? '';
  if (myLot) void (async () => {
    const cu = cache?.units?.[myLot]; const ce = cache?.elevs?.[myLot];
    const [u, e] = await Promise.all([
      cu && cu.length ? Promise.resolve(cu) : r.bCode10 ? fetchApartUnits(r.bCode10, myLot).catch(() => [] as ApartUnit[]) : Promise.resolve([] as ApartUnit[]),
      ce !== undefined ? Promise.resolve(ce) : getBuildingFacts(lotAddr(myUmd, myLot)).then((f) => (f ? f.elevator : null)).catch(() => null),
    ]);
    if (id !== runId) return;
    units.value = { ...units.value, [myLot]: u }; elevs.value = { ...elevs.value, [myLot]: e };
  })();
  if (!mySpot.value) mySpot.value = await geocodeAddress(props.auction.address).catch(() => null);   // 보통은 run 이 먼저 찾아 둔다
  if (id !== runId) return;
  const retryMiss = !cache || Date.now() - cache.at > RETRY_MISS;
  const hitSpots = Object.fromEntries(Object.entries(cache?.spots ?? {}).filter(([, v]) => v || !retryMiss));
  // 한꺼번에 넣는다 — 하나씩 넣으면 넣을 때마다 표 · 지도를 다시 그려 버벅인다
  spots.value = { ...hitSpots, ...spots.value };
  elevs.value = { ...(cache?.elevs ?? {}), ...elevs.value };
  // 공시가 호실 — 빈 목록(예전에 받다 실패한 것)은 저장값을 쓰지 않고 다시 받는다. 큰 단지(1,500세대)에서 한 번 실패하면 '공시가 없음'이 계속 남았다(2026-11-11)
  units.value = { ...Object.fromEntries(Object.entries(cache?.units ?? {}).filter(([, v]) => v && v.length)), ...units.value };
  const lots = [...new Map(periodRows.value.filter((x) => x.jibun).map((x) => [x.jibun, x.umdNm])).entries()];
  // 새로 받은 값은 모았다가 0.5초마다 한 번에 넣는다
  const got = { spots: {} as Record<string, Spot>, elevs: {} as Record<string, number | null>, units: {} as Record<string, ApartUnit[]>, done: 0 };
  let flushTimer = 0;
  const flush = () => {
    window.clearTimeout(flushTimer); flushTimer = 0;
    if (id !== runId) return;
    if (Object.keys(got.spots).length) { spots.value = { ...spots.value, ...got.spots }; got.spots = {}; }
    if (Object.keys(got.elevs).length) { elevs.value = { ...elevs.value, ...got.elevs }; got.elevs = {}; }
    if (Object.keys(got.units).length) { units.value = { ...units.value, ...got.units }; got.units = {}; }
    progress.value = { ...progress.value, done: Math.min(progress.value.total, progress.value.done + got.done) }; got.done = 0;
  };
  const soon = () => { if (!flushTimer) flushTimer = window.setTimeout(flush, 500); };
  const missing = lots.filter(([j]) => !(j in spots.value));
  progress.value = { done: 0, total: missing.length };
  await limit(missing, 8, async ([j, umd]) => {
    const p = await geocodeAddress(lotAddr(umd, j), { quick: true }).catch(() => null);
    got.spots[j] = p ? { lat: p.lat, lng: p.lng } : null; got.done += 1; soon();
  }, id);
  flush();
  if (id !== runId) return;
  progress.value = { done: 0, total: 0 };
  // 위치는 다 받은 즉시 한 번 남긴다 — 공시가 · 엘베를 받다가 화면을 떠나도 다음엔 위치를 처음부터 다시 찾지 않게
  if (missing.length) void browserCachePut(lotKey(), { at: Date.now(), spots: spots.value, elevs: elevs.value, units: units.value } satisfies LotCache);
  // 공시가 · 엘베는 가장 넓은 반경(1km) 안 지번만 — 브이월드 · 건축물대장 한도를 아낀다
  const near = lots.filter(([j]) => (squash(j) === squash(lot.value) || (distOf(j) ?? Infinity) <= RADII[RADII.length - 1])
    && (!(j in units.value) || !(j in elevs.value)));
  await limit(near, 4, async ([j, umd]) => {
    if (!(j in units.value) && r.bCode10) got.units[j] = await fetchApartUnits(r.bCode10, j).catch(() => []);
    if (!(j in elevs.value)) { const f = await getBuildingFacts(lotAddr(umd, j)); got.elevs[j] = f ? f.elevator : null; }
    soon();
  }, id);
  flush();
  if (id !== runId) return;
  if (missing.length || near.length || !cache) {
    void browserCachePut(lotKey(), { at: missing.length || !cache ? Date.now() : cache.at, spots: spots.value, elevs: elevs.value, units: units.value } satisfies LotCache);
  }
};
const distOf = (jibun: string): number | null => {
  if (squash(jibun) === squash(lot.value)) return 0;
  const p = spots.value[jibun]; const m = mySpot.value;
  return p && m ? distM(m, p) : null;
};

// ===== 줄 — 기간 안 이 동 거래에 거리 · 공시가 · 호수 · 엘베를 붙인다 =====
const periodRows = computed<CaseTradeRow[]>(() => {
  const w = tradeWindowOf(Date.now(), loadedMonths.value);
  const from = `${w.start.getFullYear()}${String(w.start.getMonth() + 1).padStart(2, '0')}${String(w.start.getDate()).padStart(2, '0')}`;
  return (res.value?.dongRows ?? []).filter((r) => r.price > 0 && groupOf(r.kind) && r.contractDate.replace(/\D/g, '') >= from);
});
const allRows = computed<PriceRow[]>(() => periodRows.value.map((r, i) => {
  const group = groupOf(r.kind)!;
  const floorNo = floorNum(r.floor);
  const u = matchUnit(units.value[r.jibun] ?? [], r.areaM2, floorNo, r.dong);
  const py = r.areaM2 / PY;
  return {
    ...r, id: `${i}|${r.contractDate}|${r.jibun}|${r.price}`, group, floorNo, ...u,
    dist: distOf(r.jibun), same: !!r.jibun && squash(r.jibun) === squash(lot.value),
    elev: r.jibun in elevs.value ? elevs.value[r.jibun] : undefined,
    perPy: py > 0 ? (group === '월세' ? (r.monthly ?? 0) : r.price) / py : 0,
  };
}));
/* 웹 — 엘베 전체 · 있음 · 없음. 유사도 · 직접범위 어느 쪽이든 같이 건다. 엘베를 아직 모르는 거래 · 같은 건물 거래는 거르지 않는다 */
const elevPick = ref<'yes' | 'no' | null>(sv?.elev ?? null);
const cond = computed<PriceCond>(() => {
  // 층 단추는 '전체'(null) · '같은 층'(0) 둘뿐 — 직접범위에서 예전에 저장된 '±1층'(유사도에서 옮겨 온 값)은 '전체'로 본다.
  // 화면엔 '전체'로 보이는데 ±1층이 숨어 걸려, 23층 아파트에서 다른 단지(15층 이하)가 다 빠졌다(2026-11-10)
  const rangeFloor = rangeCond.value.floor === 0 ? 0 : null;
  // 동만(기준 물건 없음) — 비운 칸은 제한 없음
  if (props.dongOnly) { const rc = rangeCond.value; const b: PriceCond = { mMin: rc.mMin || 0, mMax: rc.mMax || 9999, yMin: rc.yMin || 0, yMax: rc.yMax || 9999, floor: null }; return elevPick.value ? { ...b, elev: elevPick.value } : b; }
  let base = simMode.value === 'sim' ? simCond(sim.value, me.value) : { ...rangeCond.value, floor: rangeFloor };
  // 웹 — 층은 위 줄에 있어 유사도에서도 고른다: 화면에 보이는 대로 '전체'면 모든 층, '같은 층'이면 같은 층만
  if (webEmbed && simMode.value === 'sim') base = { ...base, floor: rangeFloor };
  return elevPick.value ? { ...base, elev: elevPick.value } : base;
});
const candidates = computed(() => {
  const raw = radius.value === DONG
    ? allRows.value.filter((r) => r.same || matchCond(r, cond.value, me.value.floor)).sort((a, b) => (Number(b.same) - Number(a.same)) || ((a.dist ?? 0) - (b.dist ?? 0)) || b.contractDate.localeCompare(a.contractDate))
    : inRange(allRows.value, radius.value, cond.value, me.value.floor);
  // 웹 — 같은 건물(같은 지번) 거래에도 면적 · 건축 조건을 건다. 아파트는 한 지번에 여러 평형이 있어, 면적을 좁혀도 같은 단지 다른 평형이 그대로 남았다(2026-11-11 사용자)
  const c = cond.value;
  // 엘베도 같은 건물에 건다(엘베 '없음'인데 같은 단지 거래가 남았다) — 엘베를 아직 모르는 건물은 거르지 않는다
  const elevOk = (r: PriceRow) => !c.elev || r.elev == null || (c.elev === 'yes' ? r.elev > 0 : r.elev === 0);
  const list = webEmbed ? raw.filter((r) => !r.same || (elevOk(r) && areaIn(r.areaM2, c) && (!(r.buildYear ?? 0) || ((r.buildYear ?? 0) >= c.yMin && (r.buildYear ?? 0) <= c.yMax)))) : raw;
  // 웹 — '같은 층'이면 같은 건물 거래에도 층을 건다. 같은 건물은 늘 넣는 규칙이 앞서 5층 · 3층이 섞여 층이 안 먹는 것처럼 보였다(2026-11-08)
  if (!webEmbed || rangeCond.value.floor !== 0 || !me.value.floor) return list;
  return list.filter((r) => !r.same || !r.floorNo || r.floorNo === me.value.floor);
});
/** 층별(동만) — 1~4층 · 5 = 5층이상, 비우면 전체 */
const floorLv = ref<number | null>(null);
const candLv = computed(() => (props.dongOnly && floorLv.value ? candidates.value.filter((r) => (floorLv.value === 5 ? r.floorNo >= 5 : r.floorNo === floorLv.value)) : candidates.value));
const kindRows = computed(() => candLv.value.filter((r) => r.group === kindF.value));
const kindCount = (k: Kind) => candLv.value.filter((r) => r.group === k).length;
/** 동만 — 매매 평균 평당가(제외한 줄은 빼고) */
const dongPy = computed(() => { const xs = candLv.value.filter((r) => r.group === '매매' && !isOff(r) && r.perPy > 0).map((r) => r.perPy); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; });

// ===== 머리글 ▾ 값 거르기(지금 표들과 같은 창) · 머리글 글자 = 정렬 =====
const gapText = (r: PriceRow) => (r.pub ? (r.price - r.pub * HUG_RATE < 0 ? '갭 마이너스' : '갭 있음') : '공시가 없음');
const elevText = (r: PriceRow) => (r.elev === undefined ? '조회 중' : r.elev === null ? '-' : r.elev > 0 ? `${r.elev}대있음` : '없음');
// 아파트 동(653동)도 — 같은 단지 안에서 어느 동 거래인지 보이게(2026-11-11 사용자). 국토부가 동을 안 준 거래는 비운다
const addrOf = (r: PriceRow) => [r.umdNm, r.jibun, r.name, hoCand(r)].filter(Boolean).join(' ');   // 앱 · 웹 같게 — 확정 호, 아니면 후보 '401·402호 중'
/** 표에 보이는 주소 — 선정물건과 같은 읍면동이면 동 이름을 빼 짧게(말풍선 · 정렬은 전체 주소) */
const addrShort = (r: PriceRow) => { const a = addrOf(r); const d = region.value?.dong; return d && r.umdNm === d ? a.replace(new RegExp(`^${d}\\s+`), '') : a; };
const COLS: Array<ColumnDef<PriceRow>> = [
  { key: 'date', label: '계약일', text: (r) => r.contractDate, order: (r) => Number(r.contractDate.replace(/\D/g, '')) },
  { key: 'won', label: '실거래가', text: (r) => eok(r.price), order: (r) => r.price },
  { key: 'perPy', label: '평당가', text: (r) => man(r.perPy), order: (r) => r.perPy },
  { key: 'pub', label: '공시가', text: (r) => (r.pub ? eok(r.pub) : '공시가 없음'), order: (r) => r.pub },
  { key: 'gap', label: '갭', text: gapText },
  { key: 'area', label: '전용', text: (r) => `${Math.round(r.areaM2)}㎡대`, order: (r) => r.areaM2 },
  { key: 'elev', label: '엘베', text: elevText },
  { key: 'year', label: '건축', text: (r) => (r.buildYear ? `${r.buildYear}년` : '-'), order: (r) => r.buildYear ?? 0 },
  { key: 'dist', label: '거리', text: (r) => `${Math.floor((r.dist ?? 0) / 100) * 100}m대`, order: (r) => -(r.dist ?? 0) },
  { key: 'floor', label: '층', text: (r) => `${r.floorNo}층`, order: (r) => r.floorNo },
  { key: 'name', label: '주소', text: (r) => r.name || r.jibun },
];
const colFilter = useColumnFilters<PriceRow>(kindRows, COLS);
if (sv?.keep) colFilter.picked.value = { ...colFilter.picked.value, ...sv.keep };
// 웹 — 머리글 ▾ 거르기 대신 줄마다 '제외' 체크(처음엔 비어 있다 · 체크하면 실거래가 예상 · 평균 · 건수에서 빠지고 표엔 흐리게 남는다) · 머리글은 오름 · 내림 정렬(2026-11-05). 앱은 그대로
const webEmbed = inject<boolean>('webEmbed', false) || !!props.app;
/** 시장분석 › 시세예측 빌라(웹) — 시안 v7(2026-11-29 사용자, docs/시세예측-v7-대조표.md). 손품조사 · 아파트 · 오피스텔 · 앱은 그대로 */
const mkV = computed(() => !!props.loose && webEmbed && !props.app && props.kind === 'villa');
// ===== 낙찰(운영 전용) — 시세예측 빌라에서 운영진만. 낙찰 자료(saleData)를 그 동만 골라 실거래와 호수로 잇는다 =====
const authS = useAuthStore();
const aucOn = computed(() => mkV.value && isAdminEmail(authS.email));
const aucRaw = shallowRef<AucRec[]>([]);
const aucSido = computed(() => { const r = region.value; if (!r) return ''; return REGION_GROUPS.find((g) => g.districts.some((d) => d.lawdCode === r.lawdCd5))?.sido ?? r.sido ?? ''; });
watch([aucOn, () => region.value?.dong], async ([on, d]) => {
  if (!on || !d) { aucRaw.value = []; return; }
  const list = await auctionsOfDong(aucSido.value, d as string).catch(() => [] as AucRec[]);
  if (region.value?.dong !== d) return;
  aucRaw.value = list;
  // 낙찰 지번 — 위치(지도) · 호실 목록(호수 잇기) · 엘베(표)를 실거래와 같은 길로 받는다
  const r = region.value; const id = runId;
  const lots = [...new Set(list.map((a) => a.lot).filter(Boolean))];
  await limit(lots, 6, async (j) => {
    const [p, u, e] = await Promise.all([
      j in spots.value ? Promise.resolve(undefined) : geocodeAddress(lotAddr(d as string, j), { quick: true }).catch(() => null),
      j in units.value || !r?.bCode10 ? Promise.resolve(undefined) : fetchApartUnits(r.bCode10, j).catch(() => [] as ApartUnit[]),
      j in elevs.value ? Promise.resolve(undefined) : getBuildingFacts(lotAddr(d as string, j)).then((f) => (f ? f.elevator : null)).catch(() => null),
    ]);
    if (p !== undefined) spots.value = { ...spots.value, [j]: p ? { lat: p.lat, lng: p.lng } : null };
    if (u !== undefined) units.value = { ...units.value, [j]: u };
    if (e !== undefined) elevs.value = { ...elevs.value, [j]: e };
  }, id);
}, { immediate: true });
/** 낙찰 뒤 거래 — 같은 지번 · 낙찰일 뒤 실거래(매매 먼저, 없으면 전세) 가운데 호수가 낙찰 호수와 같은 것. 실거래 호수는 공동주택가격 호실 목록으로(같은 층 · 같은 전용) */
type AucAfter = { k: 'sell' | 'rent'; r: PriceRow; est: boolean; cand: string };
const hoHit = (text: string, ho: string) => !!ho && new RegExp(`(^|[^\\d])${ho}(?!\\d)`).test(text.replace(/[0-9A-Za-z]+동\s/g, ' '));
const aucAfter = computed(() => {
  const out = new Map<number, AucAfter>();
  aucRaw.value.forEach((a) => {
    if (!a.lot || !a.ho) return;
    const later = allRows.value.filter((r) => r.jibun === a.lot && (r.group === '매매' || r.group === '전세') && r.contractDate.replace(/\D/g, '') > a.ymd)
      .sort((x, y) => x.contractDate.localeCompare(y.contractDate));
    for (const k of ['매매', '전세'] as const) {
      const hit = later.filter((r) => r.group === k).map((r) => ({ r, u: unitOfRow(r) })).find((x) => x.u.text && hoHit(x.u.text, a.ho));
      if (hit) { out.set(a.i, { k: k === '매매' ? 'sell' : 'rent', r: hit.r, est: hit.u.est, cand: hit.u.est ? hit.u.text : '' }); return; }
    }
  });
  return out;
});
/** 실거래 줄 → 그 집 낙찰(낙찰 후 매도인 매매 줄만) */
const resaleOf = computed(() => { const m = new Map<string, AucRec>(); aucRaw.value.forEach((a) => { const x = aucAfter.value.get(a.i); if (x?.k === 'sell') m.set(rowKey(x.r), a); }); return m; });
/** 지도 · 범례 — 고른 기간 · 반경 안 낙찰 중 매도가 안 된 것(전세 · 거래 없음) */
const aucUnsold = computed(() => {
  if (!aucOn.value) return [] as AucRec[];
  const w = tradeWindowOf(Date.now(), loadedMonths.value); const from = `${w.start.getFullYear()}${String(w.start.getMonth() + 1).padStart(2, '0')}${String(w.start.getDate()).padStart(2, '0')}`;
  const m = mySpot.value;
  return aucRaw.value.filter((a) => a.ymd >= from && aucAfter.value.get(a.i)?.k !== 'sell' && spots.value[a.lot] && (radius.value === -1 || !m || distM(m, spots.value[a.lot]!) <= radius.value));
});
// ===== 낙찰사례 탭 — 고른 범위 · 기간 · 필터의 낙찰 =====
const aucRes = ref<'낙찰결과' | '실거래포함'>('낙찰결과');
const aucYears = computed(() => [...new Set(aucRaw.value.map((a) => a.ymd.slice(0, 4)))].sort().slice(-3).map((y) => `${y}년`));
const aucYear = ref('');
watch([isDongA, aucYears], () => { if (!aucYears.value.includes(aucYear.value)) aucYear.value = aucYears.value[aucYears.value.length - 1] ?? ''; }, { immediate: true });
function isDongA() { return radius.value === -1; }
const fromOf = (mo: number) => { const w = tradeWindowOf(Date.now(), mo); return `${w.start.getFullYear()}${String(w.start.getMonth() + 1).padStart(2, '0')}${String(w.start.getDate()).padStart(2, '0')}`; };
const aucRows = computed(() => {
  if (!props.aucTab || !aucOn.value) return [] as AucRec[];
  const m = mySpot.value; const c = cond.value; const dongAll = radius.value === -1; const from = fromOf(loadedMonths.value);
  return aucRaw.value.filter((a) => {
    if (dongAll ? (aucYear.value && !a.ymd.startsWith(aucYear.value.slice(0, 4))) : a.ymd < from) return false;
    if (!dongAll) { const p = spots.value[a.lot]; if (!p || !m || distM(m, p) > radius.value) return false; }
    if (a.area && !areaIn(a.area, c)) return false;
    if (a.year && (a.year < c.yMin || a.year > c.yMax)) return false;
    const ev = elevs.value[a.lot]; if (c.elev && ev != null && (c.elev === 'yes' ? !(ev > 0) : ev !== 0)) return false;
    if (props.dongOnly) { if (floorLv.value && !(floorLv.value === 5 ? a.floor >= 5 : a.floor === floorLv.value)) return false; } else if (rangeCond.value.floor === 0 && me.value.floor && a.floor && a.floor !== me.value.floor) return false;
    return true;
  });
});
const monthsBetween = (ymd: string, date: string) => { const a = new Date(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`); const d = date.replace(/\D/g, ''); const b = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`); return Math.max(0, Math.round((b.getTime() - a.getTime()) / 2.63e9)); };
const aucStat = computed(() => {
  const rs = aucRows.value; const rates = rs.map((a) => a.rate).filter((x) => x > 0).sort((a, b) => a - b);
  const sold = rs.map((a) => ({ a, x: aucAfter.value.get(a.i) })).filter((z) => z.x?.k === 'sell') as Array<{ a: AucRec; x: AucAfter }>;
  const mid = rates.length ? (rates.length % 2 ? rates[(rates.length - 1) / 2] : (rates[rates.length / 2 - 1] + rates[rates.length / 2]) / 2) : 0;
  return {
    n: rs.length, avg: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0, mid,
    bids: rs.length ? rs.reduce((a, b) => a + b.bids, 0) / rs.length : 0, fail: rs.filter((a) => a.fails > 0).length,
    sold: sold.length, soldMo: sold.length ? sold.reduce((t, z) => t + monthsBetween(z.a.ymd, z.x.r.contractDate), 0) / sold.length : 0,
    soldGain: sold.length ? sold.reduce((t, z) => t + (z.x.r.price / z.a.pr - 1) * 100, 0) / sold.length : 0,
  };
});
const aucMore = ref(false);
const aucList = computed(() => (aucMore.value ? aucRows.value : aucRows.value.slice(0, MORE_AT)));
const aucExtra = computed(() => [...(radius.value === -1 ? [{ key: 'year', label: '기간', opts: aucYears.value, value: aucYear.value }] : []), { key: 'res', label: '결과', opts: ['낙찰결과', '실거래포함'] as const, value: aucRes.value }]);
const onExtra = (k: string, v: string) => { if (k === 'year') aucYear.value = v; else if (k === 'res') aucRes.value = v as '낙찰결과' | '실거래포함'; };
const pickAuc = (a: AucRec) => { popFromMap = false; focus.value = ''; meOpen.value = false; focusAuc.value = focusAuc.value === a.i ? null : a.i; };
const unOff = ref(false);
const soldOff = ref(false);
const rentOff = ref(false);
const focusAuc = ref<number | null>(null);
const shownCols = COLS;
/** 선정물건 호 — 주소의 '402호' */
/** 선정물건 동 — 주소의 '101동 23층2301호'에서 101(동 이름에 한글 읍면동은 뺀다) */
const myDong = computed(() => { const m = String(props.auction?.address ?? '').match(/([0-9A-Za-z]+)동\s*(?:제?\d+층\s*)?\d{2,5}\s*호/); return m ? m[1] : ''; });
const myHo = computed(() => { const m = String(props.auction?.address ?? '').match(/(?:^|\s|층|동)(\d{2,5})\s*호/); return m ? `${m[1]}호` : '-'; });
/** 앱 손품조사 탭이 띄운 웹 시세분석 — 지도만 뺀다(2026-11-12 사용자 '앱에서는 지도 기능만 없이') */
const sonApp = inject<boolean>('sonApp', false);
/** 줄 열쇠 — 다시 불러와도 같은 줄이 같은 열쇠(순번 id 는 불러올 때마다 바뀐다) */
const rowKey = (r: PriceRow) => [r.group, r.contractDate, r.jibun, r.price, r.floorNo, Math.round(r.areaM2 * 100)].join('|');
const dropped = ref<string[]>(Array.isArray(sv?.drop) ? [...sv.drop] : []);
/** 손품결론 '유사물건 실거래가' — 다른 건물 매매 줄을 누르면 그 거래, 다시 누르면 뺀다(아파트 · 빌라, 2026-11-15 사용자).
 *  거르기를 바꿔 표에서 사라져도 고른 거래는 남긴다(사용자가 고른 값) */
const simPick = ref<string>(sv?.simPick ?? '');
const simPickable = (r: PriceRow) => webEmbed && !r.same && r.group === '매매';
/** 손품결론 '경매지번 실거래가' — 같은 건물(경매지번) 매매 줄을 사용자가 직접 고른다. 자동으로 고르지 않는다(2026-11-15 사용자) */
const casePick = ref<string>(sv?.casePick ?? '');
const casePickable = (r: PriceRow) => webEmbed && isAptKind && !!r.same && r.group === '매매';   // 아파트만 — 빌라는 자동(2026-11-15 사용자 '일단 아파트만')
/** 호 짝짓기 — 선정물건 등기부의 소유권이전 접수일(PDF 갑구)과 실거래 등기일자가 같고 같은 지번이면 선정물건의 호. 그 밖은 '모름' */
const ymdOf = (s: string) => { const m = String(s ?? '').match(/(\d{2,4})[.\-/](\d{1,2})[.\-/](\d{1,2})/); if (!m) return ''; const y = m[1].length === 2 ? `20${m[1]}` : m[1]; return `${y}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`; };
const myOwnDates = computed(() => new Set((props.auction?.registryRows ?? []).filter((x) => /소유권이전/.test(x.kind)).map((x) => ymdOf(x.date)).filter(Boolean)));
/** 호 — ① 그 지번 호실 목록(공동주택가격 · 호마다 전용)에서 같은 층 · 같은 전용(±0.05㎡)이 하나뿐이면 그 호(동까지)
 *  ② 둘 이상이면 후보 '401 · 402호 중' ③ 선정물건 등기부 소유권이전 접수일 = 실거래 등기일자면 선정물건 호 ④ 그 밖은 '모름'(2026-11-14 사용자) */
/** 주소 끝에 붙일 호 후보 — 같은 층 · 같은 전용(±0.05㎡) 호가 둘 ~ 넷이면 '401·402호 중'(하나면 위 r.ho 가 이미 확정), 등기 짝이 맞으면 선정물건 호 */
/** 거래 한 건의 동 · 호 — 등기 짝이 맞으면 선정물건 동 · 호, 아니면 호실 목록에서(동까지, 여럿이면 '중 추정', 2026-11-15 사용자) */
function unitOfRow(r: { jibun: string; areaM2: number; floor?: string; floorNo?: number; dong?: string; rgstDate?: string }) {
  if (r.rgstDate && r.jibun && r.jibun === lot.value && myOwnDates.value.has(ymdOf(r.rgstDate)) && myHo.value !== '-') return { text: [myDong.value ? `${myDong.value}동` : '', myHo.value].filter(Boolean).join(' '), dong: myDong.value, est: false };
  return unitLabelOf(units.value[r.jibun] ?? [], r.areaM2, r.floorNo ?? floorNum(r.floor ?? ''), r.dong);
}
function hoCand(r: PriceRow): string { return unitOfRow(r).text; }
const isOff = (r: PriceRow) => webEmbed && dropped.value.includes(rowKey(r));
/** 앱 표 주소 말풍선 — 누른 칸 바로 아래(화면 밖으로 나가지 않게), 다시 누르거나 밖을 누르거나 스크롤하면 닫는다 */
const addrTip = ref<{ text: string; style: Record<string, string> } | null>(null);
const openAddrTip = (e: MouseEvent, text: string) => {
  if (addrTip.value?.text === text) { addrTip.value = null; return; }
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const w = Math.min(280, window.innerWidth - 24);
  const left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
  addrTip.value = { text, style: { top: `${Math.round(r.bottom + 6)}px`, left: `${Math.round(left)}px`, maxWidth: `${w}px` } };
};
const closeAddrTip = () => { addrTip.value = null; };
if (typeof window !== 'undefined') {
  window.addEventListener('scroll', closeAddrTip, { passive: true, capture: true });
  window.addEventListener('click', closeAddrTip);
  onBeforeUnmount(() => { window.removeEventListener('scroll', closeAddrTip, { capture: true }); window.removeEventListener('click', closeAddrTip); });
}
const toggleDrop = (r: PriceRow) => { const k = rowKey(r); dropped.value = dropped.value.includes(k) ? dropped.value.filter((x) => x !== k) : [...dropped.value, k]; };
const passKeep = (r: PriceRow) => (webEmbed ? !isOff(r) : COLS.every((c) => { const k = colFilter.picked.value[c.key] ?? []; return !k.length || k.includes(c.text(r)); }));
const keptNames = computed(() => COLS.filter((c) => colFilter.isActive(c.key)).map((c) => c.label));
const sortK = ref('');
const sortDir = ref<'desc' | 'asc'>('desc');
const SORT_VAL: Record<string, (r: PriceRow) => number | string> = {
  date: (r) => r.contractDate, won: (r) => r.price, perPy: (r) => r.perPy, pub: (r) => r.pub, gap: (r) => (r.pub ? r.price - r.pub * HUG_RATE : -Infinity),
  area: (r) => r.areaM2, elev: (r) => r.elev ?? -1, year: (r) => r.buildYear ?? 0, dist: (r) => r.dist ?? 0, floor: (r) => r.floorNo, name: (r) => r.name,
};
// 늘 높은 값이 위로, 다시 누르면 원래 순서
/** 두 줄 머리 — 아파트 면적(공급(전용)) · 웹 공시가(매매가율) */
const hk2 = (k: string) => (k === 'area' && isAptKind) || (k === 'pub' && webEmbed) || (k === 'year' && mkV.value) || (k === 'won' && aucOn.value);
const sortBy = (k: string) => {
  // 웹 — 같은 머리글을 다시 누르면 내림 ↔ 오름
  if (webEmbed) { if (sortK.value === k) sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc'; else { sortK.value = k; sortDir.value = 'desc'; } return; }
  sortK.value = sortK.value === k ? '' : k;
};
const shownRows = computed(() => {
  const list = webEmbed ? kindRows.value : colFilter.rows.value;
  const f = SORT_VAL[sortK.value];
  const dir = webEmbed && sortDir.value === 'asc' ? -1 : 1;
  // 기본 순서 — 같은 건물 → 임장 순서(지도 번호) → 최근 거래
  if (!f) return [...list].sort((a, b) => (Number(b.same) - Number(a.same)) || ((orderOf.value[a.jibun] ?? 999) - (orderOf.value[b.jibun] ?? 999)) || b.contractDate.localeCompare(a.contractDate));
  return [...list].sort((a, b) => { const x = f(a); const y = f(b); return dir * (typeof x === 'string' ? String(y).localeCompare(x) : (y as number) - x); });
});
const MORE_AT = 10;
const showAll = ref(false);
// 엘베로 거를 때 — 건물마다 엘베를 0.5초마다 조금씩 받아 와, 받는 대로 줄이 빠졌다 들어왔다 하며 표가 계속 흔들렸다(2026-11-12 사용자 '엘베 없음 누르면 흔들리기 시작').
// 받는 동안엔 바로 전 표를 그대로 두고, 다 받으면 한 번에 바꾼다
const stableRows = shallowRef<PriceRow[]>([]);
const liveRows = computed(() => (showAll.value ? shownRows.value : shownRows.value.slice(0, MORE_AT)));
// 엘베를 바꾼 직후부터 붙잡는다 — 받기가 조금 뒤에 시작돼 첫 번째 바뀜이 새어 나갔다. 받기가 끝나면(1초 안에 시작도 안 하면) 놓는다
const elevHold = ref(false);
let elevHoldT = 0;
watch(elevPick, () => { if (!webEmbed) return; elevHold.value = true; window.clearTimeout(elevHoldT); elevHoldT = window.setTimeout(() => { if (!enriching.value) elevHold.value = false; }, 1000); });
watch(enriching, (on) => { if (!on) elevHold.value = false; });
const holding = computed(() => webEmbed && !!elevPick.value && (enriching.value || elevHold.value) && stableRows.value.length > 0);
watch([liveRows, holding], () => { if (!holding.value) stableRows.value = liveRows.value; }, { immediate: true });
const listRows = computed(() => (holding.value ? stableRows.value : liveRows.value));
watch(() => (isAptKind ? [...new Set(listRows.value.filter((r) => !r.same && r.jibun).map((r) => `${r.umdNm}|${r.jibun}`))].join(',') : ''), async (k) => {
  for (const key of k ? k.split(',') : []) {
    if (areasAsked.has(key)) continue;
    areasAsked.add(key);
    const [umd, j] = key.split('|');
    const v = await getComplexAreas(lotAddr(umd, j)).catch(() => null);
    otherAreas.value = { ...otherAreas.value, [key]: v };
  }
}, { immediate: true });

// ===== 결론 — 매매 · 전세(값 거르기까지 건 줄) =====
const saleRows = computed(() => candidates.value.filter((r) => r.group === '매매' && passKeep(r)));
const jeonseRows = computed(() => candidates.value.filter((r) => r.group === '전세' && passKeep(r)));
const stats = computed(() => estStats(saleRows.value, myPy.value));
/** 같은 건물 · 다른 건물 평균(① 매도가 예상과 같은 리스트를 둘로) */
const splitAvg = computed(() => ({ c: estStats(saleRows.value.filter((r) => r.same), myPy.value), o: estStats(saleRows.value.filter((r) => !r.same), myPy.value) }));
const jeonse = computed(() => jeonseEstimate(estStats(jeonseRows.value, myPy.value), curPub.value));
const hug = computed(() => curPub.value * HUG_RATE);
// 띠 · 표 맨 위 빨간 줄은 고른 거래(매매 · 전세 · 월세)를 따른다. 전세는 보증보험 한도까지, 월세는 평당 월세로 셈한다
const monthRows = computed(() => candidates.value.filter((r) => r.group === '월세' && passKeep(r)));
const view = computed(() => {
  if (kindF.value === '전세') {
    const raw = estStats(jeonseRows.value, myPy.value); const j = jeonse.value;
    return raw && j ? { ...raw, est: Math.round(j.est), capped: j.capped } : null;
  }
  if (kindF.value === '월세') { const m = estStats(monthRows.value, myPy.value); return m ? { ...m, capped: false } : null; }
  return stats.value ? { ...stats.value, capped: false } : null;
});
// 손품조사 웹 — 아래 '선정물건 호실 예상가'가 이 예상가 · 고른 거래를 기준가로 쓴다(2026-11-11 사용자 시안)
const sonPriceOut = inject<Ref<SonPriceOut | null> | null>('sonPriceOut', null);
/** 중간값 — 고른 거래를 평당가 순으로 세워 가운데(짝수면 가운데 두 건 평균) × 이 물건 전용 평(2026-11-12 사용자 '중간값 박스') */
const medOf = (rs: Array<{ perPy: number; name?: string; jibun: string }>) => {
  const srt = [...rs].filter((r) => r.perPy > 0).sort((a, b) => a.perPy - b.perPy);
  if (!srt.length || !(myPy.value > 0)) return {};
  const odd = srt.length % 2 === 1; const mid = srt[(srt.length - 1) >> 1];
  const medPy = odd ? mid.perPy : (srt[srt.length / 2 - 1].perPy + srt[srt.length / 2].perPy) / 2;
  return { med: Math.round(medPy * myPy.value / 1e4) * 1e4, medPy, medName: odd ? (mid.name || mid.jibun) : '', medPair: odd ? '' : [srt[srt.length / 2 - 1], srt[srt.length / 2]].map((r) => r.name || r.jibun).join(' · ') };
};
if (sonPriceOut) {
  watch([view, kindF, () => rangeCond.value.floor, cond], () => {
    const v = view.value;
    const rs = kindF.value === '전세' ? jeonseRows.value : kindF.value === '월세' ? monthRows.value : saleRows.value;
    sonPriceOut.value = v ? {
      kind: kindF.value, est: v.est, n: v.n, avgPy: v.avgPy, myPy: myPy.value, ...medOf(rs), sameFloor: rangeCond.value.floor === 0, other: rs.some((r) => !r.same),
      elevFiltered: !!cond.value.elev, yearFiltered: cond.value.yMin > 1980 || cond.value.yMax < new Date().getFullYear(),
      rows: rs.map((r) => ({ same: !!r.same, name: r.name || r.jibun, dong: r.dong, floorNo: r.floorNo, price: r.price, areaM2: r.areaM2, perPy: r.perPy, umd: r.umdNm, jibun: r.jibun })),
      ...(sonPriceOut.value?.picks ? { picks: sonPriceOut.value.picks } : {}),
    } : null;
  }, { immediate: true });
}
// 띠 첫 칸 ⓘ — 셈하는 법 · 계산 조건(예전 띠 아래 두 줄)
/* 웹 — '기준' ⓘ: 유사도와 직접범위가 어떻게 이어지는지(따로 움직이고, 직접범위는 들어갈 때 유사도 범위에서 시작) */
const modeTip: TipRow[] = [
  ['유사도', '면적 · 건축 · 층을 % 하나로 한꺼번에 정합니다'],
  ['직접범위', '누르는 순간의 유사도 범위에서 시작해, 면적 · 건축 막대로 더 좁히거나 넓힙니다'],
  ['따로 움직임', '직접범위 막대를 움직여도 유사도 %는 그대로이고, 유사도 %를 바꿔도 막대는 그대로입니다'],
  ['주의', '유사도로 돌아갔다가 다시 직접범위를 누르면 그때의 유사도 범위로 다시 시작합니다(손으로 맞춘 값이 바뀝니다)'],
];
/** 초록 칸 아래 계산식(웹) — '유사물건 실거래 평균 평당가 862만 × 16.68평'. 건수 · 반경 · 기간은 위 필터 설명 줄에(2026-11-15 사용자) */
const estFormula = computed(() => {
  const v = view.value; if (!v || !(v.avgPy > 0) || !(myPy.value > 0)) return '';
  const rs = kindF.value === '전세' ? jeonseRows.value : kindF.value === '월세' ? monthRows.value : saleRows.value;
  const allSame = rs.length > 0 && rs.every((r) => r.same);
  const who = allSame ? '경매지번' : mkV.value ? '유사 실거래' : '유사물건';
  const per = kindF.value === '월세' ? '평당 월세' : '평당가';
  return `${who} ${kindF.value} ${v.n > 1 ? `평균 ${per}` : per} ${vPy(v.avgPy)} × ${myPy.value.toFixed(2)}평`;
});
const estTip = computed<TipRow[]>(() => [
  ['공식', `${kindF.value} ${kindF.value === '월세' ? '평균 평당 월세' : '평균 평당가'} ${view.value ? vPy(view.value.avgPy) : '-'} × 이 물건 전용 ${myPy.value.toFixed(2)}평`],
  ['중간·최저·최고', `거래마다 ${myPy.value.toFixed(2)}평으로 바꾼 값`],
  ...(kindF.value === '전세' && curPub.value ? [['한도', `보증보험 한도 ${eok(hug.value)}를 넘으면 한도로`] as TipRow] : []),
  ['계산 조건', condText.value],
]);
const manW = (w: number) => `월 ${Math.round(w / 1e4).toLocaleString('ko-KR')}만`;
const vfmt = (w: number) => (kindF.value === '월세' ? manW(w) : eok(w));
/** ① 매도가 예상 — 아파트는 억이 아니라 원 단위 그대로(2026-11-15 사용자) */
const vEst = (w: number) => (isAptKind && kindF.value !== '월세' ? `${Math.round(w).toLocaleString('ko-KR')}원` : vfmt(w));
const vPy = (w: number) => (kindF.value === '월세' ? `${Math.round(w / 1e3) / 10}만/평` : man(w));
const pct = (a: number, b: number) => (a > 0 && b > 0 ? `${Math.round((a / b) * 100)}%` : '-');
const tolText = computed(() => (simMode.value === 'sim'
  ? `유사도 기준 ${sim.value}%(${webEmbed ? simDefText(sim.value).replace(/ · 층.*$/, '') : simDefText(sim.value)})`
  : `면적 ${cond.value.mMin}~${cond.value.mMax}㎡ · 건축 ${cond.value.yMin}~${cond.value.yMax}년${cond.value.floor === null ? '' : ' · 같은 층'}`));
const condText = computed(() => `${region.value?.dong ?? ''} · ${radius.value === -1 ? '전체' : `반경 ${radText(radius.value)}`} · ${tolText.value} · 최근 ${periodText(loadedMonths.value)}`);

// ===== 조건 줄 — 유사도 / 직접범위, 초기화(5초 되돌리기) =====
const setSimMode = (m: 'sim' | 'range') => {
  if (m === simMode.value) return;
  // 직접범위로 가면 지금 유사도 범위에서 시작
  if (m === 'range') rangeCond.value = { ...simCond(sim.value, me.value), floor: rangeCond.value.floor === 0 ? 0 : null };   // 고른 '같은 층'은 그대로
  simMode.value = m;
};
/** 웹 — 아래 거르기는 매매수요와 같은 '필터 기본 부품 세트'(SearchFilterBar, 2026-11-12 사용자). 기간은 위 조회기간이 맡아 부품에선 뺀다.
 *  부품 값 ↔ 이 화면 값(반경 · 거래 · 유사도/직접범위 · 면적 · 건축 · 층 · 엘베) — 누르면 바로 적용(받아 둔 실거래 안에서 거른다) */
const sfDraft = computed<SearchFilter>(() => ({
  range: radius.value, months: loadedMonths.value, kind: kindF.value, mode: simMode.value, sim: sim.value,
  area: props.dongOnly ? [rangeCond.value.mMin || null, rangeCond.value.mMax || null] : [rangeCond.value.mMin, rangeCond.value.mMax],
  year: props.dongOnly ? [rangeCond.value.yMin || null, rangeCond.value.yMax || null] : [rangeCond.value.yMin, rangeCond.value.yMax],
  floor: rangeCond.value.floor === 0 ? 'same' : null, elev: elevPick.value, floorLv: floorLv.value,
}));
const sfSet = (v: SearchFilter) => {
  radius.value = Number(v.range); kindF.value = v.kind; sim.value = v.sim; elevPick.value = v.elev;
  const c = rangeCond.value;
  if (props.dongOnly) { rangeCond.value = { mMin: v.area[0] ?? 0, mMax: v.area[1] ?? 0, yMin: v.year[0] ?? 0, yMax: v.year[1] ?? 0, floor: null }; floorLv.value = v.floorLv ?? null; radius.value = DONG; return; }
  rangeCond.value = { mMin: v.area[0] ?? c.mMin, mMax: v.area[1] ?? c.mMax, yMin: v.year[0] ?? c.yMin, yMax: v.year[1] ?? c.yMax, floor: v.floor === 'same' ? 0 : null };
  if (v.mode !== simMode.value) setSimMode(v.mode);   // 직접범위로 가면 유사도 범위에서 시작
};
const sfSimRange = (s: number) => { const c = simCond(s, me.value); return { area: [c.mMin, c.mMax] as [number, number], year: [c.yMin, c.yMax] as [number, number] }; };
/** 반경 '동전체' — 받아 둔 이 동 거래 전부(거리로 거르지 않는다). 시세예측 빌라만 */
const DONG = -1;
const isDong = computed(() => radius.value === DONG);
const sfRadii = computed(() => [...RADII.map((r) => [r, radText(r)] as const), ...(mkV.value ? [[DONG, '동전체'] as const] : [])]);
const AREA_MIN = 20; const AREA_MAX = 150;
const yearMax = new Date().getFullYear();
const YEAR_MIN = 1980;
const setRange = (k: keyof PriceCond, v: number, el?: HTMLInputElement) => {
  const c = { ...rangeCond.value, [k]: v };
  // 범위 규칙은 services/rangeClamp 한 곳(입지비교 · 매각분석과 같다) — 웹은 늘 내 물건(빨간 줄)을 품는다, 앱은 최소 ≤ 최대만
  const mv = k === 'mMin' || k === 'yMin' ? 'lo' : 'hi';
  if (k === 'mMin' || k === 'mMax') [c.mMin, c.mMax] = clampAroundBase(c.mMin, c.mMax, webEmbed ? me.value.areaM2 : 0, mv);
  if (k === 'yMin' || k === 'yMax') [c.yMin, c.yMax] = clampAroundBase(c.yMin, c.yMax, webEmbed ? me.value.year : 0, mv);
  rangeCond.value = c;
  if (el && el.value !== String(c[k])) el.value = String(c[k]);   // 막힌 자리로 동그라미도 되돌린다(값이 그대로면 화면이 다시 그려지지 않는다)
};
/** 직접범위 면적 글 — 정수는 그대로(84), 소수는 둘째 자리 버림(84.39) */
const areaTx = (v: number) => (Number.isInteger(v) ? String(v) : (Math.floor(v * 100 + 1e-6) / 100).toFixed(2));
const fillStyle = (lo: number, hi: number, min: number, max: number) => ({ left: `${((lo - min) / (max - min)) * 100}%`, right: `${100 - ((hi - min) / (max - min)) * 100}%` });
const baseLeft = (v: number, min: number, max: number) => `${Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))}%`;
/** 웹 직접범위 — 막대 위 숫자 셋은 빨간 줄 자리에 고정: 가운데 내 물건 값, 왼쪽 최소 · 오른쪽 최대. 동그라미를 움직이면 숫자만 바뀐다(2026-11-07) */

type Snap = { radius: number; kindF: Kind; simMode: 'sim' | 'range'; sim: number; rangeCond: PriceCond; keep: Record<string, string[]>; drop: string[]; elev: 'yes' | 'no' | null };
const snapNow = (): Snap => ({ radius: radius.value, kindF: kindF.value, simMode: simMode.value, sim: sim.value, rangeCond: { ...rangeCond.value }, keep: JSON.parse(JSON.stringify(colFilter.picked.value)), drop: [...dropped.value], elev: elevPick.value });
const restore = (s: Snap) => { radius.value = s.radius; kindF.value = s.kindF; simMode.value = s.simMode; sim.value = s.sim; rangeCond.value = s.rangeCond; colFilter.picked.value = s.keep; dropped.value = s.drop; elevPick.value = s.elev; };
const undoSnap = ref<Snap | null>(null);
let undoTimer = 0;
const reset = () => {
  window.clearTimeout(undoTimer);
  if (undoSnap.value) { restore(undoSnap.value); undoSnap.value = null; return; }
  undoSnap.value = snapNow();
  radius.value = 500; kindF.value = '매매'; simMode.value = 'sim'; sim.value = 80; colFilter.clearAll(); dropped.value = []; elevPick.value = null; sortK.value = '';
  undoTimer = window.setTimeout(() => { undoSnap.value = null; }, 5000);
};
const widen = (w: 'r' | 's' | 'p') => {
  if (w === 'r') { const next = RADII.find((v) => v > radius.value); if (next) radius.value = next; }
  else if (w === 's') { if (simMode.value === 'sim') sim.value = Math.max(60, sim.value - 10); else setSimMode('sim'); }
  else { const next = PERIODS.find((v) => v > loadedMonths.value); if (next) { months.value = next; void run(); } }
};

// ===== 저장 — 0.8초 뒤 물건 문서(marketPicks)에. 손품결론이 실거래가 예상을 읽는다 =====
const saving = ref(false);
const savedAt = ref(store.auctions.find((x) => x.id === props.auction.id)?.marketPicks?.savedAt ?? 0);
/** 빌라 경매지번 매매가 — 자동: 같은 건물 같은 평형 · 같은 층 → 가장 가까운 평형, 고른 기간에 없으면 2년 */
const caseSaleAuto = computed(() => {
  const kinds: Array<CaseTradeRow['kind']> = ['매매', '직거래'];
  return pickCaseTrade(sameRaw.value, kinds, me.value.areaM2, me.value.floor) ?? pickCaseTrade(sameRaw2y.value, kinds, me.value.areaM2, me.value.floor);
});
/** 아파트 경매지번 실거래가 — 사용자가 고른 같은 건물 매매 줄(거르기를 바꿔 표에서 사라져도 고른 거래는 남긴다) */
const casePickRow = computed(() => (casePick.value ? allRows.value.find((r) => rowKey(r) === casePick.value) ?? null : null));
const savedCase = store.auctions.find((x) => x.id === props.auction.id)?.marketPicks?.caseSale ?? null;
const savedSim = store.auctions.find((x) => x.id === props.auction.id)?.marketPicks?.simSale ?? null;
const toPick = (r: CaseTradeRow | null): MarketPickRow | null => (r ? {
  kind: r.kind, contractDate: r.contractDate, amount: r.amount, price: r.price, areaM2: r.areaM2, floor: r.floor,
  umdNm: r.umdNm, name: r.name, jibun: r.jibun, ...(r.buildYear ? { buildYear: r.buildYear } : {}),
} : null);
const body = computed((): Omit<MarketPicks, 'savedAt'> => {
  const s = stats.value; const j = jeonse.value;
  const pv: PriceView = {
    months: loadedMonths.value, radius: radius.value, kind: kindF.value, simMode: simMode.value, sim: sim.value, cond: { ...rangeCond.value },
    keep: Object.fromEntries(Object.entries(colFilter.picked.value).filter(([, v]) => v.length)), typedPub: typedPub.value,
    ...(dropped.value.length ? { drop: [...dropped.value] } : {}),
    ...(elevPick.value ? { elev: elevPick.value } : {}),
    ...(simPick.value ? { simPick: simPick.value } : {}),
    ...(casePick.value ? { casePick: casePick.value } : {}),
    estSale: s?.est ?? 0, estJeonse: Math.round(j?.est ?? 0), estPerPy: s?.avgPy ?? 0, estCount: s?.n ?? 0,
  };
  return {
    // 같은 건물 거래는 손품결론 「경매지번 실거래가」 자리 — 같은 평형 · 같은 층 → 같은 평형 → 가까운 평형
    caseSale: !isAptKind ? (caseSaleAuto.value ? { ...toPick(caseSaleAuto.value)!, unitText: unitOfRow(caseSaleAuto.value).text } : null)
      : casePickRow.value ? { ...toPick(casePickRow.value)!, unitText: unitOfRow(casePickRow.value).text } : (casePick.value ? savedCase : null),
    caseJeonse: toPick(pickCaseTrade(sameRaw.value, ['전세'], me.value.areaM2, me.value.floor)),
    caseManual: { sale: false, jeonse: false },
    simSale: simPick.value ? (toPick(allRows.value.find((r) => rowKey(r) === simPick.value) ?? null) ?? savedSim) : null, simJeonse: null,
    condSaleAvg: s?.est ?? 0, condSalePerPy: s?.avgPy ?? 0, condJeonseAvg: Math.round(j?.est ?? 0),
    // 평균에 든 매매를 같은 건물(경매지번) · 다른 건물(유사물건)로 나눈 평균 — 손품결론 두 줄(아파트, 2026-11-15 사용자)
    caseSaleAvg: splitAvg.value.c?.est ?? 0, caseSalePerPy: splitAvg.value.c?.avgPy ?? 0,
    simSaleAvg: splitAvg.value.o?.est ?? 0, simSalePerPy: splitAvg.value.o?.avgPy ?? 0,
    pubPrice: curPub.value, hugJeonse: Math.round(hug.value), price: pv,
  };
});
const stable = (v: unknown): string => (v && typeof v === 'object'
  ? (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : `{${Object.keys(v as object).sort().filter((k) => k !== 'savedAt' && (v as Record<string, unknown>)[k] !== undefined).map((k) => `${k}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`)
  : JSON.stringify(v));
let lastJson = (() => { const mp = store.auctions.find((x) => x.id === props.auction.id)?.marketPicks; return mp?.price ? stable(mp) : ''; })();
let saveTimer = 0;
// 사용자가 고른 값(기간 · 반경 · 거래 · 유사도 · 직접범위 · 값 거르기 · 공시가)만 — 이것이 바뀐 저장만 '최근 작성'에 남긴다.
// 자료가 새로 들어와 셈만 달라진 자동 저장은 조용히(silent) 적는다
const choicesOf = (v?: PriceView) => (v ? stable({ months: v.months, radius: v.radius, kind: v.kind, simMode: v.simMode, sim: v.sim, cond: v.cond, keep: v.keep, typedPub: v.typedPub, drop: v.drop ?? [], elev: v.elev ?? null, simPick: v.simPick ?? '', casePick: v.casePick ?? '' }) : '');
let lastChoices: string | null = (() => { const v = store.auctions.find((x) => x.id === props.auction.id)?.marketPicks?.price; return v ? choicesOf(v) : null; })();
/** manual — 저장 단추로 부르면 위치를 받는 중이어도 바로 적는다 */
const saveNow = async (manual?: unknown) => {
  window.clearTimeout(saveTimer);
  const a = store.auctions.find((x) => x.id === props.auction.id);
  if (!a || !res.value || (enriching.value && !manual)) return;
  const b = body.value; const json = stable(b);
  if (json === lastJson) return;
  saving.value = true;
  try {
    const at = Date.now();
    const choices = choicesOf(b.price);
    const picked = !!manual || (lastChoices !== null && choices !== lastChoices);
    lastChoices = choices;
    await store.saveAuction({ ...a, marketPicks: { ...b, savedAt: at } }, picked
      ? { where: '손품조사 › 시세분석', note: b.price?.estSale ? `실거래가 예상 ${eok(b.price.estSale)}` : '시세분석 저장' }
      : { silent: true });
    lastJson = json; savedJson.value = json; savedAt.value = at;
  } catch {
    /* 못 적으면 다음 바뀜 때 다시 */
  } finally {
    saving.value = false;
  }
};
// 내용이 실제로 바뀔 때만 0.8초 뒤 적는다 — 「저장 중」은 실제로 쓰는 동안만 뜬다
const bodyKey = computed(() => stable(body.value));
/* 웹 — 저절로 적지 않는다. 바꾼 뒤 '저장'을 눌러야 적는다(누르기 전 새로고침이면 사라진다). 앱은 그대로 0.8초 뒤 자동 */
const savedJson = ref(lastJson);
const webDirty = computed(() => webEmbed && !!res.value && bodyKey.value !== savedJson.value);
const saveSoon = () => {
  if (webEmbed) return;
  if (!res.value || loading.value || enriching.value || bodyKey.value === lastJson) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => { void saveNow(); }, 800);
};
watch(bodyKey, saveSoon);
// 고른 값은 저장하기 전에도 손품결론에 바로 — 저장은 마지막에 저장하기로(2026-11-15 사용자)
if (sonPriceOut) watch(bodyKey, () => {
  if (!sonPriceOut.value || !res.value) return;
  const b = body.value;
  sonPriceOut.value = { ...sonPriceOut.value, picks: { caseSale: b.caseSale, simSale: b.simSale, condSaleAvg: b.condSaleAvg, condSalePerPy: b.condSalePerPy, caseSaleAvg: b.caseSaleAvg, caseSalePerPy: b.caseSalePerPy, simSaleAvg: b.simSaleAvg, simSalePerPy: b.simSalePerPy, price: b.price } };
}, { immediate: true });
watch(enriching, (v) => { if (!v) saveSoon(); });

// ===== 지도 — 카카오맵(못 열면 브이월드) 위에 반경 원 · 선정물건 · 유사물건(지번마다 한 점) =====
const mapEl = ref<HTMLElement | null>(null);
const focus = ref('');
/** 지도 빨간 점(내 물건) 이름표를 펼쳤나 — 누를 때만 */
const meOpen = ref(false);
let mv: MapView | null = null;
/** 지도 테두리 — 'd:좌표' 읍면동 경계, 'p:좌표' 필지(null = 받는 중 · 없음) */
const shapes = shallowRef<Record<string, Array<{ lat: number; lng: number }> | null>>({});
let mvP: Promise<void> | null = null;
// 카카오맵이면 오른쪽 지도 도구 막대(로드뷰 · 지적도 · 재기 · 검색 …)를 붙인다 — 카카오 물건은 Vue 가 감싸지 않게 markRaw
const kTools = shallowRef<{ k: unknown; map: unknown } | null>(null);
const mapGroups = computed(() => {
  const by = new Map<string, PriceRow[]>();
  (webEmbed ? kindRows.value : colFilter.rows.value).filter((r) => !r.same && spots.value[r.jibun]).forEach((r) => { by.set(r.jibun, [...(by.get(r.jibun) ?? []), r]); });
  return [...by.entries()].map(([jibun, list]) => {
    const prices = list.map((r) => r.price);
    const lo = Math.min(...prices); const hi = Math.max(...prices);
    return { jibun, list, spot: spots.value[jibun]!, name: list[0].name || jibun, range: lo === hi ? eok(lo) : `${n0(lo)}~${eok(hi)}`, dist: list[0].dist ?? 0 };
  });
});
/** 웹 표 머리 '근거 유사물건' 옆 — 표에 든 지번 수 · 거래 수(거르기 · 거래 종류 그대로) */
const listPlaces = computed(() => new Set(shownRows.value.map((r) => r.jibun)).size);
// 임장 순서 — 현장(선정물건)에서 출발해 가까운 곳부터 도는 동선. 지도 점 · 표 주소 앞 번호가 같다
const orderOf = computed(() => {
  const m = mySpot.value;
  const out: Record<string, number> = {};
  if (!m) return out;
  visitOrder(m, mapGroups.value.map((g) => ({ jibun: g.jibun, lat: g.spot.lat, lng: g.spot.lng }))).forEach((p, i) => { out[p.jibun] = i + 1; });
  return out;
});
// ===== 임장경로에 추가 — 번호 붙은 유사물건을 이 물건(fieldCompare)에 둔다. 임장경로 정류장의 「현장 기록」이 읽는다 =====
const savedCompare = computed(() => store.auctions.find((x) => x.id === props.auction.id)?.fieldCompare);
const addOpen = ref(false);
const addPick = ref<string[]>([]);
const addMsg = ref('');
const addList = computed(() => [...mapGroups.value]
  .filter((g) => orderOf.value[g.jibun])
  .sort((a, b) => orderOf.value[a.jibun] - orderOf.value[b.jibun]));
const toggleAdd = () => {
  addOpen.value = !addOpen.value;
  if (!addOpen.value) return;
  addMsg.value = '';
  const had = savedCompare.value?.items.map((x) => x.jibun) ?? [];
  // 넣어 둔 게 있으면 그대로, 없으면 500m 안 가까운 5곳
  addPick.value = had.length ? had.filter((j) => addList.value.some((g) => g.jibun === j)) : addList.value.filter((g) => g.dist <= 500).slice(0, 5).map((g) => g.jibun);
};
const saveCompare = async () => {
  const a = store.auctions.find((x) => x.id === props.auction.id);
  if (!a) return;
  const old = new Map((a.fieldCompare?.items ?? []).map((x) => [x.jibun, x]));
  const items = addList.value.filter((g) => addPick.value.includes(g.jibun)).map((g) => {
    const latest = [...g.list].sort((x, y) => y.contractDate.localeCompare(x.contractDate));
    return {
      no: orderOf.value[g.jibun], jibun: g.jibun, name: g.name === g.jibun ? '' : g.name,
      address: lotAddr(latest[0].umdNm, `${g.jibun}${g.name !== g.jibun ? ` ${g.name}` : ''}`),
      lat: g.spot.lat, lng: g.spot.lng, dist: g.dist, priceText: g.range,
      areaM2: latest[0].areaM2, buildYear: latest[0].buildYear ?? 0, elev: elevs.value[g.jibun] ?? null,
      trades: latest.slice(0, 5).map((r) => ({ date: r.contractDate, floor: r.floorNo, areaM2: r.areaM2, price: r.price })),
      // 현장에서 적어 둔 체크는 다시 넣어도 남긴다
      ...(old.get(g.jibun)?.check ? { check: old.get(g.jibun)!.check } : {}),
    };
  });
  const m = mySpot.value;
  await store.saveAuction({ ...a, fieldCompare: { savedAt: Date.now(), items, ...(m ? { origin: { lat: m.lat, lng: m.lng, address: props.auction.address } } : {}) } }, { where: '손품조사 › 시세분석', note: `임장 비교 물건 ${items.length}곳 넣음` });
  addOpen.value = false;
  addMsg.value = ['임장예정', '임장완료'].includes(a.status) ? '' : '임장예정 물건만 임장경로에 나옵니다 — 선정물건에서 임장예정으로 바꿔 주세요';
};
// 현장 체크 → 표 주소 밑 칩
const fieldChips = (jibun: string) => {
  const c = savedCompare.value?.items.find((x) => x.jibun === jibun)?.check;
  if (!c) return [] as { t: string; k: string }[];
  const out: { t: string; k: string }[] = [];
  if (c.vs) out.push({ t: `현장${c.vs}`, k: c.vs === '우세' ? 'g' : c.vs === '열세' ? 'r' : 'm' });
  const grade = (v: string) => (v === '상' || v === '중상' ? 'g' : v === '하' ? 'r' : 'm');
  if (c.loc) out.push({ t: `입지${c.loc}`, k: grade(c.loc) });
  if (c.villa) out.push({ t: `빌라${c.villa}`, k: grade(c.villa) });
  if (c.look === '나쁨') out.push({ t: '외관나쁨', k: 'r' });
  if (c.park === '부족') out.push({ t: '주차부족', k: 'r' });
  if (c.memo) out.push({ t: '메모', k: 'm' });
  return out;
};
const sameCount = computed(() => shownRows.value.filter((r) => r.same).length);
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const drawMap = () => {
  if (!mv) return;
  mv.clear();
  const m = mySpot.value;
  if (!m) return;
  if (radius.value !== DONG) mv.circle(m, radius.value, { color: '#2b4fd8', weight: 1.6, dash: true, fillOpacity: 0.06 });
  // 웹 — 읍면동 점선 경계 + 고른 건물(필지) 테두리. 처음엔 선정물건, 점을 누르면 그 건물(매매수요 지도와 같게, 2026-11-11 사용자)
  if (webEmbed) {
    const dk = `${m.lat.toFixed(5)},${m.lng.toFixed(5)}`;
    if (shapes.value[`d:${dk}`]) mv.polygon(shapes.value[`d:${dk}`]!, { color: '#475569', weight: 2, dash: true, fillOpacity: 0.02 });
    else if (!(`d:${dk}` in shapes.value)) { shapes.value = { ...shapes.value, [`d:${dk}`]: null }; void dongShapeOf(m.lat, m.lng).then((v) => { shapes.value = { ...shapes.value, [`d:${dk}`]: v }; if (v) drawMap(); }); }
    const g = focus.value ? mapGroups.value.find((x) => x.jibun === focus.value) : null;
    const p = g ? g.spot : m;
    if (!g && props.dongOnly) { /* 동만 — 선정물건 필지 없음 */ } else {
    const pk = `p:${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    if (shapes.value[pk]) mv.polygon(shapes.value[pk]!, { color: g ? '#2b4fd8' : '#e03e3e', weight: 2.4, fillOpacity: 0.08 });
    else if (!(pk in shapes.value)) { shapes.value = { ...shapes.value, [pk]: null }; void parcelShapeOf(p.lat, p.lng).then((v) => { shapes.value = { ...shapes.value, [pk]: v }; if (v) drawMap(); }); }
    }
  }
  // 점과 이름표를 한 표식으로 — 줌할 때 이름표가 따로 미끄러져 날아오지 않고 점과 함께 움직인다
  // 웹 — 작은 점 + '주변' 시설 같은 흰 상자(맨 앞 번호). 꼴은 웹 공통(pin-dot · pin-box)으로 경매사례 지도와 같다
  const html = (label: string, no = '') => (webEmbed
    ? `<i class="pin-dot"></i><span class="pin-box">${no ? `<em class="no">${no}</em>` : ''}<span class="tx">${label}</span></span>`
    : `<i class="dot">${no}</i><span class="lbl">${label}</span>`);
  // 평소엔 점만 — 이름표(주소 · 금액)는 누른 점 하나에만 띄운다. 지도가 무거워지지 않게(2026-11-10)
  const dotOnly = (no = '') => (webEmbed ? '<i class="pin-dot"></i>' : `<i class="dot">${no}</i>`);
  mapGroups.value.forEach((g) => {
    const on = focus.value === g.jibun;
    // 웹 — 그 건물 거래를 표에서 다 '제외'하면 핀도 회색(평균에서 빠졌다는 표시)
    const off = webEmbed && g.list.every((r) => isOff(r));
    // 건수 · 가격대는 제외하지 않은 거래만(다 제외했으면 원래 값을 회색으로)
    const live = webEmbed && !off ? g.list.filter((r) => !isOff(r)) : g.list;
    const lp = live.map((r) => r.price); const lo = Math.min(...lp); const hi = Math.max(...lp);
    const range = lo === hi ? eok(lo) : `${n0(lo)}~${eok(hi)}`;
    if (mkV.value && props.aucTab && aucRes.value !== '실거래포함') return;
    if (mkV.value) {
      // 시세예측 빌라(시안 v7) — 평소엔 점만, 누르면 말풍선(꼬리 · X). 고른 점은 조금 커지고 고리가 깜빡인다
      const nk = aucOn.value && g.list.some((r) => resaleOf.value.has(rowKey(r)));
      mv!.pin(g.spot, { className: `cmp-bub mkd${nk ? ' nk' : ''}${on ? ' on' : ''}${off ? ' off' : ''}`, html: `<i class="mk-dot" data-j="${esc(g.jibun)}"></i>`, onClick: () => { popFromMap = true; meOpen.value = false; focusAuc.value = null; focus.value = on ? '' : g.jibun; }, z: on ? 50 : 1 });
      return;
    }
    if (webEmbed) {
      // 웹 — 매매수요 지도와 같은 말풍선, 이름 · 평균 금액 · 거래 건수(등수는 시세분석엔 필요 없다, 2026-11-11 사용자). 건수는 누르지 않아도 처음부터(2026-11-12 사용자)
      const avg = lp.reduce((a, b) => a + b, 0) / (lp.length || 1);
      mv!.pin(g.spot, {
        className: `cmp-bub${on ? ' on' : ''}${off ? ' off' : ''}`,
        // 이름 뒤에 그 건물 거래의 호(확정 · 후보) — 길면 잘리고 말풍선(검은)으로 전체(2026-11-14 사용자)
        html: (() => { const nm = [g.name, hosOf(g)].filter(Boolean).join(' '); return `<div class="cb"><b><span class="nm" data-tip="${esc(nm)}">${esc(nm)}</span></b><span>${kindF.value} ${eok(avg)}<i></i>${live.length}건</span></div>`; })(),
        onClick: () => { meOpen.value = false; focus.value = on ? '' : g.jibun; },
        z: on ? 50 : 1,
      });
      return;
    }
    mv!.pin(g.spot, {
      className: `pa-pin${on ? ' on' : ''}${off ? ' off' : ''}`,
      html: on ? html(`<b>${esc([g.name, hosOf(g)].filter(Boolean).join(' '))} ${live.length}건</b><br>${range} · ${g.dist}m`, String(orderOf.value[g.jibun] ?? '')) : dotOnly(String(orderOf.value[g.jibun] ?? '')),
      onClick: () => { meOpen.value = false; focus.value = on ? '' : g.jibun; },   // 이름표는 누른 점 하나만
      z: on ? 50 : 1,
    });
  });
  // 내 물건(빨간 점)도 눌렀을 때만 이름표
  if (mkV.value) {
    (props.aucTab ? aucRows.value.filter((a) => spots.value[a.lot]) : aucUnsold.value).forEach((a) => {
      const k = aucAfter.value.get(a.i)?.k; const rent = k === 'rent'; const sold = k === 'sell';
      if ((rent && rentOff.value) || (!rent && !sold && unOff.value) || (sold && soldOff.value)) return;
      const on = focusAuc.value === a.i;
      mv!.pin(spots.value[a.lot]!, { className: `cmp-bub mkd ${sold ? 'nk' : rent ? 'rent' : 'un'}${on ? ' on' : ''}`, html: `<i class="mk-dot" data-j="a:${a.i}"></i>`, onClick: () => { popFromMap = true; meOpen.value = false; focus.value = ''; focusAuc.value = on ? null : a.i; }, z: on ? 60 : 2 });
    });
    if (props.dongOnly) return;
    mv.pin(m, { className: 'cmp-bub mkd me', html: '<i class="mk-me" data-j="__me"></i>', onClick: () => { popFromMap = true; focus.value = ''; focusAuc.value = null; meOpen.value = !meOpen.value; }, z: 1000 });
    return;
  }
  if (webEmbed) {
    const mp = shownRows.value.filter((r) => r.same && !isOff(r)).map((r) => r.price);
    const mAvg = mp.length ? mp.reduce((a, b) => a + b, 0) / mp.length : 0;
    mv.pin(m, {
      className: 'cmp-bub me',
      html: `<div class="cb"><b><span class="nm" data-tip="${esc(myAddr.value)}">${esc(myLabel.value)}</span></b><span>${mAvg ? `${kindF.value} ${eok(mAvg)}<i></i>${mp.length}건` : meName.value}</span></div>`,
      onClick: () => { focus.value = ''; meOpen.value = !meOpen.value; },
      z: 1000,
    });
    return;
  }
  mv.pin(m, {
    className: `pa-pin me${meOpen.value ? ' on' : ''}`,
    html: meOpen.value ? html(`<b>${esc(myLabel.value)}</b><br>${meName.value}${sameCount.value ? `<br>${webEmbed ? `<b>같은건물 ${sameCount.value}건</b>` : `같은 건물 ${sameCount.value}건`}` : ''}`) : dotOnly(),   /* 웹 — '같은건물' 붙여 쓰고 굵게 */
    onClick: () => { focus.value = ''; meOpen.value = !meOpen.value; },
    z: 1000,
  });
};
// ===== 시세예측 빌라 — 지도 말풍선(점 위 → 아래 → 옆, 꼬리는 점을 가리키고 점은 가리지 않는다) =====
const popEl = ref<HTMLElement | null>(null);
const popPos = ref<{ left: number; top: number; side: string; tx: number; ty: number } | null>(null);
const popHide = ref(false);
/** 지도에서 눌러 연 말풍선만 — 가리면 화면을 옮긴다. 표 줄로 연 것은 화면을 옮기지 않는다(2026-11-28 사용자) */
let popFromMap = false;
const popData = computed(() => {
  if (!mkV.value) return null;
  if (focusAuc.value != null) {
    const a = aucRaw.value.find((x) => x.i === focusAuc.value); if (!a) return null;
    const x = aucAfter.value.get(a.i); const ev = elevs.value[a.lot];
    const mo = Math.max(0, Math.floor((Date.now() - new Date(`${a.ymd.slice(0, 4)}-${a.ymd.slice(4, 6)}-${a.ymd.slice(6, 8)}`).getTime()) / 2.63e9));
    return {
      key: `a:${a.i}`, title: [a.name, a.ho ? `${a.ho}호` : ''].filter(Boolean).join(' '), sub: `${a.cs} · ${a.date} 매각`,
      rows: [['감정가', n0(a.ap)], ['낙찰가', n0(a.pr), `${a.rate.toFixed(1)}%`], ['차수 · 응찰', `${a.fails + 1}차 · ${a.bids}명`], ['전용 · 건축', `${a.area}㎡ · ${a.year || '-'}년 · 엘베 ${ev == null ? '-' : ev > 0 ? '있음' : '없음'}`]],
      sec: x?.k === 'sell' ? { t: `낙찰 후 매도${x.est ? ` · ${x.cand}` : ''}`, c: 'sold', rows: [['매도가', n0(x.r.price), `+${((x.r.price / a.pr - 1) * 100).toFixed(1)}%`], ['매도일 · 매도기간', `${x.r.contractDate} · ${monthsBetween(a.ymd, x.r.contractDate)}개월`]] }
        : x?.k === 'rent' ? { t: '낙찰 후 전세', c: 'rent', rows: [['계약일 · 보증금', `${x.r.contractDate} · ${n0(x.r.price)}`]] } : { t: '낙찰', c: 'un', rows: [['지난 기간', `${mo}개월째 매도 없음`]] },
    };
  }
  if (meOpen.value) {
    const mp = shownRows.value.filter((r) => r.same && !isOff(r)).map((r) => r.price);
    return { key: '__me', title: myLabel.value, sub: '', rows: mp.length ? [['실거래가', eok(mp.reduce((a, b) => a + b, 0) / mp.length)], ['건수', `${mp.length}건`]] : [['', meName.value]] };
  }
  const g = focus.value ? mapGroups.value.find((x) => x.jibun === focus.value) : null;
  if (!g) return null;
  const live = g.list.filter((r) => !isOff(r)); const lp = (live.length ? live : g.list).map((r) => r.price);
  const ho = hosOf(g); const est = /중 추정/.test(ho);
  const na = aucOn.value ? g.list.map((r) => resaleOf.value.get(rowKey(r))).find(Boolean) : undefined;
  return { key: g.jibun, title: [g.name, ho.replace(/\s*중 추정$/, '')].filter(Boolean).join(' '), sub: est ? '호수 중 추정' : '', rows: [['실거래가', eok(lp.reduce((a, b) => a + b, 0) / (lp.length || 1))], ['건수', `${lp.length}건`]], sec: na ? { t: '낙찰 후 매도', c: 'sold', rows: [['낙찰가', `${n0(na.pr)}원`]] } : undefined };
});
const closePop = () => { focus.value = ''; meOpen.value = false; focusAuc.value = null; };
const placePop = () => {
  popPos.value = null;
  const d = popData.value; const box = mapEl.value?.parentElement; const pe = popEl.value;
  if (!d || !box || !pe || !mapEl.value) return;
  const dot = mapEl.value.querySelector(`[data-j="${CSS.escape(d.key)}"]`) as HTMLElement | null;
  if (!dot) return;
  const br = box.getBoundingClientRect(); const dr = dot.getBoundingClientRect();
  const dx = dr.left + dr.width / 2 - br.left; const dy = (d.key === '__me' ? dr.top + dr.height : dr.top + dr.height / 2) - br.top;
  const mw = box.clientWidth; const mh = box.clientHeight;
  if (dx < 0 || dy < 0 || dx > mw || dy > mh) return;   // 점이 지도 밖이면 띄우지 않는다
  const w = pe.offsetWidth; const h = pe.offsetHeight; const G = 16; const R0 = 64;
  let left: number; let top: number; let side: string;
  const topGap = d.key === '__me' ? 30 : G;
  if (dy - h - topGap >= 8) { side = 'above'; top = dy - h - topGap; } else if (dy + G + h <= mh - 8) { side = 'below'; top = dy + G; } else { side = dx + G + w <= mw - R0 ? 'right' : 'left'; top = Math.max(8, Math.min(dy - h / 2, mh - h - 8)); }
  if (side === 'above' || side === 'below') left = Math.max(8, Math.min(dx - w / 2, mw - w - R0)); else left = side === 'right' ? dx + G : dx - G - w;
  popPos.value = { left, top, side, tx: Math.max(14, Math.min(dx - left, w - 14)), ty: Math.max(14, Math.min(dy - top, h - 14)) };
  if (!fs.value && popFromMap) void nextTick(() => {
    const pr = popEl.value?.getBoundingClientRect(); const ze = zoneEl.value?.getBoundingClientRect();
    if (!pr) return; const sb = ze ? ze.bottom : 120;
    if (pr.top < sb + 8) window.scrollBy({ top: pr.top - sb - 12, behavior: 'smooth' }); else if (pr.bottom > window.innerHeight - 8) window.scrollBy({ top: pr.bottom - window.innerHeight + 12, behavior: 'smooth' });
  });
};
watch([popData, focus, meOpen, focusAuc], () => { void nextTick(() => window.setTimeout(placePop, 30)); });
let popEvt = false;
watch(kTools, (t) => {
  if (!t || popEvt || !mkV.value) return; popEvt = true;
  const k = t.k as { event?: { addListener: (m: unknown, ev: string, f: () => void) => void } }; const map = t.map;
  k.event?.addListener(map, 'dragstart', () => { popHide.value = true; });
  k.event?.addListener(map, 'zoom_start', () => { popHide.value = true; });
  k.event?.addListener(map, 'idle', () => { popHide.value = false; placePop(); });
  k.event?.addListener(map, 'click', () => { if (popData.value) closePop(); });
});
const fitMap = () => {
  const m = mySpot.value;
  if (mv && m) mv.fitRadius(m, radius.value === DONG ? 1000 : radius.value);
};
const ensureMap = async () => {
  await nextTick();
  if (!mvP && mapEl.value) {
    const el = mapEl.value;
    mvP = createMapView(el, { zoomControl: 'topright', kakaoTools: true, leaflet: { scrollWheelZoom: true, wheelPxPerZoomLevel: 120, zoomSnap: 0.25 } }).then((v) => { mv = v; if (v.native) kTools.value = markRaw(v.native); });
  }
  await mvP;
  fitMap(); drawMap();
};
watch(mySpot, () => { void ensureMap(); });
watch(radius, fitMap);
// 점 · 원이 실제로 바뀔 때만 다시 그린다 — 공시가 · 엘베가 들어올 때마다 지도를 통째로 다시 그리지 않게
const mapKey = computed(() => `${dropped.value.join('~')}|${radius.value}|${focus.value}|${meOpen.value}|${sameCount.value}|${mySpot.value?.lat}|${mapGroups.value.map((g) => `${g.jibun}:${g.list.length}:${g.range}:${orderOf.value[g.jibun] ?? ''}:${hosOf(g)}`).join(',')}|${aucUnsold.value.map((a) => a.i).join(',')}|${focusAuc.value}|${unOff.value}|${rentOff.value}|${resaleOf.value.size}|${props.aucTab ? `${aucRows.value.map((a) => a.i).join(',')}|${aucRes.value}|${soldOff.value}` : ''}`);   // 호(호실 목록이 나중에 들어온다)도 — 들어오면 말풍선을 다시 그린다
watch(mapKey, drawMap);
// 숨은 탭에서 처음 그려지면 크기를 모른다 — 보일 때 다시 잰다
const sonTab = inject<Ref<string> | null>('sonpumTab', null);
if (sonTab) watch(sonTab, (t) => { if (t === 'price') void nextTick(() => { mv?.relayout(); fitMap(); }); });

// ===== 바로가기 — N 네이버 부동산(그 건물로) · P 부동산플래닛(검색어 복사) · 주소 복사 =====
const okKey = ref('');
const flash = (k: string) => { okKey.value = k; window.setTimeout(() => { if (okKey.value === k) okKey.value = ''; }, 900); };
const goNaver = (addr: string) => { void openNaverSpot(addr, props.kind); };
const goPlanet = (q: string, k: string) => { void openPlanetSpot(q).then(() => flash(k)); };
const copy = (t: string, k: string) => { try { void navigator.clipboard.writeText(t).then(() => flash(k), () => flash(k)); } catch { flash(k); } };
const fullAddr = (r: PriceRow) => lotAddr(r.umdNm, `${r.jibun}${r.name ? ` ${r.name}` : ''}`);

const sonAskReady = inject<Ref<boolean> | null>('sonAskReady', null);
const askSlotRef = (el: unknown) => { if (sonAskReady) sonAskReady.value = !!el; };

// ===== 표 칸 간격 — 칸마다 내용 폭을 잰 뒤 남는 폭을 칸 수로 똑같이 나눠 더한다(모자라면 주소만 줄바꿈) =====
const tableEl = ref<HTMLTableElement | null>(null);
/* 웹 — 칸 폭은 창 폭 · 거래 종류 · 새 조회 때만 다시 잰다. 유사도 ↔ 직접범위 · 반경 · 제외처럼 줄만 바뀔 때마다 재면 칸이 좌우로 '딸깍' 움직였다 */
let colsKey = '';
/** 웹 — 칸 폭(px). 템플릿 colgroup 이 그린다 */
const colWidths = ref<number[]>([]);
const evenCols = () => {
  const t = tableEl.value;
  if (!t || !t.parentElement?.clientWidth) return;
  if (webEmbed) {
    // 웹 — 칸 폭은 지금 줄의 값이 아니라 칸마다 정해 둔 '가장 긴 글'(머리말 · 값)로 잰다 → 거래 종류(매매 · 전세 · 월세)와 창 폭이 같으면 줄이 바뀌어도 칸이 한 픽셀도 안 움직인다(2026-11-12 사용자 '표 흔들리지 않게 내용과 말머리 정확하게').
    // 남는 폭은 모든 칸에 똑같이 더하고, 모자라면 칸 안 여백을 줄인 뒤 주소 칸만 줄인다(… 으로 잘리고 말풍선으로 전체)
    const cw = t.parentElement.clientWidth;
    const key = `even|${cw}|${isAptKind}`;   // 거래 종류(매매 · 전세 · 월세)는 열쇠에서 뺐다 — 탭을 바꿔도 칸이 그대로(2026-11-12 사용자)
    if (colsKey === key && colWidths.value.length) return;
    colsKey = key;
    const ths = [...t.querySelectorAll('thead th')] as HTMLElement[];
    const ctx = document.createElement('canvas').getContext('2d');
    const cs = (el: Element | null) => (el ? getComputedStyle(el) : null);
    const thCs = cs(ths.find((th) => th.dataset.k) ?? ths[0]); const tdCs = cs(t.querySelector('tbody td:not(.ck-td)'));
    const fontOf = (c: CSSStyleDeclaration | null, weight?: string, size?: string) => (c ? `${weight ?? c.fontWeight} ${size ?? c.fontSize} ${c.fontFamily}` : '13px sans-serif');
    const tw = (txt: string, font: string) => { if (!ctx) return txt.length * 8; ctx.font = font; return ctx.measureText(txt).width; };
    // 칸마다 들어갈 수 있는 가장 긴 값(숫자는 자릿수가 가장 많은 꼴) — 매매 · 전세 · 월세를 다 합친 것이라 탭을 바꿔도 칸 폭이 같다. 바뀌면 여기만
    const SAMPLE: Record<string, string[]> = {
      date: ['2026.12.31', '매매 예상', '전세 예상', '월세 예상'],
      won: [isAptKind ? '9,999,999,999' : '999,999,999'],
      perPy: ['99,999,999'],
      pub: [isAptKind ? '9,999,999,999' : '999,999,999', '999.9%', '공시가 없음'],
      gap: isAptKind ? ['9,999,999,999', '▲ 9,999,999,999', '한도 안', '갭 -9,999,999,999'] : ['999,999,999', '▲ 999,999,999', '한도 안', '갭 -999,999,999'],
      area: isAptKind ? ['999.99㎡ (999.99)'] : ['999.99㎡', '999.99평'],
      elev: ['조회 중', isAptKind ? '99대있음' : '9대있음'],   // 아파트는 30대도 있다 — 9대로 잡아 '30대 있음'이 두 줄로 꺾였다
      year: ['2026년'],
      dist: ['9,999m'],
      floor: ['99층'],
    };
    const natOf = (pad: number) => ths.map((th) => {
      if (th.classList.contains('ck-th')) return 44;
      if (th.classList.contains('acts-th')) return Math.max(74, ...[...t.querySelectorAll('td.acts-td .acts')].map((e) => (e as HTMLElement).scrollWidth)) + 16;   // 잴 때 단추가 아직 안 그려져 0이면 N · P · 복사 세 단추 폭(2026-11-29 — 동 전체에서 16px로 줄어 넘쳤다)
      const key2 = th.dataset.k ?? '';
      const head = (th.querySelector('.hk') as HTMLElement | null)?.innerText ?? th.innerText;
      const headW = tw(head.split('\n')[0], fontOf(thCs)) + (key2 ? 16 : 0);   // 정렬 ▲▼ 자리
      const vals = key2 === 'name' ? [] : key2 ? (SAMPLE[key2] ?? []) : ['선정물건'];
      const chip = !key2 || key2 === 'elev';   // 구분 · 엘베는 칩(안쪽 여백 · 굵은 글) — 칩 폭까지 잡아야 '2대있음'이 두 줄로 꺾이지 않는다
      const valW = Math.max(0, ...vals.map((v) => tw(v, fontOf(tdCs, chip ? '700' : undefined, chip ? '12px' : undefined)) + (chip ? 16 : 0)));
      return Math.ceil(Math.max(headW, valW) + pad);
    });
    const ai = ths.findIndex((th) => th.dataset.k === 'name');
    const ADDR_MIN = 170;
    let nat = natOf(10); t.classList.remove('tight', 'tighter');   // 칸 안 여백 24 → 10 — 그만큼 주소가 넓어진다(보떼하우스 '401·402호 중'까지 보이게, 2026-11-14 사용자)
    const others = () => nat.reduce((a, w, i) => (i === ai ? a : a + w), 0);
    if (cw - others() < ADDR_MIN) { t.classList.add('tight'); nat = natOf(10); }   // 좁으면 칸 안 여백을 줄인다
    if (cw - others() < 100) { t.classList.add('tighter'); nat = natOf(4); }   // 더 좁으면 한 번 더(창이 좁을 때 표가 상자 밖으로 넘치지 않게)
    // 남는 폭은 모두 주소 칸에(2026-11-14 사용자 — 호 칸을 빼고 남은 자리를 주소가 쓰게). 예전엔 모든 칸에 똑같이 나눠 더했다
    const gap = 0;
    const addrW = Math.max(100, cw - others());
    const widths = ths.map((_, i) => Math.floor((i === ai ? addrW : nat[i]) + gap));
    let over = widths.reduce((a, b) => a + b, 0) - cw;
    if (over > 0 && ai >= 0) { const cut = Math.min(over + 1, widths[ai] - 80); widths[ai] -= Math.max(0, cut); over = widths.reduce((a, b) => a + b, 0) - cw; }
    // 그래도 넘치면(아주 좁은 창) 값 칸들을 같은 비율로 조금씩 — 정해 둔 '가장 긴 값'이 넉넉해 실제 값은 잘리지 않는다. 제외 · 단추 칸은 그대로
    if (over > 0) {
      const flex = widths.map((w, i) => (i === ai || ths[i].classList.contains('ck-th') || ths[i].classList.contains('acts-th') ? 0 : w));
      const sum = flex.reduce((a, b) => a + b, 0);
      if (sum > 0) { const k2 = Math.max(0.7, (sum - over - 1) / sum); flex.forEach((w, i) => { if (w) widths[i] = Math.floor(w * k2); }); }
    }
    // 칸 폭은 화면 틀(템플릿)의 colgroup 으로 — 손으로 끼운 colgroup 은 탭을 바꿔 표를 다시 그릴 때 잠깐 빠져 칸이 왼쪽으로 꿈틀했다(2026-11-12 사용자)
    colWidths.value = widths;
    t.style.tableLayout = 'fixed';
    t.style.minWidth = '';
    if (t.parentElement) t.parentElement.scrollLeft = 0;
    return;
  }
  t.querySelector('colgroup')?.remove();
  t.style.tableLayout = 'auto';
  const ths = [...t.querySelectorAll('thead th')] as HTMLElement[];
  const measure = () => { t.classList.add('measure'); const w = ths.map((th) => th.getBoundingClientRect().width); t.classList.remove('measure'); return w; };
  // 좁으면 칸 안 여백을 줄여 다시 잰다 — 주소 칸이 서너 줄로 꺾이지 않게
  t.classList.remove('tight');
  let natural = measure();
  if (t.parentElement.clientWidth < natural.reduce((a, b) => a + b, 0)) { t.classList.add('tight'); natural = measure(); }
  const extra = t.parentElement.clientWidth - natural.reduce((a, b) => a + b, 0);
  const add = extra > 0 ? extra / natural.length : 0;
  const addrIdx = ths.findIndex((th) => th.dataset.k === 'name');
  const cg = document.createElement('colgroup');
  natural.forEach((w, i) => { const c = document.createElement('col'); if (extra > 0 || i !== addrIdx) c.style.width = `${w + add}px`; cg.appendChild(c); });
  t.insertBefore(cg, t.firstChild);
  t.style.tableLayout = 'fixed';
};
// 칸 간격은 줄 · 값이 바뀔 때 한 번만 다시 잰다(깊게 지켜보지 않는다 — 줄이 수백 개라 느려진다)
let evenTimer = 0;
watch([listRows, stats, curPub, enriching], () => { if (enriching.value) return; window.clearTimeout(evenTimer); evenTimer = window.setTimeout(evenCols, 60); });
if (sonTab) watch(sonTab, (t) => { if (t === 'price') void nextTick(evenCols); });

/** 시세예측 빌라 — 금액 칸(4~7번째) 숫자 묶음을 칸 가운데에 두되 안은 오른쪽(일의 자리 세로 맞춤). 칸마다 가장 넓은 숫자를 재서 오른쪽 여백을 정한다 */
const fitNb = () => {
  const t = tableEl.value; if (!mkV.value || !t) return;
  const rows = [...t.querySelectorAll('tbody tr')].filter((tr) => !tr.classList.contains('nohover'));
  [4, 5, 6, 7].forEach((n) => {
    let mw = 0; let cw = 0;
    rows.forEach((tr) => { const td = tr.children[n - 1] as HTMLElement | undefined; if (!td) return; cw = td.clientWidth; const rg = document.createRange(); rg.selectNodeContents(td); [...rg.getClientRects()].forEach((b) => { mw = Math.max(mw, b.width); }); });
    if (cw && mw) t.style.setProperty(`--nb${n}`, `${Math.max(6, Math.floor((cw - mw) / 2))}px`);
  });
};
watch([listRows, colWidths, mkV], () => { void nextTick(() => window.setTimeout(fitNb, 80)); });
const onResize = () => { evenCols(); window.setTimeout(fitNb, 80); };
// 웹 — 저장 등으로 표를 새로 그리면 칸 폭(colgroup)이 사라져 표가 오른쪽으로 삐져나왔다 — 다시 그려질 때 칸 폭이 없으면 바로 다시 잰다(2026-11-11 사용자)
onUpdated(() => { const t = tableEl.value; if (webEmbed && t && !colWidths.value.length) { colsKey = ''; evenCols(); } });
onMounted(() => { window.addEventListener('resize', onResize); void run(); });
// ===== 웹 — 지도 전체화면(C안, 2026-11-05): 왼쪽 지도 · 오른쪽 고정 칸(결론 · 조건 · 유사물건 목록). 이 상자를 body 로 옮겨 화면을 채운다 =====
/* 전체화면은 새로고침 · 다른 물건에서도 그대로(고른 보기는 남긴다) — 닫기를 눌러야 풀린다 */
const FS_KEY = 'son.price.fs';
const fs = ref(webEmbed && !props.app && (() => { try { return localStorage.getItem(FS_KEY) === '1'; } catch { return false; } })());
/** 웹 손품조사 — 결론 머리(제목 줄 + 네 칸)는 CSS sticky 라 시세분석 상자(.pa) 안에서만 붙는다.
 *  아래 호실 예상가 · 호가매물(손품조사 화면의 다른 칸)까지 붙어 있게(2026-11-13 사용자 '끝까지'), 상자가 끝나면 화면에 고정하고
 *  시세분석 탭의 마지막 칸이 끝날 때 함께 밀려 올라간다. 시장분석(그 아래 칸이 없다)은 CSS sticky 그대로 */
const zoneEl = ref<HTMLElement | null>(null);
const estFix = ref<{ h: number; style: Record<string, string> } | null>(null);
// 붙는 높이는 매번 잰다 — 처음 한 번만 재 두면 고정카드 높이(--item-shell-h)가 아직 0일 때 값이 남아
// 끝 구간(화면 고정)에서 머리가 고정카드 밑으로 반쯤 잠겼다(2026-11-15 사용자). 숨은 받침 하나를 두고 높이만 읽는다
let stickProbe: HTMLElement | null = null;
const stickTop = () => {
  const host = zoneEl.value?.parentElement; if (!host) return 8;
  if (!stickProbe || stickProbe.parentElement !== host) {
    stickProbe?.remove(); stickProbe = document.createElement('div');
    stickProbe.style.cssText = 'position:absolute;top:0;left:0;width:0;visibility:hidden;pointer-events:none;height:var(--pa-stick-top, 8px)';
    host.appendChild(stickProbe);
  }
  return stickProbe.offsetHeight;
};
let estRaf = 0;
const syncEstFix = () => {
  estRaf = 0;
  const z = zoneEl.value; const pa = z?.closest('.pa') as HTMLElement | null; const son = pa?.closest('.son') as HTMLElement | null;
  if (!z || !pa || !son || !webEmbed || props.app || fs.value) { if (estFix.value) estFix.value = null; return; }
  const top = stickTop(); const paR = pa.getBoundingClientRect();
  // 시세분석 탭이 숨어 있으면(다른 탭 · 접힘) 상자 크기가 0 — 그때 재면 화면 왼쪽 끝에 폭 없이 붙었다(2026-11-13 사용자 화면). 숨어 있으면 풀어 둔다
  if (!(paR.width > 0 && paR.height > 0)) { if (estFix.value) estFix.value = null; return; }
  const h = estFix.value?.h ?? z.offsetHeight;
  // 붙고 나서 200px 내려가면(풀 때는 150px) 미리 화면에 고정 — 상자 끝 가까이에서 바꾸면 빠르게 내릴 때 스크롤이 계산보다 앞서
  // 한 프레임 밀렸다 돌아와 튀었다(2026-11-15 사용자 네 번). 이 구간은 붙은 자리와 고정 자리가 같아 계산이 늦어도 보이지 않는다.
  // 상자가 짧아 그 전에 끝이 오면 끝 120px 앞에서
  const passed = top - paR.top;
  const want = passed > (estFix.value ? 150 : 200) || (passed > 0 && paR.bottom - 24 < top + h + 120);
  if (!want) { if (estFix.value) estFix.value = null; return; }
  // 끝 — 호실 예상가 · 호가매물 · 시세결론까지. 그 아래로 가면 위로 밀어 올리지 않고 통째로 감춘다(고정카드 밑으로 반쯤 걸쳤다, 2026-11-15 사용자)
  const ends = ['.son-price', '#sonUnitSlot', '#sonNaverSlot', '#sonConcSlot', '#sonAskSlot'].map((q) => (son.querySelector(q) ?? document.querySelector(q)) as HTMLElement | null).filter((e): e is HTMLElement => !!e && e.offsetHeight > 0);
  const endB = Math.max(...ends.map((e) => e.getBoundingClientRect().bottom));
  const gone = endB < top + h;
  estFix.value = { h, style: { position: 'fixed', top: `${Math.round(top)}px`, left: `${Math.round(paR.left + 1)}px`, width: `${Math.round(paR.width - 2)}px`, margin: '0', transition: 'opacity .15s', ...(gone ? { opacity: '0', pointerEvents: 'none' } : {}) } };
};
const onEstScroll = () => { if (!estRaf) estRaf = requestAnimationFrame(syncEstFix); };
if (typeof window !== 'undefined' && webEmbed && !props.app) {
  window.addEventListener('scroll', onEstScroll, { passive: true });
  const onEstResize = () => onEstScroll();
  window.addEventListener('resize', onEstResize);
  // 스크롤 없이 상자 크기 · 자리만 바뀌어도(탭 돌아옴 · 표가 늘고 줆) 다시 잰다
  const estRo = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => onEstScroll()) : null;
  watch(zoneEl, (z) => { estRo?.disconnect(); const pa = z?.closest('.pa'); const son = pa?.closest('.son'); if (pa) estRo?.observe(pa); if (son) estRo?.observe(son); }, { flush: 'post' });
  onBeforeUnmount(() => { window.removeEventListener('scroll', onEstScroll); window.removeEventListener('resize', onEstResize); estRo?.disconnect(); if (estRaf) cancelAnimationFrame(estRaf); stickProbe?.remove(); stickProbe = null; });
}
/** 전체화면 유사물건 — 그 건물 거래들의 호(확정 · 후보), 서로 다른 것만 */
const hosOf = (g: { list: PriceRow[] }) => [...new Set(g.list.filter((r) => !isOff(r)).map((r) => hoCand(r)).filter(Boolean))].join(' · ');
const fsList = computed(() => [...mapGroups.value].sort((a, b) => (orderOf.value[a.jibun] ?? 999) - (orderOf.value[b.jibun] ?? 999)));
/** 표 줄을 누르면 지도의 그 점이 커지고 이름표가 뜬다 — 경매지번(같은 건물) 줄 · 맨 위 빨간 줄은 빨간 점(2026-11-10) */
const pickMine = () => { focus.value = ''; meOpen.value = !meOpen.value; };
/** 고른 거래 한 줄 — 표는 그 줄만 칠한다(같은 지번 줄이 다 칠해졌다, 2026-11-11 사용자). 지도는 그 건물(지번)을 고른다 */
const pickedRow = ref('');
const pickRow = (r: PriceRow) => {
  popFromMap = false; focusAuc.value = null;
  const k = rowKey(r); const again = pickedRow.value === k;
  if (simPickable(r)) simPick.value = simPick.value === k ? '' : k;
  if (casePickable(r)) casePick.value = casePick.value === k ? '' : k;
  pickedRow.value = again ? '' : k;
  if (r.same) { focus.value = ''; meOpen.value = !again; return; }
  meOpen.value = false; focus.value = again ? '' : r.jibun;
};
watch([focus, meOpen], ([f, m]) => { if (!f && !m) pickedRow.value = ''; });
// 시세예측 빌라 — 지도 점을 누르면 표의 그 줄도 표시. 그 줄이 '더 보기' 뒤면 펼친다(2026-11-28 사용자)
watch(focus, (f) => { if (!mkV.value || !f || showAll.value) return; const i = shownRows.value.findIndex((r) => r.jibun === f); if (i >= MORE_AT) showAll.value = true; });
const pickMineRow = () => { popFromMap = false; if (!webEmbed) { pickMine(); return; } const again = pickedRow.value === 'mine'; pickedRow.value = again ? '' : 'mine'; focus.value = ''; meOpen.value = !again; };   // 지도에서 고른 것을 풀면 줄도 푼다
const fsGo = (g: { jibun: string; spot: { lat: number; lng: number } }) => { meOpen.value = false; focus.value = focus.value === g.jibun ? '' : g.jibun; if (focus.value && mv) mv.focus(g.spot, 16); };
const onFsKey = (e: KeyboardEvent) => { if (e.key === 'Escape') fs.value = false; };
watch(fs, async (on) => {
  if (!webEmbed) return;
  try { if (on) localStorage.setItem(FS_KEY, '1'); else localStorage.removeItem(FS_KEY); } catch { /* 이 창에서만 */ }
  document.documentElement.style.overflow = on ? 'hidden' : '';
  if (on) window.addEventListener('keydown', onFsKey); else window.removeEventListener('keydown', onFsKey);
  await nextTick();
  // 칸 크기가 바뀌었으니 지도를 다시 재고, 반경이 다 보이게
  [0, 120, 400].forEach((ms) => window.setTimeout(() => { mv?.relayout(); const m = mySpot.value; if (mv && m && !focus.value) mv.fitRadius(m, radius.value === DONG ? 1000 : radius.value); }, ms));
}, { immediate: true });
onBeforeUnmount(() => { window.removeEventListener('keydown', onFsKey); if (fs.value) document.documentElement.style.overflow = ''; });
onBeforeUnmount(() => { window.removeEventListener('resize', onResize); runId += 1; mv?.destroy(); mv = null; window.clearTimeout(saveTimer); window.clearTimeout(undoTimer); });
watch(() => props.auction.id, () => { spots.value = {}; units.value = {}; elevs.value = {}; mySpot.value = null; void run(); });

// ===== 앱 — 지도는 접어 둔다(펼친 것은 다음에도 그대로). 펼칠 때 크기를 다시 잰다 =====
const MAP_KEY = 'son.price.appMap';
const mapOpen = ref(!!props.app && (() => { try { return localStorage.getItem(MAP_KEY) === '1'; } catch { return false; } })());
watch(mapOpen, async (on) => {
  try { if (on) localStorage.setItem(MAP_KEY, '1'); else localStorage.removeItem(MAP_KEY); } catch { /* 이 창에서만 */ }
  if (!on) return;
  await nextTick();
  [0, 120, 400].forEach((ms) => window.setTimeout(() => { mv?.relayout(); fitMap(); }, ms));
});

const onPubInput = (e: Event) => { typedPub.value = Number((e.target as HTMLInputElement).value.replace(/\D/g, '')) || 0; };
const stamp = computed(() => (savedAt.value ? updateStamp(savedAt.value) : ''));
</script>

<template>
  <div :class="['pa-wrap', { app: props.app, phone: sonApp }]">
  <Teleport to="body" :disabled="!fs">
  <section :class="['pa', 'pa-card', { fs, stick: webEmbed && !props.app, web: webEmbed && !props.app, 'mk-v': mkV, 'mk-auc': aucTab }]" aria-label="시세분석">
    <!-- 전체화면 위 띠 — 닫기 · 사건 · 조회기간 · 조회 -->
    <div v-if="fs" class="fs-top">
      <button type="button" class="fs-x" @click="fs = false"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>전체화면 닫기</button>
      <b class="fs-t">시세분석<small>{{ [props.auction.caseNumber, regionText].filter(Boolean).join(' · ') }}</small></b>
      <span class="fs-r">
        <template v-if="!props.months">
        <span class="pa-seg pa-out" role="radiogroup" aria-label="조회기간">
          <button v-for="m in PERIODS" :key="m" type="button" role="radio" :class="{ on: months === m }" :aria-checked="months === m" @click="months = m" :data-t="periodText(m)">{{ periodText(m) }}</button>
        </span>
        <button type="button" :class="['pa-load', { dirty }]" :disabled="loading" @click="run">{{ loading ? '조회 중…' : '조회' }}</button>
        </template>
      </span>
    </div>
    <!-- Ⓐ 결론 — 제목 줄에 조회(지역은 물건 카드에서 온다, 기간만 고른다) -->
    <!-- 붙는 머리가 시세분석 상자 밖(호실 예상가 · 호가매물)까지 이어 붙을 때 — 빠진 자리를 같은 높이로 받친다 -->
    <div v-if="estFix" class="zone-ph" :style="{ height: `${estFix.h}px` }" aria-hidden="true" />
    <div ref="zoneEl" class="zone zone-est" :style="estFix ? estFix.style : undefined">
      <div class="zone-h"><span class="pa-tag">결론</span><h3>{{ aucTab ? '낙찰사례' : dongOnly ? `${region?.dong ?? ''} 시세` : webEmbed ? '이 물건 매도가 예상' : '이 물건 실거래가 예상' }}</h3>
        <span :class="['bar-desc', { hi: webEmbed }]"><svg v-if="webEmbed" class="flt" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h18l-7 8.5V19l-4 2v-8.5z" /></svg>{{ regionText || '지역 확인 중' }}{{ aucTab ? `${isDong ? ` 전체 · ${aucYear}` : ` · 반경 ${radText(radius)} · 최근 ${periodText(loadedMonths)}`} · ${aucStat.n.toLocaleString('ko-KR')}건` : dongOnly ? ` 전체 · ${periodText(loadedMonths)}` : webEmbed ? `${isDong ? ' 전체' : ` · 반경 ${radText(radius)}`} · ${periodText(loadedMonths)} · ${(view?.n ?? 0).toLocaleString('ko-KR')}건` : '' }} · {{ KIND_LABEL[kind] }} {{ aucTab ? '낙찰' : '실거래' }}</span>
        <span class="pa-load-r">
          <span v-if="progress.total && progress.done < progress.total" class="prog">위치 찾는 중 {{ progress.done }} / {{ progress.total }}</span>
          <!-- 앱 — 기간 단추 · 조회는 뺐다(저장된 기간 그대로, 2026-11-13 사용자) -->
          <template v-if="!props.months && !props.app">
          <span class="pa-seg pa-out" role="radiogroup" aria-label="조회기간">
            <button v-for="m in PERIODS" :key="m" type="button" role="radio" :class="{ on: months === m }" :aria-checked="months === m" @click="months = m" :data-t="periodText(m)">{{ periodText(m) }}</button>
          </span>
          <button type="button" :class="['pa-load', { dirty }]" :disabled="loading" @click="run">{{ loading ? '조회 중…' : '조회' }}</button>
          </template>
        </span>
      </div>
      <p v-if="errorMsg" class="pa-err">{{ errorMsg }}</p>
      <div class="est">
        <!-- 웹 — 중간값 · 최저 · 최고는 뺐다. 거래가를 내 평수로 바꿔 만든 값이라 실제로 거래된 값이 아니다(2026-11-11 사용자) -->
        <div v-if="aucTab" class="tiles four">
          <div class="tile key"><span class="k">① 평균 낙찰가율</span><span class="v pa-num">{{ aucStat.n ? `${aucStat.avg.toFixed(1)}%` : '-' }}</span><span class="s rad">가운데값 {{ aucStat.mid.toFixed(1) }}% · 낙찰 {{ aucStat.n.toLocaleString('ko-KR') }}건</span></div>
          <div class="tile"><span class="k">평균 응찰</span><span class="v pa-num">{{ aucStat.n ? `${aucStat.bids.toFixed(1)}명` : '-' }}</span></div>
          <div class="tile"><span class="k">유찰 뒤 낙찰</span><span class="v pa-num">{{ aucStat.fail.toLocaleString('ko-KR') }}건</span></div>
          <div class="tile"><span class="k">낙찰 후 매도</span><span class="v pa-num">{{ aucStat.sold.toLocaleString('ko-KR') }}건</span><span class="s rad">{{ aucStat.sold ? `평균 ${aucStat.soldMo.toFixed(1)}개월 뒤 · 낙찰가보다 ${aucStat.soldGain >= 0 ? '+' : ''}${aucStat.soldGain.toFixed(1)}%` : '되판 거래 없음' }}</span></div>
        </div>
        <div v-else-if="dongOnly" class="tiles four">
          <div class="tile key"><span class="k">① 평균 평당가(매매)</span><span class="v pa-num">{{ dongPy ? vPy(dongPy) : '-' }}</span><span class="s rad">{{ region?.dong ?? '' }} {{ KIND_LABEL[kind] }} 매매 실거래 평균</span></div>
          <div class="tile"><span class="k">매매 거래</span><span class="v pa-num">{{ kindCount('매매').toLocaleString('ko-KR') }}건</span></div>
          <div class="tile"><span class="k">전세 거래</span><span class="v pa-num">{{ kindCount('전세').toLocaleString('ko-KR') }}건</span></div>
          <div class="tile"><span class="k">월세 거래</span><span class="v pa-num">{{ kindCount('월세').toLocaleString('ko-KR') }}건</span></div>
        </div>
        <div v-else :class="['tiles', { four: !props.app }]">
          <div class="tile key"><span class="k"><InfoTip :rows="estTip" under="box">{{ webEmbed ? `① 매도가 예상(${kindF})` : `실거래가 예상(${kindF})` }}</InfoTip></span><span :class="['v', 'pa-num', { won: isAptKind && kindF !== '월세' }]">{{ view ? vEst(view.est) : '-' }}</span><!-- 웹 — 0건이 돼도 아래 두 줄 자리를 그대로(칸 높이가 줄면 아래 필터 · 표가 통째로 올라갔다 내려왔다, 2026-11-12 사용자 '엘베 누르면 흔들려') --><span v-if="webEmbed || view?.capped" class="cap" :style="{ visibility: view?.capped ? 'visible' : 'hidden' }">보증보험 한도 적용</span><span v-if="webEmbed || view" class="s rad">{{ webEmbed ? (estFormula || '\u00a0') : `반경 ${radText(radius)} · ${periodText(loadedMonths)} · ${(view?.n ?? 0).toLocaleString('ko-KR')}건` }}</span></div>
          <div class="tile"><span class="k">{{ kindF === '월세' ? '평균 평당 월세' : '평균 평당가' }}</span><span class="v pa-num">{{ view ? vPy(view.avgPy) : '-' }}</span></div>
          <!-- 선정물건 정보 — 유사 거래를 찾는 가운데 기준(실제 범위는 아래 「계산 조건」 줄) -->
          <div v-if="isAptKind" class="tile area"><span class="k">면적 <small class="k-sub">공급(전용)</small> / 연식</span><span class="v pa-num sm">{{ aptMyArea }}</span><span class="s">{{ me.year ? `${me.year}년식` : '-' }}</span></div>
          <div v-else class="tile"><span class="k">전용 / 연식</span><span class="v pa-num sm">{{ myPy ? `${myPy.toFixed(2)}평` : '-' }} / {{ me.year ? `${me.year}년식` : '-' }}</span></div>
          <div class="tile"><span class="k">유사 거래건수</span><span class="v pa-num">{{ view?.n ?? 0 }}건</span></div>
        </div>
      </div>
    </div>

    <!-- Ⓑ 근거 -->
    <div class="zone">
      <!-- 앱 — 지도는 한 줄로 접어 두고 누르면 편다 -->
      <!-- 앱 — 근거 유사물건 아래 지도 · 필터는 뺐다. 이름 줄 · 지번 · 거래 수 · 리스트만(2026-11-13 사용자) -->
      <div v-if="props.app || sonApp" class="map-title static"><span class="pa-tag">근거</span><b>유사물건</b><span v-if="props.app" class="mt-count pa-num">지번 {{ listPlaces }}곳 · 거래 {{ shownRows.length }}건</span>
        <!-- 앱 — 지도 대신 이 줄 오른쪽 단추로 임장경로에 넣는다. 고르기 창 · 저장 자리는 웹 지도의 '임장경로에 추가'와 같다(2026-11-13 사용자) -->
        <button v-if="props.app && !loose && (addList.length || savedCompare?.items.length)" type="button" :class="['add-btn app', { done: savedCompare?.items.length }]" :aria-expanded="addOpen" @click="toggleAdd">
          <template v-if="savedCompare?.items.length">✓ 비교 임장경로 {{ savedCompare.items.length }}곳</template><template v-else>＋ 비교 임장경로에 추가</template>
        </button>
      </div>
      <p v-if="props.app && addMsg" class="add-msg app">{{ addMsg }}</p>
      <Teleport to="body">
        <template v-if="props.app && addOpen && !loose">
          <div class="add-dim" @click="addOpen = false" />
          <div class="add-pop app" role="dialog" aria-label="임장경로에 비교 물건 넣기">
            <i class="grab" aria-hidden="true" />
            <b>임장경로에 비교 물건 넣기</b>
            <small>이 물건의 임장경로 정류장에 「현장 기록」으로 붙습니다. 기본은 500m 안 가까운 5곳.</small>
            <div class="add-items">
              <label v-for="g in addList" :key="g.jibun"><input v-model="addPick" type="checkbox" :value="g.jibun"><i class="n">{{ orderOf[g.jibun] }}</i><span class="nm">{{ g.name }}</span><span :class="['d', { far: g.dist > 500 }]">{{ g.dist }}m</span></label>
            </div>
            <p v-if="!addList.length" class="none">넣을 유사물건이 없습니다.</p>
            <button type="button" class="ok" :disabled="!addPick.length" @click="saveCompare">{{ addPick.length }}곳 넣기</button>
          </div>
        </template>
      </Teleport>
      <div v-if="!sonApp && !props.app" class="map">
        <div ref="mapEl" class="map-in" />
        <KakaoMapTools v-if="kTools" :k="kTools.k" :map="kTools.map" :near="webEmbed ? mySpot : null" />
        <button v-if="webEmbed && !fs && !props.app" type="button" class="fs-btn" aria-label="지도 전체화면으로 보기" @click="fs = true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>전체화면</button>
        <!-- 근거 제목은 지도 왼쪽 위에 — 따로 줄을 두지 않아 지도를 위로 더 보인다 -->
        <div v-if="!props.app" class="map-title"><span class="pa-tag">근거</span><b>{{ mkV ? '유사 실거래' : '유사물건' }}</b></div>
        <div v-if="addOpen && !loose" class="add-pop" role="dialog" aria-label="임장경로에 비교 물건 넣기">
          <b>임장경로에 비교 물건 넣기</b>
          <small>이 물건의 임장경로 정류장에 「현장 기록」으로 붙습니다. 기본은 500m 안 가까운 5곳.</small>
          <label v-for="g in addList" :key="g.jibun"><input v-model="addPick" type="checkbox" :value="g.jibun"><i class="n">{{ orderOf[g.jibun] }}</i>{{ g.name }}<span :class="['d', { far: g.dist > 500 }]">{{ g.dist }}m</span></label>
          <p v-if="!addList.length" class="none">지도에 유사물건이 없습니다.</p>
          <button type="button" class="ok" :disabled="!addPick.length" @click="saveCompare">{{ addPick.length }}곳 넣기</button>
        </div>
        <button v-if="!loose && (addList.length || savedCompare?.items.length)" type="button" :class="['add-btn', { done: savedCompare?.items.length && !addOpen }]" :aria-expanded="addOpen" @click="toggleAdd">
          <template v-if="savedCompare?.items.length && !addOpen">✓ 비교 임장경로 {{ savedCompare.items.length }}곳</template><template v-else>＋ 비교 임장경로에 추가</template>
        </button>
        <p v-if="addMsg" class="add-msg">{{ addMsg }}</p>
        <div v-if="mkV && popData" v-show="!popHide && popPos" ref="popEl" :class="['mk-pop', popPos?.side]" :style="popPos ? { left: `${popPos.left}px`, top: `${popPos.top}px`, '--tx': `${popPos.tx}px`, '--ty': `${popPos.ty}px` } : { left: '-9999px', top: '0' }" @click.stop>
          <div class="t"><span class="tt">{{ popData.title }}</span><button type="button" class="mk-x" aria-label="닫기" title="닫기" @click="closePop"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button></div>
          <div v-if="popData.sub" class="sub">{{ popData.sub }}</div>
          <dl><template v-for="(r, i) in popData.rows" :key="i"><dt>{{ r[0] }}</dt><dd :class="{ big: r[0] === '실거래가', big2: r[0] === '낙찰가' }">{{ r[1] }}<span v-if="r[2]" class="pct"> {{ r[2] }}</span></dd></template></dl>
          <template v-if="popData.sec"><div :class="['ph', popData.sec.c]">{{ popData.sec.t }}</div><dl><template v-for="(r, i) in popData.sec.rows" :key="i"><dt>{{ r[0] }}</dt><dd :class="{ big2: r[0] === '낙찰가' || r[0] === '매도가' }">{{ r[1] }}<span v-if="r[2]" class="pct"> {{ r[2] }}</span></dd></template></dl></template>
        </div>
        <div class="legend"><span v-if="!dongOnly"><i style="background:#e03e3e" />{{ meName }}</span><span v-if="!aucTab || aucRes === '실거래포함'"><i style="background:#2b4fd8" />{{ mkV ? '유사 실거래' : '유사물건' }}</span><template v-if="aucOn && aucTab"><span :class="['lg-nk', { off: soldOff }]" title="눌러서 켜고 끄기" style="cursor:pointer" @click="soldOff = !soldOff"><i />낙찰 후 매도 {{ aucStat.sold }}</span><span :class="['lg-rent', { off: rentOff }]" title="눌러서 켜고 끄기" @click="rentOff = !rentOff"><i />낙찰 후 전세 {{ aucRows.filter((a) => aucAfter.get(a.i)?.k === 'rent').length }}</span><span :class="['lg-un', { off: unOff }]" title="눌러서 켜고 끄기" @click="unOff = !unOff"><i />낙찰 {{ aucRows.filter((a) => !aucAfter.get(a.i)).length }}</span></template><template v-else-if="aucOn"><span class="lg-nk"><i />낙찰 후 매도</span><span :class="['lg-rent', { off: rentOff }]" title="눌러서 켜고 끄기" @click="rentOff = !rentOff"><i />낙찰 후 전세 {{ aucUnsold.filter((a) => aucAfter.get(a.i)?.k === 'rent').length }}</span><span :class="['lg-un', { off: unOff }]" title="눌러서 켜고 끄기" @click="unOff = !unOff"><i />낙찰 {{ aucUnsold.filter((a) => aucAfter.get(a.i)?.k !== 'rent').length }}</span></template></div>
        <p v-if="!mySpot && !loading && res" class="map-msg">{{ meName }} 위치를 찾지 못했습니다</p>
      </div>

      <!-- 전체화면 오른쪽 칸 맨 아래 — 유사물건 목록(지도 번호 순). 누르면 그 핀으로 -->
      <div v-if="fs" class="fs-list">
        <b class="fs-lh">{{ mkV ? '유사 실거래' : '유사물건' }} {{ fsList.length }}곳</b>
        <button v-for="g in fsList" :key="g.jibun" type="button" :class="['fs-it', { on: focus === g.jibun, off: g.list.every((r) => isOff(r)) }]" @click="fsGo(g)">
          <i class="n">{{ orderOf[g.jibun] ?? '' }}</i>
          <span class="nm">{{ g.name }}<small v-if="hosOf(g)" class="ho">{{ hosOf(g) }}</small><small>{{ g.list.filter((r) => !isOff(r)).length || g.list.length }}건 · {{ Math.round(g.dist) }}m</small></span>
          <span class="pr pa-num">{{ g.range }}</span>
        </button>
        <p v-if="!fsList.length" class="none">지도에 유사물건이 없습니다.</p>
      </div>
      <!-- 웹 — 매매수요와 같은 필터 부품(1줄 반경 · 거래 · 엘베 · 층, 2줄 기준 묶음 · 초기화 · 저장). 기간은 위 조회기간. 전체화면은 좁은 꼴 -->
      <SearchFilterBar v-if="webEmbed && !props.app" :draft="sfDraft" :compact="fs || sonApp" :hide="aucTab ? ['period', 'save', 'kind'] : loose ? ['period', 'save'] : ['period']" :extra="aucTab ? aucExtra : undefined" @extra="onExtra" :range-options="sfRadii" :period-options="[]" :kinds="KINDS" :kind-count="(k) => kindCount(k).toLocaleString('ko-KR')"
        :base-area="dongOnly ? 0 : me.areaM2" :base-year="dongOnly ? 0 : me.year" :lock="dongOnly ? { range: [DONG], sim: true, floorPick: true } : undefined" :area-max="AREA_MAX" :year-min="YEAR_MIN" :year-max="yearMax" :sim-range="sfSimRange"
        :is-default="false" :can-save="!loose" :saving="saving" :saved="!webDirty" :saved-day="savedAt ? new Date(savedAt).toLocaleDateString('sv-SE') : ''" @update:draft="sfSet" @reset="reset" @save="saveNow" />
      <div v-else-if="!props.app" :class="['conds', { web: webEmbed }]">
        <span class="pa-lab">반경<span class="pa-seg pa-out" role="radiogroup" aria-label="반경">
          <button v-for="r in RADII" :key="r" type="button" role="radio" :class="{ on: radius === r }" :aria-checked="radius === r" @click="radius = r" :data-t="radText(r)">{{ radText(r) }}</button>
        </span></span>
        <span class="pa-lab">거래<span class="pa-seg kindF" role="radiogroup" aria-label="거래 종류">
          <button v-for="k in KINDS" :key="k" type="button" role="radio" :data-k="k" :class="{ on: kindF === k }" :aria-checked="kindF === k" @click="kindF = k">{{ k }} {{ kindCount(k) }}</button>
        </span></span>
        <span class="pa-lab mode-pick"><InfoTip v-if="webEmbed" :rows="modeTip" under="box">기준</InfoTip><template v-else>기준</template><span class="pa-seg pa-out" role="radiogroup" aria-label="유사 조건 방식">
          <button type="button" role="radio" :class="{ on: simMode === 'sim' }" :aria-checked="simMode === 'sim'" @click="setSimMode('sim')" data-t="유사도">유사도</button>
          <button type="button" role="radio" :class="{ on: simMode === 'range' }" :aria-checked="simMode === 'range'" @click="setSimMode('range')" data-t="직접범위">직접범위</button>
        </span></span>
        <!-- 웹 기본 화면 — 엘베는 기준 옆(전체화면에선 아래 거르기 상자 안 층 밑) -->
        <span v-if="webEmbed && !fs" class="pa-lab elev-pick">엘베<span class="pa-seg pa-out" role="radiogroup" aria-label="엘베">
          <button type="button" role="radio" :class="{ on: !elevPick }" :aria-checked="!elevPick" @click="elevPick = null" data-t="전체">전체</button>
          <button type="button" role="radio" :class="{ on: elevPick === 'yes' }" :aria-checked="elevPick === 'yes'" @click="elevPick = 'yes'" data-t="있음">있음</button>
          <button type="button" role="radio" :class="{ on: elevPick === 'no' }" :aria-checked="elevPick === 'no'" @click="elevPick = 'no'" data-t="없음">없음</button>
        </span></span>
        <!-- 웹 기본 화면 — 층은 엘베 옆(유사도에서도 '같은 층'이면 같은 층만) -->
        <span v-if="webEmbed && !fs" class="pa-lab floor-pick">층<span class="pa-seg pa-out" role="radiogroup" aria-label="층">
          <button type="button" role="radio" :class="{ on: rangeCond.floor !== 0 }" :aria-checked="rangeCond.floor !== 0" @click="rangeCond = { ...rangeCond, floor: null }" data-t="전체">전체</button>
          <button type="button" role="radio" :class="{ on: rangeCond.floor === 0 }" :aria-checked="rangeCond.floor === 0" @click="rangeCond = { ...rangeCond, floor: 0 }" data-t="같은 층">같은 층</button>
        </span></span>
        <span class="acts-r">
          <button type="button" :class="['reset-btn', { undo: undoSnap }]" :aria-label="undoSnap ? '되돌리기' : '초기화'" :title="undoSnap ? '되돌리기 — 5초 안에 누르면 바로 전으로' : '반경 · 거래 · 유사도 · 값 거르기를 처음 값으로'" @click="reset">
            <svg v-if="undoSnap" class="undo-ic" viewBox="0 0 24 24" aria-hidden="true"><circle class="trk" cx="12" cy="12" r="10" /><circle class="run" cx="12" cy="12" r="10" /><path d="M9.2 9.6a3.6 3.6 0 1 1-.6 4.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /><path d="M8.4 7.4v2.8h2.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
            <template v-else>초기화</template>
          </button>
          <button v-if="!loose" type="button" :class="['save-btn', saving ? 'saving' : webDirty ? 'dirty' : 'saved', { two: webEmbed }]" aria-live="polite" @click="saveNow">
            <template v-if="saving">저장 중…</template><template v-else-if="webDirty">{{ webEmbed ? '저장하기' : '저장' }}</template><template v-else>{{ webEmbed ? '저장됨' : '✓ 저장됨' }}<small v-if="stamp">{{ stamp }}</small></template>
          </button>
        </span>
        <div :class="['simrow', { 'has-elev': webEmbed }]">
          <SimRangeBox v-if="simMode === 'sim'" class="simA" :sim="sim" :text="webEmbed ? simDefText(sim).replace(/ · 층.*$/, '') : simDefText(sim)" @update="(v) => (sim = v)" />   <!-- 유사도 막대 — 부품 하나(입지비교와 같다) -->
          <div v-else class="simB">
            <!-- 웹(전체화면 아님) — 면적 · 건축 막대는 부품 하나(RangeInputBox — 막대를 빼고 적는 칸, 매매수요 입지비교와 같다). 범위 규칙은 services/rangeClamp -->
            <template v-if="webEmbed && !fs">
              <RangeInputBox label="면적 ㎡" :min="AREA_MIN" :max="AREA_MAX" :lo="rangeCond.mMin" :hi="rangeCond.mMax" :base="me.areaM2" :lo-text="areaTx(rangeCond.mMin)" :base-text="areaTx(me.areaM2)" :hi-text="areaTx(rangeCond.mMax)" :sub="`${(rangeCond.mMin / PY).toFixed(1)}~${(rangeCond.mMax / PY).toFixed(1)}평`" @update="(lo, hi) => (rangeCond = { ...rangeCond, mMin: lo ?? rangeCond.mMin, mMax: hi ?? rangeCond.mMax })" />
              <RangeInputBox label="건축" :min="YEAR_MIN" :max="yearMax" :lo="rangeCond.yMin" :hi="rangeCond.yMax" :base="me.year" :lo-text="String(rangeCond.yMin)" :base-text="String(me.year)" :hi-text="String(rangeCond.yMax)" :sub="`${yearMax - rangeCond.yMax + 1}~${yearMax - rangeCond.yMin + 1}년차`" @update="(lo, hi) => (rangeCond = { ...rangeCond, yMin: lo ?? rangeCond.yMin, yMax: hi ?? rangeCond.yMax })" />
            </template>
            <template v-else>
              <div :class="['dl', { one: webEmbed && !fs }]"><span class="dn">{{ webEmbed && !fs ? '면적 ㎡' : '면적' }}<small v-if="webEmbed && !fs" class="pa-num">{{ (rangeCond.mMin / PY).toFixed(1) }}~{{ (rangeCond.mMax / PY).toFixed(1) }}평</small></span>
                <div class="dual">
                  <div class="track"><i class="fill" :style="fillStyle(rangeCond.mMin, rangeCond.mMax, AREA_MIN, AREA_MAX)" /><i class="base" :data-label="webEmbed && !fs ? '' : `${me.areaM2.toFixed(2)}㎡`" :style="{ left: baseLeft(me.areaM2, AREA_MIN, AREA_MAX) }" /><span v-if="webEmbed && !fs" class="tvg m pa-num" :style="{ left: baseLeft(me.areaM2, AREA_MIN, AREA_MAX) }"><i>{{ areaTx(rangeCond.mMin) }}</i><i class="me">{{ areaTx(me.areaM2) }}</i><i>{{ areaTx(rangeCond.mMax) }}</i></span></div>
                  <input type="range" :min="AREA_MIN" :max="AREA_MAX" step="1" :value="rangeCond.mMin" aria-label="면적 최소(㎡)" @input="setRange('mMin', Number(($event.target as HTMLInputElement).value), $event.target as HTMLInputElement)">
                  <input type="range" :min="AREA_MIN" :max="AREA_MAX" step="1" :value="rangeCond.mMax" aria-label="면적 최대(㎡)" @input="setRange('mMax', Number(($event.target as HTMLInputElement).value), $event.target as HTMLInputElement)">
                </div>
                <b v-if="!(webEmbed && !fs)">{{ areaTx(rangeCond.mMin) }}~{{ areaTx(rangeCond.mMax) }}㎡<small>{{ (rangeCond.mMin / PY).toFixed(1) }}~{{ (rangeCond.mMax / PY).toFixed(1) }}평</small></b>
              </div>
              <div :class="['dl', { one: webEmbed && !fs }]"><span class="dn">건축<small v-if="webEmbed && !fs" class="pa-num">{{ yearMax - rangeCond.yMax + 1 }}~{{ yearMax - rangeCond.yMin + 1 }}년차</small></span>
                <div class="dual">
                  <div class="track"><i class="fill" :style="fillStyle(rangeCond.yMin, rangeCond.yMax, YEAR_MIN, yearMax)" /><i class="base" :data-label="webEmbed && !fs ? '' : `${me.year}년`" :style="{ left: baseLeft(me.year, YEAR_MIN, yearMax) }" /><span v-if="webEmbed && !fs" class="tvg y pa-num" :style="{ left: baseLeft(me.year, YEAR_MIN, yearMax) }"><i>{{ rangeCond.yMin }}</i><i class="me">{{ me.year }}</i><i>{{ rangeCond.yMax }}</i></span></div>
                  <input type="range" :min="YEAR_MIN" :max="yearMax" step="1" :value="rangeCond.yMin" aria-label="건축 최소(년)" @input="setRange('yMin', Number(($event.target as HTMLInputElement).value), $event.target as HTMLInputElement)">
                  <input type="range" :min="YEAR_MIN" :max="yearMax" step="1" :value="rangeCond.yMax" aria-label="건축 최대(년)" @input="setRange('yMax', Number(($event.target as HTMLInputElement).value), $event.target as HTMLInputElement)">
                </div>
                <b v-if="!(webEmbed && !fs)">{{ rangeCond.yMin }}~{{ rangeCond.yMax }}년<small>{{ yearMax - rangeCond.yMax + 1 }}~{{ yearMax - rangeCond.yMin + 1 }}년차</small></b>
              </div>
            </template>
            <span v-if="!webEmbed" class="pa-lab">층<span class="pa-seg pa-out" role="radiogroup" aria-label="층">
              <button type="button" role="radio" :class="{ on: rangeCond.floor !== 0 }" :aria-checked="rangeCond.floor !== 0" @click="rangeCond = { ...rangeCond, floor: null }" data-t="전체">전체</button>
              <button type="button" role="radio" :class="{ on: rangeCond.floor === 0 }" :aria-checked="rangeCond.floor === 0" @click="rangeCond = { ...rangeCond, floor: 0 }" data-t="같은 층">같은 층</button>
            </span></span>
          </div>
          <!-- 전체화면 — 거르기 상자 안, 유사도 · 직접범위 어느 쪽이든 층 → 엘베 순서(면적 · 건축과 같은 틀) -->
          <span v-if="webEmbed && fs" class="pa-lab floor-pick">층<span class="pa-seg pa-out" role="radiogroup" aria-label="층">
            <button type="button" role="radio" :class="{ on: rangeCond.floor !== 0 }" :aria-checked="rangeCond.floor !== 0" @click="rangeCond = { ...rangeCond, floor: null }" data-t="전체">전체</button>
            <button type="button" role="radio" :class="{ on: rangeCond.floor === 0 }" :aria-checked="rangeCond.floor === 0" @click="rangeCond = { ...rangeCond, floor: 0 }" data-t="같은 층">같은 층</button>
          </span></span>
          <span v-if="webEmbed && fs" class="pa-lab elev-pick">엘베<span class="pa-seg pa-out" role="radiogroup" aria-label="엘베">
            <button type="button" role="radio" :class="{ on: !elevPick }" :aria-checked="!elevPick" @click="elevPick = null" data-t="전체">전체</button>
            <button type="button" role="radio" :class="{ on: elevPick === 'yes' }" :aria-checked="elevPick === 'yes'" @click="elevPick = 'yes'" data-t="있음">있음</button>
            <button type="button" role="radio" :class="{ on: elevPick === 'no' }" :aria-checked="elevPick === 'no'" @click="elevPick = 'no'" data-t="없음">없음</button>
          </span></span>
        </div>
      </div>

      <!-- 앱 — 지번 · 거래 수는 위 '유사물건' 옆으로 옮겼다(2026-11-13 사용자) -->
      <div v-if="!props.app" class="list-tools">
        <span v-if="webEmbed && aucTab" class="lt-count pa-num">낙찰 {{ aucStat.n.toLocaleString('ko-KR') }}건</span>
        <span v-else-if="webEmbed" class="lt-count pa-num">지번 {{ listPlaces }}곳 · 거래 {{ shownRows.length }}건</span>
        <!-- 앱 — 공시가 · 전세가율 글은 뺐다(공시가 칸이 없다, 2026-11-13 사용자) -->
        <div v-if="!props.app && !dongOnly && !aucTab" class="warn-box" role="note">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>
          <!-- 앱 — 짧게(2026-11-09) -->
          <template v-if="props.app">
            <span v-if="pubMissing && !typedPub"><b>공시가 없음</b> — 맨 위 빨간 줄 공시가 칸에 적으면 계산합니다.</span>
            <span v-else><b>공시가 기준</b> 자동 계산 <span class="ref">(전세가율 1.26)</span></span>
          </template>
          <span v-else-if="pubMissing && !typedPub">이 물건은 <b>공시지가가 없어</b> 매매가율·전세가·갭이 자동 계산되지 않습니다. 경매물건 행(맨 위 빨간색)의 <b>공시가 칸</b>에 숫자를 직접 입력하면 추정치가 계산됩니다. <span class="ref">(전세가율 1.26 단순 적용)</span></span>
          <span v-else-if="!props.app">이 물건은 <b>공시지가 기준</b> 매매가율·전세가·갭이 자동 계산됩니다. <span class="ref">(전세가율 1.26 단순 적용)</span></span>
        </div>
        <button v-if="keptNames.length && !props.app" type="button" class="pa-fchip" @click="colFilter.clearAll()">필터 적용 중: {{ keptNames.join(' · ') }} &nbsp;✕ 모두 지우기</button>
      </div>

      <div v-if="aucTab" class="pa-list">
        <div class="tbl-wrap"><table class="even mk-auc">
          <colgroup><col style="width: 84px"><col style="width: 112px"><col style="width: 44px"><col style="width: 100px"><col style="width: 104px"><col style="width: 48px"><col style="width: 74px"><col style="width: 52px"><col style="width: 56px"><col style="width: 56px"><col><col style="width: 90px"></colgroup>
          <thead><tr><th>매각일</th><th>사건번호</th><th>차수</th><th><span class="hk">감정가<small class="hk-sub">최저가</small></span></th><th><span class="hk">낙찰가<small class="hk-sub">낙찰가율</small></span></th><th>응찰</th><th>전용</th><th>엘베</th><th><span class="hk">건축<small class="hk-sub">연차</small></span></th><th>거리</th><th>주소</th><th class="acts-th"><span class="sr">바로가기</span></th></tr></thead>
          <tbody>
            <tr v-for="a in aucList" :key="a.i" :class="{ on: focusAuc === a.i }" @click="pickAuc(a)">
              <td class="pa-num">{{ a.date }}</td>
              <td>{{ a.cs }}</td>
              <td class="pa-num">{{ a.fails + 1 }}차</td>
              <td class="r pa-num two">{{ n0(a.ap) }}<small>{{ a.low ? n0(a.low) : '-' }}</small></td>
              <td class="r pa-num two"><span class="nakp">{{ n0(a.pr) }}</span><small><b>{{ a.rate.toFixed(1) }}%</b></small></td>
              <td class="pa-num">{{ a.bids }}명</td>
              <td class="pa-num two">{{ a.area ? `${a.area.toFixed(2)}㎡` : '-' }}<small v-if="a.area">{{ (a.area / PY).toFixed(2) }}평</small></td>
              <td><span v-if="elevs[a.lot] === undefined || elevs[a.lot] === null" class="ev u">-</span><span v-else-if="(elevs[a.lot] ?? 0) > 0" class="ev o">있음</span><span v-else class="ev x">없음</span></td>
              <td class="pa-num two">{{ a.year || '-' }}<small v-if="a.year">{{ yearMax - a.year + 1 }}년차</small></td>
              <td class="pa-num">{{ spots[a.lot] && mySpot && !dongOnly ? `${Math.round(distM(mySpot, spots[a.lot]!)).toLocaleString('ko-KR')}m` : '-' }}</td>
              <td class="l" :data-tip="a.addr" data-tip-pos="right"><div class="pa-addr"><span class="addr">{{ [region?.dong, a.lot, a.name, a.ho ? `${a.ho}호` : ''].filter(Boolean).join(' ') }}</span>
                <!-- 낙찰 후 거래 — 칸을 따로 두지 않고 주소 아래 작게(표가 넓어지지 않게, 2026-11-29 사용자) -->
                <span v-if="aucAfter.get(a.i)" class="aft-s" :title="aucAfter.get(a.i)!.est ? aucAfter.get(a.i)!.cand : undefined"><span :class="['ab-b', aucAfter.get(a.i)!.k === 'sell' ? 'sold' : 'rent']">{{ aucAfter.get(a.i)!.k === 'sell' ? '매도' : '전세' }}</span>{{ aucAfter.get(a.i)!.r.contractDate }} · {{ n0(aucAfter.get(a.i)!.r.price) }}<template v-if="aucAfter.get(a.i)!.k === 'sell'"> · {{ monthsBetween(a.ymd, aucAfter.get(a.i)!.r.contractDate) }}개월 뒤</template><template v-if="aucAfter.get(a.i)!.est"> · 추정</template></span></div></td>
              <td class="acts-td" @click.stop><span class="acts">
                <button type="button" class="ab n" title="네이버 부동산에서 보기" aria-label="네이버 부동산에서 보기" @click="goNaver(a.addr)">N</button>
                <button type="button" :class="['ab p', { ok: okKey === `a${a.i}P` }]" title="부동산플래닛에서 보기" aria-label="부동산플래닛에서 보기" @click="goPlanet(`${region?.dong ?? ''} ${a.lot}`, `a${a.i}P`)">P</button>
                <button type="button" :class="['ab', { ok: okKey === `a${a.i}C` }]" title="주소 복사" aria-label="주소 복사" @click="copy(a.addr, `a${a.i}C`)"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg></button>
              </span></td>
            </tr>
            <tr v-if="!aucRows.length" class="nohover"><td colspan="12" class="pa-empty">{{ aucRaw.length ? '고른 범위 · 조건에 낙찰사례가 없습니다.' : '낙찰 자료를 불러오는 중이거나 이 동의 낙찰 자료가 없습니다.' }}</td></tr>
          </tbody>
        </table></div>
        <button v-if="aucRows.length > MORE_AT" type="button" class="more" @click="aucMore = !aucMore">{{ aucMore ? '접기' : `더 보기 (${aucRows.length - MORE_AT}건)` }}</button>
        <p class="list-foot">※ 낙찰은 매각된 사건만 넣습니다(유찰 · 취하 · 변경은 뺍니다). 낙찰가율은 낙찰가 ÷ 감정가로 계산합니다.<br>※ 낙찰 후 거래는 낙찰일 뒤의 실거래(매매 · 전세) 중 호수가 낙찰 호수와 같은 것입니다. 실거래 호수는 공동주택가격 호실 목록에서 같은 층 · 같은 전용 호실로 찾고, 그런 호실이 둘 이상이면 '○○·○○호 중 추정'으로 적습니다. 호수를 못 찾은 거래는 잇지 않습니다.<br>※ 거래 없음은 아직 안 판 것인지 못 판 것인지 가르지 못합니다.<br>※ 운영 표시는 지금 자료가 운영진만 보는 자료라는 뜻입니다.</p>
      </div>
      <div v-else class="pa-list">
        <!-- 앱 — 유사물건 표는 다섯 칸(주소 · 실거래가 · 연식 · 전용 · 엘베), 옆으로 밀지 않는다. 주소는 잘리면 … · 누르면 말풍선(2026-11-13 사용자) -->
        <div v-if="props.app" class="tbl-wrap app-tbl"><table>
          <colgroup><col style="width: 34%"><col style="width: 25%"><col style="width: 12%"><col style="width: 16%"><col style="width: 13%"></colgroup>
          <thead><tr><th>주소</th><th>실거래가</th><th>연식</th><th>전용</th><th>엘베</th></tr></thead>
          <tbody>
            <tr class="mine">
              <td class="l"><button type="button" class="at-addr" @click.stop="openAddrTip($event, myAddr)"><span class="kind me q">{{ meName }}</span><span class="at-line"><i class="no ph" aria-hidden="true" /><span class="at-tx">{{ myAddr }}</span></span></button></td>
              <td class="r pa-num at-two"><span class="est-lab">{{ kindF }} 예상</span>{{ view ? n0(view.est) : '-' }}</td>
              <td class="pa-num">{{ me.year || '-' }}</td>
              <td v-if="isAptKind" class="pa-num at-two">{{ areaLines(aptMyArea)[0] }}<small v-if="areaLines(aptMyArea)[1]">{{ areaLines(aptMyArea)[1] }}</small></td>
              <td v-else class="pa-num at-two">{{ me.areaM2.toFixed(2) }}㎡<small>{{ myPy.toFixed(2) }}평</small></td>
              <td><span v-if="myElev === null" class="ev u">-</span><span v-else-if="myElev > 0" class="ev o">{{ myElev }}대</span><span v-else class="ev x">없음</span></td>
            </tr>
            <tr v-for="r in listRows" :key="r.id">
              <td class="l"><button type="button" class="at-addr" @click.stop="openAddrTip($event, addrOf(r))"><span class="at-line"><i :class="['no', { ph: !orderOf[r.jibun] }]">{{ orderOf[r.jibun] || '' }}</i><span class="at-tx">{{ addrOf(r) }}</span></span></button></td>
              <td class="r pa-num">{{ n0(r.price) }}</td>
              <td class="pa-num">{{ r.buildYear || '-' }}</td>
              <td v-if="isAptKind" class="pa-num at-two">{{ areaLines(aptRowArea(r.areaM2, !!r.same, r))[0] }}<small v-if="areaLines(aptRowArea(r.areaM2, !!r.same, r))[1]">{{ areaLines(aptRowArea(r.areaM2, !!r.same, r))[1] }}</small></td>
              <td v-else class="pa-num at-two">{{ r.areaM2.toFixed(2) }}㎡<small>{{ (r.areaM2 / PY).toFixed(2) }}평</small></td>
              <td><span v-if="r.elev === undefined || r.elev === null" class="ev u">-</span><span v-else-if="r.elev > 0" class="ev o">{{ r.elev }}대</span><span v-else class="ev x">없음</span></td>
            </tr>
            <tr v-if="!listRows.length && res && !loading" class="nohover"><td colspan="5" class="pa-empty">반경 {{ radText(radius) }} 안에 조건에 맞는 거래가 없습니다.</td></tr>
          </tbody>
        </table></div>
        <div v-else class="tbl-wrap"><table ref="tableEl" :class="['even', { 'mk-v': mkV }]">
          <colgroup v-if="webEmbed && colWidths.length"><col v-for="(w, i) in colWidths" :key="i" :style="{ width: `${w}px` }"></colgroup>
          <thead><tr>
            <th v-if="webEmbed" class="ck-th" title="체크하면 매도가 예상 · 평균 · 건수에서 빠집니다">제외</th>
            <th>구분</th>
            <th v-for="c in shownCols" :key="c.key" :data-k="c.key" :aria-sort="sortK === c.key ? (webEmbed && sortDir === 'asc' ? 'ascending' : 'descending') : undefined" :class="{ hl: ['won', 'perPy', 'pub', 'gap'].includes(c.key) }">
              <span class="hk" :title="c.key === 'gap' ? '전세 = 공시가 × 126%(보증보험 한도)' : undefined" @click="sortBy(c.key)">{{ c.key === 'pub' ? (webEmbed ? '공시가' : '공시가 / 매매가율') : c.key === 'gap' ? '전세 / 갭' : c.key === 'area' && isAptKind ? '면적' : c.label }}<small v-if="c.key === 'area' && isAptKind" class="hk-sub">공급(전용)<i v-if="webEmbed" :class="['sdir', { on: sortK === c.key }]" aria-hidden="true">{{ sortK === c.key && sortDir === 'asc' ? '▲' : '▼' }}</i></small><small v-if="c.key === 'pub' && webEmbed" class="hk-sub">매매가율<i :class="['sdir', { on: sortK === c.key }]" aria-hidden="true">{{ sortK === c.key && sortDir === 'asc' ? '▲' : '▼' }}</i></small><small v-if="c.key === 'won' && aucOn" class="hk-sub">낙찰가</small><small v-if="c.key === 'year' && mkV" class="hk-sub">연차<i :class="['sdir', { on: sortK === c.key }]" aria-hidden="true">{{ sortK === c.key && sortDir === 'asc' ? '▲' : '▼' }}</i></small><i v-if="mkV && !hk2(c.key)" :class="['sdir', { on: sortK === c.key }]" aria-hidden="true">{{ sortK === c.key && sortDir === 'asc' ? '▲' : '▼' }}</i></span>
              <!-- 두 줄 머리(공시가 / 매매가율 · 면적 / 공급(전용))는 ▼ 를 아랫줄 오른쪽에 붙인다(2026-11-15 사용자) -->
              <i v-if="webEmbed && !hk2(c.key) && !mkV" :class="['sdir', { on: sortK === c.key }]" aria-hidden="true" @click="sortBy(c.key)">{{ sortK === c.key && sortDir === 'asc' ? '▲' : '▼' }}</i>
              <button v-else-if="!webEmbed" type="button" :class="['fv', { act: colFilter.isActive(c.key) }]" :aria-label="`${c.label} 값 거르기`" @click.stop="colFilter.open(c.key, $event)">▾</button>
            </th>
            <th class="acts-th"><span class="sr">바로가기</span></th>
          </tr></thead>
          <tbody>
            <!-- 맨 위 고정 — 선정물건. 거래가 아니라 견줄 기준이라 실거래가 예상을 적는다 -->
            <tr v-if="!dongOnly" :class="['mine', { on: webEmbed ? pickedRow === 'mine' : meOpen }]" @click="pickMineRow">
              <td v-if="webEmbed" class="ck-td" />
              <td><span class="kind me q">{{ meName }}</span></td>
              <td class="r"><span class="est-lab">{{ kindF }} 예상</span></td>
              <td v-if="kindF === '월세'" class="r pa-num two est-v">{{ view ? n0(view.est) : '-' }}<small>월세</small></td>
              <td v-else class="r pa-num est-v">{{ view ? n0(view.est) : '-' }}</td>
              <td class="r pa-num">{{ view ? n0(view.avgPy) : '-' }}</td>
              <td v-if="pubMissing" class="r two"><input class="pubin pa-num" placeholder="입력" inputmode="numeric" aria-label="선정물건 공시가" :value="typedPub ? n0(typedPub) : ''" @change="onPubInput"><small v-if="typedPub && view && kindF !== '월세'">{{ pct(view.est, typedPub) }}</small></td>
              <td v-else class="r pa-num two">{{ n0(curPub) }}<small>{{ view && kindF !== '월세' ? pct(view.est, curPub) : '-' }}</small></td>
              <td v-if="!curPub || kindF === '월세'" class="r two">{{ curPub ? n0(hug) : '-' }}</td>
              <td v-else-if="kindF === '전세'" class="r pa-num two">{{ n0(hug) }}<small :class="{ neg: view && view.est > hug }">{{ !view ? '-' : view.est > hug ? `▲ ${n0(view.est - hug)}` : '한도 안' }}</small></td>
              <td v-else class="r pa-num two">{{ n0(hug) }}<small :class="{ neg: view && view.est - hug < 0 }">{{ view ? `갭 ${n0(view.est - hug)}` : '-' }}</small></td>
              <td v-if="isAptKind" class="r pa-num two">{{ areaLines(aptMyArea)[0] }}<small v-if="areaLines(aptMyArea)[1]">{{ areaLines(aptMyArea)[1] }}</small></td>
              <td v-else class="r pa-num two">{{ me.areaM2.toFixed(2) }}㎡<small>{{ myPy.toFixed(2) }}평</small></td>
              <td><span v-if="myElev === null" class="ev u">-</span><span v-else-if="myElev > 0" class="ev o two">{{ myElev }}대<br>있음</span><span v-else class="ev x">없음</span></td>
              <td :class="['pa-num', { two: mkV && me.year }]">{{ me.year || '-' }}<small v-if="mkV && me.year">{{ yearMax - me.year + 1 }}년차</small></td>
              <td class="r pa-num">0m</td>
              <td class="pa-num">{{ me.floor || '-' }}</td>
              <td class="l" :data-tip="webEmbed ? myAddr : undefined" data-tip-pos="right"><div class="pa-addr"><span class="addr">{{ myAddr }}</span><span class="chips"><span class="same">경매지번</span></span></div></td>
              <td class="acts-td"><span class="acts">
                <button type="button" class="ab n" title="네이버 부동산에서 이 빌라 보기" aria-label="네이버 부동산에서 보기" @click="goNaver(props.auction.address)">N</button>
                <button type="button" :class="['ab p', { ok: okKey === 'mineP' }]" :title="`부동산플래닛에서 보기 — 「${region?.dong} ${lot}」를 복사해 두고 지도를 엽니다`" aria-label="부동산플래닛에서 보기" @click="goPlanet(`${region?.dong ?? ''} ${lot}`, 'mineP')">P</button>
                <button type="button" :class="['ab', { ok: okKey === 'mineC' }]" title="주소 복사" aria-label="주소 복사" @click="copy(props.auction.address, 'mineC')"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg></button>
              </span></td>
            </tr>
            <tr v-for="r in listRows" :key="r.id" :class="{ on: webEmbed ? (pickedRow === rowKey(r) || (mkV && !pickedRow && !!focus && focus === r.jibun)) : (r.same ? meOpen : (focus && focus === r.jibun)), off: isOff(r) }" @click="pickRow(r)">
              <td v-if="webEmbed" class="ck-td" @click.stop><input type="checkbox" :checked="isOff(r)" :aria-label="`${r.contractDate} ${r.name || r.jibun} 평균에서 빼기`" @change="toggleDrop(r)" /></td>
              <td><span :class="['kind', r.group === '전세' ? 'j' : r.group === '월세' ? 'm' : '']">{{ r.group }}</span><span v-if="aucOn && resaleOf.has(rowKey(r))" class="kind nak" title="이 호수가 경매로 낙찰된 뒤 팔린 거래(운영)">낙찰</span><span v-if="simPick && simPick === rowKey(r)" class="sim-pick" title="손품결론 '유사물건 실거래가'로 들어갑니다 — 다시 누르면 뺍니다">유사</span><span v-if="casePick && casePick === rowKey(r)" class="sim-pick" title="손품결론 '경매지번 실거래가'로 들어갑니다 — 다시 누르면 뺍니다">선택</span></td>
              <td class="pa-num">{{ r.contractDate }}</td>
              <template v-if="r.group === '월세'">
                <td class="r pa-num two">{{ n0(r.price) }}<small>월 {{ Math.round((r.monthly ?? 0) / 1e4) }}만</small></td>
                <td class="r pa-num two">{{ n0(r.perPy) }}<small>평당 월세</small></td>
                <td class="r pa-num">{{ r.pub ? n0(r.pub) : '' }}<span v-if="!r.pub" class="ph2">공시가 없음</span></td>
                <td class="r two">-</td>
              </template>
              <template v-else>
                <td :class="['r', 'pa-num', { two: aucOn && resaleOf.has(rowKey(r)) }]">{{ n0(r.price) }}<small v-if="aucOn && resaleOf.has(rowKey(r))" class="nakv">{{ n0(resaleOf.get(rowKey(r))!.pr) }}</small></td>
                <td class="r pa-num">{{ n0(r.perPy) }}</td>
                <td v-if="!r.pub" class="r"><span class="ph2">{{ units[r.jibun] ? '공시가 없음' : '조회 중' }}</span></td>
                <td v-else class="r pa-num two">{{ n0(r.pub) }}<small>{{ pct(r.price, r.pub) }}</small></td>
                <td v-if="!r.pub" class="r two">-</td>
                <td v-else-if="r.group === '전세'" class="r pa-num two">{{ n0(r.pub * HUG_RATE) }}<small :class="{ neg: r.price > r.pub * HUG_RATE }">{{ r.price > r.pub * HUG_RATE ? `▲ ${n0(r.price - r.pub * HUG_RATE)}` : '한도 안' }}</small></td>
                <td v-else class="r pa-num two">{{ n0(r.pub * HUG_RATE) }}<small :class="{ neg: r.price - r.pub * HUG_RATE < 0 }">갭 {{ n0(r.price - r.pub * HUG_RATE) }}</small></td>
              </template>
              <td v-if="isAptKind" class="r pa-num two">{{ areaLines(aptRowArea(r.areaM2, !!r.same, r))[0] }}<small v-if="areaLines(aptRowArea(r.areaM2, !!r.same, r))[1]">{{ areaLines(aptRowArea(r.areaM2, !!r.same, r))[1] }}</small></td>
              <td v-else class="r pa-num two">{{ r.areaM2.toFixed(2) }}㎡<small>{{ (r.areaM2 / PY).toFixed(2) }}평</small></td>
              <td><span v-if="r.elev === undefined || r.elev === null" class="ev u" :title="r.elev === null ? '건축물대장을 찾지 못했습니다' : '조회 중'">-</span><span v-else-if="r.elev > 0" class="ev o two">{{ r.elev }}대<br>있음</span><span v-else class="ev x">없음</span></td>
              <td :class="['pa-num', { two: mkV && r.buildYear }]">{{ r.buildYear || '-' }}<small v-if="mkV && r.buildYear">{{ yearMax - r.buildYear + 1 }}년차</small></td>
              <td class="r pa-num">{{ r.dist ?? '-' }}m</td>
              <td class="pa-num">{{ r.floorNo || '-' }}</td>
              <td class="l" :data-tip="webEmbed ? addrOf(r) : undefined" data-tip-pos="right"><div class="pa-addr"><span class="addr"><i v-if="orderOf[r.jibun]" class="no" :title="`임장 순서 ${orderOf[r.jibun]}번 — 지도 번호와 같다`">{{ orderOf[r.jibun] }}</i>{{ webEmbed ? addrShort(r) : addrOf(r) }}</span><span v-if="r.same" class="chips"><span class="same">경매지번</span><span v-if="Math.abs(r.areaM2 - me.areaM2) <= 0.05" class="same eq">같은면적</span></span><span v-else-if="fieldChips(r.jibun).length" class="chips"><span v-for="c in fieldChips(r.jibun)" :key="c.t" :class="['pa-fc', c.k]">{{ c.t }}</span></span></div></td>
              <td class="acts-td" @click.stop><span class="acts">
                <button type="button" class="ab n" title="네이버 부동산에서 이 빌라 보기 — 그 건물을 가운데 두고 지도를 바로 엽니다" aria-label="네이버 부동산에서 보기" @click="goNaver(fullAddr(r))">N</button>
                <button type="button" :class="['ab p', { ok: okKey === `${r.id}P` }]" :title="`부동산플래닛에서 보기 — 「${r.umdNm} ${r.jibun}」를 복사해 두고 지도를 엽니다`" aria-label="부동산플래닛에서 보기" @click="goPlanet(`${r.umdNm} ${r.jibun}`, `${r.id}P`)">P</button>
                <button type="button" :class="['ab', { ok: okKey === `${r.id}C` }]" title="주소 복사" aria-label="주소 복사" @click="copy(fullAddr(r), `${r.id}C`)"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg></button>
              </span></td>
            </tr>
            <tr v-if="!listRows.length && res && !loading" class="nohover"><td :colspan="COLS.length + (webEmbed ? 3 : 2)" class="pa-empty">{{ isDong ? `${region?.dong ?? ''} 전체에` : `반경 ${radText(radius)} 안에` }} 조건에 맞는 거래가 없습니다. 조건을 넓혀 보세요.
              <div class="btns">
                <button v-if="!isDong && radius < RADII[RADII.length - 1]" type="button" @click="widen('r')">반경 {{ radText(RADII.find((v) => v > radius) ?? 1000) }}로</button>
                <button type="button" @click="widen('s')">유사도 낮추기</button>
                <button v-if="loadedMonths < PERIODS[PERIODS.length - 1]" type="button" @click="widen('p')">기간 늘려 조회</button>
              </div>
            </td></tr>
          </tbody>
        </table></div>
        <button v-if="shownRows.length > MORE_AT" type="button" class="more" @click="showAll = !showAll">{{ showAll ? '접기' : `더 보기 (${shownRows.length - MORE_AT}건)` }}</button>
      </div>
      <!-- 앱 — 제외 · 공시가 칸이 없어 그 설명은 뺀다 -->
      <p v-if="props.app" class="list-foot">※ 맨 위 빨간 줄은 {{ meName }}입니다(비교 기준이라 계산에 넣지 않습니다).<br>※ 위치를 찾은 거래만 나옵니다. 주소 앞 번호는 비교 임장 순서입니다.</p>
      <p v-else-if="!aucTab" class="list-foot">※ 맨 위 빨간 줄은 {{ meName }}입니다(비교 기준이라 계산에 넣지 않습니다).<br>※ 공시가는 공동주택가격입니다. 매매가율 = 실거래가 ÷ 공시가, 전세 = 공시가 × 126%(보증보험 한도, 지역 · 평형 보정 없음), 갭 = 실거래가 − 전세.<br>※ 위치를 찾은 거래만 나옵니다. 주소 앞 번호는 비교 임장 순서입니다.<br>※ <template v-if="webEmbed">제외 칸에 체크한 거래는 실거래가 예상 · 평균 · 건수에서 빠집니다(체크는 물건에 남습니다).</template><template v-else>머리글 ▾로 값을 빼면 그 거래는 표 · 지도 · 실거래가 예상에서 빠집니다(물건에 남습니다).</template></p>
    </div>

    <ColumnFilterPanel :ctl="colFilter" />
    <Teleport to="body"><p v-if="addrTip" class="at-tip" :style="addrTip.style" role="tooltip" @click="addrTip = null">{{ addrTip.text }}</p></Teleport>
  </section>
  </Teleport>

  <!-- 입력 — 호가는 따로 흰 상자(손품조사에서만 — 시장분석 물건분석엔 호가를 옮겨 그릴 물건상세가 없다). 손품조사의 네이버 매물조사(호가)를 여기로 옮겨 그린다(AuctionDetailPage 가 #sonAskSlot 으로 보낸다) -->
  <section v-if="sonAskReady" class="pa pa-card" aria-label="호가 입력">
    <div class="zone">
      <div class="zone-h"><span class="pa-tag">입력</span><h3>호가 입력</h3></div>
      <div id="sonAskSlot" :ref="askSlotRef" class="app-detail tab-survey son-detail" />
    </div>
  </section>
  </div>
</template>

<style scoped>
.pa-wrap { display: grid; gap: 10px; min-width: 0; }   /* 가격분석 · 호가 입력 — 흰 상자 둘 */
.pa { --fg: #111827; --sub: #6b7280; --line: #e5e7eb; --soft: #f7f8fb; --head: #f3f5f9; --navy: #2b3a67; --blue: #2b4fd8; --blue-tint: #eef2ff;
  --green: #5aae6e; --green-tint: #e8f6ee; --ok: #22a55a; --red: #e03e3e; --todo: #9ca3af; --amber: #b7791f;
  background: #fff; border: 1px solid #e8ecf3; border-radius: 12px; padding: 18px 22px 24px; display: grid; gap: 18px; min-width: 0; color: var(--fg); -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
.pa-num { font-variant-numeric: tabular-nums; }
.pa button { font: inherit; }
.pa-err { margin: 0; color: var(--red); font-size: 13px; }

.bar-desc { font-size: 13px; color: var(--sub); margin-left: 4px; min-width: 0; }
.bar-desc.hi { color: #2563eb; }   /* 웹 — 어느 동네 · 반경 · 기간으로 낸 값인지 파란 글(2026-11-11 사용자) */
.bar-desc .flt { margin-right: 4px; vertical-align: -1px; color: var(--text, #111827); }   /* 필터 설명 앞 깔때기(규칙) */
.pa-load-r { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; }
.pa-load-r .prog { font-size: 12px; color: var(--sub); white-space: nowrap; min-width: 10.5em; text-align: right; font-variant-numeric: tabular-nums; }   /* 숫자가 늘어도 옆 단추를 밀지 않게 */
.pa-seg { display: inline-flex; gap: 4px; background: #f3f5f9; border-radius: 6px; padding: 3px; height: 32px; box-sizing: border-box; align-items: center; }
.pa-seg button { border: none; background: transparent; border-radius: 5px; height: 26px; padding: 0 13px; font-size: 14px; font-weight: 400; color: #6b7280; cursor: pointer; white-space: nowrap; }
/* 고른 칸 = 앱 파랑 가는 테두리 + 굵은 파란 글자 — 거래(매매 · 전세 · 월세)만 칩 색 채움 */
.pa-seg.pa-out button.on { background: #fff; color: #2b6df3; font-weight: 700; box-shadow: inset 0 0 0 1px #2b6df3; }
/* 고른 칸만 굵어져도 폭이 그대로 — 굵은 글 폭을 data-t 로 미리 잡는다(조회기간 상자가 누를 때마다 커졌다 작아졌다, 2026-11-11 사용자 · 흔들림 금지) */
.pa-seg button[data-t] { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; }
.pa-seg button[data-t]::after { content: attr(data-t); height: 0; overflow: hidden; visibility: hidden; font-weight: 700; pointer-events: none; user-select: none; }
.pa-load { height: 32px; min-width: 136px; padding: 0 18px; border: none; border-radius: 6px; background: #1f3a72; color: #fff; font-size: 14px; font-weight: 800; cursor: pointer; white-space: nowrap; }
.pa-load:hover { background: #16305f; }
.pa-load.dirty { box-shadow: 0 0 0 3px #dbe5ff; }
.pa-load:disabled { opacity: .7; cursor: default; }

.zone { display: grid; gap: 10px; min-width: 0; }
.zone-h { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.zone-h h3 { margin: 0; font-size: 15px; font-weight: 800; }
.pa-tag { font-size: 13px; font-weight: 700; color: var(--blue); background: var(--blue-tint); border-radius: 5px; padding: 3px 8px; }
.zone-h .side { margin-left: auto; font-size: 12px; color: var(--sub); }

/* Ⓐ 띠 */
.est { background: var(--soft); border-radius: 10px; padding: 14px; display: grid; gap: 12px; }
.tiles { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 10px; }
.tiles.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 1000px) { .tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.tile { background: #fff; border-radius: 10px; padding: 13px 8px; text-align: center; display: grid; gap: 5px; box-shadow: 0 1px 2px rgba(17, 24, 39, .04); min-width: 0; }
.tile .k { font-size: 13px; color: var(--sub); }
.tile .v { font-size: 19px; font-weight: 700; color: var(--navy); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile .v.sm { font-size: clamp(12.5px, 1.15vw, 15px); }   /* 좁은 화면에서 「20.26평 / 2018년식」이 잘리지 않게 */
.tile.key { background: var(--green); box-shadow: 0 0 0 2px #4b9a5e inset; }
.tile.key .k { color: #eaf6ee; }
.tile.key .v { color: #fff; font-size: 23px; }
.tile.key :deep(.itip-i) { color: #eaf6ee; }
.tile.key { position: relative; }   /* 말풍선은 이 칸 아래 밖에 — 칸 안 금액을 가리지 않게 */
.tile.key :deep(.itip-bubble) { left: 0; transform: none; z-index: 600; }   /* 왼쪽 끝 칸 — 오른쪽으로 펼친다 */
.tile.key :deep(.itip-bubble)::before { left: 40px; transform: none; }
.tile.key .s.rad { color: #fff; }   /* 초록 칸 아래 — 어느 반경 · 기간 · 몇 건으로 낸 값인지(2026-11-11 사용자) */
.tile .s { font-size: 12px; color: var(--sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hk-sub { display: block; font-size: 12px; font-weight: 400; color: var(--sub); }   /* 아파트 면적 머리 — '공급(전용)' */
.tile .cap { justify-self: center; font-size: 11px; color: #fff; background: rgba(0, 0, 0, .18); border-radius: 999px; padding: 1px 8px; }
/* 웹 내비게이터(매도가 예상 · 평균 평당가 · 전용/연식 · 건수) — 네 칸 모두 같은 세 줄(이름 18 · 금액 30 · 아래 글 16)로 고정해 이름 · 금액 · 아래 글 줄이 가로로 맞고,
   값이 없어도(0건) 칸 높이가 그대로(2026-11-12 사용자 '세로 맞춰 고정 · 금액도 줄 맞춰'). '보증보험 한도 적용'은 줄을 늘리지 않게 칸 오른쪽 위 작은 딱지로 */
.tiles.four .tile { grid-template-rows: 18px 30px 16px; align-content: center; row-gap: 4px; padding: 12px 8px; }
.tiles.four .tile > .k { align-self: center; line-height: 18px; }
.tiles.four .tile > .v, .tiles.four .tile.key > .v, .tiles.four .tile > .v.sm { align-self: center; line-height: 30px; font-size: 20px; }   /* 금액 · 면적 글 크기를 네 칸 모두 같게 — 크기가 달라 7.5억 · 2,938만 · 면적 · 2건 글줄이 어긋났다(2026-11-12 사용자) */
.tiles.four .tile > .s { align-self: center; line-height: 16px; grid-row: 3; }
.tiles.four .tile.key .cap { position: absolute; top: 6px; right: 6px; padding: 0 6px; line-height: 16px; }

/* 지도 */
.map { position: relative; z-index: 0; isolation: isolate; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }   /* 지도 안 z-index(400~1000)를 이 상자에 가둔다 — 스크롤 때 위 고정 머리를 뚫고 나오지 않게 */
.map-in { height: 620px; }   /* 조회 줄 · 근거 제목 줄을 걷은 만큼(약 100px) 늘렸고(510), 2026-11-03 표 3줄(약 110px)만큼 더 높였다 */
.map-title { position: absolute; left: 10px; top: 10px; z-index: 500; display: inline-flex; align-items: center; gap: 8px; background: rgba(255, 255, 255, .95); border-radius: 8px; padding: 6px 12px 6px 8px; box-shadow: 0 1px 3px rgba(17, 24, 39, .12); }
.map-title b { font-size: 15px; font-weight: 800; color: var(--fg); }
.map-title.static { position: static; display: flex; margin: 4px 0 10px; padding: 0; background: none; box-shadow: none; }   /* 앱 — 지도 없이 제목만(2026-11-12) */
.add-btn { position: absolute; right: 10px; bottom: 26px; z-index: 600; height: 34px; padding: 0 14px; border: 0; border-radius: 8px; background: #1f3a72; color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: 0 2px 8px rgba(17, 24, 39, .2); }
.add-btn.done { background: #fff; color: var(--ok); box-shadow: inset 0 0 0 1px #cfe9d8, 0 2px 8px rgba(17, 24, 39, .12); }
.add-pop { position: absolute; right: 10px; bottom: 68px; z-index: 600; width: min(300px, calc(100% - 20px)); max-height: calc(100% - 90px); overflow: auto; background: #fff; border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 28px rgba(17, 24, 39, .18); padding: 12px; display: grid; gap: 6px; font-size: 13px; }
.add-pop small { color: var(--sub); font-size: 12px; line-height: 1.5; }
.add-pop label { display: flex; align-items: center; gap: 8px; padding: 3px 2px; cursor: pointer; }
.add-pop input { accent-color: #2b6df3; }
.add-pop .n { width: 20px; height: 20px; border-radius: 50%; background: #2b4fd8; color: #fff; font-size: 11px; font-weight: 800; font-style: normal; display: grid; place-items: center; flex: 0 0 auto; }
.add-pop .d { margin-left: auto; color: var(--sub); font-size: 12px; }
.add-pop .d.far { color: var(--amber); }
.add-pop .none { margin: 0; color: var(--sub); }
.add-pop .ok { height: 34px; border: 0; border-radius: 8px; background: #1f3a72; color: #fff; font-weight: 700; cursor: pointer; }
.add-pop .ok:disabled { opacity: .5; cursor: default; }
.add-msg { position: absolute; right: 10px; bottom: 66px; z-index: 600; margin: 0; max-width: calc(100% - 20px); background: #fffbea; border: 1px solid #f5e3a3; border-radius: 8px; padding: 6px 10px; font-size: 12px; color: #4b4b4b; }
.pa-fc { font-size: 8.5px; line-height: 1.35; border-radius: 3px; padding: 0 4px; }
.pa-fc.g { background: var(--green-tint); color: var(--ok); }
.pa-fc.r { background: #fdecec; color: var(--red); }
.pa-fc.m { background: var(--soft); color: #4b5563; border: 1px solid var(--line); }
.map .legend { position: absolute; left: 10px; bottom: 10px; z-index: 500; background: rgba(255, 255, 255, .94); border-radius: 8px; padding: 6px 10px; font-size: 12px; display: flex; gap: 10px; }
.map .legend span { display: inline-flex; align-items: center; gap: 5px; }
.map .legend i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.map-msg { position: absolute; inset: 0; z-index: 500; margin: 0; display: grid; place-items: center; color: var(--sub); font-size: 13px; background: rgba(255, 255, 255, .6); }
.map :deep(.pa-pin) { position: relative; }
/* 웹 말풍선 — 매매수요 단지 입지비교 지도와 같은 꼴(이름 위 · 금액 아래 파란 띠) */
.map :deep(.cmp-bub) { position: relative; cursor: pointer; }
.map :deep(.cmp-bub .cb) { position: absolute; left: -10px; bottom: 9px; display: grid; min-width: 78px; border: 1.5px solid #2b4fd8; border-radius: 4px; background: #fff; box-shadow: 0 2px 6px rgba(17, 24, 39, .22); text-align: center; white-space: nowrap; }
.map :deep(.cmp-bub .cb b) { display: flex; align-items: center; justify-content: center; padding: 3px 8px 2px; font-size: 12px; font-weight: 400; color: #18213a; }
.map :deep(.cmp-bub .cb b .nm) { max-width: 7em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.map :deep(.cmp-bub .cb > span) { display: flex; align-items: center; justify-content: center; padding: 2px 8px 3px; background: #2b4fd8; color: #fff; font-size: 12px; font-weight: 400; }
.map :deep(.cmp-bub .cb > span i) { width: 1px; height: 10px; margin: 0 6px; background: rgba(255, 255, 255, .55); }
.map :deep(.cmp-bub .cb::after) { content: ''; position: absolute; left: 4px; bottom: -9px; border: 5px solid transparent; border-top: 5px solid #2b4fd8; border-left: 5px solid #2b4fd8; }
.map :deep(.cmp-bub.on .cb) { border-width: 2.5px; z-index: 2; }
.map :deep(.cmp-bub.off .cb) { border-color: #b8bfcc; }
.map :deep(.cmp-bub.off .cb > span) { background: #b8bfcc; }
.map :deep(.cmp-bub.off .cb::after) { border-top-color: #b8bfcc; border-left-color: #b8bfcc; }
.map :deep(.cmp-bub.me .cb) { border-color: #e03e3e; }
.map :deep(.cmp-bub.me .cb > span) { background: #e03e3e; }
.map :deep(.cmp-bub.me .cb::after) { border-top-color: #e03e3e; border-left-color: #e03e3e; }
.map :deep(.pa-pin .dot) { position: absolute; left: -12px; top: -12px; width: 24px; height: 24px; border-radius: 50%; background: #2b4fd8; border: 2px solid #fff; box-sizing: border-box; box-shadow: 0 1px 3px rgba(17, 24, 39, .3); cursor: pointer; display: grid; place-items: center; color: #fff; font-size: 12px; font-weight: 800; font-style: normal; line-height: 1; }   /* 안에 임장 순서 번호 */
.map :deep(.pa-pin.on .dot) { left: -22px; top: -22px; width: 44px; height: 44px; font-size: 18px; border-width: 3px; box-shadow: 0 2px 8px rgba(0, 0, 0, .35); }   /* 누른 점(지도 · 목록) — 두 배 가까이(2026-11-10) */
.map :deep(.pa-pin.off .dot) { background: #b8bfcc; }   /* 그 건물 거래를 다 제외 — 회색 */
.map :deep(.pa-pin.off .lbl) { opacity: .55; text-decoration: line-through; }
.map :deep(.pa-pin.me .dot) { left: -9px; top: -9px; width: 18px; height: 18px; background: #e03e3e; cursor: pointer; }
.map :deep(.pa-pin.me.on .dot) { left: -17px; top: -17px; width: 34px; height: 34px; border-width: 3px; box-shadow: 0 2px 8px rgba(0, 0, 0, .35); }
.map :deep(.pa-pin.on .lbl) { top: 26px; }   /* 커진 점 아래로 이름표를 내린다 */
.map :deep(.pa-pin.me.on .lbl) { top: 20px; }
.map :deep(.pa-pin .lbl) { position: absolute; left: 0; top: 15px; transform: translateX(-50%); font-size: 12px; line-height: 1.3; text-align: center; color: var(--fg); text-shadow: 0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff; white-space: nowrap; pointer-events: none; }
.map :deep(.pa-pin b) { font-weight: 700; }
.map :deep(.pa-pin.me b) { color: var(--red); }

/* Ⓑ 조건 줄 — 반경 · 거래 · 기준 상자는 가로 크기 같게, 초기화 · 저장은 오른쪽 끝 */
.conds { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; gap: 10px 12px; align-items: center; background: var(--soft); border-radius: 10px; padding: 10px 12px; }
.conds .pa-lab { display: inline-flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 700; color: #6b7280; white-space: nowrap; }
.conds > .pa-lab { background: #fff; border: 1px solid #dde3ee; border-radius: 8px; padding: 4px 12px; }
.conds > .pa-lab .pa-seg { flex: 1; min-width: 0; display: flex; gap: 2px; }
.conds > .pa-lab .pa-seg button { flex: 1 1 0; min-width: 0; padding: 0; text-align: center; }
/* 칸이 좁으면 이름(반경 · 거래 · 기준)을 빼고 고르기만 — 전체화면 오른쪽 칸 · 좁은 창 */
.conds.web { container-type: inline-size; position: relative; z-index: 5; }   /* 웹만 — 말풍선이 아래 상자(목록 · 표)에 가리지 않게 위로 */
.conds.web > .pa-lab { position: relative; }   /* '기준 ⓘ' 말풍선은 그 칸 바로 아래에 */
@container (max-width: 760px) {
  .conds > .pa-lab { font-size: 0; gap: 0; }
  .conds:has(> .elev-pick) > .pa-lab { grid-template-columns: 0 minmax(0, 1fr); gap: 0; }
  .conds > .pa-lab .pa-seg button { font-size: 13px; }
}
.pa.fs .conds { grid-template-columns: minmax(0, 1fr); }
.pa.fs .simrow.has-elev, .pa.fs .simrow.has-elev .simB { grid-template-columns: minmax(0, 1fr); }
.pa.fs .simB { height: auto; }
/* 전체화면 — 층 · 엘베를 면적 · 건축 줄과 같은 틀로: 이름 칸 32 · 사이 8, 고르기 상자는 시작점이 같고 끝은 '2020년' 값 끝과 맞춘다 */
.pa.fs .simB { gap: 10px; }
.pa.fs .dl .dn { flex: 0 0 32px; }
.pa.fs .simB > .pa-lab, .pa.fs .simrow > :is(.elev-pick, .floor-pick) { display: grid; grid-template-columns: 32px minmax(0, 1fr); align-items: center; gap: 8px; width: 100%; }
.pa.fs .simrow.has-elev .simB .pa-lab .pa-seg, .pa.fs .simrow > :is(.elev-pick, .floor-pick) .pa-seg { width: 100% !important; }
.pa.fs .simrow > :is(.elev-pick, .floor-pick) .pa-seg button { flex: 1 1 0; min-width: 0; padding: 0 4px; }
/* 층 '전체'는 엘베 '전체'와 같은 폭(세 칸 중 하나), '같은 층'이 나머지를 넓게 */
.pa.fs .simrow > .floor-pick .pa-seg button:first-child { flex: 0 0 calc((100% - 8px) / 3); }
.pa.fs .acts-r { justify-content: stretch; order: 99; }
.pa.fs .conds > .acts-r { justify-self: stretch; }
/* 전체화면 왼쪽 칸은 좁다 — '기준 ⓘ' 말풍선을 칸 왼쪽에 붙이고 글은 칸 폭 안에서 줄바꿈(가운데로 펼치면 화면 왼쪽 밖으로 나갔다) */
.pa.fs .conds :deep(.itip-bubble) { left: 0 !important; right: auto !important; transform: none !important; white-space: normal; width: 300px; max-width: calc(100vw - 40px); grid-template-columns: max-content minmax(0, 1fr); z-index: 700; }
.pa.fs .conds :deep(.itip-bubble)::before { left: 24px; transform: none; }
.pa.fs .conds :deep(.itip-bubble) span { white-space: normal; word-break: keep-all; }   /* 전체화면 — 초기화 · 저장은 조건(반경 · 거래 · 기준 · 유사도/직접범위) 다 고른 뒤 맨 아래 */
.pa.fs .acts-r .save-btn { flex: 1; width: auto; min-height: 44px; }
.kindF button { font-weight: 700 !important; }
.kindF button[data-k="매매"] { background: #eef2ff; color: var(--navy); }
.kindF button[data-k="전세"] { background: #fdf3e1; color: var(--amber); }
.kindF button[data-k="월세"] { background: #eef7f1; color: var(--ok); }
.kindF button.on[data-k="매매"] { background: var(--navy); color: #fff; }
.kindF button.on[data-k="전세"] { background: var(--amber); color: #fff; }
.kindF button.on[data-k="월세"] { background: var(--ok); color: #fff; }
.acts-r { display: inline-flex; gap: 8px; align-items: stretch; align-self: stretch; }
.reset-btn, .save-btn { box-sizing: border-box; border-radius: 8px; font-size: 13.5px; cursor: pointer; white-space: nowrap; }
.reset-btn { width: 66px; padding: 0; border: 1px solid #dde3ee; background: #fff; color: #374151; }
.reset-btn:hover { border-color: var(--blue); color: var(--blue); }
.reset-btn.undo { border-color: var(--amber); color: var(--amber); background: #fffaf0; display: inline-flex; align-items: center; justify-content: center; }
.undo-ic { width: 24px; height: 24px; display: block; }
.undo-ic .trk { fill: none; stroke: #f6dfb3; stroke-width: 2.5; }
.undo-ic .run { fill: none; stroke: var(--amber); stroke-width: 2.5; stroke-linecap: round; stroke-dasharray: 62.83; transform: rotate(-90deg); transform-origin: 12px 12px; animation: undoRun 5s linear forwards; }
@keyframes undoRun { from { stroke-dashoffset: 0; } to { stroke-dashoffset: 62.83; } }
.save-btn { width: 176px; padding: 0 14px; border: 0; background: #1f3a72; color: #fff; font-weight: 700; }
.save-btn small { margin-left: 6px; font-size: 12px; font-weight: 400; color: var(--sub); }
/* 웹 — '저장완료' 아래 줄에 저장 시각(작게) */
.save-btn.two { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; line-height: 1.2; }
.save-btn.two { min-height: 44px; font-size: 14px; }
.save-btn.two small { margin-left: 0; font-size: 12px; }
/* 웹 — 마우스를 올리면 바뀐다(조회 단추와 같은 진한 남색 · 저장완료는 테두리만 진하게) */
.save-btn.two { transition: background .15s, border-color .15s; }
.save-btn.two.dirty:hover { background: #16305f; }
.save-btn.two.saved:hover { border-color: #8fceaa; background: #f4fbf6; }
/* 웹 — 매매수요 입지비교 저장 단추와 같은 꼴 · 색(2026-11-12 사용자): 저장할 게 있으면 파랑 '저장하기', 저장됐으면 회색 '저장됨' + 날짜 */
.save-btn.two.dirty { background: #2b6df3; border: 1px solid #2b6df3; color: #fff; font-weight: 700; }
.save-btn.two.dirty:hover { background: #1f5ad6; border-color: #1f5ad6; }
.save-btn.two.saved { background: #fff; border: 1px solid #d5dbe6; color: #9ca3af; font-weight: 700; }
.save-btn.two.saved:hover { background: #fff; border-color: #d5dbe6; }
.save-btn.two.saved small { color: #9ca3af; font-weight: 400; }
:root[data-theme="dark"] .save-btn.two.saved { background: transparent; border-color: #34405a; color: #6e788c; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .save-btn.two.saved { background: transparent; border-color: #34405a; color: #6e788c; } }
.save-btn.saved { background: #fff; color: var(--ok); border: 1px solid #cfe9d8; font-weight: 600; }
.save-btn.saving { background: #fff; color: var(--sub); border: 1px solid #dde3ee; font-weight: 400; }
.simrow { grid-column: 1 / -1; display: grid; background: #fff; border: 1px solid #dde3ee; border-radius: 8px; padding: 12px 18px; }
.simA, .simB { height: 44px; min-width: 0; }   /* 두 방식 같은 높이 — 바꿀 때 덜컹이지 않게 */
/* 웹 — 거르기 상자 오른쪽 끝에 엘베. 막대(유사도 · 면적 · 건축)는 그만큼 줄어든다 */
.simrow.has-elev { grid-template-columns: minmax(0, 1fr); gap: 10px 28px; align-items: center; }
/* 웹 기본 화면 — 위 줄 넷(반경 · 거래 · 기준 · 엘베), 그 아래 거르기 상자, 맨 아래 오른쪽 초기화 · 저장(세팅 다 하고 저장) */
.conds:has(> .elev-pick) { grid-template-columns: minmax(0, 1.25fr) minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, .9fr) minmax(0, .95fr); }   /* 거래는 '매매 36 · 전세 19 · 월세 43'이 빽빽해 넓게, 그만큼 반경 · 엘베를 줄였다(2026-11-06). 층 칸은 그대로 */
/* 위 줄 다섯(반경 · 거래 · 기준 · 엘베 · 층), 아래 줄은 거르기 상자(넷 칸) + 그 오른쪽 초기화 · 저장(예전 층 자리) */
.conds:has(> .elev-pick) > .simrow { grid-column: 1 / 5; grid-row: 2; }
.conds:has(> .elev-pick) > .acts-r { grid-column: 5; grid-row: 2; }
.conds:has(> .elev-pick) > .acts-r .save-btn { flex: 1; width: auto; }
.conds:has(> .elev-pick) > .acts-r { justify-self: stretch; }
.conds:has(> .elev-pick) > .acts-r .reset-btn:only-child { flex: 1; width: auto; }   /* 시세예측(저장 없음) — 초기화가 칸을 꽉 채워 위 '층' 상자 오른쪽 끝과 맞는다 */
.conds > .floor-pick .pa-seg { width: auto; }
/* 웹 기본 화면 위 줄 다섯 — 상자 폭을 칸 폭에 꽉 맞춰 모두 같게, 이름 칸(반경 · 거래 · 기준 · 엘베 · 층)도 같은 폭 → 고르기 상자 시작점이 같다 */
.conds:has(> .elev-pick) > .pa-lab { display: grid !important; grid-template-columns: 46px minmax(0, 1fr); gap: 6px; width: 100%; box-sizing: border-box; padding-left: 10px !important; padding-right: 8px !important; }   /* 이름 칸 46 — '기준 ⓘ'까지 들어가게 */
.conds:has(> .elev-pick) > .pa-lab .pa-seg { width: 100% !important; }
.conds:has(> .elev-pick) > .pa-lab .pa-seg button { flex: 1 1 0; min-width: 0; padding: 0 2px; font-size: 13px; }
.conds > .elev-pick .pa-seg { width: auto; }
/* 아래 거르기 상자엔 면적 · 건축 · 층만 — 층 상자를 넓게 */
.simrow.has-elev .simB { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, .7fr); }
.simrow.has-elev .simB > .pa-lab { display: flex; align-items: center; gap: 8px; }
.simrow.has-elev .simB > .pa-lab .pa-seg { flex: 1; width: auto !important; }
/* 웹 — 면적 · 건축 A안: 값은 이름 줄 오른쪽 끝(한 줄), 막대는 그 아래 칸 폭 전체. 유사도 칸과 높이를 같게(바꿀 때 덜컹이지 않게) */
.simrow.has-elev :is(.simA, .simB) { height: 48px; }   /* 웹 — 유사도 · 직접범위 상자 높이를 줄였다(62 → 48, 2026-11-07) */
.conds:has(> .elev-pick) > .simrow { padding-top: 8px; padding-bottom: 8px; }
.simrow.has-elev .simB .dl { display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-areas: "dn val" "bar bar"; align-items: center; gap: 0 8px; }
.simrow.has-elev .simB .dl > .dn { grid-area: dn; }
.simrow.has-elev .simB .dl > b { grid-area: val; min-width: 0; text-align: right; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.simrow.has-elev .simB .dl > b small { display: inline; margin-left: 6px; font-size: 12px; }
.simrow.has-elev .simB .dl > .dual { grid-area: bar; min-width: 0; margin-top: 12px; }
.simrow.has-elev .simB .dl.one { grid-template-columns: 64px minmax(0, 1fr); grid-template-areas: none; gap: 0 12px; }   /* 웹 — 왼쪽 이름(아래 평 · 연차 범위) · 오른쪽 막대. 범위값은 동그라미 위에 붙어 따라간다(2026-11-07) */
.simrow.has-elev .simB .dl.one > :is(.dn, .dual) { grid-area: auto; }
.simrow.has-elev .simB .dl.one > .dn { display: grid; justify-items: center; gap: 2px; font-size: 14px; font-weight: 800; color: var(--fg); }
.simrow.has-elev .simB .dl.one > .dn small { font-size: 12px; font-weight: 400; color: var(--sub); white-space: nowrap; }
.simrow.has-elev .simB .dl.one > .dual { margin-top: 0; }
.dl.one .dual .tvg { position: absolute; bottom: 12px; transform: translateX(-50%); display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 8px; font-size: 13px; line-height: 1; font-weight: 800; color: var(--blue); white-space: nowrap; pointer-events: none; }   /* 가운데 칸 = 빨간 줄 위. 양 칸 폭이 같아 빨간 값이 늘 가운데 */
.dl.one .dual .tvg.m { width: 136px; }
.dl.one .dual .tvg.y { width: 140px; }
.dl.one .dual .tvg i { font-style: normal; }
.dl.one .dual .tvg i:first-child { text-align: right; }
.dl.one .dual .tvg i.me { color: var(--red); }
.dl.one .dual .base::before { display: none; }   /* 빨간 값은 위 한 줄(.tv.me)로 그린다 */
/* 웹 직접범위 — 면적 · 건축이 상자를 반씩(막대 길이가 같게, 2026-11-07). '면적' 글자는 위 '반경' 글자와 같은 세로줄(안쪽 여백 10 + 테두리 1) */
.conds:has(> .elev-pick) > .simrow { padding-left: 10px; padding-right: 10px; }   /* 유사도 · 직접범위 둘 다 */
.simrow.has-elev .simB:has(> .dl.one) { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 32px; }
.simrow.has-elev .simB .dl.one > .dn { justify-items: start; }
/* 전체화면 — 면적 · 건축 · 층 · 엘베를 세로로 쌓으므로 높이는 내용대로 */
.pa.fs .simrow.has-elev :is(.simA, .simB) { height: auto; }
.simrow.has-elev .simB .pa-lab .pa-seg, .elev-pick .pa-seg { width: 186px; }   /* 웹 — 층 · 엘베 고르기 상자 크기를 같게 */
.simrow.has-elev .simB .pa-lab .pa-seg button, .elev-pick .pa-seg button { flex: 1 1 0; min-width: 0; padding: 0 4px; }
.elev-pick { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: #6b7280; white-space: nowrap; }
.simA { display: grid; grid-template-columns: minmax(0, 1fr); align-content: center; gap: 1px; }
.simlab { display: flex; gap: 10px; align-items: baseline; font-size: 12.5px; line-height: 1.2; color: var(--fg); white-space: nowrap; overflow: hidden; }
.simlab b { color: var(--blue); }
.simlab span + span { color: var(--sub); font-size: 12px; }
.simA input[type="range"] { width: 100%; height: 14px; margin: 0; accent-color: var(--blue); }
.ticks { display: flex; justify-content: space-between; font-size: 10px; line-height: 1; color: var(--todo); padding: 0 2px; transform: translateY(2px); }
.simB { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 10px 32px; align-items: center; }
.dl { display: flex; align-items: center; gap: 8px; white-space: nowrap; font-size: 13px; color: #6b7280; font-weight: 700; }
.dl > b { min-width: 96px; text-align: right; color: var(--blue); font-size: 14px; line-height: 1.2; }
.dl > b small { display: block; font-size: 11px; font-weight: 400; color: var(--sub); }
.dual { position: relative; flex: 1 1 auto; min-width: 80px; height: 24px; margin-top: 14px; }
.dual .track { position: absolute; left: 8px; right: 8px; top: 50%; height: 4px; transform: translateY(-50%); background: #dde3ee; border-radius: 2px; }
.dual .fill { position: absolute; top: 0; bottom: 0; background: var(--blue); border-radius: 2px; }
.dual .base { position: absolute; top: -5px; width: 2px; height: 14px; background: var(--red); transform: translateX(-1px); }
.dual .base::before { content: attr(data-label); position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); font-size: 11.5px; font-weight: 700; font-style: normal; color: var(--red); white-space: nowrap; }
.dual input[type="range"] { position: absolute; inset: 0; width: 100%; margin: 0; background: none; pointer-events: none; -webkit-appearance: none; appearance: none; }
.dual input[type="range"]::-webkit-slider-runnable-track { background: none; }
.dual input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; pointer-events: auto; width: 16px; height: 16px; border-radius: 50%; background: var(--blue); border: 2px solid #fff; box-shadow: 0 1px 3px rgba(17, 24, 39, .3); cursor: grab; }
.dual input[type="range"]::-moz-range-thumb { pointer-events: auto; width: 14px; height: 14px; border-radius: 50%; background: var(--blue); border: 2px solid #fff; cursor: grab; }

/* 표 위 안내 */
.list-tools { display: flex; gap: 10px; align-items: stretch; flex-wrap: wrap; }
.warn-box { flex: 1 1 360px; display: flex; gap: 8px; align-items: flex-start; background: #fffbea; border: 1px solid #f5e3a3; border-radius: 8px; padding: 10px 14px; font-size: 13px; line-height: 1.6; color: #4b4b4b; }
.warn-box svg { flex: 0 0 auto; color: #d4a017; margin-top: 2px; }
.warn-box b { font-weight: 700; color: var(--fg); }
.warn-box .ref { color: var(--amber); }
.pa-fchip { border: 0; background: var(--blue-tint); color: var(--fg); border-radius: 6px; padding: 7px 10px; font-size: 12.5px; cursor: pointer; white-space: nowrap; }

/* 표 */
.tbl-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 8px; }
.pa table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
.pa th { background: var(--head); font-size: 12.5px; font-weight: 700; padding: 10px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; text-align: center; color: #374151; }
.pa th.hl { color: var(--navy); }
.pa td { padding: 9px 8px; border-bottom: 1px solid var(--line); text-align: center; white-space: nowrap; font-size: 13.5px; }
.pa td.l { text-align: left; }
.pa td.r { text-align: right; }
/* 웹 — 머리말 · 내용 모두 가운데(2026-11-14 사용자 '공시가 · 거리 · 층 가운데'). 머리말 옆 정렬 ▼ 만큼 왼쪽에도 빈 자리를 둬 글자가 칸 가운데에 온다 */
.pa.web td.r { text-align: center; }

.pa.web th:has(.sdir) .hk::before { content: ""; display: inline-block; width: 13px; }
/* 두 줄 머리 — ▼ 는 아랫줄에 있어 빈 자리도 아랫줄 앞에만. 윗줄은 그냥 가운데(윗줄만 밀려 들여쓴 것처럼 보였다, 2026-11-15 사용자) */
.pa.web th:has(.hk-sub .sdir) .hk::before { content: none; }
.pa.web .hk-sub:has(.sdir)::before { content: ""; display: inline-block; width: 13px; }
.pa-list { position: relative; min-width: 0; }
.pa-list .tbl-wrap { overflow-x: visible; }
.pa-list table.even { table-layout: auto; width: 100%; }
.pa-list table.even.measure th, .pa-list table.even.measure td { width: 1%; }
.pa-list table.even.measure td.l { white-space: nowrap; }
.pa-list table.even th, .pa-list table.even td { padding-left: 12px; padding-right: 12px; }
.pa-list table.even.tight th, .pa-list table.even.tight td { padding-left: 5px; padding-right: 5px; }
.pa-list table.even.tighter th, .pa-list table.even.tighter td { padding-left: 2px; padding-right: 2px; }
.pa-list table.even td.l { white-space: normal; word-break: keep-all; }   /* 주소는 낱말 단위로 줄바꿈 */
.pa-list th[data-k] .hk { cursor: pointer; user-select: none; }
.pa-list th[aria-sort] .hk { color: var(--blue); text-decoration: underline; text-underline-offset: 3px; }
/* 지도 전체화면 단추(웹) — 지도 왼쪽 위 */
.fs-btn { position: absolute; left: 10px; top: 10px; z-index: 500; display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border: 0; border-radius: 8px; background: #fff; box-shadow: 0 2px 8px rgba(17, 24, 39, .18); font: inherit; font-size: 12.5px; font-weight: 700; color: #111827; cursor: pointer; }
.fs-btn:hover { color: var(--blue); }
/* ===== 전체화면(C안) — 왼쪽 340 고정 칸(결론 → 조건 → 유사물건 목록) · 오른쪽 지도. 거래 랭킹처럼 목록이 왼쪽(2026-11-05) ===== */
.pa.fs { position: fixed; inset: 0; z-index: 3000; margin: 0; border-radius: 0; padding: 0; gap: 12px; background: #e7ebf1; overflow: hidden;
  display: grid; grid-template-columns: 340px minmax(0, 1fr); grid-template-rows: 52px auto auto minmax(0, 1fr); }
.pa.fs > .zone { display: contents; }
.pa.fs .fs-top { grid-column: 1 / -1; grid-row: 1; display: flex; align-items: center; gap: 12px; padding: 0 14px; background: #213366; color: #fff; }
.fs-x { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border: 1px solid rgba(255, 255, 255, .35); border-radius: 8px; background: transparent; color: #fff; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
.fs-t { font-size: 14px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.fs-t small { margin-left: 8px; font-size: 12px; font-weight: 500; color: rgba(255, 255, 255, .72); }
.fs-r { display: flex; align-items: center; gap: 8px; margin-left: 4px; }   /* 조회기간 · 조회는 사건 · 지역 바로 옆 */
/* 남색 띠 위 고르기 — 옅은 흰 바탕에 흰 글, 고른 것은 흰 바탕 남색 글 · 조회는 흰 단추 */
.pa.fs .fs-top .pa-seg { background: rgba(255, 255, 255, .12); }
.pa.fs .fs-top .pa-seg button { color: rgba(255, 255, 255, .78); }
.pa.fs .fs-top .pa-seg button:hover { color: #fff; }
.pa.fs .fs-top .pa-seg.pa-out button.on { background: #fff; color: #213366; box-shadow: none; }
.pa.fs .fs-top .pa-load { background: #fff; color: #213366; }
.pa.fs .fs-top .pa-load:hover { background: #e8edf8; }
.fs-hint { font-size: 12px; color: rgba(255, 255, 255, .6); white-space: nowrap; }
/* 임장경로처럼 — 지도가 위 띠 아래를 꽉 채우고, 왼쪽 상자들은 그 위에 떠 있다 */
.pa.fs .map { grid-column: 1 / -1; grid-row: 2 / -1; margin-top: -12px; border: 0; border-radius: 0; min-height: 0; z-index: 0; }
.pa.fs .map .legend { left: 364px; }   /* 범례는 떠 있는 왼쪽 상자 옆으로 */
.pa.fs .map-in { height: 100%; }
/* 오른쪽 칸 — 결론(등수 칸 둘 줄) · 조건 · 목록 */
.pa.fs .zone-h, .pa.fs .pa-err { display: none; }
/* 왼쪽 칸 — 거래 랭킹처럼 회색 바탕 위 흰 상자(모서리 12)를 쌓고, 위 띠와 떨어뜨린다 */
.pa.fs :is(.est, .conds, .fs-list) { position: relative; z-index: 2; margin-left: 12px; background: #fff; border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 6px 20px rgba(17, 24, 39, .14); }
.pa.fs .est { grid-column: 1; grid-row: 2; padding: 14px; }
.pa.fs .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.pa.fs .tile { padding: 9px 8px; }
.pa.fs .tile:not(.key) { background: var(--soft); box-shadow: none; }   /* 실거래가 예상 칸은 원래 초록 그대로 */
.pa.fs .tile.key { grid-column: 1 / -1; }
/* 실거래가 예상만 지금 크기, 나머지 여섯 칸(중간값 ~ 유사 거래건수)은 낮고 작게 — 아래 조건 · 목록이 위로 붙는다 */
.pa.fs .tile:not(.key) { padding: 6px 8px; gap: 2px; }
.pa.fs .tile:not(.key) .k { font-size: 12px; }
.pa.fs .tile:not(.key) .v { font-size: 13.5px; }
.pa.fs .est { padding: 12px; }
.pa.fs .tiles { gap: 6px; }
.pa.fs .conds { grid-column: 1; grid-row: 3; padding: 12px 14px; }
/* 전체화면 — 필터 부품(좁은 꼴)도 옛 조건 상자 자리(왼쪽 창 · 예상가 밑)에 같은 흰 카드로(2026-11-12) */
.pa.fs .sfb.compact { grid-column: 1; grid-row: 3; position: relative; z-index: 2; margin: 0 0 0 12px; padding: 12px 14px; background: #fff; border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 6px 20px rgba(17, 24, 39, .14); }
.pa.fs .fs-list { grid-column: 1; grid-row: 4; margin-bottom: 12px; min-height: 0; overflow-y: auto; padding: 10px 10px 14px; display: grid; gap: 6px; align-content: start; }
.fs-lh { padding: 0 4px; font-size: 13px; font-weight: 800; color: var(--fg); }
.fs-it { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--soft); font: inherit; text-align: left; cursor: pointer; }
.fs-it:hover { border-color: #c7d0e2; }
.fs-it.on { border-color: var(--blue); background: var(--blue-tint); }
.fs-it.off { opacity: .5; } .fs-it.off .nm { text-decoration: line-through; } .fs-it.off .n { background: #b8bfcc; }
.fs-it .n { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #2b4fd8; color: #fff; font-size: 11px; font-weight: 800; font-style: normal; }
.fs-it .nm { display: grid; min-width: 0; font-size: 13px; font-weight: 700; color: var(--fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fs-it .nm small { font-size: 12px; font-weight: 400; color: var(--sub); }
.fs-it .nm small.ho { color: #374151; font-weight: 600; }   /* 그 건물 거래의 호(확정 · 후보) — 건물 이름 바로 아래 */
.fs-it .pr { font-size: 12.5px; font-weight: 800; color: var(--fg); white-space: nowrap; }
.fs-list .none { margin: 0; padding: 12px; font-size: 13px; color: var(--sub); text-align: center; }
/* 전체화면에선 표 · 알림 · 지도 위 단추(임장경로 추가)는 감춘다 — 닫으면 그대로 */
.pa.fs :is(.list-tools, .pa-list, .list-foot, .add-btn, .add-pop, .add-msg) { display: none !important; }
@media (max-width: 760px) {
  .pa.fs { grid-template-columns: minmax(0, 1fr); grid-template-rows: 52px minmax(0, 1fr) auto auto 220px; overflow: auto; }
  .pa.fs .map { grid-row: 2; grid-column: 1; min-height: 55vh; }
  .pa.fs :is(.est, .conds, .fs-list) { grid-column: 1; border-right: 0; }
  .pa.fs .est { grid-row: 3; } .pa.fs .conds { grid-row: 4; } .pa.fs .fs-list { grid-row: 5; }
  .pa.fs .fs-hint { display: none; }
}
.ck-th, .ck-td { width: 44px; text-align: center !important; }
.ck-td input { width: 15px; height: 15px; accent-color: var(--blue); cursor: pointer; }
tr.off td:not(.ck-td) { opacity: .42; text-decoration: line-through; }
.sim-pick { display: inline-block; margin-left: 4px; padding: 1px 5px; border-radius: 4px; background: #2b6df3; color: #fff; font-size: 12px; font-weight: 700; vertical-align: middle; }   /* 손품결론 유사물건 실거래가로 고른 줄(2026-11-15) */
.sdir { display: inline-block; margin-left: 3px; font-style: normal; font-size: 10px; color: #c3c9d4; cursor: pointer; }
.sdir.on { color: var(--blue); }
.fv { border: 0; background: none; color: #b3bac6; font-size: 11px; padding: 0 2px; margin-left: 2px; cursor: pointer; }
.fv:hover { color: var(--blue); }
.fv.act { color: #fff; background: var(--blue); border-radius: 4px; }
.pa-list tbody tr { cursor: pointer; }
.pa-list tbody tr:hover td { background: var(--soft); }
.pa-list tbody tr.on td { background: var(--blue-tint); }
.pa-list tbody tr.on td:first-child { box-shadow: inset 3px 0 0 #2b6df3; }   /* 고른 줄 왼쪽 파란 막대 — 매각분석 표와 같게(2026-11-12) */
/* 다크 모드 — 줄에 마우스를 대거나 고른 줄이 하얗게 튀었다(2026-11-11 사용자) */
:root[data-theme="dark"] .pa-list tbody tr:hover td { background: rgba(255, 255, 255, .05); }
:root[data-theme="dark"] .pa-list tbody tr.on td { background: rgba(43, 109, 243, .2); }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .pa-list tbody tr:hover td { background: rgba(255, 255, 255, .05); }
  :root:not([data-theme="light"]) .pa-list tbody tr.on td { background: rgba(43, 109, 243, .2); }
}
.pa-list tbody tr.mine { background: #fff5f5; box-shadow: inset 0 -2px 0 #f3c9c9; cursor: pointer; }   /* 누르면 지도 빨간 점 이름표 */
.pa-list tbody tr.mine:hover td, .pa-list tbody tr.nohover:hover td { background: transparent; }
td.two { line-height: 1.35; }
td.two small { display: block; font-size: inherit; color: #4b5563; font-weight: 400; }
td.two small.neg { color: var(--red); }
.ph2 { color: var(--todo); }
.kind { font-size: 12px; border-radius: 4px; padding: 1px 6px; background: #eef2ff; color: var(--navy); }
.kind.j { background: #fdf3e1; color: var(--amber); }
.kind.m { background: #eef7f1; color: var(--ok); }
.kind.me { background: var(--red); color: #fff; font-size: 9px; padding: 1px 4px; border-radius: 3px; }
.kind.me.q { font-size: 12px !important; padding: 1px 6px; border-radius: 4px; }   /* 조회물건 · 선정물건(앱 · 웹) — 아래 매매 · 전세 칩과 같은 높이(2026-11-14 사용자) */
.est-lab { color: var(--red); font-size: 13.5px; }
.est-v { color: var(--red); }   /* 선정물건 줄 가격 — 실거래가 아니라 예상가라 '매매 예상'과 같은 빨강(2026-11-12 사용자) */
.pubin { width: 110px; height: 30px; border: 1.5px solid var(--red); border-radius: 6px; padding: 0 8px; font: inherit; font-size: 13px; text-align: right; background: #fff; }
.ev { font-size: 12px; border-radius: 4px; padding: 1px 6px; white-space: nowrap; }
.ev.two { display: inline-block; text-align: center; line-height: 1.3; padding: 2px 7px; }
.ev.o { background: var(--green-tint); color: var(--ok); font-weight: 600; }
.ev.x { background: #fdecec; color: var(--red); }
.ev.u { color: var(--todo); }
.pa-addr { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; }
.chips { display: inline-flex; gap: 4px; }
/* 웹 — 한 줄은 많아야 두 줄: 주소는 첫 줄 한 줄(넘치면 …), 칩(경매지번 · 같은면적 · 현장 …)은 둘째 줄 한 줄 */
.pa-list table.even td.l:has(.pa-addr) { white-space: nowrap; }
.pa-list .pa-addr { min-width: 0; max-width: 100%; }
.pa-list table:has(.ck-th) .pa-addr > .addr { display: block; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pa-list table:has(.ck-th) .pa-addr > .chips { max-width: 100%; white-space: nowrap; overflow: hidden; flex-wrap: nowrap; }
.addr .no { display: inline-grid; place-items: center; min-width: 18px; height: 18px; margin-right: 6px; padding: 0 4px; box-sizing: border-box; border-radius: 9px; background: #2b4fd8; color: #fff; font-size: 11px; font-weight: 800; font-style: normal; vertical-align: 1px; }   /* 지도 점 번호와 같다 */
.same { font-size: 8.5px; line-height: 1.35; color: var(--red); border: 1px solid var(--red); border-radius: 3px; padding: 0 3px; }
.same.eq { color: #fff; background: var(--red); }
td.acts-td, th.acts-th { width: 1%; padding-left: 4px !important; padding-right: 10px !important; }
.acts { display: inline-flex; gap: 4px; }
.ab { width: 22px; height: 22px; border: 1px solid var(--line); border-radius: 5px; background: #fff; color: var(--sub); display: inline-grid; place-items: center; font-size: 11px; font-weight: 800; cursor: pointer; padding: 0; }
.ab.p { color: #2f6be0; }
.ab.n { color: #03a94d; }
.ab:hover { border-color: var(--blue); }
.ab.ok { background: var(--green-tint); border-color: var(--ok); color: var(--ok); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.pa-empty { padding: 26px !important; text-align: center; color: var(--sub); white-space: normal !important; }
.pa-empty .btns { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 10px; }
.pa-empty button { border: 1px solid var(--blue); color: var(--blue); background: #fff; border-radius: 6px; padding: 6px 12px; cursor: pointer; }
.more { margin-top: 8px; width: 100%; border: 1px dashed var(--line); background: #fff; border-radius: 8px; padding: 8px; font-size: 13px; color: #374151; cursor: pointer; }
.list-foot { margin: 0; font-size: 12px; color: var(--todo); line-height: 1.6; }


/* ===== 앱(물건상세 › 손품+현장 › 시세조사) — 폰 폭으로 위아래 쌓기(2026-11-09 시안 price-mock) ===== */
.pa-wrap:is(.app, .phone) .pa { padding: 12px; gap: 12px; border-radius: 12px; }
/* 넓은 표가 칸 폭을 밀지 않게 — 모든 칸을 상자 폭에 가둔다 */
.pa-wrap:is(.app, .phone), .pa-wrap:is(.app, .phone) .pa, .pa-wrap:is(.app, .phone) .zone { grid-template-columns: minmax(0, 1fr); min-width: 0; max-width: 100%; }
.pa-wrap:is(.app, .phone) .est, .pa-wrap:is(.app, .phone) .conds, .pa-wrap:is(.app, .phone) .list-tools, .pa-wrap:is(.app, .phone) .pa-list { min-width: 0; max-width: 100%; }
.pa-wrap:is(.app, .phone) .zone-h { row-gap: 8px; }
.pa-wrap:is(.app, .phone) .bar-desc { flex: 1 1 100%; margin-left: 0; font-size: 12px; }
.pa-wrap:is(.app, .phone) .pa-load-r { flex: 1 1 100%; margin-left: 0; }
.pa-wrap:is(.app, .phone) .pa-load-r .prog { min-width: 0; }
.pa-wrap:is(.app, .phone) .pa-load-r .pa-seg { flex: 1 1 auto; min-width: 0; }
.pa-wrap:is(.app, .phone) .pa-load-r .pa-seg button { flex: 1 1 0; min-width: 0; padding: 0 4px; }
.pa-wrap:is(.app, .phone) .pa-load-r .pa-load { flex: 0 0 72px; width: 72px; min-width: 0; padding: 0; }
/* 매도가 예상 — 큰 칸 한 줄 + 작은 칸 셋씩 */
.pa-wrap:is(.app, .phone) .tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.pa-wrap:is(.app, .phone) .tile { padding: 8px 6px; gap: 3px; border: 1px solid #e8ecf3; box-shadow: none; }
.pa-wrap:is(.app, .phone) .tile .k { font-size: 11.5px; }
.pa-wrap:is(.app, .phone) .tile .v { font-size: 15px; }
.pa-wrap:is(.app, .phone) .tile .v.sm { font-size: 12px; white-space: normal; line-height: 1.3; }
.pa-wrap:is(.app, .phone) .tile.key { grid-column: 1 / -1; display: flex; align-items: baseline; justify-content: space-between; padding: 10px 12px; }
.pa-wrap:is(.app, .phone) .tile.key .v { font-size: 24px; }
/* 지도 — 접힌 한 줄, 펴면 240 */
/* 상자 없이 제목 줄로 — 위 '결론 이 물건 매도가 예상' 줄과 같은 꼴(근거 칩 · 유사물건 · 오른쪽 접기) */
.map-fold { display: flex; align-items: center; gap: 8px; width: 100%; padding: 2px 0; border: 0; border-radius: 0; background: none; cursor: pointer; text-align: left; font-family: inherit; }
.map-fold .mf-t { font-size: 15px; font-weight: 800; color: var(--fg); }
.map-fold small { margin-left: 2px; }
.map-fold small { font-size: 11.5px; color: var(--sub); }
.map-fold i { margin-left: auto; font-style: normal; font-size: 12px; font-weight: 700; color: var(--blue); white-space: nowrap; }
.pa-wrap.app .map-in { height: 480px; }   /* 접어 두니 펼치면 크게(240 → 480, 2026-11-09) */
/* 앱 — '임장경로에 ○곳'은 오른쪽 아래 지도 도구(출력 · 인쇄)와 겹쳐, 왼쪽 위 '근거 유사물건' 옆으로 */
.pa-wrap.app .map-title { padding: 5px 10px 5px 6px; }
.pa-wrap.app .map-title b { font-size: 14px; }
.pa-wrap.app .add-btn { left: 10px; right: auto; top: 10px; bottom: auto; height: 32px; padding: 0 10px; font-size: 12px; }
.pa-wrap.app .add-pop { left: 10px; right: auto; top: 50px; bottom: auto; max-height: calc(100% - 60px); }
.pa-wrap.app .add-msg { left: 10px; right: auto; top: 48px; bottom: auto; }
/* 거르기 — 반경 · 거래 · 엘베 · 층 · 기준 · 막대 · 단추 차례로 한 줄씩 */
.pa-wrap:is(.app, .phone) .conds { display: flex !important; flex-direction: column; align-items: stretch; gap: 6px; padding: 8px; }
.pa-wrap:is(.app, .phone) .conds > .simrow { width: 100%; box-sizing: border-box; }
.pa-wrap:is(.app, .phone) .conds > .elev-pick { order: 1; }
.pa-wrap:is(.app, .phone) .conds > .floor-pick { order: 2; }
.pa-wrap:is(.app, .phone) .conds > .mode-pick { order: 3; }
.pa-wrap:is(.app, .phone) .conds > .simrow { order: 4; }
.pa-wrap:is(.app, .phone) .conds > .acts-r { order: 5; }
.pa-wrap:is(.app, .phone) .conds > .pa-lab,
.pa-wrap:is(.app, .phone) .conds:has(> .elev-pick) > .pa-lab { display: grid !important; grid-template-columns: 34px minmax(0, 1fr); gap: 6px; font-size: 12.5px; padding: 4px 8px !important; }
.pa-wrap:is(.app, .phone) .conds > .pa-lab .pa-seg { width: 100% !important; }
.pa-wrap:is(.app, .phone) .conds > .pa-lab .pa-seg button { font-size: 12.5px; padding: 0 2px; }
.pa-wrap:is(.app, .phone) .simrow.has-elev :is(.simA, .simB) { height: auto; }
.pa-wrap:is(.app, .phone) .conds > .simrow { padding: 8px !important; }
.pa-wrap:is(.app, .phone) .simrow.has-elev .simB,
.pa-wrap:is(.app, .phone) .simrow.has-elev .simB:has(> .dl.one) { grid-template-columns: minmax(0, 1fr); row-gap: 18px; }
.pa-wrap:is(.app, .phone) .simrow.has-elev .simB .dl.one { grid-template-columns: 58px minmax(0, 1fr); gap: 0 10px; padding-top: 6px; }
.pa-wrap:is(.app, .phone) .simrow.has-elev .simB .dl.one > .dn { font-size: 13px; }
.pa-wrap:is(.app, .phone) .simrow.has-elev .simB .dl.one > .dual { margin-right: 16px; }   /* 오른쪽 끝 값(2020)이 상자 밖으로 나가지 않게 */
.pa-wrap:is(.app, .phone) .simrow.has-elev .simB .dl.one > .dn small { font-size: 11px; }
.pa-wrap:is(.app, .phone) .conds > .acts-r { display: flex; width: 100%; }
.pa-wrap:is(.app, .phone) .conds > .acts-r > button { flex: 1 1 0; width: auto; }
.pa-wrap:is(.app, .phone) .conds > .acts-r .save-btn { flex: 2 1 0; }
/* 근거 표 — 옆으로 밀어 본다 */
.pa-wrap:is(.app, .phone) .list-tools { gap: 6px; }
/* 한 줄 — 왼쪽 '지번 ○곳 · 거래 ○건', 오른쪽 '공시가 기준 …' 글만(상자 없이, 2026-11-09) */
.pa-wrap:is(.app, .phone) .list-tools { flex-wrap: nowrap; align-items: center; }
.pa-wrap:is(.app, .phone) .list-tools .lt-count { flex: 0 0 auto; margin-right: 0; font-size: 13px; }
.pa-wrap:is(.app, .phone) .warn-box { flex: 0 1 auto; min-width: 0; margin-left: auto; padding: 0; border: 0; background: none; font-size: 11.5px; line-height: 1.4; text-align: right; }
.pa-wrap:is(.app, .phone) .warn-box > svg { display: none; }
.pa-wrap:is(.app, .phone) .pa-list { overflow: hidden; }   /* 표가 옆 칸 밖으로 화면을 밀지 않게 — 표는 안에서 옆으로 민다 */
.pa-wrap:is(.app, .phone) .pa-list .tbl-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.pa-wrap:is(.app, .phone) .pa-list table.even { width: max-content; min-width: 100%; font-size: 12px; }
.pa-wrap:is(.app, .phone) .pa-list table.even th, .pa-wrap:is(.app, .phone) .pa-list table.even td { padding-left: 6px; padding-right: 6px; }
.pa-wrap:is(.app, .phone) .pa-list table.even td.l { white-space: nowrap; }
.pa-wrap:is(.app, .phone) .list-foot { font-size: 11px; }
/* 앱 — 초록 칸: 위 줄 이름 · 반경 기간 건수, 아래 줄 금액(한 줄에 몰아 '1.…'로 잘리던 것, 2026-11-13). 보증보험 딱지는 금액 줄 오른쪽 */
/* 앱 — 이름(① 매도가 예상) 한 줄 · 금액 · 계산식 줄 차례로. 계산식이 옆 칸을 먹어 이름이 세로로 쌓이던 것(2026-11-15 사용자) */
.pa-wrap.app .tile.key > .k { grid-column: 1 / -1 !important; grid-row: 1 !important; white-space: nowrap; }
.pa-wrap.app .tile.key > .s { grid-column: 1 / -1 !important; grid-row: 3 !important; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* 앱 — 면적 칸을 조금 넓혀 '면적 공급(전용) / 연식' · '83.18㎡ (59.98)'을 한 줄로(공급(전용)은 작은 글) */
.pa-wrap:is(.app, .phone) .tiles { grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, .85fr); }
.pa-wrap:is(.app, .phone) .tile.area .k, .pa-wrap:is(.app, .phone) .tile.area .v { white-space: nowrap; letter-spacing: -0.3px; }
.pa-wrap:is(.app, .phone) .tile.area .k-sub { font-size: 9px; font-weight: 600; }
.pa-wrap.app .tile.key { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; row-gap: 2px; text-align: left; }
.pa-wrap.app .tile.key > .k { grid-area: 1 / 1; }
.pa-wrap.app .tile.key > .s { grid-area: 1 / 2; }
.pa-wrap.app .tile.key > .v { grid-area: 2 / 1; font-size: 26px; line-height: 1.2; overflow: visible; text-overflow: clip; }
.pa-wrap.app .tile.key > .cap { grid-area: 2 / 2; justify-self: end; position: static; transform: none; }
/* 앱 유사물건 표 — 다섯 칸, 폰 폭 안에(2026-11-13) */
.app-tbl table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 12px; }
.app-tbl :is(th, td) { padding: 7px 3px; text-align: center; vertical-align: middle; white-space: nowrap; overflow: hidden; }
.app-tbl td.l { text-align: left; padding-left: 6px; }
.app-tbl .at-addr { display: grid; width: 100%; min-width: 0; margin: 0; padding: 0; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.app-tbl .at-line { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.app-tbl .at-line { display: flex; align-items: center; }
.app-tbl .at-line > :not(.no) { min-width: 0; }
/* 임장 순서 — 동그라미 번호. 번호가 없는 줄(선정물건 등)도 같은 자리를 비워 두어 주소 글이 세로로 같은 x 에서 시작한다(2026-11-13 사용자) */
.app-tbl .at-line .no { flex: none; display: inline-grid; place-items: center; width: 14px; height: 14px; margin-right: 4px; border: 1px solid #2b4fd8; border-radius: 50%; box-sizing: border-box; font-style: normal; font-size: 9px; font-weight: 800; line-height: 1; color: #2b4fd8; }
.app-tbl .at-line .no.ph { visibility: hidden; }
.app-tbl .at-line .at-tx { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.app-tbl .kind.me { justify-self: start; margin-bottom: 2px; }
/* 앱 — 선정물건 줄은 칩 위 · 주소 아래 두 줄, 칸 세로 가운데. 두 줄이 다른 줄 높이에 들도록 칩은 작게 · 주소 글 시작 x 에 맞춘다(2026-11-14 사용자) */
.app-tbl .at-addr:has(> .kind.me) { align-content: center; row-gap: 1px; }
.app-tbl .at-addr > .kind.me.q { margin: 0 0 0 18px; padding: 0 4px; font-size: 10px !important; line-height: 14px; border-radius: 3px; }
.app-tbl .at-two { line-height: 1.3; }
.app-tbl .at-two small { display: block; font-size: 10.5px; color: var(--sub); }
.app-tbl .est-lab { display: block; font-size: 10.5px; }
.at-tip { position: fixed; z-index: 3000; margin: 0; padding: 8px 10px; border-radius: 8px; background: #1f2937; color: #fff; font-size: 12.5px; line-height: 1.45; box-shadow: 0 4px 14px rgba(0, 0, 0, .2); word-break: keep-all; }
/* 앱 — 결론 · 근거: 꼬리표 왼쪽 끝 같은 x, 제목 줄 아래 10, 두 단락 사이 가로 구분선(위 16 · 아래 16)(2026-11-13 사용자) */
.pa-wrap.app .map-title.static { margin: 0; padding: 0; min-height: 25px; }
.pa-wrap.app .pa > .zone + .zone { margin-top: 4px; padding-top: 16px; border-top: 1px solid var(--line); }
/* 앱 — 임장경로에 추가 단추(근거 줄 오른쪽) · 아래에서 올라오는 고르기 창(2026-11-13) */
.pa-wrap.app .map-title.static { display: flex; align-items: center; gap: 8px; z-index: auto; }   /* 지도 위 층 번호(500)를 지운다 — 그리드 칸이라 그대로 두면 스크롤할 때 위 머리 위로 올라왔다 */
.add-btn.app { position: static; z-index: auto; margin-left: auto; height: 30px; padding: 0 12px; font-size: 12.5px; }
.add-msg.app { position: static; margin: 0; max-width: none; font-size: 12px; }
.add-dim { position: fixed; inset: 0; z-index: 2900; background: rgba(17, 24, 39, .45); }
.add-pop.app { position: fixed; left: 0; right: 0; bottom: 0; top: auto; z-index: 2901; width: auto; max-height: 75vh; display: flex; flex-direction: column; gap: 10px; padding: 10px 16px calc(16px + env(safe-area-inset-bottom, 0px)); border: 0; border-radius: 18px 18px 0 0; box-shadow: 0 -8px 24px rgba(0, 0, 0, .18); }
.add-pop.app .grab { align-self: center; width: 40px; height: 4px; border-radius: 2px; background: #dde3ee; }
.add-pop.app > b { font-size: 15px; font-weight: 800; }
.add-pop.app .add-items { overflow: auto; border: 1px solid var(--line); border-radius: 10px; }
.add-pop.app .add-items label { padding: 10px 12px; border-bottom: 1px solid var(--line); font-size: 13.5px; }
.add-pop.app .add-items label:last-child { border-bottom: 0; }
.add-pop.app .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
.add-pop.app .ok { flex: none; height: 44px; font-size: 15px; }
.pa-wrap.app .map-title.static .mt-count { font-size: 12px; font-weight: 400; color: var(--sub); white-space: nowrap; }
.pa-wrap.app .map-title.static b { white-space: nowrap; }
.add-btn.app { white-space: nowrap; padding: 0 10px; }
/* 밤 — 상자 · 표 · 필터 선이 낮 색(#e5e7eb)으로 하얗게 떴다(2026-11-13 사용자). 웹 밤 선 색으로 */
:root[data-theme="dark"] .pa { --line: #2a3449; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .pa { --line: #2a3449; } }
/* 밤 — 선정물건 줄: 낮 연분홍 선(#f3c9c9)이 하얀 줄로 보였다. 매각분석 · 매매수요 내 물건 줄과 같은 색 */
:root[data-theme="dark"] .pa-list tbody tr.mine { background: rgba(224, 62, 62, .1); box-shadow: inset 0 -2px 0 rgba(224, 62, 62, .35); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .pa-list tbody tr.mine { background: rgba(224, 62, 62, .1); box-shadow: inset 0 -2px 0 rgba(224, 62, 62, .35); } }
/* 웹 — 결론 단락(제목 줄 + 내비게이터 네 칸)을 스크롤해도 위에 붙여 둔다. 매각분석 결과 머리(.sx-hero)와 같은 자리 · 같은 그림자(2026-11-13 사용자).
   붙는 높이는 웹이 화면마다 --pa-stick-top 으로 준다. 단락은 시세분석 상자(.pa) 바로 아래 칸이라 상자 끝까지 붙어 있다 */
.pa.stick:not(.fs) > .zone-est { position: sticky; top: var(--pa-stick-top, 8px); z-index: 19; margin: -18px -22px 0; padding: 18px 22px 14px; border-radius: 12px; background: inherit; box-shadow: 0 6px 16px rgba(17, 24, 39, .08); }   /* 결론 제목 줄('이 물건 매도가 예상' · 조건 · 기간 · 조회)까지 한 덩어리로(2026-11-13 사용자) */
.zone-ph { margin: -18px 0 0; }   /* 고정한 머리 자리 받침 — 머리의 위 여백(-18)과 같게 */
/* 붙는 자리는 머리띠 · 고정카드 바로 아래(틈 0) — 8px 틈으로 아래 필터 줄이 반쯤 걸쳐 보였다. 대신 위 안쪽 여백을 18 로 늘려 글 자리는 그대로(2026-11-15 사용자) */
</style>
