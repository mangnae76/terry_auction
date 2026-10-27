<script setup lang="ts">
// 실거래가 조건 분석 (해당 읍면동) — 관리자 도구.
//
// 시군구 12개월치를 한 번 받아 두고, 읍면동·기간·면적·연식은 받아 둔 줄
// 안에서 추린다. 조건을 바꿀 때마다 다시 부르면 하루 한도만 깎아먹는다.
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/authStore';
import { REGION_GROUPS, districtsOf, type DistrictOption } from '../services/regionCodes';
import { fetchDongTradeDetails, fetchDongTradeStats, type DongTradeDetailRow } from '../services/publicDataApi';
import { loadUserPrefs, saveUserPrefs } from '../services/userPrefsRepository';
import ColumnFilterPanel from '../components/ColumnFilterPanel.vue';
import AppToast from '../components/AppToast.vue';
import { useColumnFilters, type ColumnDef } from '../composables/useColumnFilters';

type Kind = 'villa' | 'apt' | 'officetel';
const KINDS: Array<{ key: Kind; label: string }> = [
  { key: 'villa', label: '연립다세대' },
  { key: 'apt', label: '아파트' },
  { key: 'officetel', label: '오피스텔' },
];

const router = useRouter();
/** 웹 시장분석 › 지역분석에 띄웠는가 — 웹(shared.entry.js)이 넣어 준다. 분석 도구에서는 false */
const webEmbed = inject<boolean>('webEmbed', false);
const auth = useAuthStore();

// 시도 → 시군구 → 읍면동 차례로 좁힌다. 여기는 한 시군구씩만 받는다 —
// 줄 단위로 다 들고 있어야 해서 시도 전체는 너무 무겁다.
const sido = ref('');
const districtCode = ref('');
const kind = ref<Kind>('villa');
const dong = ref('');

const districts = computed<DistrictOption[]>(() => districtsOf(sido.value));
const district = computed<DistrictOption | null>(
  () => districts.value.find((d) => d.lawdCode === districtCode.value) ?? null,
);
let restoring = false;
watch(sido, () => { if (!restoring) districtCode.value = ''; });

// 읍면동 목록 — 표를 받기 전에도 고를 수 있어야 한다.
// 시군구를 고르면 최근 석 달치를 먼저 받아 동 이름을 채운다 (국토부 호출 3번).
// 한 번 받은 시군구는 들고 있다가 다시 고르면 그대로 쓴다.
const dongPeek = ref<Record<string, string[]>>({});
const dongPeeking = ref(false);
const peekKey = computed(() => (districtCode.value ? `${districtCode.value}|${kind.value}` : ''));
const peekDongs = async () => {
  const key = peekKey.value;
  if (!key || dongPeek.value[key]) return;
  dongPeeking.value = true;
  try {
    const res = await fetchDongTradeStats({
      lawdCd5: districtCode.value, propertyType: kind.value, months: 3,
    });
    dongPeek.value = { ...dongPeek.value, [key]: res.rows.map((r) => r.umdNm) };
  } catch {
    // 못 받아도 그만 — 표를 받고 나면 그때 목록이 찬다
  } finally {
    dongPeeking.value = false;
  }
};
watch([districtCode, kind], () => { if (!restoring) dong.value = ''; peekDongs(); });
const dongOptions = computed(() => {
  const peeked = dongPeek.value[peekKey.value] ?? [];
  return Array.from(new Set([...dongNames.value, ...peeked])).sort((a, b) => a.localeCompare(b, 'ko'));
});

const loading = ref(false);
const errorMsg = ref('');
const notice = ref('');
const all = ref<DongTradeDetailRow[]>([]);
const dongNames = ref<string[]>([]);
const period = ref({ from: '', to: '' });
const loadedLabel = ref('');

// ===== 검색조건 =====
const PERIODS = [1, 3, 6, 12];
const periodMonths = ref(12);
const dateFrom = ref('');
const dateTo = ref('');
const areaMin = ref('');   // 평
const areaMax = ref('');
const yearMin = ref('');
const yearMax = ref('');
const listQuery = ref('');

const todayIso = () => new Date().toISOString().slice(0, 10);
const isoMonthsAgo = (m: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - m);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};
const applyPeriod = (m: number) => {
  periodMonths.value = m;
  dateFrom.value = isoMonthsAgo(m);
  dateTo.value = todayIso();
};
applyPeriod(12);

const resetFilters = () => {
  applyPeriod(12);
  clearColFilters();
  areaMin.value = ''; areaMax.value = '';
  yearMin.value = ''; yearMax.value = '';
  listQuery.value = '';
};

// 조건은 사용자별로 남긴다 — 늘 같은 조건으로 보는 일이 많다
const prefsLoaded = ref(false);
const savedMsg = ref('');
const savedTone = ref<'info' | 'success' | 'error'>('success');
const toast = (text: string, tone: 'info' | 'success' | 'error' = 'success') => {
  savedTone.value = tone;
  savedMsg.value = text;
  window.setTimeout(() => { if (savedMsg.value === text) savedMsg.value = ''; }, 1800);
};
const saveFilters = async () => {
  if (!auth.uid) { toast('로그인한 뒤에 저장됩니다.', 'error'); return; }
  await saveUserPrefs(auth.uid, {
    adminDongFilter: {
      sido: sido.value,
      districtCode: districtCode.value,
      kind: kind.value,
      dong: dong.value,
      periodMonths: periodMonths.value,
      areaMin: areaMin.value,
      areaMax: areaMax.value,
      yearMin: yearMin.value,
      yearMax: yearMax.value,
    },
  });
  toast('검색조건을 저장했습니다.');
};
onMounted(async () => {
  if (!auth.uid) { prefsLoaded.value = true; return; }
  const prefs = await loadUserPrefs(auth.uid);
  const f = prefs?.adminDongFilter;
  if (f) {
    restoring = true;
    sido.value = f.sido || '';
    districtCode.value = f.districtCode || '';
    kind.value = (f.kind as Kind) || kind.value;
    dong.value = f.dong || '';
    applyPeriod(f.periodMonths || 12);
    areaMin.value = f.areaMin ?? ''; areaMax.value = f.areaMax ?? '';
    yearMin.value = f.yearMin ?? ''; yearMax.value = f.yearMax ?? '';
    await nextTick();
    restoring = false;
  }
  prefsLoaded.value = true;
});

// ===== 불러오기 =====
const load = async () => {
  const d = district.value;
  if (loading.value || !d) return;
  errorMsg.value = ''; notice.value = '';
  loading.value = true;
  try {
    const res = await fetchDongTradeDetails({
      lawdCd5: d.lawdCode,
      propertyType: kind.value,
      months: 12,
    });
    all.value = res.rows;
    dongNames.value = res.dongNames;
    period.value = { from: res.periodFrom, to: res.periodTo };
    loadedLabel.value = `${sido.value} ${d.label}`;
    // 고르지 않았으면 고르지 않은 채로 둔다 — 첫 동을 멋대로 집으면
    // 시군구 전체를 보려던 뜻이 꺾인다
    if (dong.value && !res.dongNames.includes(dong.value)) dong.value = '';
    if (res.error) notice.value = res.error;
    if (res.rows.length === 0 && !res.error) notice.value = '그 기간에 거래가 없습니다.';
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
};
// 종류를 바꾸면 받아 둔 줄이 더는 맞지 않는다
watch(kind, () => { if (district.value) void load(); });

// ===== 거르기 =====
const toNum = (v: string) => {
  const n = Number(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const inWindow = (r: DongTradeDetailRow) => {
  if (!r.dealTime) return true;
  const from = dateFrom.value ? new Date(`${dateFrom.value}T00:00:00`).getTime() : 0;
  const to = dateTo.value ? new Date(`${dateTo.value}T23:59:59`).getTime() : Infinity;
  return r.dealTime >= from && r.dealTime <= to;
};
const filtered = computed(() => {
  const target = dong.value;
  const aMin = toNum(areaMin.value);
  const aMax = toNum(areaMax.value);
  const yMin = toNum(yearMin.value);
  const yMax = toNum(yearMax.value);
  return all.value.filter((r) => {
    if (target && r.umdNm !== target) return false;
    if (!inWindow(r)) return false;
    if (aMin && r.pyeong < aMin) return false;
    if (aMax && r.pyeong > aMax) return false;
    if (yMin && (!r.buildYear || r.buildYear < yMin)) return false;
    if (yMax && (!r.buildYear || r.buildYear > yMax)) return false;
    return true;
  });
});
/** 지표와 분포는 정상거래만 센다 — 직거래·해제는 시세가 아니다 */
const normals = computed(() => filtered.value.filter((r) => r.kind === '정상거래'));
const counts = computed(() => ({
  정상거래: filtered.value.filter((r) => r.kind === '정상거래').length,
  직거래: filtered.value.filter((r) => r.kind === '직거래').length,
  계약해제: filtered.value.filter((r) => r.kind === '계약해제').length,
}));

const avgPrice = computed(() => {
  const list = normals.value.filter((r) => r.priceWon > 0);
  if (list.length === 0) return 0;
  return Math.round(list.reduce((s, r) => s + r.priceWon, 0) / list.length);
});
const avgUnitPrice = computed(() => {
  const list = normals.value.filter((r) => r.priceWon > 0 && r.pyeong > 0);
  if (list.length === 0) return 0;
  return Math.round(list.reduce((s, r) => s + r.priceWon / r.pyeong, 0) / list.length);
});

// ===== 분포 =====
type Bucket = { label: string; test: (r: DongTradeDetailRow) => boolean };
const AREA_BUCKETS: Bucket[] = [
  { label: '~10평', test: (r) => r.pyeong > 0 && r.pyeong < 10 },
  { label: '10~15평', test: (r) => r.pyeong >= 10 && r.pyeong < 15 },
  { label: '15~20평', test: (r) => r.pyeong >= 15 && r.pyeong < 20 },
  { label: '20~25평', test: (r) => r.pyeong >= 20 && r.pyeong < 25 },
  { label: '25평~', test: (r) => r.pyeong >= 25 },
];
const EOK = 100_000_000;
const PRICE_BUCKETS: Bucket[] = [
  { label: '~5천', test: (r) => r.priceWon > 0 && r.priceWon < 0.5 * EOK },
  { label: '~1억', test: (r) => r.priceWon >= 0.5 * EOK && r.priceWon < 1 * EOK },
  { label: '~1억5천', test: (r) => r.priceWon >= 1 * EOK && r.priceWon < 1.5 * EOK },
  { label: '~2억', test: (r) => r.priceWon >= 1.5 * EOK && r.priceWon < 2 * EOK },
  { label: '~3억', test: (r) => r.priceWon >= 2 * EOK && r.priceWon < 3 * EOK },
  { label: '3억~', test: (r) => r.priceWon >= 3 * EOK },
];
const thisYear = new Date().getFullYear();
const age = (r: DongTradeDetailRow) => (r.buildYear > 0 ? thisYear - r.buildYear + 1 : -1);
const AGE_BUCKETS: Bucket[] = [
  { label: '~5년', test: (r) => age(r) >= 0 && age(r) <= 5 },
  { label: '5~10년', test: (r) => age(r) > 5 && age(r) <= 10 },
  { label: '10~15년', test: (r) => age(r) > 10 && age(r) <= 15 },
  { label: '15~20년', test: (r) => age(r) > 15 && age(r) <= 20 },
  { label: '20~25년', test: (r) => age(r) > 20 && age(r) <= 25 },
  { label: '25년~', test: (r) => age(r) > 25 },
];
const FLOOR_BUCKETS: Bucket[] = [
  { label: 'B1~1층', test: (r) => r.floorNum <= 1 },
  { label: '2층', test: (r) => r.floorNum === 2 },
  { label: '3층', test: (r) => r.floorNum === 3 },
  { label: '4층', test: (r) => r.floorNum === 4 },
  { label: '5층~', test: (r) => r.floorNum >= 5 },
];
const distribute = (buckets: Bucket[]) => {
  const total = normals.value.length;
  return buckets.map((b) => {
    const count = normals.value.filter(b.test).length;
    return { label: b.label, count, pct: total > 0 ? (count / total) * 100 : 0 };
  });
};
const DISTS = computed(() => [
  { title: '전용면적 분포', unit: '㎡/평', cells: distribute(AREA_BUCKETS) },
  { title: '금액분포', unit: '', cells: distribute(PRICE_BUCKETS) },
  { title: '건축연식', unit: '', cells: distribute(AGE_BUCKETS) },
  { title: '층', unit: '', cells: distribute(FLOOR_BUCKETS) },
]);

// ===== 검색리스트 =====
// 칸마다 값 목록을 띄워 하나씩 걸러낸다 (composables/useColumnFilters).
// 경매지번 화면과 같은 engine 을 쓴다 — 고칠 일이 생기면 한 곳만 고친다.
const COLS: Array<ColumnDef<DongTradeDetailRow>> = [
  { key: 'date', label: '계약년월일', text: (r) => r.contractDate || '-', order: (r) => r.dealTime },
  { key: 'price', label: '거래금액', text: (r) => won(r.priceWon), order: (r) => r.priceWon },
  { key: 'area', label: '전용 ㎡ / 평', text: (r) => `${r.areaM2.toFixed(2)} / ${r.pyeong.toFixed(2)}`, order: (r) => r.areaM2 },
  { key: 'year', label: '건축연도', text: (r) => (r.buildYear ? String(r.buildYear) : '-'), order: (r) => r.buildYear },
  { key: 'age', label: '건축년차', text: (r) => (r.buildYear ? `${thisYear - r.buildYear + 1}년` : '-'), order: (r) => -(r.buildYear || 0) },
  { key: 'unit', label: '평당가', text: (r) => (r.pyeong > 0 ? won(Math.round(r.priceWon / r.pyeong)) : '-'), order: (r) => (r.pyeong > 0 ? r.priceWon / r.pyeong : 0) },
  { key: 'floor', label: '층', text: (r) => r.floor || '-', order: (r) => r.floorNum },
  { key: 'kind', label: '구분', text: (r) => r.kind, order: (r) => (r.kind === '정상거래' ? 2 : r.kind === '직거래' ? 1 : 0) },
];

/** 돋보기 검색 — 칸 거르기 앞에 한 번 좁힌다 */
const searched = computed(() => {
  const q = listQuery.value.trim();
  if (!q) return filtered.value;
  const needle = q.replace(/\s+/g, '').toLowerCase();
  return filtered.value.filter((r) => [
    r.contractDate, String(r.priceWon), r.areaM2.toFixed(2), r.pyeong.toFixed(2),
    String(r.buildYear), r.floor, r.umdNm, r.name, r.jibun, r.houseType,
  ].join('').replace(/\s+/g, '').toLowerCase().includes(needle));
});
const colFilter = useColumnFilters<DongTradeDetailRow>(searched, COLS);
const listRows = computed(() => colFilter.rows.value);

// ===== 웹 — 시군구까지만 골랐을 때(읍면동 '전체') 검색리스트는 동별 요약 표 =====
// 정상거래만 센다(검색조건의 기간 · 면적 · 연식 거르기를 거친 것). 거래가 없는 동도 0건으로 남긴다
type DongSum = { name: string; count: number; avg: number; median: number; min: number; max: number; area: number; perM2: number };
const dongSums = computed<DongSum[]>(() => {
  const by = new Map<string, DongTradeDetailRow[]>();
  normals.value.forEach((r) => { if (r.umdNm) by.set(r.umdNm, [...(by.get(r.umdNm) ?? []), r]); });
  dongOptions.value.forEach((n) => { if (!by.has(n)) by.set(n, []); });
  return Array.from(by.entries()).map(([name, list]) => {
    const prices = list.map((r) => r.priceWon).filter((v) => v > 0).sort((a, b) => a - b);
    const n = prices.length;
    const areas = list.map((r) => r.areaM2).filter((v) => v > 0);
    const perM2s = list.filter((r) => r.priceWon > 0 && r.areaM2 > 0).map((r) => r.priceWon / r.areaM2);
    const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    return {
      name,
      count: list.length,
      avg: avgOf(prices),
      median: n ? (n % 2 ? prices[(n - 1) / 2] : (prices[n / 2 - 1] + prices[n / 2]) / 2) : 0,
      min: n ? prices[0] : 0,
      max: n ? prices[n - 1] : 0,
      area: avgOf(areas),
      perM2: avgOf(perM2s),
    };
  });
});
const sumSortKey = ref<keyof DongSum>('count');
const sumSortDesc = ref(true);
const toggleSumSort = (k: keyof DongSum) => {
  if (sumSortKey.value === k) sumSortDesc.value = !sumSortDesc.value;
  else { sumSortKey.value = k; sumSortDesc.value = k !== 'name'; }
};
const dongSumRows = computed(() => [...dongSums.value].sort((a, b) => {
  const k = sumSortKey.value;
  const d = k === 'name' ? String(a.name).localeCompare(String(b.name), 'ko') : Number(a[k]) - Number(b[k]);
  return sumSortDesc.value ? -d : d;
}));
const SUM_COLS: Array<{ key: keyof DongSum; label: string }> = [
  { key: 'name', label: '동/지역' }, { key: 'count', label: '거래건수' }, { key: 'avg', label: '평균가' },
  { key: 'median', label: '중간가' }, { key: 'min', label: '최저가' }, { key: 'max', label: '최고가' },
  { key: 'area', label: '평균면적' }, { key: 'perM2', label: '㎡당 평균가' },
];
/** '1.61억' · '9,563만' · '—' */
const eokMan = (v: number) => {
  if (!(v > 0)) return '—';
  if (v >= 100000000) return `${(Math.round(v / 1000000) / 100).toFixed(2)}억`;
  return `${Math.round(v / 10000).toLocaleString('ko-KR')}만`;
};
// 웹 — 시군구까지만 골랐을 때 위 요약은 시군구 전체 한 줄(기간은 아래 검색조건에서 고른다)
const guNav = computed(() => {
  const prices = normals.value.map((r) => r.priceWon).filter((v) => v > 0);
  const areas = normals.value.map((r) => r.areaM2).filter((v) => v > 0);
  const perM2s = normals.value.filter((r) => r.priceWon > 0 && r.areaM2 > 0).map((r) => r.priceWon / r.areaM2);
  const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return [
    { label: '거래건수', value: `${normals.value.length.toLocaleString('ko-KR')}건` },
    { label: '평균 거래가', value: eokMan(avgOf(prices)) },
    { label: '최저가', value: eokMan(prices.length ? Math.min(...prices) : 0) },
    { label: '최고가', value: eokMan(prices.length ? Math.max(...prices) : 0) },
    { label: '평균 면적', value: areas.length ? `${avgOf(areas).toFixed(1)}㎡` : '—' },
    { label: '㎡당 평균가', value: perM2s.length ? `${Math.round(avgOf(perM2s) / 10000).toLocaleString('ko-KR')}만/㎡` : '—' },
  ];
});
const clearColFilters = () => { colFilter.clearAll(); };

const won = (n: number) => (n > 0 ? n.toLocaleString('ko-KR') : '-');
const ymd = (v: string) => (v.length === 6 ? `${v.slice(0, 4)}.${v.slice(4)}` : v);
const addressOf = (r: DongTradeDetailRow) =>
  [loadedLabel.value, r.umdNm, r.jibun, r.name].filter(Boolean).join(' ');

/** 주소 복사 — 누른 줄만 잠깐 표시를 바꾼다 */
const copiedKey = ref('');
let copyTimer = 0;
const copyAddress = async (key: string, text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // 권한이 없으면 옛 방식으로 — 보이지 않는 칸에 담아 복사한다
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    try { document.execCommand('copy'); } catch { /* 그래도 안 되면 그만 */ }
    document.body.removeChild(el);
  }
  copiedKey.value = key;
  window.clearTimeout(copyTimer);
  copyTimer = window.setTimeout(() => { copiedKey.value = ''; }, 1400);
};

const downloadCsv = () => {
  if (listRows.value.length === 0) return;
  const head = ['계약년월일', '거래금액', '유형', '전용㎡', '전용평', '건축연도', '건축년차', '층', '구분', '주소'];
  const body = listRows.value.map((r) => [
    r.contractDate, r.priceWon, r.houseType, r.areaM2.toFixed(2), r.pyeong.toFixed(2),
    r.buildYear || '', r.buildYear ? thisYear - r.buildYear + 1 : '', r.floor, r.kind, addressOf(r),
  ]);
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [head, ...body].map((l) => l.map(esc).join(',')).join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `실거래_${loadedLabel.value}_${dong.value || '전체'}_${dateFrom.value}~${dateTo.value}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};
</script>

<template>
  <section class="adm-shell">
    <header class="adm-top">
      <div class="adm-top-in">
        <button type="button" class="adm-back" aria-label="뒤로" @click="router.push('/admin')">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg>
        </button>
        <div class="adm-title">
          <h1>실거래가 조건 분석 <em>해당 읍 · 면 · 동</em></h1>
          <p>해당 읍면동에 세부 개별성을 걸러 비교 데이터를 알아본다.</p>
        </div>
        <button type="button" class="adm-csv" :disabled="listRows.length === 0" @click="downloadCsv">엑셀 내려받기</button>
      </div>
    </header>

    <div class="adm-body">
      <!-- 지역 -->
      <div class="adm-bar">
        <label class="adm-f">
          <small>시 · 도</small>
          <select v-model="sido" :class="['adm-input', 'narrow', { ph: !sido }]">
            <option value="">{{ webEmbed ? '시도 선택' : '전국' }}</option>
            <option v-for="g in REGION_GROUPS" :key="g.sido" :value="g.sido">{{ g.sido }}</option>
          </select>
        </label>
        <label class="adm-f">
          <small>시 · 군 · 구</small>
          <select v-model="districtCode" :class="['adm-input', 'narrow', { ph: !districtCode }]" :disabled="!sido">
            <option value="">{{ webEmbed ? '시군구 선택' : '선택' }}</option>
            <option v-for="d in districts" :key="d.lawdCode" :value="d.lawdCode">{{ d.label }}</option>
          </select>
        </label>
        <label class="adm-f">
          <small>읍 · 면 · 동</small>
          <select v-model="dong" :class="['adm-input', 'narrow', { ph: !dong }]" :disabled="dongOptions.length === 0">
            <option value="">{{ dongPeeking ? '불러오는 중…' : (webEmbed ? '읍면동 선택' : '전체') }}</option>
            <option v-for="d in dongOptions" :key="d" :value="d">{{ d }}</option>
          </select>
        </label>
        <label class="adm-f">
          <small>종류</small>
          <div class="adm-seg">
            <button v-for="k in KINDS" :key="k.key" type="button" :class="['adm-seg-btn', { on: kind === k.key }]" @click="kind = k.key">{{ k.label }}</button>
          </div>
        </label>
        <!-- 웹 — 엑셀 내려받기를 조회 바로 왼쪽으로 (제목 줄은 웹에서 감춘다) — 지역 수요공급과 같은 틀 -->
        <button
          v-if="webEmbed"
          type="button"
          class="adm-csv adm-csv-bar"
          :disabled="listRows.length === 0"
          @click="downloadCsv"
        >엑셀 내려받기</button>
        <button type="button" class="adm-load" :disabled="loading || !district" @click="load">
          {{ loading ? '불러오는 중…' : (webEmbed ? '조회' : '데이터 로드') }}
        </button>
      </div>

      <p v-if="errorMsg" class="adm-msg err">{{ errorMsg }}</p>
      <p v-else-if="notice" class="adm-msg warn">{{ notice }}</p>

      <template v-if="all.length > 0">
        <section v-if="webEmbed && !dong" class="adm-gunav">
          <div class="adm-gunav-head">
            <strong>{{ loadedLabel }}</strong>
          </div>
          <div class="adm-gunav-row">
            <div v-for="c in guNav" :key="c.label" class="adm-gunav-box"><small>{{ c.label }}</small><b>{{ c.value }}</b></div>
          </div>
        </section>
        <div v-else class="adm-sum">
          <strong>{{ loadedLabel }} {{ dong || '전체' }}</strong>
          <span v-if="district" class="code">{{ district.lawdCode }}</span>
          <span>{{ ymd(period.from) }} ~ {{ ymd(period.to) }} 받아 둠</span>
        </div>

        <!-- 요약 -->
        <div v-if="!(webEmbed && !dong)" :class="['adm-kpis', { 'is-web': webEmbed }]">
          <div class="adm-kpi"><small>실거래가 평균</small><strong>{{ won(avgPrice) }}</strong></div>
          <div class="adm-kpi"><small>평당가 평균</small><strong>{{ won(avgUnitPrice) }}</strong></div>
          <div class="adm-kpi blue"><small>총 거래건수 <em>정상거래</em></small><strong>{{ normals.length.toLocaleString('ko-KR') }}건</strong></div>
        </div>

        <!-- 분포 -->
        <div class="adm-dists">
          <div v-for="d in DISTS" :key="d.title" class="adm-dist">
            <div class="adm-dist-head">{{ d.title }} <em v-if="d.unit">{{ d.unit }}</em><small>건 / %</small></div>
            <div class="adm-dist-cells">
              <div v-for="c in d.cells" :key="c.label" :class="['adm-dist-cell', { top: c.count > 0 && c.count === Math.max(...d.cells.map(x => x.count)) }]">
                <small>{{ c.label }}</small>
                <strong>{{ c.count }}<em>건</em></strong>
                <span>{{ c.pct.toFixed(0) }}%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 검색조건 -->
        <div class="adm-cond">
          <div class="adm-cond-head">검색조건</div>
          <div class="adm-cond-body">
            <label class="adm-f">
              <small>기간선택</small>
              <div class="adm-seg">
                <button v-for="m in PERIODS" :key="m" type="button" :class="['adm-seg-btn', { on: periodMonths === m }]" @click="applyPeriod(m)">{{ m }}개월</button>
              </div>
            </label>
            <label class="adm-f">
              <small>시작일자</small>
              <input v-model="dateFrom" type="date" class="adm-input narrow" />
            </label>
            <label class="adm-f">
              <small>종료일자</small>
              <input v-model="dateTo" type="date" class="adm-input narrow" />
            </label>
            <label class="adm-f">
              <small>최소~최대 면적 <em>평</em></small>
              <span class="adm-pair">
                <input v-model="areaMin" class="adm-input tiny" inputmode="decimal" placeholder="최소" />
                <em>~</em>
                <input v-model="areaMax" class="adm-input tiny" inputmode="decimal" placeholder="최대" />
              </span>
            </label>
            <label class="adm-f">
              <small>건축년도</small>
              <span class="adm-pair">
                <input v-model="yearMin" class="adm-input tiny" inputmode="numeric" placeholder="1990" />
                <em>~</em>
                <input v-model="yearMax" class="adm-input tiny" inputmode="numeric" placeholder="2026" />
              </span>
            </label>
            <div class="adm-cond-btns">
              <button type="button" class="adm-ghost" @click="saveFilters">저장</button>
              <button type="button" class="adm-ghost" @click="resetFilters">초기화</button>
            </div>
          </div>
        </div>

        <!-- 검색리스트 -->
        <div class="adm-list-head">
          <strong>검색리스트</strong>
          <span class="tag ok">정상거래 {{ counts.정상거래 }}</span>
          <span class="tag">직거래 {{ counts.직거래 }}</span>
          <span class="tag">계약해제 {{ counts.계약해제 }}</span>
          <button v-if="colFilter.activeCount.value > 0" type="button" class="adm-flt-clear" @click="clearColFilters">
            걸러내기 {{ colFilter.activeCount.value }}칸 해제
          </button>
          <span class="adm-search">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
            <input v-model="listQuery" class="adm-input search" placeholder="주소 · 금액 · 층 등으로 검색" />
          </span>
        </div>

        <!-- 웹 · 읍면동 '전체' — 동별 요약 표. 동 이름을 누르면 그 동의 거래 목록으로 -->
        <div v-if="webEmbed && !dong" class="adm-table-wrap">
          <table class="adm-table adm-dongsum">
            <thead>
              <tr>
                <th v-for="c in SUM_COLS" :key="c.key" :class="c.key === 'name' ? 'l' : 'r'">
                  <button type="button" class="adm-sort" @click="toggleSumSort(c.key)">
                    {{ c.label }}<i :class="{ on: sumSortKey === c.key }">{{ sumSortKey === c.key ? (sumSortDesc ? '↓' : '↑') : '⇅' }}</i>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in dongSumRows" :key="d.name">
                <td class="l"><button type="button" class="adm-dong-link" @click="dong = d.name">{{ d.name }}</button></td>
                <td class="r">{{ d.count.toLocaleString('ko-KR') }}건</td>
                <td class="r strong">{{ eokMan(d.avg) }}</td>
                <td class="r">{{ eokMan(d.median) }}</td>
                <td class="r">{{ eokMan(d.min) }}</td>
                <td class="r">{{ eokMan(d.max) }}</td>
                <td class="r">{{ d.area > 0 ? `${d.area.toFixed(1)}㎡` : '—' }}</td>
                <td class="r">{{ d.perM2 > 0 ? `${Math.round(d.perM2 / 10000).toLocaleString('ko-KR')}만/㎡` : '—/㎡' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="adm-table-wrap">
          <table class="adm-table">
            <thead>
              <tr>
                <th v-for="c in COLS" :key="c.key">
                  <span class="th-in">
                    {{ c.label }}
                    <button
                      type="button"
                      class="adm-flt"
                      :class="{ on: colFilter.isActive(c.key), open: colFilter.openKey.value === c.key }"
                      :aria-label="`${c.label} 걸러내기`"
                      @click.stop="colFilter.open(c.key, $event)"
                    ><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" /></svg></button>
                  </span>
                </th>
                <th>주소</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in listRows.slice(0, 300)" :key="`${r.contractDate}-${r.name}-${i}`" :class="r.kind !== '정상거래' ? 'off' : ''">
                <td>{{ r.contractDate }}</td>
                <td class="n strong price"><span class="v">{{ won(r.priceWon) }}</span></td>
                <td class="n area">
                  <span class="v">{{ r.areaM2.toFixed(2) }} / {{ r.pyeong.toFixed(2) }}</span>
                  <small v-if="r.houseType">{{ r.houseType }}</small>
                </td>
                <td class="n">{{ r.buildYear || '-' }}</td>
                <td class="n age"><span class="v">{{ r.buildYear ? `${thisYear - r.buildYear + 1}년` : '-' }}</span></td>
                <td class="n unit"><span class="v">{{ r.pyeong > 0 ? won(Math.round(r.priceWon / r.pyeong)) : '-' }}</span></td>
                <td class="n">{{ r.floor || '-' }}</td>
                <td><span :class="['kind', r.kind === '정상거래' ? 'ok' : 'no']">{{ r.kind }}</span></td>
                <td class="addr">
                  <span class="t">{{ addressOf(r) }}</span>
                  <button
                    type="button"
                    class="adm-copy"
                    :class="{ done: copiedKey === `${r.contractDate}-${r.name}-${i}` }"
                    :aria-label="`주소 복사: ${addressOf(r)}`"
                    @click="copyAddress(`${r.contractDate}-${r.name}-${i}`, addressOf(r))"
                  >
                    <svg v-if="copiedKey === `${r.contractDate}-${r.name}-${i}`" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    <svg v-else viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="listRows.length > 300" class="adm-foot">앞의 300줄만 보여 줍니다 — 전체 {{ listRows.length.toLocaleString('ko-KR') }}줄은 엑셀로 내려받으세요.</p>
        <p v-else-if="listRows.length === 0" class="adm-foot">조건에 맞는 거래가 없습니다.</p>
      </template>
    </div>

    <ColumnFilterPanel :ctl="colFilter" />
    <AppToast :visible="!!savedMsg" :text="savedMsg" :tone="savedTone" />
  </section>
</template>

<style scoped>
.adm-shell { min-height: 100vh; background: #f5f7fb; color: #111827; display: flex; flex-direction: column; }
.adm-top { position: sticky; top: 0; z-index: 20; background: rgba(255,255,255,0.9); backdrop-filter: saturate(160%) blur(10px); border-bottom: 1px solid #e8ecf3; }
.adm-top-in { max-width: 1680px; margin: 0 auto; padding: 12px 28px; display: flex; align-items: center; gap: 14px; }
.adm-back {
  border: 1px solid #dde3ee; background: #fff; border-radius: 9px;
  width: 32px; height: 32px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  line-height: 0; color: #374151; cursor: pointer;
}
.adm-back:hover { border-color: #b9cdf7; color: #2b6df3; }
.adm-title h1 { margin: 0; font-size: 17px; font-weight: 800; letter-spacing: -0.3px; display: flex; align-items: baseline; gap: 7px; }
.adm-title h1 em { font-style: normal; font-size: 11.5px; font-weight: 700; color: #9ca3af; }
.adm-title p { margin: 2px 0 0; font-size: 12px; color: #9ca3af; }
.adm-csv { margin-left: auto; border: 1px solid #c7d7f8; background: #fff; border-radius: 9px; padding: 8px 14px; font-family: inherit; font-size: 12.5px; font-weight: 700; color: #2b6df3; cursor: pointer; }
.adm-csv:disabled { border-color: #e5e7eb; color: #c3c9d4; cursor: default; }

.adm-body { flex: 1 1 auto; width: 100%; max-width: 1680px; margin: 0 auto; padding: 24px 28px 60px; }

.adm-bar { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; background: #fff; border: 1px solid #e8ecf3; border-radius: 14px; padding: 16px 18px; }
.adm-f { display: flex; flex-direction: column; gap: 6px; }
.adm-f small { font-size: 11px; font-weight: 700; color: #6b7280; display: flex; align-items: baseline; gap: 4px; }
.adm-f small em { font-style: normal; color: #aeb8ca; font-weight: 600; }
.adm-input { width: 240px; box-sizing: border-box; height: 36px; border: 1px solid #dde3ee; border-radius: 9px; background: #fff; padding: 0 11px; font-family: inherit; font-size: 13.5px; color: #111827; }
.adm-input.narrow { width: 160px; }
.adm-input.tiny { width: 92px; }
.adm-search { position: relative; display: block; margin-left: auto; }
.adm-search > svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #9ca3af; pointer-events: none; }
.adm-input.search { width: 280px; padding-left: 30px; }
.adm-input:focus { outline: none; border-color: #2b6df3; }
.adm-pair { display: inline-flex; align-items: center; gap: 6px; }
.adm-pair em { font-style: normal; color: #9ca3af; }
.adm-seg { display: inline-flex; gap: 4px; background: #f3f5f9; border-radius: 9px; padding: 3px; }
.adm-seg-btn { border: none; background: transparent; border-radius: 7px; padding: 7px 13px; font-family: inherit; font-size: 12.5px; font-weight: 700; color: #6b7280; cursor: pointer; white-space: nowrap; }
.adm-seg-btn.on { background: #fff; color: #1f3a72; box-shadow: 0 1px 3px rgba(17,24,39,0.1); }
.adm-load { margin-left: auto; height: 36px; padding: 0 20px; border: none; border-radius: 9px; background: #1f3a72; color: #fff; font-family: inherit; font-size: 13px; font-weight: 800; cursor: pointer; }
.adm-load:hover { background: #16305f; }
.adm-load:disabled { background: #aeb8ca; cursor: default; }
.adm-ghost { border: 1px solid #dde3ee; background: #fff; border-radius: 9px; height: 36px; padding: 0 16px; font-family: inherit; font-size: 12.5px; font-weight: 700; color: #374151; cursor: pointer; }
.adm-ghost:hover { border-color: #b9cdf7; color: #2b6df3; }

.adm-msg { margin: 14px 0 0; padding: 11px 14px; border-radius: 10px; font-size: 12.5px; font-weight: 600; }
.adm-msg.err { background: #fef2f2; color: #b91c1c; }
.adm-msg.warn { background: #fffbeb; color: #92400e; }

.adm-gunav { margin: 18px 0 14px; padding: 16px 18px 18px; border-radius: 10px; background: #f5f7fa; }
.adm-gunav-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.adm-gunav-head strong { font-size: 18px; font-weight: 800; color: #2b6df3; }
.adm-gunav-row { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
.adm-gunav-box { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 8px; border-radius: 8px; background: #fff; }
.adm-gunav-box small { font-size: 14px; color: #6b7280; white-space: nowrap; }
.adm-gunav-box b { font-size: 18px; font-weight: 800; color: #2b6df3; white-space: nowrap; }
.adm-sum { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin: 18px 2px 12px; font-size: 12.5px; color: #6b7280; font-weight: 600; }
.adm-sum strong { font-size: 14.5px; font-weight: 800; color: #111827; }
.adm-sum .code { font-size: 11px; font-weight: 700; color: #6b7280; background: #eef1f6; border-radius: 999px; padding: 2px 8px; }

/* 요약 셋 */
.adm-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
/* 웹 — 총 거래건수를 맨 왼쪽으로 (실거래가 평균 · 평당가 평균 순) */
.adm-kpis.is-web .adm-kpi.blue { order: -1; }
.adm-kpi { background: #fff; border: 1px solid #e8ecf3; border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 5px; }
.adm-kpi small { font-size: 11.5px; font-weight: 700; color: #6b7280; display: flex; align-items: baseline; gap: 5px; }
.adm-kpi small em { font-style: normal; font-size: 10px; color: #aeb8ca; }
.adm-kpi strong { font-size: 21px; font-weight: 800; letter-spacing: -0.5px; font-variant-numeric: tabular-nums; }
.adm-kpi.blue strong { color: #2b6df3; }

/* 분포 */
.adm-dists { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
@media (min-width: 1360px) { .adm-dists { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.adm-dist { background: #fff; border: 1px solid #e8ecf3; border-radius: 12px; padding: 12px 14px 14px; }
.adm-dist-head { font-size: 12.5px; font-weight: 800; color: #1f3a72; margin-bottom: 9px; display: flex; align-items: baseline; gap: 5px; }
.adm-dist-head em { font-style: normal; font-size: 10.5px; font-weight: 600; color: #9ca3af; }
.adm-dist-head small { margin-left: auto; font-size: 10px; font-weight: 600; color: #c3c9d4; }
.adm-dist-cells { display: flex; gap: 5px; }
.adm-dist-cell { flex: 1 1 0; min-width: 0; border: 1px solid #eef1f6; border-radius: 8px; padding: 7px 4px; text-align: center; display: flex; flex-direction: column; gap: 2px; }
.adm-dist-cell small { font-size: 10px; font-weight: 700; color: #9ca3af; white-space: nowrap; }
.adm-dist-cell strong { font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums; }
.adm-dist-cell strong em { font-style: normal; font-size: 9.5px; font-weight: 600; color: #c3c9d4; margin-left: 1px; }
.adm-dist-cell span { font-size: 10px; font-weight: 600; color: #aeb8ca; }
/* 가장 많은 칸만 짚어 준다 — 어디에 몰려 있는지가 한눈에 보여야 한다 */
.adm-dist-cell.top { background: #eef4ff; border-color: #c7d7f8; }
.adm-dist-cell.top strong { color: #2b6df3; }

/* 검색조건 */
.adm-cond { background: #fff; border: 1px solid #e8ecf3; border-radius: 14px; margin-bottom: 16px; overflow: hidden; }
.adm-cond-head { background: #f7f9fc; border-bottom: 1px solid #eef1f6; padding: 9px 18px; font-size: 12.5px; font-weight: 800; color: #1f3a72; }
.adm-cond-body { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; padding: 16px 18px; }
.adm-cond-btns { margin-left: auto; display: flex; gap: 8px; }
.adm-saved { margin: 0; padding: 0 18px 12px; font-size: 12px; color: #0f9d7a; font-weight: 700; }

/* 리스트 */
.adm-list-head { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; margin: 0 2px 10px; }
.adm-list-head strong { font-size: 14.5px; font-weight: 800; }
.adm-list-head .tag { font-size: 11.5px; font-weight: 700; color: #6b7280; background: #eef1f6; border-radius: 999px; padding: 4px 10px; }
.adm-list-head .tag.ok { background: #e8f7f1; color: #0f9d7a; }

.adm-table-wrap { background: #fff; border: 1px solid #e8ecf3; border-radius: 14px; overflow: hidden; }
.adm-table { width: 100%; border-collapse: collapse; }
.adm-table th, .adm-table td { border-bottom: 1px solid #eef1f6; border-right: 1px solid #eef1f6; padding: 9px 12px; font-size: 12.5px; text-align: center; white-space: nowrap; }
.adm-table th:last-child, .adm-table td:last-child { border-right: none; }
.adm-table thead th { background: #f7f9fc; color: #374151; font-weight: 700; }
.adm-table tbody tr:last-child td { border-bottom: none; }
.adm-table tbody tr:hover td { background: #fafbfe; }
/* 직거래·해제는 지표에서 뺀 줄이라 흐리게 — 그래도 목록에는 남긴다 */
.adm-table tbody tr.off td { color: #aeb8ca; background: #fcfcfd; }
.adm-table td.n { font-variant-numeric: tabular-nums; }
.adm-table td.n.strong { font-weight: 800; }
.adm-table td.addr { text-align: left; color: #6b7280; }
/* 주소 끝의 복사 단추 — 줄에 손을 얹었을 때만 또렷해진다 */
.adm-table td.addr .t { vertical-align: middle; }
.adm-copy {
  vertical-align: middle; margin-left: 6px; padding: 0;
  width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid #d8dfea; border-radius: 6px; background: #fff;
  color: #5b6474; cursor: pointer; opacity: 0.92; transition: opacity 0.12s, color 0.12s;
}
.adm-table tbody tr:hover .adm-copy { opacity: 1; }
.adm-copy:hover { border-color: #b9cdf7; color: #2b6df3; }
.adm-copy.done { opacity: 1; border-color: #9ee0c6; color: #0f9d7a; }
/* 전용면적 아래의 연립·다세대 */
.adm-table td.area small { display: block; font-size: 10.5px; font-weight: 600; color: #6b7280; }
/* 줄끼리 끝자리를 맞춘다 — 값을 같은 폭 상자에 담아 오른쪽에 붙인다 */
.adm-table td .v { display: inline-block; text-align: right; }
.adm-table td.price .v { min-width: 96px; }
.adm-table td.unit .v { min-width: 74px; }
.adm-table td.age .v { min-width: 34px; }
.kind { font-size: 10.5px; font-weight: 700; border-radius: 999px; padding: 2px 8px; }
.kind.ok { background: #e8f7f1; color: #0f9d7a; }
.kind.no { background: #f3f4f6; color: #9ca3af; }

.adm-foot { margin: 12px 2px 0; font-size: 11.5px; color: #9ca3af; }

@media (max-width: 900px) {
  .adm-top-in, .adm-body { padding-left: 16px; padding-right: 16px; }
  .adm-kpis { grid-template-columns: minmax(0, 1fr); }
  .adm-input, .adm-input.narrow, .adm-input.search { width: 100%; }
  .adm-f { flex: 1 1 100%; }
  .adm-load, .adm-cond-btns { margin-left: 0; }
}

/* 웹 · 동별 요약 표 — 칸 이름을 누르면 그 칸으로 줄 세우기 */
.adm-dongsum th, .adm-dongsum td { padding: 14px 16px; font-size: 14px; }
.adm-dongsum th { color: #2f6b45; font-weight: 800; background: #f3f8f4; }
.adm-dongsum .l { text-align: left; }
.adm-dongsum .r { text-align: right; }
.adm-dongsum td.strong { font-weight: 800; color: #111827; }
.adm-sort { border: 0; background: none; padding: 0; font: inherit; color: inherit; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
.adm-sort i { font-style: normal; font-size: 12px; color: #9ca3af; }
.adm-sort i.on { color: #2f6b45; }
.adm-dong-link { border: 0; background: none; padding: 0; font: inherit; font-weight: 700; color: #111827; cursor: pointer; }
.adm-dong-link:hover { color: #2b6df3; text-decoration: underline; }
</style>
