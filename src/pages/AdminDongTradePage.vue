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
import SnapChip from '../components/SnapChip.vue';
import YmCount from '../components/YmCount.vue';
import InfoTip from '../components/InfoTip.vue';
import { useScreenSnapshot } from '../composables/useScreenSnapshot';
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
const WEB_PERIODS = [3, 6, 12]; // 웹은 위 고르는 줄에서 — 1개월은 뺀다
/** 웹 — 매매 / 전세 (전세는 전월세 자료에서 월세 없는 것, 값은 보증금). 바꾸면 '조회' 로 다시 받는다 */
const DEAL_KINDS = [{ key: 'sale', label: '매매' }, { key: 'jeonse', label: '전세' }] as const;
const dealKind = ref<'sale' | 'jeonse'>('sale');
/** 지금 화면에 받아 둔 자료가 매매인지 전세인지 — 이름표(평균 거래가 / 평균 전세가)를 맞춘다 */
const loadedDeal = ref<'sale' | 'jeonse'>('sale');
const periodMonths = ref(12);
const dateFrom = ref('');
const dateTo = ref('');
const areaMin = ref('');   // 평
const areaMax = ref('');
const yearMin = ref('');
const yearMax = ref('');
const listQuery = ref('');
/** 웹 — 결과 보기: 표(지역별 분석 · 검색리스트) / 막대그래프(지역별 분포) */
const listView = ref<'table' | 'dist' | 'detail' | 'deals'>('table');
// ===== 웹 '거래상세' — 월별 평균가 추이 + 개별 거래 목록 (조건검색 · 검색어를 따른다, 계약해제 제외) =====
const dealBase = computed(() => searched.value.filter((r) => r.kind !== '계약해제'));
type DealKey = 'umdNm' | 'name' | 'areaM2' | 'floorNum' | 'buildYear' | 'dealTime' | 'priceWon';
const DEAL_COLS: Array<{ key: DealKey; label: string; align: string }> = [
  { key: 'umdNm', label: '동', align: 'c' }, { key: 'name', label: '건물명', align: 'l' },
  { key: 'areaM2', label: '면적 ㎡ / 평', align: 'r' }, { key: 'floorNum', label: '층', align: 'r' },
  { key: 'buildYear', label: '건축년도', align: 'r' }, { key: 'dealTime', label: '계약일', align: 'c' },
  { key: 'priceWon', label: '거래금액', align: 'r' },
];
const dealSort = ref<DealKey>('dealTime');
const dealDesc = ref(true);
const toggleDealSort = (k: DealKey) => {
  if (dealSort.value === k) dealDesc.value = !dealDesc.value;
  else { dealSort.value = k; dealDesc.value = k !== 'umdNm' && k !== 'name'; }
};
const dealRows = computed(() => {
  const k = dealSort.value;
  return [...dealBase.value].sort((a, b) => {
    const d = typeof a[k] === 'string' ? String(a[k]).localeCompare(String(b[k]), 'ko') : Number(a[k]) - Number(b[k]);
    return dealDesc.value ? -d : d;
  });
});
// 월별 평균가 선 그래프 — 한 색(파랑) 선 + 옅은 면, 칸마다 마우스를 올리면 평균 · 건수
const TREND_W = 1200; const TREND_H = 320;
const TREND_PAD = { l: 64, r: 24, t: 16, b: 34 };
const trend = computed(() => {
  const by = new Map<string, number[]>();
  dealBase.value.forEach((r) => {
    if (!(r.priceWon > 0) || !r.contractDate) return;
    const key = r.contractDate.slice(0, 7); // 'YYYY.MM'
    by.set(key, [...(by.get(key) ?? []), r.priceWon]);
  });
  const keys = Array.from(by.keys()).sort();
  const avgs = keys.map((k) => { const xs = by.get(k)!; return xs.reduce((a, b) => a + b, 0) / xs.length; });
  const lo0 = avgs.length ? Math.min(...avgs) : 0; const hi0 = avgs.length ? Math.max(...avgs) : 1;
  // 눈금은 깔끔한 값(1 · 2 · 2.5 · 5 × 10ⁿ 간격)으로 — 7,688만 같은 어중간한 값이 서지 않게
  const span = Math.max(hi0 - lo0, hi0 * 0.05, 1);
  const raw = (span * 1.3) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw) ?? raw;
  const lo = Math.max(0, Math.floor((lo0 - span * 0.15) / nice) * nice);
  const hi = lo + nice * 4 >= hi0 ? lo + nice * 4 : Math.ceil((hi0 + span * 0.15) / nice) * nice;
  const plotW = TREND_W - TREND_PAD.l - TREND_PAD.r; const plotH = TREND_H - TREND_PAD.t - TREND_PAD.b;
  const step = keys.length > 1 ? plotW / (keys.length - 1) : plotW;
  const yOf = (v: number) => TREND_PAD.t + plotH - ((v - lo) / (hi - lo)) * plotH;
  const points = keys.map((k, i) => ({
    key: k, label: k, avg: avgs[i], n: by.get(k)!.length,
    x: TREND_PAD.l + i * step, y: yOf(avgs[i]),
  }));
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const base = TREND_PAD.t + plotH;
  const area = points.length ? `${line} L${points[points.length - 1].x.toFixed(1)},${base} L${points[0].x.toFixed(1)},${base} Z` : '';
  const nTicks = Math.round((hi - lo) / nice);
  const ticks = Array.from({ length: nTicks + 1 }, (_, i) => { const v = lo + nice * i; return { v, y: yOf(v), label: eokMan(v) }; });
  return { points, line, area, ticks, step };
});

// ===== 웹 '상세분포' — 동 × 구간 거래건수 표 =====
type DetailKind = 'price' | 'area' | 'age' | 'floor';
const DETAIL_KINDS: Array<{ key: DetailKind; label: string; icon: string }> = [
  { key: 'price', label: '가격대', icon: 'M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.6 4.5 3 4.5 1.4 4.5 3.2-2 3-4.5 3-4.5-1.3-4.5-3' },
  { key: 'area', label: '면적(평형)', icon: 'M4 20V4l16 16H4zM8 16h3M4 12h3M4 8h3' },
  { key: 'age', label: '건축연식', icon: 'M4 21V9l8-5 8 5v12M9 21v-6h6v6M3 21h18' },
  { key: 'floor', label: '층수', icon: 'M4 3h16v18H4zM4 9h16M4 15h16M10 3v18' },
];
const detailKind = ref<DetailKind>('price');
// 상세분포의 면적은 ㎡ 구간(국민주택 85㎡ 기준이 보이게) — 평은 설명 줄에 ≈ 로
const m2 = (r: DongTradeDetailRow) => r.areaM2;
const DETAIL_AREA_BUCKETS: Bucket[] = [
  { label: '~30㎡', test: (r) => m2(r) > 0 && m2(r) <= 30 },
  { label: '30~50㎡', test: (r) => m2(r) > 30 && m2(r) <= 50 },
  { label: '50~70㎡', test: (r) => m2(r) > 50 && m2(r) <= 70 },
  { label: '70~85㎡', test: (r) => m2(r) > 70 && m2(r) <= 85 },
  { label: '85~100㎡', test: (r) => m2(r) > 85 && m2(r) <= 100 },
  { label: '100㎡~', test: (r) => m2(r) > 100 },
];
// 상세분포의 건축연식 — 20~30년을 한 칸으로 (표가 넓어지지 않게 여섯 칸)
// (AGE_BUCKETS 는 아래에서 정한다 — 여기서 펼쳐 쓰면 정하기 전이라 멎는다. 나이 셈 age 는 함수라 괜찮다)
const DETAIL_AGE_BUCKETS: Bucket[] = [
  { label: '~5년', test: (r) => age(r) >= 0 && age(r) <= 5 },
  { label: '5~10년', test: (r) => age(r) > 5 && age(r) <= 10 },
  { label: '10~15년', test: (r) => age(r) > 10 && age(r) <= 15 },
  { label: '15~20년', test: (r) => age(r) > 15 && age(r) <= 20 },
  { label: '20~30년', test: (r) => age(r) > 20 && age(r) <= 30 },
  { label: '30년~', test: (r) => age(r) > 30 },
];
// 상세분포의 층 — 지하(지층 · 반지하 포함) · 1 · 2 · 3 · 4 · 5층~
const hasFloor = (r: DongTradeDetailRow) => r.floor.trim() !== '';
const DETAIL_FLOOR_BUCKETS: Bucket[] = [
  { label: '지하', test: (r) => hasFloor(r) && r.floorNum <= 0 },
  { label: '1층', test: (r) => r.floorNum === 1 },
  { label: '2층', test: (r) => r.floorNum === 2 },
  { label: '3층', test: (r) => r.floorNum === 3 },
  { label: '4층', test: (r) => r.floorNum === 4 },
  { label: '5층~', test: (r) => r.floorNum >= 5 },
];
const detailBuckets = computed<Bucket[]>(() => ({
  price: WEB_PRICE_BUCKETS, area: DETAIL_AREA_BUCKETS, age: DETAIL_AGE_BUCKETS, floor: DETAIL_FLOOR_BUCKETS,
}[detailKind.value]));
/** 층별 평균 평당가 — 전체 평균과 견줘 어느 층을 더 쳐주는지 (정상 + 직거래, 값이 있는 것만) */
const floorSummary = computed(() => {
  const unitOf = (r: DongTradeDetailRow) => (r.priceWon > 0 && r.pyeong > 0 ? r.priceWon / r.pyeong : 0);
  const avgUnit = (list: DongTradeDetailRow[]) => {
    const us = list.map(unitOf).filter((v) => v > 0);
    return us.length ? us.reduce((a, b) => a + b, 0) / us.length : 0;
  };
  const all = detailBase.value;
  const total = avgUnit(all);
  const cols = DETAIL_FLOOR_BUCKETS.map((b) => {
    const list = all.filter(b.test);
    const unit = avgUnit(list);
    return { label: b.label, count: list.length, unit, diff: total > 0 && unit > 0 ? ((unit - total) / total) * 100 : null };
  });
  return { cols, total: { count: all.length, unit: total } };
});
const manText = (won: number) => (won > 0 ? `${Math.round(won / 10000).toLocaleString('ko-KR')}만` : '—');
const pctText = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10}%`);
/** 표 위 설명 줄 — 면적은 ㎡ 구간이 몇 평쯤인지 함께 */
const detailCaption = computed(() => {
  if (detailKind.value === 'area') return '동별 면적(㎡) 거래건수 분포 — ~30㎡ ≈ 9평 이하 · 30~50㎡ ≈ 9~15평 · 50~70㎡ ≈ 15~21평 · 70~85㎡ ≈ 21~26평 · 85~100㎡ ≈ 26~30평 · 100㎡~ ≈ 30평 이상';
  return `동별 ${DETAIL_KINDS.find((k) => k.key === detailKind.value)?.label ?? ''} 거래건수 분포`;
});
/** 셀 건수 — 실제로 이뤄진 거래(정상 + 직거래). 계약해제는 없던 거래라 뺀다 */
const detailBase = computed(() => filtered.value.filter((r) => r.kind !== '계약해제'));
const detailSort = ref<'name' | 'total' | number>('total');
const detailDesc = ref(true);
const toggleDetailSort = (k: 'name' | 'total' | number) => {
  if (detailSort.value === k) detailDesc.value = !detailDesc.value;
  else { detailSort.value = k; detailDesc.value = k !== 'name'; }
};
const detailRows = computed(() => {
  const by = new Map<string, DongTradeDetailRow[]>();
  detailBase.value.forEach((r) => { if (r.umdNm) by.set(r.umdNm, [...(by.get(r.umdNm) ?? []), r]); });
  const rows = Array.from(by.entries()).map(([name, list]) => {
    const cells = detailBuckets.value.map((b) => list.filter(b.test).length);
    return { name, cells, total: cells.reduce((a, n) => a + n, 0) };
  });
  const k = detailSort.value;
  return rows.sort((a, b) => {
    const d = k === 'name' ? a.name.localeCompare(b.name, 'ko') : k === 'total' ? a.total - b.total : a.cells[k] - b.cells[k];
    return detailDesc.value ? -d : d;
  });
});
/** 칸 색 — 한 색(파랑)의 옅음 → 짙음. 표에서 가장 많은 칸 대비 */
const detailMax = computed(() => Math.max(1, ...detailRows.value.flatMap((r) => r.cells)));
const heatStyle = (n: number) => (n > 0 ? { background: `rgba(43, 109, 243, ${(0.08 + 0.42 * (n / detailMax.value)).toFixed(3)})` } : {});

/** 지역분포 그림 — 막대 / 도넛. '지역분포' 탭을 한 번 더 누르면 바뀐다 */
const distChart = ref<'bar' | 'pie'>('bar');
const onDistTab = () => {
  if (listView.value === 'dist') distChart.value = distChart.value === 'bar' ? 'pie' : 'bar';
  else listView.value = 'dist';
};
// 도넛 — 반지름 · 둘레, 구간 차례대로 옅은 파랑 → 짙은 파랑
const DONUT_R = 56;
const DONUT_C = 2 * Math.PI * DONUT_R;
const DONUT_RAMP = ['#dbe7ff', '#bcd2fd', '#9cbcfa', '#7aa4f7', '#588cf4', '#2b6df3', '#2257cc', '#1a44a3']; // 구간 여덟까지
const DONUT_GAP = 2;
/** 조각마다 시작 자리 · 길이 (둘레 기준). 조각 사이 2px 틈 */
const donutSegs = (cells: Array<{ label: string; count: number; pct: number }>) => {
  const total = cells.reduce((a, c) => a + c.count, 0);
  let at = 0;
  return cells.map((c) => {
    const full = total > 0 ? (c.count / total) * DONUT_C : 0;
    const seg = { label: c.label, count: c.count, pct: c.pct, start: at, len: Math.max(0, full - (full > DONUT_GAP ? DONUT_GAP : 0)) };
    at += full;
    return seg;
  });
};

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
// ===== 웹 — 마지막으로 받은 자료를 이 브라우저에 남겨 새로고침해도 요약 · 지역별 분석 · 지역분포가 그대로 (composables/useScreenSnapshot) =====
type Snapshot = {
  sido: string; districtCode: string; kind: Kind; dong: string; dealKind: 'sale' | 'jeonse';
  rows: DongTradeDetailRow[]; dongNames: string[]; period: { from: string; to: string };
  loadedLabel: string;
};
const snap = useScreenSnapshot<Snapshot>('adm.dong.snapshot.v1');
const saveSnapshot = () => {
  if (!webEmbed) return;
  void snap.save({
    sido: sido.value, districtCode: districtCode.value, kind: kind.value, dong: dong.value, dealKind: loadedDeal.value,
    rows: all.value, dongNames: dongNames.value, period: period.value, loadedLabel: loadedLabel.value,
  });
};
const restoreSnapshot = async () => {
  if (!webEmbed) return;
  const s = await snap.restore();
  if (!s || !Array.isArray(s.rows) || s.rows.length === 0) { snap.state.value = null; return; }
  restoring = true;
  sido.value = s.sido; districtCode.value = s.districtCode; kind.value = s.kind; dong.value = s.dong;
  dealKind.value = s.dealKind; loadedDeal.value = s.dealKind;
  all.value = s.rows; dongNames.value = s.dongNames; period.value = s.period; loadedLabel.value = s.loadedLabel;
  await nextTick();
  restoring = false;
};
// 동을 바꿔 보면 그 동도 남긴다 — 새로고침해도 보던 동으로
watch(dong, (v) => {
  if (!webEmbed || restoring) return;
  void snap.patch({ dong: v }, (x) => x.districtCode === districtCode.value);
});
const snapChip = snap.chip;

onMounted(async () => {
  if (!auth.uid) { prefsLoaded.value = true; await restoreSnapshot(); return; }
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
  await restoreSnapshot(); // 마지막으로 본 자료가 있으면 그게 우선
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
      dealKind: webEmbed ? dealKind.value : 'sale',
    });
    all.value = res.rows;
    dongNames.value = res.dongNames;
    period.value = { from: res.periodFrom, to: res.periodTo };
    loadedLabel.value = `${sido.value} ${d.label}`;
    loadedDeal.value = webEmbed ? dealKind.value : 'sale';
    // 고르지 않았으면 고르지 않은 채로 둔다 — 첫 동을 멋대로 집으면
    // 시군구 전체를 보려던 뜻이 꺾인다
    if (dong.value && !res.dongNames.includes(dong.value)) dong.value = '';
    if (res.error) notice.value = res.error;
    if (res.rows.length === 0 && !res.error) notice.value = '그 기간에 거래가 없습니다.';
    if (res.rows.length > 0) saveSnapshot();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
};
// 종류를 바꾸면 받아 둔 줄이 더는 맞지 않는다
watch(kind, () => { if (district.value && !restoring) void load(); });

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
// 웹 — 구간을 더 잘게(앱은 그대로). 면적은 ㎡ / 평 함께, 25~30평 · 30평~ / 3~5억 · 5~10억 · 10억~ / 25~30년 · 30년~
const WEB_AREA_BUCKETS: Bucket[] = [
  { label: '~33㎡ / 10평', test: (r) => r.pyeong > 0 && r.pyeong < 10 },
  { label: '33~50㎡ / 10~15평', test: (r) => r.pyeong >= 10 && r.pyeong < 15 },
  { label: '50~66㎡ / 15~20평', test: (r) => r.pyeong >= 15 && r.pyeong < 20 },
  { label: '66~83㎡ / 20~25평', test: (r) => r.pyeong >= 20 && r.pyeong < 25 },
  { label: '83~99㎡ / 25~30평', test: (r) => r.pyeong >= 25 && r.pyeong < 30 },
  { label: '99㎡~ / 30평~', test: (r) => r.pyeong >= 30 },
];
const WEB_PRICE_BUCKETS: Bucket[] = [
  ...PRICE_BUCKETS.slice(0, 5),
  { label: '3~5억', test: (r) => r.priceWon >= 3 * EOK && r.priceWon < 5 * EOK },
  { label: '5~10억', test: (r) => r.priceWon >= 5 * EOK && r.priceWon < 10 * EOK },
  { label: '10억~', test: (r) => r.priceWon >= 10 * EOK },
];
const WEB_AGE_BUCKETS: Bucket[] = [
  ...AGE_BUCKETS.slice(0, 5),
  { label: '25~30년', test: (r) => age(r) > 25 && age(r) <= 30 },
  { label: '30년~', test: (r) => age(r) > 30 },
];
const distribute = (buckets: Bucket[]) => {
  const total = normals.value.length;
  return buckets.map((b) => {
    const count = normals.value.filter(b.test).length;
    return { label: b.label, count, pct: total > 0 ? (count / total) * 100 : 0 };
  });
};
const DISTS = computed(() => [
  // 웹은 '…별 분포' 로 이름을 맞춘다 (앱은 그대로)
  { title: webEmbed ? '전용면적별 분포' : '전용면적 분포', unit: '㎡/평', cells: distribute(webEmbed ? WEB_AREA_BUCKETS : AREA_BUCKETS) },
  { title: webEmbed ? '금액대별 분포' : '금액분포', unit: '', cells: distribute(webEmbed ? WEB_PRICE_BUCKETS : PRICE_BUCKETS) },
  { title: webEmbed ? '건축연식별 분포' : '건축연식', unit: '', cells: distribute(webEmbed ? WEB_AGE_BUCKETS : AGE_BUCKETS) },
  { title: webEmbed ? '층별 분포' : '층', unit: '', cells: distribute(FLOOR_BUCKETS) },
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
      // 거래건수는 총 거래건수 셈과 같게 정상 + 직거래 (값들은 정상거래만으로)
      count: list.length + filtered.value.filter((r) => r.kind === '직거래' && r.umdNm === name).length,
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
/** '48.1㎡ / 14.6평' */
const areaText = (m2: number) => `${m2.toFixed(1)}㎡ / ${(m2 / 3.305785).toFixed(1)}평`;
/** '1.61억' · '9,563만' · '—' */
const eokMan = (v: number) => {
  if (!(v > 0)) return '—';
  if (v >= 100000000) return `${(Math.round(v / 1000000) / 100).toFixed(2)}억`;
  return `${Math.round(v / 10000).toLocaleString('ko-KR')}만`;
};
// 웹 — 시군구까지만 골랐을 때 위 요약은 시군구 전체 한 줄(기간은 아래 검색조건에서 고른다)
// ===== 총 거래건수 = 정상 + 직거래 (계약해제 제외) — 앱 · 웹 모든 '총 거래건수' 가 같은 셈 =====
const kindCount = (k: DongTradeDetailRow['kind'], rows = all.value) => rows.filter((r) => r.kind === k).length;
const yearTotal = computed(() => kindCount('정상거래') + kindCount('직거래'));
const totalTip = computed(() => {
  const n = (v: number) => v.toLocaleString('ko-KR');
  return [
    `총 거래건수 = 정상 ${n(kindCount('정상거래'))}건 + 직거래 ${n(kindCount('직거래'))}건 = ${n(yearTotal.value)}건`,
    `계약해제 ${n(kindCount('계약해제'))}건은 제외 (없던 거래)`,
    '연 = 최근 12개월 합 · 월 = 연 ÷ 12',
  ];
});
const guNav = computed(() => {
  const prices = normals.value.map((r) => r.priceWon).filter((v) => v > 0);
  const areas = normals.value.map((r) => r.areaM2).filter((v) => v > 0);
  const perM2s = normals.value.filter((r) => r.priceWon > 0 && r.areaM2 > 0).map((r) => r.priceWon / r.areaM2);
  const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return [
    // 총 거래건수 — 받아 둔 12개월의 정상 + 직거래(계약해제는 없던 거래라 뺀다)를 연 | 월(월평균)로, 밑에 나눠 적는다
    { label: '총 거래건수', value: '', ym: { year: yearTotal.value, month: yearTotal.value / 12 }, tip: totalTip.value }, // 정상 · 직거래 · 해제는 ⓘ 말풍선에만
    { label: loadedDeal.value === 'jeonse' ? '평균 전세가' : '평균 거래가', value: eokMan(avgOf(prices)) },
    { label: '최저가', value: eokMan(prices.length ? Math.min(...prices) : 0) },
    { label: '최고가', value: eokMan(prices.length ? Math.max(...prices) : 0) },
    { label: '평균면적', value: areas.length ? areaText(avgOf(areas)) : '—' },
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
            <option value="">{{ webEmbed ? '시도선택' : '전국' }}</option>
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
        <label v-if="webEmbed" class="adm-f">
          <small>거래</small>
          <div class="adm-seg">
            <button v-for="k in DEAL_KINDS" :key="k.key" type="button" :class="['adm-seg-btn', { on: dealKind === k.key }]" @click="dealKind = k.key">{{ k.label }}</button>
          </div>
        </label>
        <!-- 웹 — 기간은 검색조건 대신 여기서 (3 · 6 · 12개월) -->
        <label v-if="webEmbed" class="adm-f">
          <small>기간</small>
          <div class="adm-seg">
            <button v-for="m in WEB_PERIODS" :key="m" type="button" :class="['adm-seg-btn', { on: periodMonths === m }]" @click="applyPeriod(m)">{{ m }}개월</button>
          </div>
        </label>
        <!-- 웹 — 엑셀 내려받기는 뺐다 (매매 · 전세 · 기간이 들어오며 고르는 줄이 좁아서) -->
        <button type="button" class="adm-load" :disabled="loading || !district" @click="load">
          {{ loading ? '불러오는 중…' : (webEmbed ? '조회' : '데이터 로드') }}
        </button>
      </div>

      <p v-if="errorMsg" class="adm-msg err">{{ errorMsg }}</p>
      <p v-else-if="notice" class="adm-msg warn">{{ notice }}</p>

      <template v-if="all.length > 0">
        <section v-if="webEmbed && !dong" class="adm-gunav">
          <div class="adm-gunav-head">
            <strong>{{ loadedLabel }}<template v-if="loadedDeal === 'jeonse'"> 전세</template></strong>
            <SnapChip :chip="snapChip" />
          </div>
          <div class="adm-gunav-row">
            <div v-for="c in guNav" :key="c.label" class="adm-gunav-box"><small><InfoTip v-if="c.tip" :lines="c.tip">{{ c.label }}</InfoTip><template v-else>{{ c.label }}</template></small><b><YmCount v-if="c.ym" :year="c.ym.year" :month="c.ym.month" /><template v-else>{{ c.value }}</template></b></div>
          </div>
        </section>
        <div v-else class="adm-sum">
          <strong>{{ loadedLabel }} {{ dong || '전체' }}</strong>
          <SnapChip v-if="webEmbed" :chip="snapChip" />
          <span v-if="district" class="code">{{ district.lawdCode }}</span>
          <span>{{ ymd(period.from) }} ~ {{ ymd(period.to) }} 받아 둠</span>
        </div>

        <!-- 요약 -->
        <div v-if="!(webEmbed && !dong)" :class="['adm-kpis', { 'is-web': webEmbed }]">
          <div class="adm-kpi"><small>실거래가 평균</small><strong>{{ won(avgPrice) }}</strong></div>
          <div class="adm-kpi"><small>평당가 평균</small><strong>{{ won(avgUnitPrice) }}</strong></div>
          <div class="adm-kpi blue"><small>총 거래건수 <em v-if="!webEmbed">정상거래</em></small><strong>{{ (webEmbed ? kindCount('정상거래', filtered) + kindCount('직거래', filtered) : normals.length).toLocaleString('ko-KR') }}건</strong></div>
        </div>

        <!-- 분포 (앱) -->
        <div v-if="!webEmbed" class="adm-dists">
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

        <!-- 검색조건 (웹 거래상세 탭에서는 개별 거래 목록 밑 한 줄로 옮겨 그린다) -->
        <div v-if="!(webEmbed && listView === 'deals')" class="adm-cond">
          <div class="adm-cond-head">{{ webEmbed ? '조건검색' : '검색조건' }}</div>
          <div class="adm-cond-body">
            <label v-if="!webEmbed" class="adm-f">
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
          <strong v-if="!webEmbed">검색리스트</strong>
          <!-- 웹 — 결과를 두 가지로 본다: 지역별 분석(표) · 지역별 분포(막대그래프) -->
          <nav v-else class="adm-view-tabs" role="tablist">
            <button type="button" role="tab" :aria-selected="listView === 'table'" :class="{ on: listView === 'table' }" @click="listView = 'table'">{{ dong ? '검색리스트' : '지역별 분석' }}</button>
            <button type="button" role="tab" :aria-selected="listView === 'dist'" :class="{ on: listView === 'dist' }" @click="onDistTab">지역분포<span class="adm-view-kind" :title="distChart === 'bar' ? '막대 — 한 번 더 누르면 도넛' : '도넛 — 한 번 더 누르면 막대'" :aria-label="distChart === 'bar' ? '막대' : '도넛'">
              <svg v-if="distChart === 'bar'" viewBox="0 0 16 16" width="15" height="15" fill="currentColor"><rect x="1.5" y="8" width="3" height="6.5" rx="1" /><rect x="6.5" y="3" width="3" height="11.5" rx="1" /><rect x="11.5" y="6" width="3" height="8.5" rx="1" /></svg>
              <svg v-else viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="3"><circle cx="8" cy="8" r="5.5" stroke-opacity=".35" /><path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5" /></svg>
            </span></button>
            <button type="button" role="tab" :aria-selected="listView === 'detail'" :class="{ on: listView === 'detail' }" @click="listView = 'detail'">상세분포</button>
            <button type="button" role="tab" :aria-selected="listView === 'deals'" :class="{ on: listView === 'deals' }" @click="listView = 'deals'">거래상세</button>
          </nav>
          <span v-if="!webEmbed" class="tag ok">정상거래 {{ counts.정상거래 }}</span>
          <span v-if="!webEmbed" class="tag">직거래 {{ counts.직거래 }}</span>
          <span v-if="!webEmbed" class="tag">계약해제 {{ counts.계약해제 }}</span>
          <button v-if="colFilter.activeCount.value > 0" type="button" class="adm-flt-clear" @click="clearColFilters">
            걸러내기 {{ colFilter.activeCount.value }}칸 해제
          </button>
          <span v-if="!webEmbed" class="adm-search">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
            <input v-model="listQuery" class="adm-input search" placeholder="주소 · 금액 · 층 등으로 검색" />
          </span>
        </div>

        <!-- 웹 '거래상세' 탭 — 월별 평균가 추이(선 그래프) + 개별 거래 목록. 조건검색(기간 · 면적 · 연식 · 검색어)을 그대로 따른다 -->
        <div v-if="webEmbed && listView === 'deals'" class="adm-deals">
          <section class="adm-trend">
            <p class="adm-trend-title">월별 평균가 추이 <em>(최근 {{ trend.points.length }}개월 · 정상 + 직거래)</em></p>
            <svg v-if="trend.points.length > 1" class="adm-trend-svg" :viewBox="`0 0 ${TREND_W} ${TREND_H}`" role="img" aria-label="월별 평균가 추이 선 그래프">
              <g v-for="t in trend.ticks" :key="t.v">
                <line :x1="TREND_PAD.l" :x2="TREND_W - TREND_PAD.r" :y1="t.y" :y2="t.y" class="grid" />
                <text :x="TREND_PAD.l - 8" :y="t.y" text-anchor="end" dominant-baseline="central" class="ax">{{ t.label }}</text>
              </g>
              <path :d="trend.area" class="area" />
              <path :d="trend.line" class="line" />
              <g v-for="pt in trend.points" :key="pt.key" class="pt">
                <line :x1="pt.x" :x2="pt.x" :y1="TREND_PAD.t" :y2="TREND_H - TREND_PAD.b" class="hover-line" />
                <circle :cx="pt.x" :cy="pt.y" r="4.5" class="dot" />
                <rect :x="pt.x - trend.step / 2" :y="TREND_PAD.t" :width="trend.step" :height="TREND_H - TREND_PAD.t - TREND_PAD.b" class="hit"><title>{{ pt.key }} — 평균 {{ eokMan(pt.avg) }} · {{ pt.n.toLocaleString('ko-KR') }}건</title></rect>
                <text :x="pt.x" :y="TREND_H - TREND_PAD.b + 18" text-anchor="middle" class="ax">{{ pt.label }}</text>
              </g>
            </svg>
            <p v-else class="adm-trend-empty">두 달 이상 거래가 있어야 추이를 그립니다.</p>
          </section>
          <div class="adm-deals-head">
            <strong>개별 거래 목록</strong>
            <span>총 {{ dealRows.length.toLocaleString('ko-KR') }}건</span>
          </div>
          <!-- 조건검색을 상자 없이 한 줄로 — 칸 이름은 칸 안 왼쪽에. 검색칸 · 저장 · 초기화까지 한 줄 -->
          <div class="adm-inline-cond">
            <label class="adm-inbox"><em>시작일자</em><input v-model="dateFrom" type="date" /></label>
            <label class="adm-inbox"><em>종료일자</em><input v-model="dateTo" type="date" /></label>
            <label class="adm-inbox"><em>면적(평)</em><input v-model="areaMin" inputmode="decimal" placeholder="최소" class="num" /><i>~</i><input v-model="areaMax" inputmode="decimal" placeholder="최대" class="num" /></label>
            <label class="adm-inbox"><em>건축년도</em><input v-model="yearMin" inputmode="numeric" placeholder="1990" class="num" /><i>~</i><input v-model="yearMax" inputmode="numeric" placeholder="2026" class="num" /></label>
            <label class="adm-inbox grow">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
              <input v-model="listQuery" placeholder="건물명 · 동 · 금액 등으로 검색" />
            </label>
            <button type="button" class="adm-ghost" @click="saveFilters">저장</button>
            <button type="button" class="adm-ghost" @click="resetFilters">초기화</button>
          </div>
          <div class="adm-table-wrap">
            <table class="adm-table adm-dongsum adm-deals-table">
              <thead>
                <tr>
                  <th v-for="c in DEAL_COLS" :key="c.key" :class="c.align"><button type="button" class="adm-sort" @click="toggleDealSort(c.key)">{{ c.label }}<i :class="{ on: dealSort === c.key }">{{ dealSort === c.key ? (dealDesc ? '↓' : '↑') : '⇅' }}</i></button></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(r, i) in dealRows.slice(0, 300)" :key="i">
                  <td class="c"><button type="button" class="adm-dong-link" @click="dong = r.umdNm">{{ r.umdNm }}</button></td>
                  <td class="l">{{ r.name || '—' }}</td>
                  <td class="r">{{ r.areaM2 > 0 ? `${r.areaM2.toFixed(1)}㎡ / ${r.pyeong.toFixed(1)}평` : '—' }}</td>
                  <td class="r">{{ r.floor || '—' }}</td>
                  <td class="r">{{ r.buildYear || '—' }}</td>
                  <td class="c">{{ r.contractDate || '—' }}</td>
                  <td class="r strong">{{ eokMan(r.priceWon) }}<small v-if="r.kind === '직거래'" class="adm-direct-tag">직거래</small></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="dealRows.length > 300" class="adm-foot">앞의 300줄만 보여 줍니다 — 전체 {{ dealRows.length.toLocaleString('ko-KR') }}줄 중</p>
        </div>
        <!-- 웹 '상세분포' 탭 — 동마다 구간별 거래건수(정상 + 직거래, 계약해제 제외). 칸이 진할수록 많다. 머리글을 누르면 정렬 -->
        <div v-else-if="webEmbed && listView === 'detail'" class="adm-detail">
          <nav class="adm-detail-kinds" role="tablist">
            <button v-for="k in DETAIL_KINDS" :key="k.key" type="button" role="tab" :aria-selected="detailKind === k.key" :class="{ on: detailKind === k.key }" @click="detailKind = k.key">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="k.icon" /></svg>{{ k.label }}
            </button>
          </nav>
          <!-- 층수 — 위에 층별 평균 평당가 표(전체 대비 %), 아래에 동별 표 -->
          <template v-if="detailKind === 'floor'">
            <p class="adm-detail-cap">층별 평균 평당가 — 전체 평균과 견줘 어느 층을 더 쳐주는지 봅니다 (지하 = 지층 · 반지하 포함)</p>
            <div class="adm-table-wrap">
              <table class="adm-table adm-dongsum adm-floorsum">
                <thead>
                  <tr><th class="c">구분</th><th v-for="c in floorSummary.cols" :key="c.label" class="c">{{ c.label }}</th><th class="c">전체</th></tr>
                </thead>
                <tbody>
                  <tr><td class="c">거래건수</td><td v-for="c in floorSummary.cols" :key="c.label" class="c">{{ c.count.toLocaleString('ko-KR') }}</td><td class="c strong">{{ floorSummary.total.count.toLocaleString('ko-KR') }}</td></tr>
                  <tr><td class="c">평균 평당가</td><td v-for="c in floorSummary.cols" :key="c.label" class="c">{{ manText(c.unit) }}</td><td class="c strong">{{ manText(floorSummary.total.unit) }}</td></tr>
                  <tr><td class="c">평균 대비</td><td v-for="c in floorSummary.cols" :key="c.label" :class="['c', 'pct', { up: (c.diff ?? 0) > 0, down: (c.diff ?? 0) < 0 }]">{{ pctText(c.diff) }}</td><td class="c">—</td></tr>
                </tbody>
              </table>
            </div>
          </template>
          <p class="adm-detail-cap">{{ detailCaption }}</p>
          <div class="adm-table-wrap">
            <table class="adm-table adm-dongsum adm-heat">
              <thead>
                <tr>
                  <th class="c"><button type="button" class="adm-sort" @click="toggleDetailSort('name')">동<i :class="{ on: detailSort === 'name' }">{{ detailSort === 'name' ? (detailDesc ? '↓' : '↑') : '⇅' }}</i></button></th>
                  <th v-for="(b, bi) in detailBuckets" :key="b.label" class="c"><button type="button" class="adm-sort" @click="toggleDetailSort(bi)"><span class="adm-heat-h">{{ b.label }}</span><i :class="{ on: detailSort === bi }">{{ detailSort === bi ? (detailDesc ? '↓' : '↑') : '⇅' }}</i></button></th>
                  <th class="c"><button type="button" class="adm-sort" @click="toggleDetailSort('total')">합계<i :class="{ on: detailSort === 'total' }">{{ detailSort === 'total' ? (detailDesc ? '↓' : '↑') : '⇅' }}</i></button></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in detailRows" :key="r.name">
                  <td class="c"><button type="button" class="adm-dong-link" @click="dong = r.name">{{ r.name }}</button></td>
                  <td v-for="(n, ci) in r.cells" :key="ci" class="r" :style="heatStyle(n)" :title="`${r.name} · ${detailBuckets[ci].label} ${n.toLocaleString('ko-KR')}건`">{{ n > 0 ? n.toLocaleString('ko-KR') : '—' }}</td>
                  <td class="r strong">{{ r.total.toLocaleString('ko-KR') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <!-- 웹 '지역별 분포' 탭 — 지역별 분석 표 자리에 전용면적 · 금액 · 건축연식 · 층 분포 막대그래프 (검색조건으로 거른 거래 기준) -->
        <div v-else-if="webEmbed && listView === 'dist'" class="adm-dists is-web">
          <div v-for="d in DISTS" :key="d.title" class="adm-dist">
            <div class="adm-dist-head">{{ d.title }} <em v-if="d.unit">{{ d.unit }}</em><small>건수 · %</small></div>
            <!-- 웹 — 막대그래프. 막대 높이는 그 분포에서 가장 많은 칸 대비, 위에 건수 · 밑에 구간 · % -->
            <div v-if="distChart === 'bar'" class="adm-bars" role="img" :aria-label="`${d.title} 막대그래프`">
              <div
                v-for="c in d.cells"
                :key="c.label"
                :class="['adm-bar-col', { top: c.count > 0 && c.count === Math.max(...d.cells.map(x => x.count)) }]"
                :title="`${c.label} — ${c.count}건 (${c.pct.toFixed(1)}%)`"
              >
                <b>{{ c.count }}</b>
                <span class="adm-bar-track"><i :style="{ height: `${(c.count / Math.max(1, ...d.cells.map(x => x.count))) * 100}%` }" /></span>
                <small :class="{ two: c.label.includes(' / ') }">{{ c.label }}</small>
                <em>{{ c.pct.toFixed(0) }}%</em>
              </div>
            </div>
            <!-- 도넛 — 구간이 차례가 있는 값이라 한 색의 옅음 → 짙음으로. 조각 사이 2px 흰 틈 -->
            <div v-else class="adm-donut-wrap">
              <svg class="adm-donut" viewBox="0 0 160 160" role="img" :aria-label="`${d.title} 도넛 분포도`">
                <circle cx="80" cy="80" :r="DONUT_R" fill="none" stroke="#f1f4f9" stroke-width="28" />
                <circle
                  v-for="(seg, si) in donutSegs(d.cells)"
                  :key="seg.label"
                  cx="80" cy="80" :r="DONUT_R" fill="none"
                  :stroke="DONUT_RAMP[si % DONUT_RAMP.length]" stroke-width="28"
                  :stroke-dasharray="`${seg.len} ${DONUT_C - seg.len}`"
                  :stroke-dashoffset="-seg.start"
                  transform="rotate(-90 80 80)"
                  class="adm-donut-seg"
                ><title>{{ seg.label }} — {{ seg.count }}건 ({{ seg.pct.toFixed(1) }}%)</title></circle>
                <!-- 숫자와 '건' 은 같은 바닥선(글자 밑면)에 — 가운데 맞춤이면 작은 '건' 이 떠 보인다 -->
                <text x="80" y="86" text-anchor="middle" class="adm-donut-total">{{ d.cells.reduce((a, c) => a + c.count, 0).toLocaleString('ko-KR') }}<tspan class="adm-donut-unit">건</tspan></text>
              </svg>
              <ul class="adm-donut-legend">
                <li v-for="(c, ci) in d.cells" :key="c.label">
                  <i :style="{ background: DONUT_RAMP[ci % DONUT_RAMP.length] }" />
                  <span>{{ c.label }}</span>
                  <b>{{ c.count }}</b>
                  <em>{{ c.pct.toFixed(0) }}%</em>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- 웹 · 읍면동 '전체' — 동별 요약 표. 동 이름을 누르면 그 동의 거래 목록으로 -->
        <div v-else-if="webEmbed && !dong" class="adm-table-wrap">
          <table class="adm-table adm-dongsum">
            <thead>
              <tr>
                <th v-for="c in SUM_COLS" :key="c.key"  class="c">
                  <button type="button" class="adm-sort" @click="toggleSumSort(c.key)">
                    {{ c.label }}<i :class="{ on: sumSortKey === c.key }">{{ sumSortKey === c.key ? (sumSortDesc ? '↓' : '↑') : '⇅' }}</i>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in dongSumRows" :key="d.name">
                <td class="c"><button type="button" class="adm-dong-link" @click="dong = d.name">{{ d.name }}</button></td>
                <td class="r">{{ d.count.toLocaleString('ko-KR') }}건</td>
                <td class="r strong">{{ eokMan(d.avg) }}</td>
                <td class="r">{{ eokMan(d.median) }}</td>
                <td class="r">{{ eokMan(d.min) }}</td>
                <td class="r">{{ eokMan(d.max) }}</td>
                <td class="r">{{ d.area > 0 ? areaText(d.area) : '—' }}</td>
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
        <p v-if="!webEmbed && listRows.length > 300" class="adm-foot">앞의 300줄만 보여 줍니다 — 전체 {{ listRows.length.toLocaleString('ko-KR') }}줄은 엑셀로 내려받으세요.</p>
        <!-- 웹 — 거래 목록(동을 골랐을 때)에만, 엑셀 단추는 웹에서 뺐다 -->
        <p v-else-if="webEmbed && dong && listView === 'table' && listRows.length > 300" class="adm-foot">앞의 300줄만 보여 줍니다 — 전체 {{ listRows.length.toLocaleString('ko-KR') }}줄 중</p>
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
.adm-search.in-cond { margin-left: 0; }
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
.adm-gunav-box { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 4px; border-radius: 8px; background: #fff; }
.adm-gunav-box small { font-size: 14px; color: #6b7280; white-space: nowrap; }
.adm-gunav-box b { font-size: 18px; font-weight: 800; color: #2b6df3; white-space: nowrap; text-align: center; }
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
/* 웹 — 분포 막대그래프 (한 묶음 한 색, 가장 많은 칸만 진하게) */
.adm-dists.is-web { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.adm-dists.is-web .adm-dist { padding: 16px 20px 14px; }
.adm-dists.is-web .adm-dist-head { font-size: 16px; margin-bottom: 12px; }
.adm-dists.is-web .adm-dist-head :is(em, small) { font-size: 14px; }
.adm-bars { display: flex; align-items: stretch; gap: 8px; height: 190px; padding: 4px 2px 0; }
.adm-bar-col { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: default; }
.adm-bar-col b { font-size: 14px; font-weight: 800; color: #374151; font-variant-numeric: tabular-nums; }
.adm-bar-track { flex: 1 1 auto; width: 100%; max-width: 44px; display: flex; align-items: flex-end; border-bottom: 1px solid #d1d5db; }
.adm-bar-track i { display: block; width: 100%; min-height: 2px; background: #a9c3f7; border-radius: 4px 4px 0 0; transition: background .15s; }
.adm-bar-col.top .adm-bar-track i, .adm-bar-col:hover .adm-bar-track i { background: #2b6df3; }
.adm-bar-col.top b { color: #2b6df3; }
.adm-bar-col small { font-size: 14px; font-weight: 600; color: #4b5563; white-space: nowrap; }
.adm-bar-col small.two { white-space: normal; text-align: center; line-height: 1.3; font-size: 13px; word-break: keep-all; } /* '33~50㎡ / 10~15평' 은 두 줄로 */
.adm-bar-col em { font-style: normal; font-size: 14px; color: #9ca3af; }
/* 지역분포 바로 옆 아이콘 — 지금 모양(막대 · 도넛) */
.adm-deals { display: flex; flex-direction: column; gap: 12px; }
.adm-trend { background: #fff; border: 1px solid #e8ecf3; border-radius: 12px; padding: 16px 20px 10px; }
.adm-trend-title { margin: 0 0 8px; font-size: 16px; font-weight: 800; color: #1f3a72; }
.adm-trend-title em { font-style: normal; font-size: 14px; font-weight: 600; color: #9ca3af; }
.adm-trend-svg { width: 100%; height: auto; display: block; }
.adm-trend-svg .grid { stroke: #eef1f6; stroke-width: 1; }
.adm-trend-svg .ax { font-size: 13px; fill: #6b7280; }
.adm-trend-svg .area { fill: rgba(43, 109, 243, 0.08); }
.adm-trend-svg .line { fill: none; stroke: #2b6df3; stroke-width: 2; stroke-linejoin: round; }
.adm-trend-svg .dot { fill: #fff; stroke: #2b6df3; stroke-width: 2; }
.adm-trend-svg .hit { fill: transparent; cursor: default; }
.adm-trend-svg .hover-line { stroke: #c7d7f8; stroke-width: 1; opacity: 0; }
.adm-trend-svg .pt:hover .hover-line { opacity: 1; }
.adm-trend-svg .pt:hover .dot { fill: #2b6df3; }
.adm-trend-empty { margin: 8px 0; font-size: 14px; color: #6b7280; }
.adm-deals-head { display: flex; align-items: center; gap: 10px; margin: 4px 2px 0; }
.adm-deals-head strong { font-size: 16px; font-weight: 800; color: #111827; }
.adm-deals-head > span:not(.adm-search) { font-size: 14px; color: #6b7280; }
.adm-deals-table td.l { text-align: left; }
/* 거래상세 — 조건검색 한 줄 (상자 없이, 칸 이름은 칸 안 왼쪽 회색) */
.adm-inline-cond { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.adm-inbox {
  display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 10px;
  border: 1px solid #e3e8f0; border-radius: 8px; background: #fff; color: #9ca3af;
}
.adm-inbox:focus-within { border-color: #2b6df3; }
.adm-inbox em { font-style: normal; font-size: 14px; font-weight: 600; color: #9ca3af; white-space: nowrap; }
.adm-inbox i { font-style: normal; color: #c3c9d4; }
.adm-inbox input { border: 0; outline: none; background: transparent; font: inherit; font-size: 15px; color: #111827; min-width: 0; padding: 0; }
.adm-inbox input[type='date'] { width: 130px; }
.adm-inbox input.num { width: 56px; text-align: center; }
.adm-inbox.grow { flex: 1 1 200px; }
.adm-inbox.grow input { flex: 1 1 auto; }
.adm-inline-cond .adm-ghost { height: 40px; }
.adm-direct-tag { margin-left: 6px; font-size: 12px; font-weight: 700; color: #0f9d7a; }
.adm-detail { display: flex; flex-direction: column; gap: 10px; }
.adm-detail-kinds { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; } /* 네 단추 같은 폭 */
.adm-detail-kinds button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 38px; padding: 0 14px; border: 1px solid #e3e8f0; border-radius: 8px; background: #fff; font-size: 15px; font-weight: 700; color: #4b5563; cursor: pointer; }
.adm-detail-kinds button.on { border-color: #2b6df3; color: #2b6df3; background: #eef4ff; }
.adm-detail-cap { margin: 4px 2px 0; font-size: 14px; color: #6b7280; }
.adm-heat td.r { font-variant-numeric: tabular-nums; }
/* 가격대 · 면적 · 연식 · 층수를 오가도 동 · 합계 칸은 제자리 — 첫 칸 · 끝 칸 폭을 못 박고 가운데 구간 칸이 나머지를 고르게 나눈다 */
.adm-heat th:first-child, .adm-heat td:first-child, .adm-floorsum th:first-child, .adm-floorsum td:first-child { width: 120px; }
.adm-heat th:last-child, .adm-heat td:last-child, .adm-floorsum th:last-child, .adm-floorsum td:last-child { width: 110px; }
.adm-floorsum td { font-variant-numeric: tabular-nums; }
.adm-floorsum td.pct { font-weight: 800; }
.adm-floorsum td.pct.up { color: #2b6df3; }
.adm-floorsum td.pct.down { color: #d64545; }
.adm-heat-h { white-space: normal; word-break: keep-all; line-height: 1.3; }
.adm-view-kind { display: inline-flex; vertical-align: -2px; margin-left: 3px; color: #9ca3af; }
.adm-view-tabs button.on .adm-view-kind { color: #2b6df3; }
/* 도넛 분포도 — 왼쪽 도넛, 오른쪽 범례(구간 · 건수 · %) */
.adm-donut-wrap { display: flex; align-items: center; gap: 24px; height: 190px; padding: 4px 8px 0; }
.adm-donut { width: 170px; height: 170px; flex: 0 0 auto; }
.adm-donut-seg { transition: opacity .15s; }
.adm-donut:hover .adm-donut-seg { opacity: .55; }
.adm-donut .adm-donut-seg:hover { opacity: 1; }
.adm-donut-total { font-size: 16px; font-weight: 800; fill: #111827; } /* 가운데 한 줄 '1,232건' */
.adm-donut-unit { font-size: 13px; font-weight: 600; fill: #6b7280; }
.adm-donut-legend { list-style: none; margin: 0; padding: 0; flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.adm-donut-legend li { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto 44px; align-items: center; gap: 8px; font-size: 14px; }
.adm-donut-legend i { width: 12px; height: 12px; border-radius: 3px; }
.adm-donut-legend span { color: #374151; white-space: nowrap; }
.adm-donut-legend b { font-weight: 800; color: #111827; font-variant-numeric: tabular-nums; text-align: right; }
.adm-donut-legend em { font-style: normal; color: #9ca3af; text-align: right; }
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
/* 웹 — 결과 보기 탭(밑줄은 ::after 막대) */
.adm-view-tabs { display: flex; gap: 22px; padding-left: 28px; } /* 글자 두 개쯤 안으로 */
.adm-view-tabs button { position: relative; border: 0; background: none; padding: 6px 0 8px; font-size: 16px; font-weight: 700; color: #6b7280; cursor: pointer; border-radius: 0; }
.adm-view-tabs button.on { color: #2b6df3; font-weight: 800; }
.adm-view-tabs button.on::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: #2b6df3; }
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
.adm-dongsum .c { text-align: center; }
/* 칸 너비를 고르게 — 칸 이름은 가운데, ㎡당 평균가(맨 오른쪽)는 끝에 붙지 않게 안쪽으로 띄운다 */
.adm-dongsum { table-layout: fixed; width: 100%; }
.adm-dongsum th { text-align: center; }
.adm-dongsum :is(th, td):last-child { padding-right: 32px; }
.adm-dongsum .r { text-align: right; }
.adm-dongsum td.strong { font-weight: 800; color: #111827; }
.adm-sort { border: 0; background: none; padding: 0; font: inherit; color: inherit; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
.adm-sort i { font-style: normal; font-size: 12px; color: #9ca3af; }
.adm-sort i.on { color: #2f6b45; }
.adm-dong-link { border: 0; background: none; padding: 0; font: inherit; font-weight: 700; color: #111827; cursor: pointer; }
.adm-dong-link:hover { color: #2b6df3; text-decoration: underline; }
</style>
