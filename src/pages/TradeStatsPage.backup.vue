<script setup lang="ts">
import L from 'leaflet';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import {
  fetchTradeVolumeStats,
  type PropertyType,
  type TradeVolumeStat,
} from '../services/publicDataApi';
import { geocodeAddress } from '../services/routeOptimizer';

interface DistrictOption {
  label: string;
  lawdCode: string;
}

interface RegionGroup {
  sido: string;
  districts: DistrictOption[];
}

const regionGroups: RegionGroup[] = [
  {
    sido: '서울특별시',
    districts: [
      { label: '종로구', lawdCode: '11110' }, { label: '중구', lawdCode: '11140' },
      { label: '용산구', lawdCode: '11170' }, { label: '성동구', lawdCode: '11200' },
      { label: '광진구', lawdCode: '11215' }, { label: '동대문구', lawdCode: '11230' },
      { label: '중랑구', lawdCode: '11260' }, { label: '성북구', lawdCode: '11290' },
      { label: '강북구', lawdCode: '11305' }, { label: '도봉구', lawdCode: '11320' },
      { label: '노원구', lawdCode: '11350' }, { label: '은평구', lawdCode: '11380' },
      { label: '서대문구', lawdCode: '11410' }, { label: '마포구', lawdCode: '11440' },
      { label: '양천구', lawdCode: '11470' }, { label: '강서구', lawdCode: '11500' },
      { label: '구로구', lawdCode: '11530' }, { label: '금천구', lawdCode: '11545' },
      { label: '영등포구', lawdCode: '11560' }, { label: '동작구', lawdCode: '11590' },
      { label: '관악구', lawdCode: '11620' }, { label: '서초구', lawdCode: '11650' },
      { label: '강남구', lawdCode: '11680' }, { label: '송파구', lawdCode: '11710' },
      { label: '강동구', lawdCode: '11740' },
    ],
  },
  {
    sido: '부산광역시',
    districts: [
      { label: '중구', lawdCode: '26110' }, { label: '서구', lawdCode: '26140' },
      { label: '동구', lawdCode: '26170' }, { label: '영도구', lawdCode: '26200' },
      { label: '부산진구', lawdCode: '26230' }, { label: '동래구', lawdCode: '26260' },
      { label: '남구', lawdCode: '26290' }, { label: '북구', lawdCode: '26320' },
      { label: '해운대구', lawdCode: '26350' }, { label: '사하구', lawdCode: '26380' },
      { label: '금정구', lawdCode: '26410' }, { label: '강서구', lawdCode: '26440' },
      { label: '연제구', lawdCode: '26470' }, { label: '수영구', lawdCode: '26500' },
      { label: '사상구', lawdCode: '26530' }, { label: '기장군', lawdCode: '26710' },
    ],
  },
  {
    sido: '대구광역시',
    districts: [
      { label: '중구', lawdCode: '27110' }, { label: '동구', lawdCode: '27140' },
      { label: '서구', lawdCode: '27170' }, { label: '남구', lawdCode: '27200' },
      { label: '북구', lawdCode: '27230' }, { label: '수성구', lawdCode: '27260' },
      { label: '달서구', lawdCode: '27290' }, { label: '달성군', lawdCode: '27710' },
    ],
  },
  {
    sido: '인천광역시',
    districts: [
      { label: '중구', lawdCode: '28110' }, { label: '동구', lawdCode: '28140' },
      { label: '미추홀구', lawdCode: '28177' }, { label: '연수구', lawdCode: '28185' },
      { label: '남동구', lawdCode: '28200' }, { label: '부평구', lawdCode: '28237' },
      { label: '계양구', lawdCode: '28245' }, { label: '서구', lawdCode: '28260' },
      { label: '강화군', lawdCode: '28710' }, { label: '옹진군', lawdCode: '28720' },
    ],
  },
  {
    sido: '광주광역시',
    districts: [
      { label: '동구', lawdCode: '29110' }, { label: '서구', lawdCode: '29140' },
      { label: '남구', lawdCode: '29155' }, { label: '북구', lawdCode: '29170' },
      { label: '광산구', lawdCode: '29200' },
    ],
  },
  {
    sido: '대전광역시',
    districts: [
      { label: '동구', lawdCode: '30110' }, { label: '중구', lawdCode: '30140' },
      { label: '서구', lawdCode: '30170' }, { label: '유성구', lawdCode: '30200' },
      { label: '대덕구', lawdCode: '30230' },
    ],
  },
  {
    sido: '울산광역시',
    districts: [
      { label: '중구', lawdCode: '31110' }, { label: '남구', lawdCode: '31140' },
      { label: '동구', lawdCode: '31170' }, { label: '북구', lawdCode: '31200' },
      { label: '울주군', lawdCode: '31710' },
    ],
  },
  {
    sido: '세종특별자치시',
    districts: [{ label: '세종시', lawdCode: '36110' }],
  },
  {
    sido: '경기도',
    districts: [
      { label: '수원시', lawdCode: '41110' }, { label: '성남시', lawdCode: '41130' },
      { label: '의정부시', lawdCode: '41150' }, { label: '안양시', lawdCode: '41170' },
      { label: '부천시', lawdCode: '41190' }, { label: '광명시', lawdCode: '41210' },
      { label: '평택시', lawdCode: '41220' }, { label: '동두천시', lawdCode: '41250' },
      { label: '안산시', lawdCode: '41270' }, { label: '고양시', lawdCode: '41280' },
      { label: '과천시', lawdCode: '41290' }, { label: '구리시', lawdCode: '41310' },
      { label: '남양주시', lawdCode: '41360' }, { label: '오산시', lawdCode: '41370' },
      { label: '시흥시', lawdCode: '41390' }, { label: '군포시', lawdCode: '41410' },
      { label: '의왕시', lawdCode: '41430' }, { label: '하남시', lawdCode: '41450' },
      { label: '용인시', lawdCode: '41460' }, { label: '파주시', lawdCode: '41480' },
      { label: '이천시', lawdCode: '41500' }, { label: '안성시', lawdCode: '41550' },
      { label: '김포시', lawdCode: '41570' }, { label: '화성시', lawdCode: '41590' },
      { label: '광주시', lawdCode: '41610' }, { label: '양주시', lawdCode: '41630' },
      { label: '포천시', lawdCode: '41650' }, { label: '여주시', lawdCode: '41670' },
      { label: '연천군', lawdCode: '41800' }, { label: '가평군', lawdCode: '41820' },
      { label: '양평군', lawdCode: '41830' },
    ],
  },
  {
    sido: '강원특별자치도',
    districts: [
      { label: '춘천시', lawdCode: '42110' }, { label: '원주시', lawdCode: '42130' },
      { label: '강릉시', lawdCode: '42150' }, { label: '동해시', lawdCode: '42170' },
      { label: '태백시', lawdCode: '42190' }, { label: '속초시', lawdCode: '42210' },
      { label: '삼척시', lawdCode: '42230' },
    ],
  },
  {
    sido: '충청북도',
    districts: [
      { label: '청주시', lawdCode: '43110' }, { label: '충주시', lawdCode: '43130' },
      { label: '제천시', lawdCode: '43150' },
    ],
  },
  {
    sido: '충청남도',
    districts: [
      { label: '천안시', lawdCode: '44130' }, { label: '공주시', lawdCode: '44150' },
      { label: '보령시', lawdCode: '44180' }, { label: '아산시', lawdCode: '44200' },
      { label: '서산시', lawdCode: '44210' }, { label: '논산시', lawdCode: '44230' },
    ],
  },
  {
    sido: '전북특별자치도',
    districts: [
      { label: '전주시', lawdCode: '45110' }, { label: '군산시', lawdCode: '45130' },
      { label: '익산시', lawdCode: '45140' }, { label: '정읍시', lawdCode: '45180' },
    ],
  },
  {
    sido: '전라남도',
    districts: [
      { label: '목포시', lawdCode: '46110' }, { label: '여수시', lawdCode: '46130' },
      { label: '순천시', lawdCode: '46150' }, { label: '광양시', lawdCode: '46230' },
    ],
  },
  {
    sido: '경상북도',
    districts: [
      { label: '포항시', lawdCode: '47110' }, { label: '경주시', lawdCode: '47130' },
      { label: '김천시', lawdCode: '47150' }, { label: '안동시', lawdCode: '47170' },
      { label: '구미시', lawdCode: '47190' },
    ],
  },
  {
    sido: '경상남도',
    districts: [
      { label: '창원시', lawdCode: '48120' }, { label: '진주시', lawdCode: '48170' },
      { label: '통영시', lawdCode: '48220' }, { label: '사천시', lawdCode: '48240' },
      { label: '김해시', lawdCode: '48250' }, { label: '밀양시', lawdCode: '48270' },
      { label: '거제시', lawdCode: '48310' }, { label: '양산시', lawdCode: '48330' },
    ],
  },
  {
    sido: '제주특별자치도',
    districts: [
      { label: '제주시', lawdCode: '50110' }, { label: '서귀포시', lawdCode: '50130' },
    ],
  },
];

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
const topNOptions: Array<{ value: number; label: string }> = [
  { value: 3, label: 'Top 3' },
  { value: 5, label: 'Top 5' },
  { value: 10, label: 'Top 10' },
  { value: 0, label: '전체' },
];

const initialSido = regionGroups.find((g) => g.sido === '서울특별시') ?? regionGroups[0];
const selectedSido = ref(initialSido.sido);
const selectedDistrict = ref(initialSido.districts[0].label);
const selectedPropertyType = ref<PropertyType>('apt');
const selectedPeriod = ref(1);
const selectedTopN = ref(5);
const progress = ref<{ done: number; total: number } | null>(null);
const loading = ref(false);
const message = ref('');
const rows = ref<TradeVolumeStat[]>([]);
const totalCount = ref(0);
const sourceSummary = ref('');
const lastLoadedLabel = ref('');
const lastLoadedAt = ref('');
const selectedRegion = ref<string | null>(null);
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

const rankedRows = computed<RankedRow[]>(() =>
  selectedTopN.value === 0
    ? allRankedRows.value
    : allRankedRows.value.slice(0, selectedTopN.value),
);

const topCount = computed(() => rankedRows.value[0]?.count ?? 0);
const averageCount = computed(() => {
  if (allRankedRows.value.length === 0) return 0;
  return Math.round(totalCount.value / allRankedRows.value.length);
});

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

const barPalette: Array<[string, string]> = [
  ['#fbbf24', '#f59e0b'],
  ['#cbd5e1', '#94a3b8'],
  ['#d97706', '#b45309'],
  ['#3b82f6', '#2563eb'],
  ['#8b5cf6', '#6d28d9'],
  ['#14b8a6', '#0f766e'],
  ['#ef4444', '#b91c1c'],
  ['#ec4899', '#be185d'],
  ['#10b981', '#047857'],
  ['#0ea5e9', '#0369a1'],
  ['#a855f7', '#7e22ce'],
  ['#f97316', '#c2410c'],
  ['#22c55e', '#15803d'],
  ['#6366f1', '#4338ca'],
  ['#eab308', '#a16207'],
];

const paletteColors = (rank: number) => barPalette[(rank - 1) % barPalette.length];
const barGradient = (rank: number) => {
  const [from, to] = paletteColors(rank);
  return `linear-gradient(90deg, ${from}, ${to})`;
};
const badgeGradient = (rank: number) => {
  const [from, to] = paletteColors(rank);
  return `linear-gradient(135deg, ${from}, ${to})`;
};
const isLightBadge = (rank: number) => rank === 2; // 은색만 어두운 텍스트

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
  <section class="trade-page">
    <header class="hero-card trade-hero">
      <div>
        <small>{{ new Date().toLocaleDateString('ko-KR', { dateStyle: 'full' }) }}</small>
        <h1>지역별 실거래 건수 랭킹</h1>
        <p>국토교통부 실거래가 데이터를 동(洞) 단위로 집계해 랭킹과 지도로 보여줍니다.</p>
      </div>
      <div class="stats-actions">
        <button class="primary" :disabled="loading" type="button" @click="loadStats">
          {{ loading ? '불러오는 중...' : '새로고침' }}
        </button>
      </div>
    </header>

    <article class="panel">
      <div class="trade-filter-grid">
        <label>
          시/도
          <select v-model="selectedSido">
            <option v-for="sido in sidoOptions" :key="sido" :value="sido">{{ sido }}</option>
          </select>
        </label>
        <label>
          시/군/구
          <select v-model="selectedDistrict" :disabled="isNationwide">
            <option
              v-for="district in districtOptions"
              :key="district.lawdCode"
              :value="district.label"
            >
              {{ district.label }}
            </option>
          </select>
        </label>
        <label>
          표시 범위
          <select v-model.number="selectedTopN">
            <option v-for="opt in topNOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>
        <label>
          거래유형
          <select v-model="selectedPropertyType">
            <option v-for="opt in propertyOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>
        <label>
          조회 기간
          <select v-model.number="selectedPeriod">
            <option v-for="m in periodOptions" :key="m" :value="m">최근 {{ m }}개월</option>
          </select>
        </label>
      </div>
      <p v-if="isNationwide" class="sources warn">
        전국 모드는 시/군/구 단위로 집계합니다. 기간을 길게 설정하면 API 호출이 많아질 수 있으니 1~3개월 권장.
      </p>
      <p v-if="progress" class="sources">
        불러오는 중 {{ progress.done }} / {{ progress.total }} 시/군/구
      </p>
      <p v-if="message" class="sources">{{ message }}</p>
      <p v-if="lastLoadedLabel" class="sources">
        최근 조회: {{ lastLoadedLabel }}
        <span v-if="lastLoadedAt"> · {{ lastLoadedAt }}</span>
        <span v-if="sourceSummary"> · API: {{ sourceSummary }}</span>
      </p>
    </article>

    <div class="kpi-grid trade-kpis">
      <article>
        <small>총 거래건수</small>
        <strong>{{ totalCount.toLocaleString() }}건</strong>
      </article>
      <article>
        <small>{{ isNationwide ? '대상 시/군/구 수' : '대상 동 수' }}</small>
        <strong>{{ allRankedRows.length }}개</strong>
      </article>
      <article>
        <small>{{ isNationwide ? '최다 거래 시/군/구' : '최다 거래 동' }}</small>
        <strong>{{ allRankedRows[0]?.region ?? '-' }}</strong>
      </article>
      <article>
        <small>평균 건수</small>
        <strong>{{ averageCount.toLocaleString() }}건</strong>
      </article>
    </div>

    <div class="trade-layout">
      <article class="panel ranking-panel">
        <header class="ranking-header">
          <h2>{{ isNationwide ? '시/군/구 거래 랭킹' : '동별 거래 랭킹' }}</h2>
          <small v-if="allRankedRows.length > 0">
            {{ rankedRows.length }} / {{ allRankedRows.length }}
          </small>
        </header>
        <div v-if="rankedRows.length === 0" class="chart-empty">
          조회 결과가 없으면 여기에 랭킹이 표시됩니다.
        </div>
        <ol v-else class="trade-ranking-table">
          <li
            v-for="row in rankedRows"
            :key="row.region"
            :class="['trade-ranking-row', { active: selectedRegion === row.region }]"
            @click="focusRegion(row.region)"
          >
            <span
              class="trade-rank-badge"
              :style="{
                background: badgeGradient(row.rank),
                color: isLightBadge(row.rank) ? '#1e293b' : '#fff',
              }"
            >
              {{ row.rank }}
            </span>
            <div class="trade-ranking-main">
              <strong>{{ row.region }}</strong>
              <div class="trade-bar">
                <span
                  class="trade-bar-fill"
                  :style="{
                    width: `${topCount > 0 ? (row.count / topCount) * 100 : 0}%`,
                    background: barGradient(row.rank),
                  }"
                />
              </div>
            </div>
            <div class="trade-ranking-value">
              <strong>{{ row.count.toLocaleString() }}건</strong>
              <small>{{ row.share.toFixed(1) }}%</small>
            </div>
          </li>
        </ol>
      </article>

      <article class="panel map-panel">
        <header class="ranking-header">
          <h2>지도</h2>
          <small>마커 크기 = 거래건수</small>
        </header>
        <div id="trade-map" class="trade-map" />
      </article>
    </div>
  </section>
</template>

<style scoped>
.trade-page {
  display: grid;
  gap: 12px;
}

.trade-hero .stats-actions {
  display: flex;
  align-items: center;
}

.trade-filter-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.trade-filter-grid label {
  display: grid;
  gap: 5px;
  font-size: 11px;
  color: var(--text-secondary);
}

.trade-filter-grid select {
  width: 100%;
  min-height: 34px;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: var(--bg-card);
  color: var(--text-primary);
  padding: 0 10px;
}

.trade-kpis {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.trade-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.ranking-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}

.ranking-header h2 {
  margin: 0;
}

.ranking-header small {
  color: var(--text-secondary);
  font-size: 11px;
}

.trade-ranking-table {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
  max-height: 480px;
  overflow-y: auto;
}

.trade-ranking-row {
  display: grid;
  grid-template-columns: 36px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-soft) 44%, var(--bg-card));
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.1s ease, border-color 0.1s ease;
}

.trade-ranking-row:hover {
  border-color: #2563eb;
  transform: translateX(2px);
}

.trade-ranking-row.active {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px color-mix(in srgb, #2563eb 25%, transparent);
}

.trade-rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 12px;
  color: #fff;
  background: #94a3b8;
}


.trade-ranking-main {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.trade-ranking-main strong {
  font-size: 13px;
}

.trade-bar {
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--line) 60%, transparent);
  overflow: hidden;
}

.trade-bar-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #2563eb);
}


.trade-ranking-value {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.trade-ranking-value strong {
  font-size: 13px;
}

.trade-ranking-value small {
  color: var(--text-secondary);
  font-size: 11px;
}

.trade-map {
  height: 480px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--line);
}

.chart-empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--text-secondary);
  border: 1px dashed var(--line);
  border-radius: 12px;
}

@media (max-width: 900px) {
  .trade-filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .trade-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .trade-layout {
    grid-template-columns: 1fr;
  }
  .trade-map {
    height: 360px;
  }
}
</style>
