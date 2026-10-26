<script setup lang="ts">
import L from 'leaflet';
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  fetchTradeVolumeStats,
  type PropertyType,
  type TradeVolumeStat,
} from '../services/publicDataApi';
import { geocodeAddress } from '../services/routeOptimizer';
import { REGION_GROUPS as regionGroups, type DistrictOption } from '../services/regionCodes';


type RankedRow = TradeVolumeStat & {
  rank: number;
  share: number;
  /** 그 동네 매매 평균가 (원) — 금액이 적혀 온 거래만으로 센다 */
  avgPrice: number;
  lat?: number;
  lng?: number;
};

// 차례는 다른 분석 화면(KINDS)과 같게 — 연립다세대 · 아파트 · 오피스텔
const propertyOptions: Array<{ value: PropertyType; label: string }> = [
  { value: 'villa', label: '연립다세대' },
  { value: 'apt', label: '아파트' },
  { value: 'officetel', label: '오피스텔' },
];

const periodOptions = [1, 3, 6, 12];
/** 억·만 단위로 짧게 — '3억 2,500만' */
const shortWon = (won: number): string => {
  if (!Number.isFinite(won) || won <= 0) return '-';
  const eok = Math.floor(won / 100000000);
  const man = Math.round((won % 100000000) / 10000);
  if (eok > 0) return man > 0 ? `${eok}억 ${man.toLocaleString('ko-KR')}만` : `${eok}억`;
  return `${man.toLocaleString('ko-KR')}만`;
};
/** 웹 시장분석 › 거래량 랭킹에 띄웠는가 — 웹(shared.entry.js)이 넣어 준다. 분석 도구에서는 false */
const webEmbed = inject<boolean>('webEmbed', false);
/** 고르는 칸을 옮겨 넣을 왼쪽 판 자리 — 화면마다 다른 이름을 써서, 같은 화면이 둘 떠도 칸이 한 판에 두 벌 들어가지 않게 */
const filterSlotId = `tsp-filter-slot-${Math.random().toString(36).slice(2, 8)}`;
const router = useRouter();
const selectedSido = ref('');
const selectedDistrict = ref('');
const selectedPropertyType = ref<PropertyType>('villa');
/** 기간은 고르고 들어가게 둔다 — 빈 값이면 아직 안 골랐다는 뜻이다 */
const selectedPeriod = ref(0);
/** 랭킹은 늘 다섯 줄 — 고르는 메뉴를 두지 않는다.
 *  더 아래가 궁금하면 읍·면·동을 골라 그 동이 몇 등인지 바로 본다. */
const TOP_N = 5;
const progress = ref<{ done: number; total: number } | null>(null);
const loading = ref(false);
const message = ref('');
const rows = ref<TradeVolumeStat[]>([]);
const totalCount = ref(0);
const sourceSummary = ref('');
const lastLoadedLabel = ref('');
const lastLoadedAt = ref('');
const selectedRegion = ref<string | null>(null);
/** 읍·면·동 — 고르면 그 동에 눈을 맞춘다. 통계 정보도 그 동 것으로 바뀐다 */
const selectedDong = ref('');
/** 검색 전에도 고를 수 있게, 시군구를 고르면 석 달치를 미리 훑어 이름만 모아 둔다 */
const peekDongs = ref<string[]>([]);
const peeking = ref(false);
const dongOptions = computed(() => (rows.value.length > 0 ? rows.value.map((r) => r.region) : peekDongs.value));
const geocodedCoords = ref<Map<string, { lat: number; lng: number }>>(new Map());

let leafletMap: L.Map | null = null;
let markerLayer: L.LayerGroup | null = null;
const markerByRegion = new Map<string, L.Marker>();

const ALL_DISTRICTS: DistrictOption = { label: '전체', lawdCode: 'ALL' };

// 전국 훑기는 쓰지 않는다 — 시·도를 고르는 것으로 시작한다
const sidoOptions = computed(() => regionGroups.map((g) => g.sido));
const baseDistricts = computed(
  () => regionGroups.find((item) => item.sido === selectedSido.value)?.districts ?? [],
);
const districtOptions = computed<DistrictOption[]>(() =>
  (selectedSido.value ? [ALL_DISTRICTS, ...baseDistricts.value] : []),
);
const isAllDistricts = computed(() => selectedDistrict.value === ALL_DISTRICTS.label);
const selectedDistrictOption = computed(
  () =>
    districtOptions.value.find((item) => item.label === selectedDistrict.value) ??
    districtOptions.value[0],
);
const selectedLawdCode = computed(() => selectedDistrictOption.value?.lawdCode ?? '');
const selectedKeyword = computed(() =>
  [selectedSido.value, selectedDistrict.value].filter(Boolean).join(' '),
);

const allRankedRows = computed<RankedRow[]>(() => {
  const sum = rows.value.reduce((acc, r) => acc + r.count, 0);
  return rows.value.map((row, idx) => {
    const coord = geocodedCoords.value.get(row.region);
    return {
      ...row,
      rank: idx + 1,
      share: sum > 0 ? (row.count / sum) * 100 : 0,
      avgPrice: row.priceCount > 0 ? row.priceSum / row.priceCount : 0,
      lat: coord?.lat,
      lng: coord?.lng,
    };
  });
});

const rankedRows = computed<RankedRow[]>(() => allRankedRows.value.slice(0, TOP_N));

const topCount = computed(() => rankedRows.value[0]?.count ?? 0);

/** 통계 정보 — 동을 고르면 그 동 것만, 아니면 받아 온 동을 통째로 센다 */
const statRows = computed(() => (
  selectedRegion.value ? rows.value.filter((r) => r.region === selectedRegion.value) : rows.value
));
const statTotalCount = computed(() => statRows.value.reduce((acc, r) => acc + r.count, 0));
const statPriceSum = computed(() => statRows.value.reduce((acc, r) => acc + r.priceSum, 0));
const statPriceCount = computed(() => statRows.value.reduce((acc, r) => acc + r.priceCount, 0));
const statAvgPrice = computed(() => (statPriceCount.value > 0 ? statPriceSum.value / statPriceCount.value : 0));
/** 지금 보고 있는 범위 — '인천광역시 서해구' */
const scopeTitle = computed(() => (
  selectedRegion.value
    ? `${selectedKeyword.value} ${selectedRegion.value}`
    : (selectedKeyword.value || '지역을 고르세요')
));
/** 받아 온 기간 — '최근 1개월' */
const periodText = computed(() => (selectedPeriod.value ? `최근 ${selectedPeriod.value}개월` : ''));
/** 매매 / 전월세 — 웹에서만 고른다(분석 도구는 늘 매매) */
const selectedDealKind = ref<'sale' | 'rent'>('sale');
const DEAL_KINDS = [{ value: 'sale', label: '매매' }, { value: 'rent', label: '전월세' }] as const;
const dealKindLabel = computed(() => (selectedDealKind.value === 'rent' ? '전월세' : '매매'));
/** 평균 금액 이름 — 전월세는 보증금 평균 */
const avgLabel = computed(() => (selectedDealKind.value === 'rent' ? '보증금 평균' : '매매 평균가'));
/** 웹 판 — 검색 아래 결과 줄: 고른 시도 · 시군구 · 읍면동, 그 아래 '최근 12개월 · 연립다세대' */
const pickedPlaceText = computed(() => (
  [selectedSido.value, selectedDistrict.value, selectedDong.value].filter(Boolean).join(' ') || '지역을 고르세요'
));
const kindLabel = computed(
  () => propertyOptions.find((o) => o.value === selectedPropertyType.value)?.label ?? '전체',
);

const buildDealYmdList = (months: number): string[] => {
  const list: string[] = [];
  const base = new Date();
  base.setMonth(base.getMonth() - 1); // previous month as baseline (current month often incomplete)
  for (let i = 0; i < months; i += 1) {
    const d = new Date(base);
    d.setMonth(base.getMonth() - i);
    list.push(
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`,
    );
  }
  return list;
};

watch(
  () => selectedSido.value,
  () => {
    selectedDistrict.value = districtOptions.value[0]?.label ?? '';
  },
);
// 메뉴에서 동을 고르면 지도와 통계가 따라오고, 지도에서 누르면 메뉴가 따라온다
watch(selectedDong, (dong) => {
  if (!dong) { selectedRegion.value = null; return; }
  if (selectedRegion.value !== dong) focusRegion(dong);
});
watch(selectedRegion, (region) => { selectedDong.value = region ?? ''; });

// 지역을 바꾸면 고른 동은 푼다. 시군구를 고르면 동 이름을 미리 훑어 둔다
watch(() => `${selectedSido.value}|${selectedDistrict.value}`, async () => {
  selectedDong.value = '';
  selectedRegion.value = null;
  peekDongs.value = [];
  const district = selectedDistrictOption.value;
  if (!selectedSido.value || !selectedDistrict.value || isAllDistricts.value || !district) return;
  peeking.value = true;
  try {
    const result = await fetchTradeVolumeStats({
      keyword: selectedKeyword.value,
      lawdCode: district.lawdCode,
      dealYmdList: buildDealYmdList(3),
      propertyType: selectedPropertyType.value,
    });
    if (district.lawdCode !== selectedDistrictOption.value?.lawdCode) return;
    peekDongs.value = result.rows.map((r) => r.region);
  } catch {
    peekDongs.value = [];
  } finally {
    peeking.value = false;
  }
});

/** 등수 색 — 다섯 줄만 세우므로 색상환을 큼직하게 건너뛴다.
 *  빨강 → 노랑 → 초록 → 파랑 → 보라. 이웃한 등수가 한눈에 갈린다. */
const RANK_HUES = [0, 45, 135, 215, 285];
const hueOf = (rank: number) => RANK_HUES[(rank - 1) % RANK_HUES.length];
/** 노랑 언저리는 어둡게 깔면 흙빛이 된다 — 색은 그대로 두고 글씨를 검게 쓴다 */
const isPaleHue = (h: number) => h >= 35 && h <= 80;
const paletteColors = (rank: number): [string, string] => {
  // 여섯 등부터는 색을 빼 담담하게 — 지도에 다 찍되 앞 다섯이 먼저 눈에 들어와야 한다
  if (rank > TOP_N) return ['hsl(215 16% 66%)', 'hsl(215 18% 52%)'];
  const h = hueOf(rank);
  return [`hsl(${h} 88% 58%)`, `hsl(${h} 82% ${isPaleHue(h) ? 50 : 45}%)`];
};
/** 노랑 바탕에서만 글씨를 검게 — 나머지는 흰 글씨가 읽힌다 */
const isLightBadge = (rank: number) => rank <= TOP_N && isPaleHue(hueOf(rank));

/** 지도 표시 — 등수·동 이름·평균가를 한 알약에 담는다 (전에는 동그라미와 이름표가 따로였다) */
const makePin = (row: RankedRow) => {
  const [, deep] = paletteColors(row.rank);
  const color = isLightBadge(row.rank) ? '#1e293b' : '#fff';
  const top = row.rank <= TOP_N ? ' top' : '';
  const value = `${row.count.toLocaleString('ko-KR')}건`;
  return L.divIcon({
    className: 'trade-map-marker-wrap',
    html: `<div class="trade-map-pin${top}" style="background:${deep};color:${color}">`
      + `<i>${row.rank}</i><b>${row.region}</b><span>${value}</span></div>`,
    iconSize: [112, 26],
    iconAnchor: [56, 13],
  });
};

const markerRadius = (count: number) => 8 + Math.sqrt(Math.max(count, 0)) * 2;

const ensureMap = async () => {
  await nextTick();
  if (leafletMap) return;
  const container = document.getElementById('trade-map');
  if (!container) return;
  // 확대·축소 단추는 오른쪽으로 — 왼쪽은 통계 판이 덮는다
  leafletMap = L.map('trade-map', { zoomControl: false }).setView([37.48, 126.68], 11);
  L.control.zoom({ position: 'topright' }).addTo(leafletMap);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
  }).addTo(leafletMap);
  markerLayer = L.layerGroup().addTo(leafletMap);
};

const drawMap = async () => {
  await ensureMap();
  if (!leafletMap || !markerLayer) return;
  markerLayer.clearLayers();
  markerByRegion.clear();

  const plotted: L.LatLngTuple[] = [];
  // 지도에는 받아 온 동을 모두 찍는다 — 다섯 줄은 왼쪽 목록에서만 추린다
  allRankedRows.value.forEach((row) => {
    if (row.lat == null || row.lng == null) return;
    const [cFrom, cTo] = paletteColors(row.rank);
    const circle = L.circleMarker([row.lat, row.lng], {
      radius: markerRadius(row.count),
      color: cTo,
      fillColor: cFrom,
      fillOpacity: 0.35,
      weight: 2,
    });
    markerLayer!.addLayer(circle);

    // 말풍선은 띄우지 않는다 — 누르면 왼쪽 판이 그 동 것으로 바뀐다
    const pin = L.marker([row.lat, row.lng], { icon: makePin(row) }).on('click', () => {
      selectedRegion.value = selectedRegion.value === row.region ? null : row.region;
    });
    markerLayer!.addLayer(pin);
    markerByRegion.set(row.region, pin);
    plotted.push([row.lat, row.lng]);
  });

  if (plotted.length > 0) {
    leafletMap.fitBounds(L.latLngBounds(plotted), { padding: [40, 40], maxZoom: 14 });
  }
};

const focusRegion = (region: string) => {
  selectedRegion.value = region;
  const marker = markerByRegion.get(region);
  if (!marker || !leafletMap) return;
  const latlng = marker.getLatLng();
  leafletMap.setView(latlng, Math.max(leafletMap.getZoom(), 13), { animate: true });
};

const regionGeocodeQuery = new Map<string, string>();

const geocodeRegions = async () => {
  const next = new Map(geocodedCoords.value);
  for (const row of rows.value) {
    if (next.has(row.region)) continue;
    const query = regionGeocodeQuery.get(row.region) ?? row.region;
    try {
      const point = await geocodeAddress(query);
      if (point) {
        next.set(row.region, { lat: point.lat, lng: point.lng });
        geocodedCoords.value = new Map(next);
        void drawMap();
      }
    } catch {
      // ignore individual failures
    }
  }
};

const runWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onDone?: (done: number, total: number) => void,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  let completed = 0;
  const runOne = async (): Promise<void> => {
    while (cursor < items.length) {
      const myIdx = cursor;
      cursor += 1;
      results[myIdx] = await worker(items[myIdx], myIdx);
      completed += 1;
      onDone?.(completed, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runOne()));
  return results;
};

const loadStats = async () => {
  if (!selectedSido.value || !selectedDistrict.value) {
    message.value = '시·도와 시·군·구를 고른 뒤 검색해 주세요.';
    return;
  }
  if (!selectedPeriod.value) {
    message.value = '기간을 골라 주세요.';
    return;
  }
  loading.value = true;
  message.value = '';
  regionGeocodeQuery.clear();
  progress.value = null;
  try {
    const dealYmdList = buildDealYmdList(selectedPeriod.value);

    type Target = { sido: string; district: DistrictOption };
    const targets: Target[] = isAllDistricts.value
      ? baseDistricts.value.map((d) => ({ sido: selectedSido.value, district: d }))
      : [{ sido: selectedSido.value, district: selectedDistrictOption.value! }];

    // 시군구를 '전체'로 두면 그 시도의 구마다 한 번씩 부른다 — 어디까지 왔는지 알린다
    const many = targets.length > 1;
    if (many) {
      progress.value = { done: 0, total: targets.length };
    }

    const perDistrict = await runWithConcurrency(
      targets,
      many ? 4 : 6,
      async (target) => {
        try {
          const result = await fetchTradeVolumeStats({
            keyword: [target.sido, target.district.label].filter(Boolean).join(' '),
            lawdCode: target.district.lawdCode,
            dealYmd: dealYmdList[0],
            dealYmdList,
            propertyType: selectedPropertyType.value,
            dealKind: selectedDealKind.value,
          });
          return { target, result };
        } catch (error) {
          return { target, error };
        }
      },
      (done, total) => {
        if (many) progress.value = { done, total };
      },
    );

    const merged = new Map<string, TradeVolumeStat>();
    const sourceSet = new Set<string>();
    const warnings: string[] = [];
    let aggregateCount = 0;

    perDistrict.forEach((entry) => {
      if ('error' in entry && entry.error) {
        const msg = entry.error instanceof Error ? entry.error.message : String(entry.error);
        warnings.push(`${entry.target.district.label}: ${msg}`);
        return;
      }
      const { target, result } = entry as { target: Target; result: Awaited<ReturnType<typeof fetchTradeVolumeStats>> };
      aggregateCount += result.totalCount;
      result.sources.forEach((s) => sourceSet.add(s));
      if (result.errors && result.errors.length > 0) {
        const errMsgs = result.errors.map((e) => `${e.source}(${e.message})`).join(', ');
        warnings.push(`${target.district.label}: ${errMsgs}`);
      } else if (result.warning) {
        warnings.push(`${target.district.label}: ${result.warning}`);
      }

      // 동 level aggregation (single 시/도)
      result.rows.forEach((row) => {
        const displayRegion = isAllDistricts.value
          ? `${target.district.label} ${row.region}`
          : row.region;
        regionGeocodeQuery.set(
          displayRegion,
          [target.sido, target.district.label, row.region].filter(Boolean).join(' '),
        );
        const existing = merged.get(displayRegion);
        if (existing) {
          existing.count += row.count;
          existing.priceSum += row.priceSum;
          existing.priceCount += row.priceCount;
          row.sources.forEach((s) => {
            if (!existing.sources.includes(s)) existing.sources.push(s);
          });
        } else {
          merged.set(displayRegion, {
            region: displayRegion,
            count: row.count,
            sources: [...row.sources],
            priceSum: row.priceSum,
            priceCount: row.priceCount,
          });
        }
      });
    });

    rows.value = [...merged.values()].sort(
      (a, b) => b.count - a.count || a.region.localeCompare(b.region, 'ko'),
    );
    totalCount.value = aggregateCount;
    sourceSummary.value = [...sourceSet].join(', ');
    const periodLabel = `${dealYmdList[dealYmdList.length - 1]}~${dealYmdList[0]}`;
    lastLoadedLabel.value = `${selectedKeyword.value || selectedLawdCode.value} · ${periodLabel}`;
    lastLoadedAt.value = new Date().toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    selectedRegion.value = null;
    geocodedCoords.value = new Map();
    const unit = '동(洞)';
    if (rows.value.length === 0) {
      message.value = warnings[0] || '해당 조건의 실거래 건수가 없습니다.';
    } else if (warnings.length > 0) {
      message.value = `${rows.value.length}개 ${unit} 집계 완료 (일부 실패: ${warnings.slice(0, 2).join(' | ')})`;
    } else {
      message.value = `${rows.value.length}개 ${unit}의 실거래 건수를 집계했습니다.`;
    }
    await drawMap();
    void geocodeRegions();
  } catch (error) {
    rows.value = [];
    totalCount.value = 0;
    sourceSummary.value = '';
    message.value = error instanceof Error ? error.message : '실거래 통계를 불러오지 못했습니다.';
  } finally {
    loading.value = false;
    progress.value = null;
  }
};

// 처음에는 아무것도 부르지 않는다 — 지역과 기간을 고르고 검색을 눌러야 받는다
onMounted(() => {
  void ensureMap();
});
</script>

<template>
  <!-- 틀은 분석 도구의 '실거래 분석'과 같은 것을 쓴다 — 같은 자료를 눈으로 보는 화면이다 -->
  <section class="adm-shell">
    <header class="adm-top">
      <div class="adm-top-in">
        <button type="button" class="adm-back" aria-label="뒤로" @click="router.push('/admin')">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg>
        </button>
        <div class="adm-title">
          <h1>지역별 거래량 랭킹</h1>
          <p>지도와 함께 지역별 거래량 랭킹을 본다.</p>
        </div>
      </div>
    </header>

    <div class="adm-body tsp-body">
      <div class="tsp-filter">
        <!-- 웹 — 고르는 칸 묶음을 왼쪽 판 맨 위(통계 정보 위)로 옮긴다. 분석 도구에서는 제자리 -->
        <Teleport defer :to="`#${filterSlotId}`" :disabled="!webEmbed">
          <!-- 분석 도구의 '실거래 분석'과 같은 차례로 좁힌다 — 시도 → 시군구 → 읍면동 → 종류.
               다만 여기는 '데이터 로드'가 아니라 전처럼 검색이다 -->
          <div class="tsp-bar">
            <label class="tsp-f">
              <small>시 · 도</small>
              <select :class="['tsp-select', { ph: !selectedSido }]" v-model="selectedSido">
                <option value="">{{ webEmbed ? '시도 선택' : '선택' }}</option>
                <option v-for="sido in sidoOptions" :key="sido" :value="sido">{{ sido }}</option>
              </select>
            </label>
            <label class="tsp-f">
              <small>시 · 군 · 구</small>
              <select :class="['tsp-select', { ph: !selectedDistrict }]" v-model="selectedDistrict" :disabled="!selectedSido">
                <option value="">{{ webEmbed ? '시군구 선택' : '선택' }}</option>
                <option v-for="district in districtOptions" :key="district.lawdCode" :value="district.label">
                  {{ district.label }}
                </option>
              </select>
            </label>
            <label class="tsp-f">
              <small>읍 · 면 · 동</small>
              <select :class="['tsp-select', { ph: !selectedDong }]" v-model="selectedDong" :disabled="dongOptions.length === 0">
                <option value="">{{ peeking ? '불러오는 중…' : (webEmbed ? '읍면동 선택' : '전체') }}</option>
                <option v-for="d in dongOptions" :key="d" :value="d">{{ d }}</option>
              </select>
            </label>
            <label class="tsp-f">
              <small>종류</small>
              <div class="tsp-seg">
                <button
                  v-for="opt in propertyOptions"
                  :key="opt.value"
                  type="button"
                  :class="['tsp-seg-btn', { on: selectedPropertyType === opt.value }]"
                  @click="selectedPropertyType = opt.value"
                >{{ opt.label }}</button>
              </div>
            </label>
            <!-- 웹 — 기간 옆에서 매매 / 전월세를 고른다 -->
            <label v-if="webEmbed" class="tsp-f tsp-f-deal">
              <small>거래</small>
              <div class="tsp-seg">
                <button
                  v-for="opt in DEAL_KINDS"
                  :key="opt.value"
                  type="button"
                  :class="['tsp-seg-btn', { on: selectedDealKind === opt.value }]"
                  @click="selectedDealKind = opt.value"
                >{{ opt.label }}</button>
              </div>
            </label>
            <label class="tsp-f tsp-f-period">
              <small>기간</small>
              <select :class="['tsp-select', { ph: !selectedPeriod }]" v-model.number="selectedPeriod">
                <option :value="0">{{ webEmbed ? '기간 선택' : '선택' }}</option>
                <option v-for="m in periodOptions" :key="m" :value="m">{{ m }}개월</option>
              </select>
            </label>
            <button
              type="button"
              class="tsp-search-btn"
              :disabled="loading || !selectedSido || !selectedDistrict || !selectedPeriod"
              @click="loadStats"
            >
              {{ loading ? '검색 중…' : '검색' }}
            </button>
          </div>
          <p v-if="progress" class="tsp-note">불러오는 중 {{ progress.done }} / {{ progress.total }}</p>
          <!-- 검색이 비거나 실패했을 때 이유를 바로 보여 준다 -->
          <p v-if="message" :class="['tsp-note', { warn: rows.length === 0 }]">{{ message }}</p>
        </Teleport>
      </div>

      <!-- 지도를 바탕에 깔고, 통계와 랭킹은 그 위 왼쪽 판에 얹는다 -->
      <section class="tsp-stage">
        <div id="trade-map" class="tsp-map" />

        <aside class="tsp-panel">
          <!-- 웹 판 — 제목·안내 → 고르는 칸 → 고른 결과 → 통계 정보 → 동별 랭킹 (사이마다 가름선) -->
          <header v-if="webEmbed" class="tsp-web-head">
            <strong>거래량 랭킹</strong>
            <small>지도와 함께 지역별 거래량 랭킹을 봅니다.</small>
          </header>
          <div v-if="webEmbed" :id="filterSlotId" class="tsp-filter-slot" />
          <div v-if="webEmbed" class="tsp-web-picked">
            <strong>{{ pickedPlaceText }}</strong>
            <small v-if="periodText || kindLabel">{{ [periodText, kindLabel, dealKindLabel].filter(Boolean).join(' · ') }}</small>
          </div>
          <header v-if="!webEmbed" class="tsp-panel-head">
            <strong>{{ scopeTitle }}</strong>
            <small v-if="lastLoadedLabel">{{ periodText }} · {{ kindLabel }}</small>
            <small v-else>지역과 기간을 고르고 검색을 누르세요</small>
          </header>

          <section class="tsp-stat">
            <h3>통계 정보</h3>
            <div class="tsp-stat-grid">
              <div><dt>거래 건수</dt><dd>{{ statTotalCount.toLocaleString('ko-KR') }}건</dd></div>
              <div><dt>{{ avgLabel }}</dt><dd>{{ shortWon(statAvgPrice) }}</dd></div>
              <div><dt>거래 총액</dt><dd>{{ shortWon(statPriceSum) }}</dd></div>
              <div><dt>집계 동</dt><dd>{{ selectedRegion ? '1곳' : `${rows.length}곳` }}</dd></div>
            </div>
          </section>

          <section class="tsp-rank">
            <h3>동별 거래 랭킹
              <small v-if="allRankedRows.length > 0">{{ rankedRows.length }} / {{ allRankedRows.length }}</small>
            </h3>
            <p v-if="rankedRows.length === 0" class="tsp-empty">조회 결과가 여기에 표시됩니다.</p>
            <ol v-else class="tsp-rank-list">
              <li
                v-for="row in rankedRows"
                :key="row.region"
                :class="['tsp-rank-row', { active: selectedRegion === row.region }]"
                @click="focusRegion(row.region)"
              >
                <span
                  class="tsp-rank-badge"
                  :style="{ background: paletteColors(row.rank)[1], color: isLightBadge(row.rank) ? '#1e293b' : '#fff' }"
                >{{ row.rank }}</span>
                <div class="tsp-rank-main">
                  <div class="tsp-rank-top">
                    <strong class="tsp-rank-name">{{ row.region }}</strong>
                    <strong class="tsp-rank-count">{{ row.count.toLocaleString() }}건</strong>
                  </div>
                  <div class="tsp-rank-bot">
                    <div class="tsp-rank-bar">
                      <span
                        class="tsp-rank-fill"
                        :style="{ width: `${topCount > 0 ? (row.count / topCount) * 100 : 0}%`, background: paletteColors(row.rank)[1] }"
                      />
                    </div>
                    <small class="tsp-rank-pct">{{ row.share.toFixed(1) }}%</small>
                  </div>
                  <small class="tsp-rank-avg">{{ avgLabel }} {{ shortWon(row.avgPrice) }}</small>
                </div>
              </li>
            </ol>
          </section>
        </aside>
      </section>
    </div>

  </section>
</template>

<style scoped>
/* 분석 도구와 같은 틀 (AdminRegionDemandPage 와 같은 값) */
.adm-shell { min-height: 100vh; background: #f5f7fb; color: #111827; display: flex; flex-direction: column; }
.adm-top {
  position: sticky; top: 0; z-index: 20;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: saturate(160%) blur(10px);
  border-bottom: 1px solid #e8ecf3;
}
.adm-top-in { max-width: 1680px; margin: 0 auto; padding: 12px 28px; display: flex; align-items: center; gap: 14px; }
.adm-back {
  border: 1px solid #dde3ee; background: #fff; border-radius: 9px;
  width: 32px; height: 32px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  line-height: 0; color: #374151; cursor: pointer;
}
.adm-back:hover { border-color: #b9cdf7; color: #2b6df3; }
.adm-title h1 {
  margin: 0; font-size: 17px; font-weight: 800; letter-spacing: -0.3px;
  display: flex; align-items: baseline; gap: 7px;
}
.adm-title h1 em { font-style: normal; font-size: 11.5px; font-weight: 700; color: #9ca3af; }
.adm-title p { margin: 2px 0 0; font-size: 12px; color: #9ca3af; }
.adm-body { flex: 1 1 auto; width: 100%; max-width: 1680px; margin: 0 auto; padding: 24px 28px 60px; }



.tsp-body { display: flex; flex-direction: column; gap: 16px; }

.tsp-card { background: #fff; border: 1px solid #e8ecf3; border-radius: 14px; overflow: hidden; }
.tsp-card-head { display: flex; align-items: baseline; justify-content: space-between; padding: 16px 16px 12px; }
.tsp-card-head h2 { margin: 0; font-size: 15.3px; font-weight: 800; color: #111827; }
.tsp-card-sub { font-size: 12px; color: #9ca3af; font-weight: 500; }

.tsp-filter {
  display: flex; flex-direction: column; gap: 10px;
  background: #fff; border: 1px solid #e8ecf3; border-radius: 14px; padding: 16px 18px;
}
/* 조건 줄 — 분석 도구(.adm-bar)와 같은 짜임. 칸마다 이름을 머리에 달고,
   남는 폭은 고르게 나눠 갖는다. 좁은 화면에서는 두 칸씩 접힌다 */
.tsp-bar { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
.tsp-f { display: flex; flex-direction: column; gap: 6px; flex: 1 1 160px; min-width: 0; }
.tsp-f small { font-size: 11px; font-weight: 700; color: #6b7280; }
.tsp-seg { display: flex; gap: 4px; background: #f3f5f9; border-radius: 9px; padding: 3px; align-items: center; height: 36px; }
.tsp-seg-btn {
  flex: 1 1 0; border: none; background: transparent; border-radius: 7px;
  padding: 7px 6px; font-family: inherit; font-size: 12.5px; font-weight: 700;
  color: #6b7280; cursor: pointer; white-space: nowrap;
}
.tsp-seg-btn.on { background: #fff; color: #1f3a72; box-shadow: 0 1px 3px rgba(17, 24, 39, 0.1); }
.tsp-bar .tsp-search-btn { margin-left: auto; flex: 0 0 auto; }
/* 평균 매매가 — 동네 이름과 건수 사이에 담담하게 */
.tsp-rank-avg { margin-left: 6px; font-size: 11.5px; font-weight: 700; color: #6b7280; white-space: nowrap; }
.tsp-filter-row { display: grid; gap: 10px; }
.tsp-filter-row.two { grid-template-columns: 1fr 1fr; }
.tsp-filter-row.three { grid-template-columns: 1fr 1fr 1fr; }
.tsp-select {
  width: 100%; height: 36px; padding: 0 11px; font-size: 13.5px;
  border: 1px solid #dde3ee; border-radius: 9px; background: #fff; color: #111827;
  -webkit-appearance: none; appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1l5 5 5-5' stroke='%239ca3af' stroke-width='1.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>");
  background-repeat: no-repeat; background-position: right 14px center;
  padding-right: 36px;
}
.tsp-select:disabled { background-color: #f9fafb; color: #9ca3af; }
.tsp-search-btn {
  height: 36px; padding: 0 20px;
  border: none; border-radius: 9px; background: #1f3a72; color: #fff;
  font-family: inherit; font-size: 13px; font-weight: 800; cursor: pointer;
}
.tsp-search-btn:hover { background: #16305f; }
.tsp-search-btn:disabled { background: #aeb8ca; cursor: default; }
.tsp-note { margin: 0; font-size: 13px; color: #6b7280; line-height: 1.45; }
.tsp-note.warn { color: #b45309; }

.tsp-kpi-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; }
.tsp-kpi {
  background: #fff; border: 1px solid #eef0f5; border-radius: 12px;
  padding: 12px 8px; display: flex; flex-direction: column; gap: 6px; align-items: center;
  min-width: 0;
}
.tsp-kpi small { font-size: 11px; color: #9ca3af; font-weight: 500; letter-spacing: -0.2px; }
.tsp-kpi strong {
  font-size: 22px; font-weight: 900; color: #111827; line-height: 1; letter-spacing: -0.6px;
  display: inline-flex; align-items: baseline;
}
.tsp-kpi strong em {
  font-style: normal; font-size: 11px; font-weight: 700; color: #6b7280; margin-left: 2px;
}
.tsp-kpi strong.t-name {
  font-size: 13px; font-weight: 800; max-width: 100%;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tsp-kpi .t-sub { font-size: 10.5px; color: #6b7280; font-weight: 600; }
.tsp-kpi .kpi-suffix { font-size: 10px; color: #2b6df3; font-weight: 700; margin-left: 2px; }

.tsp-rank-list { list-style: none; margin: 0; padding: 4px 0 12px; }
.tsp-rank-row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
}
.tsp-rank-row.active { background: #eff6ff; }
.tsp-rank-badge {
  width: 30px; height: 30px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 800; flex-shrink: 0;
}
.tsp-rank-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.tsp-rank-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.tsp-rank-name {
  font-size: 15px; font-weight: 700; color: #111827;
  flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tsp-rank-count { font-size: 15px; font-weight: 800; color: #111827; flex-shrink: 0; }
.tsp-rank-bot { display: flex; align-items: center; gap: 10px; }
.tsp-rank-bar {
  flex: 1 1 auto; background: #eef0f5; height: 8px; border-radius: 999px; overflow: hidden;
}
.tsp-rank-fill { display: block; height: 100%; border-radius: 999px; transition: width 0.3s; }
.tsp-rank-pct { font-size: 12px; color: #9ca3af; font-weight: 500; flex-shrink: 0; min-width: 42px; text-align: right; }

.tsp-empty { margin: 12px 14px 16px; padding: 30px 14px; text-align: center; color: #9ca3af; font-size: 13px; background: #fafafa; border: 1px dashed #e5e7eb; border-radius: 10px; }

/* 지도를 바탕에 깔고 그 위 왼쪽에 판을 얹는다 — 지도만 보고도 읽히게 */
.tsp-stage {
  position: relative; border-radius: 14px; overflow: hidden;
  border: 1px solid #e8ecf3; background: #fff;
  height: calc(100vh - 230px); min-height: 560px;
}
.tsp-map { width: 100%; height: 100%; }
.tsp-panel {
  position: absolute; z-index: 600; top: 14px; left: 14px; bottom: 14px; width: 328px;
  display: flex; flex-direction: column; gap: 12px; overflow-y: auto;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid #e3e8f0; border-radius: 14px; padding: 16px 16px 18px;
  box-shadow: 0 10px 30px rgba(17, 24, 39, 0.14);
}
.tsp-panel-head strong { display: block; font-size: 16px; font-weight: 800; letter-spacing: -0.3px; }
/* 조건 요약과 통계 이름표는 앱이 쓰는 파랑으로 — 값(검정)과 한눈에 갈린다 */
.tsp-panel-head small { display: block; margin-top: 3px; font-size: 11.5px; color: #2b6df3; font-weight: 700; }
.tsp-panel h3 {
  margin: 0 0 8px; font-size: 12.5px; font-weight: 800; color: #374151;
  display: flex; align-items: baseline; gap: 6px;
}
.tsp-panel h3 small { margin-left: auto; font-size: 11px; font-weight: 700; color: #9ca3af; }
/* 통계 정보 — 네 칸짜리 작은 표 */
.tsp-stat-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  border: 1px solid #e8ecf3; border-radius: 10px; overflow: hidden; background: #e8ecf3; gap: 1px;
}
.tsp-stat-grid > div { background: #fff; padding: 9px 10px; min-width: 0; }
.tsp-stat-grid dt { font-size: 10.5px; font-weight: 700; color: #2b6df3; }
.tsp-stat-grid dd { margin: 2px 0 0; font-size: 13.5px; font-weight: 800; color: #111827; white-space: nowrap; }
.tsp-rank .tsp-rank-list { padding: 0; }
.tsp-rank .tsp-empty { margin: 0; padding: 18px 0; text-align: center; font-size: 12px; color: #9ca3af; }
/* 지도 표시 — 등수·동 이름·평균가를 한 알약에 담는다 */
:global(.trade-map-pin) {
  display: inline-flex; align-items: center; gap: 5px; white-space: nowrap;
  padding: 3px 9px 3px 3px; border-radius: 999px; border: 2px solid #fff;
  box-shadow: 0 2px 7px rgba(15, 23, 42, 0.32); line-height: 1;
}
:global(.trade-map-pin i) {
  flex: 0 0 auto; width: 17px; height: 17px; border-radius: 50%;
  background: rgba(255, 255, 255, 0.92); color: #111827;
  display: inline-flex; align-items: center; justify-content: center;
  font-style: normal; font-size: 10.5px; font-weight: 800;
}
:global(.trade-map-pin b) { font-size: 11px; font-weight: 800; }
:global(.trade-map-pin span) { font-size: 10.5px; font-weight: 700; opacity: 0.92; }
/* 앞 다섯은 한 치수 크게 — 지도에서 먼저 눈에 들어와야 한다 */
:global(.trade-map-pin.top) { padding: 4px 11px 4px 4px; }
:global(.trade-map-pin.top i) { width: 19px; height: 19px; font-size: 11.5px; }
:global(.trade-map-pin.top b) { font-size: 12.5px; }
:global(.trade-map-pin.top span) { font-size: 11.5px; }

@media (max-width: 900px) {
  .tsp-stage { height: auto; min-height: 0; border: none; background: transparent; display: flex; flex-direction: column-reverse; gap: 12px; }
  .tsp-map { height: 360px; border: 1px solid #e8ecf3; border-radius: 14px; }
  .tsp-panel { position: static; width: auto; box-shadow: none; }
}

</style>
