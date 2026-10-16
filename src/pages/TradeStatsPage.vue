<script setup lang="ts">
import L from 'leaflet';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import chevronDownIcon from '../assets/icones/chevron-down.png';
import {
  fetchTradeVolumeStats,
  type PropertyType,
  type TradeVolumeStat,
} from '../services/publicDataApi';
import { geocodeAddress } from '../services/routeOptimizer';
import { REGION_GROUPS as regionGroups, type DistrictOption } from '../services/regionCodes';

const NATIONWIDE_SIDO = '전국';

type RankedRow = TradeVolumeStat & {
  rank: number;
  share: number;
  lat?: number;
  lng?: number;
};

const propertyOptions: Array<{ value: PropertyType; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'apt', label: '아파트' },
  { value: 'villa', label: '연립다세대' },
  { value: 'officetel', label: '오피스텔' },
];

const periodOptions = [1, 3, 6, 12];
const initialSido = regionGroups.find((g) => g.sido === '서울특별시') ?? regionGroups[0];
const selectedSido = ref(initialSido.sido);
const selectedDistrict = ref(initialSido.districts[0].label);
const selectedPropertyType = ref<PropertyType>('apt');
const selectedPeriod = ref(1);
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
/** 읍·면·동 — 시군구를 고른 뒤 받은 결과에서 고른다 (실거래 분석 화면과 같은 차례) */
const selectedDong = ref('');
const dongOptions = computed(() => (isAllDistricts.value ? [] : rows.value.map((r) => r.region)));
const geocodedCoords = ref<Map<string, { lat: number; lng: number }>>(new Map());

let leafletMap: L.Map | null = null;
let markerLayer: L.LayerGroup | null = null;
const markerByRegion = new Map<string, L.Marker>();

const ALL_DISTRICTS: DistrictOption = { label: '전체', lawdCode: 'ALL' };

const isNationwide = computed(() => selectedSido.value === NATIONWIDE_SIDO);
const sidoOptions = computed(() => [NATIONWIDE_SIDO, ...regionGroups.map((g) => g.sido)]);
const baseDistricts = computed(
  () => regionGroups.find((item) => item.sido === selectedSido.value)?.districts ?? [],
);
const districtOptions = computed<DistrictOption[]>(() =>
  isNationwide.value ? [ALL_DISTRICTS] : [ALL_DISTRICTS, ...baseDistricts.value],
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
      lat: coord?.lat,
      lng: coord?.lng,
    };
  });
});

const rankedRows = computed<RankedRow[]>(() => {
  // 읍면동을 고르면 그 줄만 남긴다 — 등수는 전체에서 매긴 것을 그대로 쓴다
  if (selectedDong.value) return allRankedRows.value.filter((r) => r.region === selectedDong.value);
  return allRankedRows.value.slice(0, TOP_N);
});

const topCount = computed(() => rankedRows.value[0]?.count ?? 0);

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
// 지역을 바꾸면 읍면동 선택은 푼다 — 전 지역의 동이 남아 있으면 빈 목록이 된다
watch(() => [selectedSido.value, selectedDistrict.value].join('|'), () => { selectedDong.value = ''; });
watch(rows, () => {
  if (selectedDong.value && !rows.value.some((r) => r.region === selectedDong.value)) selectedDong.value = '';
});

/** 등수 색 — 색상환을 1등 빨강(0°)에서 시작해 한 칸씩 돌린다.
 *  빨강 → 주황 → 노랑 → 초록 → 청록 → 파랑 → 남색 → 보라 → 자주 로 이어지고,
 *  열 등을 지나면 다시 빨강으로 돌아온다 (36° 씩 열 칸). */
const HUE_STEP = 36;
const hueOf = (rank: number) => (((rank - 1) * HUE_STEP) % 360 + 360) % 360;
/** 노랑 언저리(40°~80°)는 흰 글씨가 안 읽혀 한 단 어둡게 깐다 */
const isPaleHue = (h: number) => h > 40 && h < 80;
const paletteColors = (rank: number): [string, string] => {
  const h = hueOf(rank);
  const light = isPaleHue(h) ? 48 : 58; // 띠·동그라미 바탕
  const deep = isPaleHue(h) ? 34 : 44;  // 테두리·진한 쪽
  return [`hsl(${h.toFixed(1)} 85% ${light}%)`, `hsl(${h.toFixed(1)} 78% ${deep}%)`];
};
/** 글씨는 늘 흰색으로 읽힌다 — 밝은 색은 위에서 이미 어둡게 깔았다 */
const isLightBadge = (_rank: number) => false;

const makeRankIcon = (rank: number) => {
  const [from, to] = paletteColors(rank);
  const bg = `linear-gradient(135deg, ${from}, ${to})`;
  const color = isLightBadge(rank) ? '#1e293b' : '#fff';
  const extra = rank <= 5 ? ' emphasize' : '';
  return L.divIcon({
    className: 'trade-map-marker-wrap',
    html: `<div class="trade-map-marker${extra}" style="background:${bg};color:${color}"><span>${rank}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
};

const markerRadius = (count: number) => 8 + Math.sqrt(Math.max(count, 0)) * 2;

const ensureMap = async () => {
  await nextTick();
  if (leafletMap) return;
  const container = document.getElementById('trade-map');
  if (!container) return;
  leafletMap = L.map('trade-map', { zoomControl: true }).setView([37.48, 126.68], 11);
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
  rankedRows.value.forEach((row) => {
    if (row.lat == null || row.lng == null) return;
    const [cFrom, cTo] = paletteColors(row.rank);
    const circle = L.circleMarker([row.lat, row.lng], {
      radius: markerRadius(row.count),
      color: cTo,
      fillColor: cFrom,
      fillOpacity: 0.35,
      weight: 2,
    }).bindPopup(
      `<strong>${row.rank}위 · ${row.region}</strong><br/>${row.count}건 · ${row.share.toFixed(1)}%`,
    );
    markerLayer!.addLayer(circle);

    const badge = L.marker([row.lat, row.lng], {
      icon: makeRankIcon(row.rank),
    }).bindPopup(
      `<strong>${row.rank}위 · ${row.region}</strong><br/>${row.count}건 · ${row.share.toFixed(1)}%`,
    );
    markerLayer!.addLayer(badge);
    markerByRegion.set(row.region, badge);
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
  marker.openPopup();
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
  if (!isNationwide.value && !selectedDistrict.value) {
    message.value = '시/군/구를 선택해 주세요.';
    return;
  }
  loading.value = true;
  message.value = '';
  regionGeocodeQuery.clear();
  progress.value = null;
  try {
    const dealYmdList = buildDealYmdList(selectedPeriod.value);
    const nationwide = isNationwide.value;

    type Target = { sido: string; district: DistrictOption };
    const targets: Target[] = nationwide
      ? regionGroups.flatMap((g) => g.districts.map((d) => ({ sido: g.sido, district: d })))
      : (isAllDistricts.value
          ? baseDistricts.value.map((d) => ({ sido: selectedSido.value, district: d }))
          : [{ sido: selectedSido.value, district: selectedDistrictOption.value! }]);

    if (nationwide) {
      progress.value = { done: 0, total: targets.length };
    }

    const perDistrict = await runWithConcurrency(
      targets,
      nationwide ? 4 : 6,
      async (target) => {
        try {
          const result = await fetchTradeVolumeStats({
            keyword: [target.sido, target.district.label].filter(Boolean).join(' '),
            lawdCode: target.district.lawdCode,
            dealYmd: dealYmdList[0],
            dealYmdList,
            propertyType: selectedPropertyType.value,
          });
          return { target, result };
        } catch (error) {
          return { target, error };
        }
      },
      (done, total) => {
        if (nationwide) progress.value = { done, total };
      },
    );

    const merged = new Map<string, TradeVolumeStat>();
    const sourceSet = new Set<string>();
    const warnings: string[] = [];
    let aggregateCount = 0;
    const sidoShort = (name: string) => name.replace(/(특별자치도|특별자치시|특별시|광역시|도)$/, '');

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

      if (nationwide) {
        // 시/군/구 level aggregation
        const displayRegion = `${sidoShort(target.sido)} ${target.district.label}`;
        regionGeocodeQuery.set(
          displayRegion,
          [target.sido, target.district.label].filter(Boolean).join(' '),
        );
        const existing = merged.get(displayRegion);
        if (existing) {
          existing.count += result.totalCount;
          result.sources.forEach((s) => {
            if (!existing.sources.includes(s)) existing.sources.push(s);
          });
        } else {
          merged.set(displayRegion, {
            region: displayRegion,
            count: result.totalCount,
            sources: [...result.sources],
          });
        }
        return;
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
          row.sources.forEach((s) => {
            if (!existing.sources.includes(s)) existing.sources.push(s);
          });
        } else {
          merged.set(displayRegion, { region: displayRegion, count: row.count, sources: [...row.sources] });
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
    const unit = nationwide ? '시/군/구' : '동(洞)';
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

onMounted(() => {
  void ensureMap().then(() => loadStats());
});
</script>

<template>
  <section class="tsp-shell">
    <header class="tsp-topbar">
      <h1 class="tsp-page-title">지역별 거래량 랭킹</h1>
      <button class="tsp-topbar-btn" type="button" :disabled="loading" @click="loadStats" aria-label="새로고침">
        <img :src="chevronDownIcon" alt="" />
      </button>
    </header>

    <div class="tsp-body">
      <section class="tsp-card">
        <header class="tsp-card-head">
          <h2>조건 검색</h2>
        </header>
        <div class="tsp-filter">
          <!-- 분석 도구의 '실거래 분석'과 같은 차례로 좁힌다 — 시도 → 시군구 → 읍면동 → 종류.
               다만 여기는 '데이터 로드'가 아니라 전처럼 검색이다 -->
          <div class="tsp-bar">
            <label class="tsp-f">
              <small>시 · 도</small>
              <select class="tsp-select" v-model="selectedSido">
                <option v-for="sido in sidoOptions" :key="sido" :value="sido">{{ sido }}</option>
              </select>
            </label>
            <label class="tsp-f">
              <small>시 · 군 · 구</small>
              <select class="tsp-select" v-model="selectedDistrict" :disabled="isNationwide">
                <option v-for="district in districtOptions" :key="district.lawdCode" :value="district.label">
                  {{ district.label }}
                </option>
              </select>
            </label>
            <label class="tsp-f">
              <small>읍 · 면 · 동</small>
              <select class="tsp-select" v-model="selectedDong" :disabled="dongOptions.length === 0">
                <option value="">{{ dongOptions.length === 0 ? '검색 후 선택' : '전체' }}</option>
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
            <label class="tsp-f">
              <small>기간</small>
              <select class="tsp-select" v-model.number="selectedPeriod">
                <option v-for="m in periodOptions" :key="m" :value="m">{{ m }}개월</option>
              </select>
            </label>
            <button type="button" class="tsp-search-btn" :disabled="loading" @click="loadStats">
              {{ loading ? '검색 중…' : '검색' }}
            </button>
          </div>
          <p v-if="isNationwide" class="tsp-note warn">전국 모드는 시/군/구 단위 집계. 1~3개월 권장.</p>
          <p v-if="progress" class="tsp-note">불러오는 중 {{ progress.done }} / {{ progress.total }}</p>
          <!-- 검색이 비거나 실패했을 때 이유를 바로 보여 준다 -->
          <p v-if="message" :class="['tsp-note', { warn: rows.length === 0 }]">{{ message }}</p>
        </div>
      </section>

      <section class="tsp-card">
        <header class="tsp-card-head">
          <h2>{{ isNationwide ? '시/군/구 거래 랭킹' : '동별 거래 랭킹' }}</h2>
          <small v-if="allRankedRows.length > 0" class="tsp-card-sub">{{ rankedRows.length }} / {{ allRankedRows.length }}</small>
        </header>
        <div v-if="rankedRows.length === 0" class="tsp-empty">조회 결과가 여기에 표시됩니다.</div>
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
            </div>
          </li>
        </ol>
      </section>

      <section class="tsp-card">
        <header class="tsp-card-head">
          <h2>지도</h2>
          <small class="tsp-card-sub">마커 크기 = 거래건수</small>
        </header>
        <div id="trade-map" class="tsp-map" />
      </section>
    </div>

    <AppMobileBottomNav active="more" />
  </section>
</template>

<style scoped>
.tsp-shell { display: flex; flex-direction: column; min-height: 100vh; background: #f3f4f6; padding-bottom: 76px; }

.tsp-topbar {
  display: flex; align-items: center; gap: 8px; padding: 8px 14px 6px; background: #fff;
  /* 제목줄 아래 구분선 — 물건상세와 같게 */
  border-bottom: 1px solid #e5e7eb;
}
.tsp-page-title { flex: 1 1 auto; margin: 0; font-size: 20px; font-weight: 800; color: #111827; letter-spacing: -0.4px; }
.tsp-topbar-btn {
  border: none; background: transparent; padding: 4px;
  width: 32px; height: 32px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
}
.tsp-topbar-btn:disabled { opacity: 0.4; }
.tsp-topbar-btn img { width: 20px; height: 20px; opacity: 0.55; }

.tsp-body { flex: 1 1 auto; padding: 14px 12px; display: flex; flex-direction: column; gap: 14px; }

.tsp-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; }
.tsp-card-head { display: flex; align-items: baseline; justify-content: space-between; padding: 16px 16px 12px; }
.tsp-card-head h2 { margin: 0; font-size: 15.3px; font-weight: 800; color: #111827; }
.tsp-card-sub { font-size: 12px; color: #9ca3af; font-weight: 500; }

.tsp-filter { display: flex; flex-direction: column; gap: 10px; padding: 0 14px 16px; }
/* 조건 줄 — 분석 도구(.adm-bar)와 같은 짜임. 칸마다 이름을 머리에 달고,
   남는 폭은 고르게 나눠 갖는다. 좁은 화면에서는 두 칸씩 접힌다 */
.tsp-bar { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
.tsp-f { display: flex; flex-direction: column; gap: 5px; flex: 1 1 150px; min-width: 0; }
.tsp-f small { font-size: 11px; font-weight: 700; color: #6b7280; }
.tsp-seg { display: flex; gap: 4px; background: #f3f5f9; border-radius: 10px; padding: 3px; min-height: 44px; align-items: center; }
.tsp-seg-btn {
  flex: 1 1 0; border: none; background: transparent; border-radius: 8px;
  padding: 8px 6px; font-family: inherit; font-size: 12.5px; font-weight: 700;
  color: #6b7280; cursor: pointer; white-space: nowrap;
}
.tsp-seg-btn.on { background: #fff; color: #1f3a72; box-shadow: 0 1px 3px rgba(17, 24, 39, 0.1); }
.tsp-bar .tsp-search-btn { flex: 1 1 120px; width: auto; }
.tsp-filter-row { display: grid; gap: 10px; }
.tsp-filter-row.two { grid-template-columns: 1fr 1fr; }
.tsp-filter-row.three { grid-template-columns: 1fr 1fr 1fr; }
.tsp-select {
  width: 100%; min-height: 44px; padding: 0 14px; font-size: 14px;
  border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; color: #111827;
  -webkit-appearance: none; appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1l5 5 5-5' stroke='%239ca3af' stroke-width='1.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>");
  background-repeat: no-repeat; background-position: right 14px center;
  padding-right: 36px;
}
.tsp-select:disabled { background-color: #f9fafb; color: #9ca3af; }
.tsp-search-btn {
  width: 100%; min-height: 44px;
  border: none; border-radius: 10px; background: #111827; color: #fff;
  font-size: 14px; font-weight: 800; letter-spacing: -0.2px; cursor: pointer;
}
.tsp-search-btn:disabled { background: #9ca3af; cursor: not-allowed; }
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

.tsp-map { width: 100%; height: 320px; border-radius: 0 0 14px 14px; }

</style>
