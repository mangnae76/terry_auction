<script setup lang="ts">
// 경매지번 공동주택가 및 실거래가 (관리자 도구).
//
// 주소 한 줄이면 끝난다 — 주소에 국토부 열쇠(법정동코드 앞 5자리)와
// 브이월드 열쇠(10자리+지번)가 같이 들어 있어, 공동주택가와 그 지번의
// 매매·전세·월세를 한 번에 모은다. 호수는 공동주택가에만 쓰이고
// 실거래 맞추기에서는 빠진다 (국토부 거래 자료에 동·호가 없다).
//
// 셈과 조회는 services/caseTradeAnalysis.ts 에 있다 — 이 화면은 보여 주기만 한다.
import UnitText from '../components/UnitText.vue';
import InfoTip from '../components/InfoTip.vue';
import { JEONSE_RATIO_TIP, PUB_RATIO_TIP, jeonseRateTip, pubPriceTip } from '../services/tipRows';
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue';
import { useScreenSnapshot } from '../composables/useScreenSnapshot';
import SnapChip from '../components/SnapChip.vue';
import { useRouter } from 'vue-router';
import { REGION_GROUPS, districtsOf, type DistrictOption } from '../services/regionCodes';
import { analyzeAddress, matchRange, pickCaseTrade, type CasePropertyType, type CaseTradeRow, type TradeRange } from '../services/caseTradeAnalysis';
import TradeRangeFilter from '../components/TradeRangeFilter.vue';
import { tradeWindowOf } from '../services/publicDataApi';
import { priceUnitText, shortPlaceName } from '../services/addressLookup';
import ColumnFilterPanel from '../components/ColumnFilterPanel.vue';
import AppToast from '../components/AppToast.vue';
import AppConfirm from '../components/AppConfirm.vue';
import { skipsToday, type ConfirmBox } from '../services/confirmBox';
import { useAuthStore } from '../stores/authStore';
import {
  addSnapshot, listSnapshots, removeSnapshot, updateSnapshot, type CaseSnapshot,
} from '../services/adminSnapshots';
import { useColumnFilters, type ColumnDef } from '../composables/useColumnFilters';
import type { ApartPrice } from '../services/vworldApi';
import type { ResolvedRegion } from '../services/regionResolver';

const KINDS: Array<{ key: CasePropertyType; label: string }> = [
  { key: 'villa', label: '연립다세대' },
  { key: 'apt', label: '아파트' },
  { key: 'officetel', label: '오피스텔' },
];
const YEARS = [2, 4, 8, 10];
const PYEONG = 3.305785;

/** inDong — 지역분석 › 경매지번 탭 안에 붙어 쓴다(주소 줄은 지역분석 고르는 줄 자리로, 경로는 지역분석 탭 줄에) */
/** preset — 손품분석처럼 물건이 주소 · 종류를 주면 위 주소 줄 없이 바로 조회한다(저장본도 쓰지 않는다) */
const props = withDefaults(defineProps<{ inDong?: boolean; preset?: { address: string; kind: CasePropertyType } | null }>(), { inDong: false, preset: null });
const inDong = computed(() => props.inDong);
const router = useRouter();
/** 웹에 떴는가 — 웹은 지역분석과 같은 틀(띠 위 고르는 줄 → 제목 · 단추 줄 + 오른쪽 경로)로 보인다 */
const webEmbed = inject<boolean>('webEmbed', false);
const auth = useAuthStore();

// ===== 주소 한 줄 =====
const address = ref('');
const kind = ref<CasePropertyType>('villa');
// 웹 시세조사는 4년 고정 — 같은 동 유사물건 · 조건분석까지 이 한 번으로 끝난다
const years = ref(webEmbed ? 4 : 10);

const loading = ref(false);
const errorMsg = ref('');
const notice = ref('');

const region = ref<ResolvedRegion | null>(null);
const lot = ref('');
const ho = ref('');
const buildingDong = ref('');
const price = ref<ApartPrice | null>(null);
const rows = ref<CaseTradeRow[]>([]);
/** 같은 동 모든 거래 — 유사물건 표 · 조건분석 평균이 여기서 거른다 */
const dongRows = ref<CaseTradeRow[]>([]);
/** 웹 실거래가 조사 — 경매물건(그 건물) / 유사물건(같은 동 다른 건물). 손품조사 알약 두 개와 같다 */
const MODES = ['경매물건', '유사물건'] as const;
type CaseMode = typeof MODES[number];
const mode = ref<CaseMode>('경매물건');
/** 스냅샷에서 되살린 값 — 표를 다시 받기 전까지 이 값으로 선다 */
const restoredSale = ref<CaseTradeRow | null>(null);
const restoredJeonse = ref<CaseTradeRow | null>(null);
const restoredSpot = ref('');
const scanned = ref(0);
/** 공부상 전용면적 — 공시가격 자료의 그 호실 줄에서 온다 */
const baseArea = ref(0);
const missed = ref(0);
const priceUnit = computed(() => priceUnitText(price.value));

// 직접 고르기 — 카카오가 엉뚱한 구를 집었을 때만 편다
// (인천 서구 → 서해구·검단구처럼 갈린 지역이 있다)
const manualOpen = ref(false);
const ovSido = ref('');
const ovDistrictCode = ref('');
const ovDong = ref('');
const ovLot = ref('');
const ovDistricts = computed<DistrictOption[]>(() => districtsOf(ovSido.value));

/** 해석 결과 한 줄 — 어디를 보고 있는지 */
const spotChip = computed(() => {
  const r = region.value;
  if (!r && !ovDistrictCode.value) return '';
  const d = ovDistrictCode.value
    ? ovDistricts.value.find((x) => x.lawdCode === ovDistrictCode.value)?.label
    : r?.sigungu;
  // 카카오는 시도를 '인천'처럼 줄여 준다 — 우리 표의 이름으로 펴서 적는다
  const code = ovDistrictCode.value || r?.lawdCd5 || '';
  const full = REGION_GROUPS.find((g) => g.districts.some((x) => x.lawdCode === code))?.sido;
  // 끝 칸은 '프리스틴 106동 402호' 처럼 — 단지 이름은 공시가격 자료에서 온다
  const unit = [
    shortPlaceName(price.value?.name) || shortName.value,
    buildingDong.value ? `${buildingDong.value}동` : (price.value?.dong ? `${price.value.dong.replace(/동$/, '')}동` : ''),
    ho.value ? `${ho.value}호` : '',
  ].filter(Boolean).join(' ');
  return [ovSido.value || full || r?.sido, d, ovDong.value || r?.dong, ovLot.value || lot.value, unit]
    .filter(Boolean).join(' · ');
});

const callCount = computed(() => years.value * 12 * 2);
/** 화면 머리의 칩 — 되살린 스냅샷이면 저장해 둔 글을 그대로 쓴다 */
const chipText = computed(() => restoredSpot.value || spotChip.value);

/** 마지막으로 받은 주소 — 같은 주소로 칸만 벗어날 때는 다시 받지 않는다 */
const lastRunAddress = ref('');
const pickKind = (k: CasePropertyType) => {
  if (kind.value === k) return;
  kind.value = k;
  if (webEmbed && address.value.trim()) void run();
};
const run = async () => {
  const text = address.value.trim();
  if (!text || loading.value) return;
  lastRunAddress.value = text;
  loading.value = true;
  errorMsg.value = '';
  notice.value = '';
  try {
    const res = await analyzeAddress(
      { address: text, propertyType: kind.value, years: years.value },
      {
        lawdCd5: ovDistrictCode.value || undefined,
        umdNm: ovDong.value || undefined,
        lot: ovLot.value || undefined,
      },
    );
    restoredSpot.value = '';
    snapLabel.value = '';
    snapId.value = '';
    region.value = res.region;
    lot.value = res.parts.lot;
    ho.value = res.parts.ho;
    buildingDong.value = res.parts.buildingDong;
    price.value = res.price;
    rows.value = res.rows;
    dongRows.value = res.dongRows;
    scanned.value = res.scanned;
    missed.value = res.missedMonths;
    baseArea.value = res.baseAreaM2;
    // 평형으로 저절로 좁히지 않는다 — 받은 그대로 다 펴 두고 사람이 고른다.
    // 기준 전용면적은 칩에만 적어 둔다
    areaFilter.value = '';
    areaNote.value = '';
    // 표는 전체로 펴 두되 아무것도 집어 두지 않는다 — 고르는 건 사람 몫
    tab.value = 'all';
    await nextTick();
    pickNone();
    // 그 건물 거래가 하나도 없으면 유사물건부터 펴 둔다
    mode.value = pickCaseTrade(res.rows, ['매매', '직거래', '전세'], 0) ? MODES[0] : MODES[1];
    resetSim();
    if (res.rows.length === 0) notice.value = '그 지번의 실거래가 없습니다 — 기간을 늘리거나 직접 고르기로 지번을 고쳐 보세요.';
    else if (res.missedMonths > 0) notice.value = `${res.missedMonths}개월치를 받지 못했습니다 — 다시 누르면 채워집니다.`;
    if (!res.price) {
      notice.value = notice.value || '공동주택가 자료가 없습니다 — 공동주택이 아니거나 아직 고시 전입니다.';
    }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
};

// ===== 거르기 =====
const areaFilter = ref('');
const areaNote = ref('');
const yearFilter = ref('');
const tab = ref<'all' | '매매' | '전세' | '월세'>('매매');
const resetFilters = () => {
  if (webEmbed) {
    // 웹 — 지금 보는 쪽만 처음으로(경매물건은 자동 판단으로, 유사물건은 조건 기본값으로)
    tab.value = 'all';
    areaFilter.value = ''; yearFilter.value = '';
    if (mode.value === MODES[1]) resetSim(); else clearPicks();
    colFilter.clearAll();
    return;
  }
  areaFilter.value = ''; yearFilter.value = ''; tab.value = '매매';
  clearPicks();
  colFilter.clearAll();
};

// ===== ① 유사물건 — 고른 줄. 거르기는 경매물건과 같은 면적 · 거래년도(가격정보 경매지번 표와 같은 소팅) =====
const simSale = ref('');
const simJeonse = ref('');
const ymdText = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** 기본 거르기 — 기간선택 12개월(조회일부터, tradeWindowOf) · 면적 · 건축년도 전체 */
const defaultRange = (): TradeRange => {
  const w = tradeWindowOf(Date.now(), 12);
  return { months: 12, from: ymdText(w.start), to: ymdText(w.end), areaMin: '', areaMax: '', buildMin: '', buildMax: '' };
};
/** 유사물건 거르기 — 실거래가 조건분석과 같은 칸(TradeRangeFilter), 값은 따로 */
const simF = ref<TradeRange>(defaultRange());
const resetSim = () => {
  areaFilter.value = ''; yearFilter.value = '';
  simF.value = defaultRange();
  simSale.value = ''; simJeonse.value = '';
};
const COLS: Array<ColumnDef<CaseTradeRow>> = [
  { key: 'kind', label: '구분', text: (r) => r.kind },
  { key: 'date', label: '계약일', text: (r) => r.contractDate || '-', order: (r) => Number(r.contractDate.replace(/\D/g, '')) || 0 },
  { key: 'amount', label: '거래금액', text: (r) => r.amount, order: (r) => r.price },
  { key: 'area', label: '전용(㎡/평)', text: (r) => areaText(r.areaM2), order: (r) => r.areaM2 },
  { key: 'build', label: '건축년도', text: (r) => (r.buildYear ? String(r.buildYear) : '-'), order: (r) => r.buildYear ?? 0 },
  { key: 'floor', label: '층', text: (r) => r.floor || '-', order: (r) => Number(String(r.floor).replace(/[^\d-]/g, '')) || 0 },
  { key: 'place', label: '주소', text: (r) => [r.umdNm, r.jibun, r.name].filter(Boolean).join(' ') },
];

// ===== ② 실거래가 조건분석 — 유사물건과 같은 거르기 칸, 값은 따로 =====
const condF = ref<TradeRange>(defaultRange());
const resetCond = () => { condF.value = defaultRange(); condColFilter.clearAll(); };
/** 조건에 맞는 같은 동 매매(정상거래 · 직거래, 계약해제는 받을 때 이미 뺐다) */
const condRangeSales = computed(() => dongRows.value.filter((r) => (
  (r.kind === '매매' || r.kind === '직거래') && r.price > 0 && matchRange(r, condF.value)
)));
/** 표 머리글(구분 ~ 층) ▽ 고르기까지 건 줄 — 평균 · 네 칸이 이걸 따른다(손품조사 조건분석과 같다) */
const condColFilter = useColumnFilters<CaseTradeRow>(condRangeSales, COLS.filter((c) => c.key !== 'place'));
const condSales = computed(() => condColFilter.rows.value);
const condAvg = computed(() => (condSales.value.length ? condSales.value.reduce((t, r) => t + r.price, 0) / condSales.value.length : 0));
/** 손품조사 조건분석과 같은 글 — 면적은 걸러진 매매의 실제 최소~최대, 사용승인은 건축년도 범위 + 몇 년차 */
/** 시작 · 끝 두 줄(손품조사 앱 칸과 같이) — 한 줄이면 칸을 넘친다 */
const condAreaPair = computed<[string, string] | null>(() => {
  const a = condSales.value.map((r) => r.areaM2).filter((v) => v > 0);
  if (!a.length) return null;
  const pair = (m2: number) => `${m2.toFixed(2)}㎡ / ${(m2 / PYEONG).toFixed(2)}평`;
  return [pair(Math.min(...a)), pair(Math.max(...a))];
});
const condPeriodText = computed(() => {
  const sd = (v: string) => (v ? v.slice(2, 7).replace(/-/g, '.') : '');
  const f = sd(condF.value.from); const t = sd(condF.value.to);
  return f || t ? `${f}~${t}` : '-';
});
const condApprovalText = computed(() => {
  const ys = condSales.value.map((r) => r.buildYear ?? 0).filter((v) => v > 1800);
  if (!ys.length) return '-';
  const min = Math.min(...ys); const max = Math.max(...ys);
  const yy = (y: number) => String(y % 100).padStart(2, '0');
  const thisYear = new Date().getFullYear();
  const age = (y: number) => Math.max(1, thisYear - y + 1);
  return `${yy(min)}.01~${yy(max)}.12 / ${min === max ? `${age(min)}년차` : `${age(max)}~${age(min)}년차`}`;
});
const condAvgPerPy = computed(() => {
  const list = condSales.value.filter((r) => r.areaM2 > 0);
  return list.length ? list.reduce((t, r) => t + r.price / (r.areaM2 / PYEONG), 0) / list.length : 0;
});
/** 지금 보고 있는 평형이 공부상 면적과 같은가 — 칩에 적어 둔다 */
/** '49.74㎡ / 15.05평' — 표와 같은 표기로 */
const m2py = (m2: number) => (m2 > 0 ? `${m2.toFixed(2)}㎡ / ${(m2 / PYEONG).toFixed(2)}평` : '');
const areaChip = computed(() => {
  if (!(baseArea.value > 0)) return '';
  const base = m2py(baseArea.value);
  const same = areaFilter.value && Math.abs(Number(areaFilter.value) - baseArea.value) <= 0.1;
  return same
    ? `기준 전용 ${base} · 공시가격 자료`
    : `공부상 전용 ${base} — ${areaFilter.value ? m2py(Number(areaFilter.value)) : '전체 면적 상태'}`;
});

/** 웹 — 지금 리스트의 바탕(경매물건은 그 지번, 유사물건은 같은 동) */
const baseList = computed(() => (webEmbed && mode.value === MODES[1] ? dongRows.value : rows.value));
/** 유사물건은 면적 가짓수가 수백이라 '12평대'처럼 평 단위로 묶는다 */
const simBucket = (m2: number) => `py${Math.floor(m2 / PYEONG)}`;
const areaOptions = computed(() => {
  const set = new Set<string>();
  if (webEmbed && mode.value === MODES[1]) {
    dongRows.value.forEach((r) => { if (r.areaM2 > 0) set.add(simBucket(r.areaM2)); });
    return [...set].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
  }
  rows.value.forEach((r) => { if (r.areaM2 > 0) set.add(String(r.areaM2)); });
  return [...set].sort((a, b) => Number(a) - Number(b));
});
const yearOptions = computed(() => {
  const set = new Set<string>();
  baseList.value.forEach((r) => { const y = r.contractDate.slice(0, 4); if (y) set.add(y); });
  return [...set].sort().reverse();
});
/** 면적·연도만 거른 줄 — 요약과 탭 건수가 이걸 본다 */
const byAreaYear = computed(() => baseList.value.filter((r) => {
  if (webEmbed && mode.value === MODES[1]) return matchRange(r, simF.value);
  if (areaFilter.value) {
    if (areaFilter.value.startsWith('py')) { if (simBucket(r.areaM2) !== areaFilter.value) return false; }
    else if (String(r.areaM2) !== areaFilter.value) return false;
  }
  if (yearFilter.value && r.contractDate.slice(0, 4) !== yearFilter.value) return false;
  return true;
}));
// 표의 칸마다 값 목록으로 한 번 더 추린다 (실거래가 조건 분석과 같은 방식).
// 위 지표는 걸러낸 결과를 따르지 않는다 — 지표의 기준은 줄을 눌러 고른다.

const shown = computed(() => byAreaYear.value.filter((r) => (
  tab.value === 'all' || r.kind === tab.value || (tab.value === '매매' && r.kind === '직거래')
)));
const colFilter = useColumnFilters<CaseTradeRow>(shown, COLS);
const tableRows = computed(() => colFilter.rows.value);

const counts = computed(() => {
  const list = byAreaYear.value;
  const by = (t: string) => list.filter((r) => r.kind === t || (t === '매매' && r.kind === '직거래')).length;
  return { all: list.length, 매매: by('매매'), 전세: by('전세'), 월세: by('월세') };
});
const countLabel = computed(() => (tab.value === 'all' ? '전체' : tab.value));

const won = (n: number) => (n > 0 ? Math.round(n).toLocaleString('ko-KR') : '-');

const matchedNames = computed(() => Array.from(new Set(rows.value.map((r) => r.name).filter(Boolean))));
/** 요약 줄에 쓸 짧은 이름 — 공시가격 자료의 단지명이 먼저,
 *  없으면 국토부 신고 이름을 쓴다. 표의 '단지' 칸은 원문 그대로 둔다 */
const shortName = computed(() => (
  shortPlaceName(price.value?.name) || shortPlaceName(matchedNames.value[0]) || ''
));

// 기준 거래 고르기 — 비워 두면 '가장 최근 정상 거래'.
// 줄을 누르면 그 거래가 기준이 되고, 위 지표가 그 값으로 다시 선다.
const rowKey = (r: CaseTradeRow) => `${r.kind}|${r.contractDate}|${r.price}|${r.areaM2}|${r.floor}`;
const pickedSale = ref('');
const pickedJeonse = ref('');
/** 아무것도 집지 않은 자리 — 지표는 사람이 고른 줄로만 선다 */
const pickNone = () => {
  pickedSale.value = ''; pickedJeonse.value = '';
  restoredSale.value = null; restoredJeonse.value = null;
};
const isSaleKind = (k: string) => k === '매매' || k === '직거래' || k === '계약해제';
const pickRow = (r: CaseTradeRow) => {
  const key = rowKey(r);
  if (webEmbed && mode.value === MODES[1]) {
    if (isSaleKind(r.kind) && r.kind !== '계약해제') simSale.value = simSale.value === key ? '' : key;
    else if (r.kind === '전세') simJeonse.value = simJeonse.value === key ? '' : key;
    return;
  }
  // 표에서 고르면 되살려 둔 값은 물러난다
  if (isSaleKind(r.kind)) {
    restoredSale.value = null;
    pickedSale.value = pickedSale.value === key ? '' : key;
  } else if (r.kind === '전세') {
    restoredJeonse.value = null;
    pickedJeonse.value = pickedJeonse.value === key ? '' : key;
  }
};
const clearPicks = () => { pickNone(); };

const isPicked = (r: CaseTradeRow) => rowKey(r) === pickedSale.value || rowKey(r) === pickedJeonse.value;

/** 기준 매매 — 표에서 고른 줄만. 고르기 전에는 비어 있다 */
/** 경매물건 자동 판단 — 그 건물에서 이 호실과 같은 평형, 없으면 가장 가까운 평형의 최근 거래 */
const autoSale = computed(() => pickCaseTrade(rows.value, ['매매', '직거래'], baseArea.value));
const autoJeonse = computed(() => pickCaseTrade(rows.value, ['전세'], baseArea.value));
const recentSale = computed(() => {
  if (webEmbed && mode.value === MODES[1]) return dongRows.value.find((r) => rowKey(r) === simSale.value) ?? null;
  return rows.value.find((r) => rowKey(r) === pickedSale.value) ?? restoredSale.value ?? (webEmbed ? autoSale.value : null);
});
const recentPrice = computed(() => recentSale.value?.price ?? 0);
/** 전세도 매매와 같은 꼴로 — 보증금·평당 보증금·건수 */
const jeonsePriceReal = computed(() => recentJeonse.value?.price ?? 0);
/** 전세 실거래가가 공동주택가의 몇 %인가 — 보증보험 기준(126%)과 견준다 */
const jeonseVsPubText = computed(() => {
  const pub = pubValue.value;
  const j = jeonsePriceReal.value;
  return pub > 0 && j > 0 ? `공동주택가 × ${((j / pub) * 100).toFixed(0)}%` : '';
});
/** 고른 줄을 한 줄로 적는다 — 계약일 · 전용 · 층.
 *  공동주택가 칸의 '106동 402호 전용 49.74㎡' 와 견주라고 둔다 */
const rowFace = (r: CaseTradeRow | null) => {
  if (!r) return '';
  const area = r.areaM2 > 0 ? `${r.areaM2.toFixed(2)}㎡ / ${(r.areaM2 / PYEONG).toFixed(2)}평` : '';
  const floor = r.floor ? `${r.floor}층` : '';
  return [r.contractDate, area, floor].filter(Boolean).join(' · ');
};
/** 웹 12칸 — 매매 줄 · 전세 줄. 칸마다 고른 줄의 전용면적 · 거래일자/층 · 실거래가 · 평당가 */
const tradeArea = (r: CaseTradeRow | null) => (r && r.areaM2 > 0 ? `${r.areaM2.toFixed(2)}㎡ / ${(r.areaM2 / PYEONG).toFixed(2)}평` : '-');
const tradeWhen = (r: CaseTradeRow | null) => (r ? [r.contractDate.replace(/\./g, '-'), r.floor ? `${r.floor}층` : ''].filter(Boolean).join(' / ') : '-');
const perPyeong = (r: CaseTradeRow | null) => (r && r.areaM2 > 0 && r.price > 0 ? r.price / (r.areaM2 / PYEONG) : 0);
/** 기준 전세 — 표에서 고른 줄만 */
const recentJeonse = computed(() => {
  if (webEmbed && mode.value === MODES[1]) return dongRows.value.find((r) => rowKey(r) === simJeonse.value) ?? null;
  return rows.value.find((r) => rowKey(r) === pickedJeonse.value) ?? restoredJeonse.value ?? (webEmbed ? autoJeonse.value : null);
});
/** 표에서 파랑 · 초록으로 칠할 줄 — 위 칸에 지금 들어가 있는 거래(자동 판단 포함) */
const saleKeyNow = computed(() => (recentSale.value ? rowKey(recentSale.value) : ''));
const jeonseKeyNow = computed(() => (recentJeonse.value ? rowKey(recentJeonse.value) : ''));
const tradeLines = computed(() => [
  { key: 'sale', label: '매매', row: recentSale.value },
  { key: 'jeonse', label: '전세', row: recentJeonse.value },
]);
const condTip = computed(() => [
  ['공식', '조건에 맞는 같은 동 매매가 합 ÷ 건수'] as [string, string],
  ['건수', `매매 ${condSales.value.length.toLocaleString('ko-KR')}건 (직거래 포함 · 계약해제 제외)`] as [string, string],
  ['평당', condAvgPerPy.value > 0 ? `평균 ${won(condAvgPerPy.value)}원` : '-'] as [string, string],
  ['조건', '이 상자 아래의 면적 · 건축년도 · 계약일'] as [string, string],
]);
const pubTip = computed(() => pubPriceTip({ year: price.value?.year, unit: priceUnit.value }));
/** 고른 줄인지 저절로 잡힌 줄인지 — 요약 칸에 적어 둔다 */


// 손품+현장 가격정보의 셋째 표와 같은 셈이다.
//   전세가 = 공동주택가 × 비율(기본 126%)
//   전세가율 = 전세가 ÷ 매매 실거래가,  갭 = 매매 실거래가 − 전세가
//   공시대비율 = 매매 실거래가 ÷ 공동주택가
const JEONSE_RATE = 126;
// 공동주택가는 공시된 값 그대로 쓴다 — 고칠 자리가 아니다
const pubValue = computed(() => price.value?.price ?? 0);
const rateText = ref(String(JEONSE_RATE));
const jeonseRate = computed(() => {
  const r = Number(rateText.value.replace(/[^\d.]/g, ''));
  return Number.isFinite(r) && r > 0 ? r : JEONSE_RATE;
});
const jeonsePrice = computed(() => (pubValue.value > 0
  ? Math.round((pubValue.value * jeonseRate.value) / 100) : 0));
const saleReal = computed(() => recentPrice.value);
const jeonseRatioText = computed(() => (jeonsePrice.value > 0 && saleReal.value > 0
  ? `${((jeonsePrice.value / saleReal.value) * 100).toFixed(0)}%` : '-'));
const gapText = computed(() => (jeonsePrice.value > 0 && saleReal.value > 0
  ? Math.round(saleReal.value - jeonsePrice.value).toLocaleString('ko-KR') : ''));
const pubRatioText = computed(() => (pubValue.value > 0 && saleReal.value > 0
  ? `${((saleReal.value / pubValue.value) * 100).toFixed(0)}%` : '-'));
/** 보증보험 기준 전세가율 (공동주택가 × 비율 ÷ 매매) */
const jeonseRatioNum = computed(() => (jeonsePrice.value > 0 && saleReal.value > 0
  ? (jeonsePrice.value / saleReal.value) * 100 : 0));
/** 실거래 기준 전세가율 — 추정(공동주택가 × 비율)이 현실과 얼마나 벌어지는지 */
const realJeonseRatioText = computed(() => {
  const j = recentJeonse.value?.price ?? 0;
  return j > 0 && saleReal.value > 0 ? `${((j / saleReal.value) * 100).toFixed(0)}%` : '-';
});
/** 두 거래의 시점 차 (개월) — 몇 해씩 벌어지면 견주는 뜻이 옅어진다 */
const pairGapMonths = computed(() => {
  const j = recentJeonse.value?.contractDate ?? '';
  const sdate = recentSale.value?.contractDate ?? '';
  if (!j || !sdate) return 0;
  const n = (v: string) => Number(v.slice(0, 4)) * 12 + Number(v.slice(5, 7));
  return Math.abs(n(j) - n(sdate));
});
/** 실거래 기준 갭 = 매매 − 전세. 음수면 전세가 매매를 넘었다는 뜻이다 */
const realGapValue = computed(() => (
  jeonsePriceReal.value > 0 && saleReal.value > 0 ? saleReal.value - jeonsePriceReal.value : 0
));
const realGapText = computed(() => {
  const g = realGapValue.value;
  if (g === 0) return '';
  return `${g < 0 ? '-' : ''}${Math.abs(Math.round(g)).toLocaleString('ko-KR')}`;
});
const realRatioNum = computed(() => {
  const j = recentJeonse.value?.price ?? 0;
  return j > 0 && saleReal.value > 0 ? (j / saleReal.value) * 100 : 0;
});
/** 실거래 전세가율이 뜻하는 바 — 보증금을 돌려받을 수 있는 자리인가 */
const realRatioSign = computed(() => {
  const n = realRatioNum.value;
  if (!(n > 0)) return null;
  if (n >= 90) return { tone: 'bad', text: '▲ 깡통전세 위험 — 보증금이 매매가에 닿는다' };
  if (n >= 80) return { tone: 'warn', text: '▲ 높음 — 값이 빠지면 역전세' };
  if (n >= 60) return { tone: 'ok', text: '보통 — 흔한 범위' };
  return { tone: 'low', text: '▼ 낮음 — 전세 끼고 들어가도 갭이 크다' };
});
/** 전세와 매매가 몇 해씩 벌어져 있으면 그 사실을 먼저 알린다 */
const pairGapNote = computed(() => {
  const m = pairGapMonths.value;
  if (!(m >= 24)) return '';
  const y = Math.floor(m / 12);
  return `※ 전세와 매매가 ${y}년 차 — 시세가 아니라 시점 차일 수 있다`;
});
/** 보증보험 기준과 실거래가 얼마나 벌어졌나 */
const jeonseGapSign = computed(() => {
  const a = jeonseRatioNum.value;
  const b = realRatioNum.value;
  if (!(a > 0) || !(b > 0)) return null;
  const diff = Math.round(a - b);
  if (Math.abs(diff) < 3) return { tone: 'ok', text: '≈ 실거래와 비슷' };
  return diff > 0
    ? { tone: 'warn', text: `▲ 실거래보다 ${diff}%p 높음 — 보증 한도만큼은 못 받는 중` }
    : { tone: 'low', text: `▼ 실거래보다 ${-diff}%p 낮음 — 시장이 더 세게 간다` };
});

/** 숫자가 뜻하는 바는 말풍선으로 — 칸에는 값과 공식만 둔다 */
const tip = ref<'gap' | 'real' | ''>('');
const toggleTip = (k: 'gap' | 'real') => { tip.value = tip.value === k ? '' : k; };
// 마우스를 얹으면 뜨고 떼면 닫힌다. 말풍선 쪽으로 옮겨 가는 동안은
// 닫지 않으려고 조금 기다린다
let tipTimer = 0;
const tipEnter = (k: 'gap' | 'real') => {
  window.clearTimeout(tipTimer);
  tip.value = k;
};
const tipLeave = () => {
  window.clearTimeout(tipTimer);
  tipTimer = window.setTimeout(() => { tip.value = ''; }, 160);
};
const realTipLines = computed(() => {
  const lines: string[] = [];
  const r = recentJeonse.value;
  if (r) lines.push(`${r.contractDate} 전세 ${won(r.price)}`);
  if (realRatioSign.value) lines.push(realRatioSign.value.text);
  if (pairGapNote.value) lines.push(pairGapNote.value);
  if (lines.length === 0) lines.push('견줄 전세 거래가 없습니다.');
  return lines;
});
const gapTipLines = computed(() => {
  const lines: string[] = [];
  if (jeonseGapSign.value) lines.push(jeonseGapSign.value.text);
  lines.push('보증보험 전세가율은 공동주택가로 셈한 추정값입니다.');
  lines.push('실거래 전세가율과 벌어질수록 시장과 공시가의 차가 크다는 뜻입니다.');
  return lines;
});

const areaText = (m2: number) => (m2 > 0 ? `${m2.toFixed(2)} / ${(m2 / PYEONG).toFixed(2)}` : '-');
const areaOptText = (opt: string) => {
  // 평대 묶음도 ㎡ / 평 으로 — '39.67~42.98㎡ / 12평대'
  if (opt.startsWith('py')) { const py = Number(opt.slice(2)); return `${(py * PYEONG).toFixed(2)}~${((py + 1) * PYEONG).toFixed(2)}㎡ / ${py}평대`; }
  const m2 = Number(opt);
  return m2 > 0 ? `${m2.toFixed(2)}㎡ / ${(m2 / PYEONG).toFixed(2)}평` : opt;
};
const kindClass = (k: string) => {
  if (k === '직거래' || k === '계약해제') return 'tt-off';
  return k === '전세' ? 'tt-jeon' : k === '월세' ? 'tt-wol' : 'tt-buy';
};
/** 시세로 쓰면 안 되는 줄 — 흐리게 적는다 */
const isOff = (k: string) => k === '직거래' || k === '계약해제';

// ===== 스냅샷 =====
// 그때 본 숫자를 그대로 남긴다. 표는 담지 않는다 — 기준 두 줄만 있으면 지표가 선다.
const snapOpen = ref(false);
const snapList = ref<CaseSnapshot[]>([]);
const snapBusy = ref(false);
const snapMsg = ref('');
/** 지금 열어 둔 스냅샷 — 덮어쓰기를 누를 때 쓴다 */
const snapId = ref('');

const canSave = computed(() => !!(price.value || recentSale.value || recentJeonse.value));
const snapTone = ref<'info' | 'success' | 'error'>('success');
/** 표 한 줄의 주소 — 시 · 구까지 붙여 그대로 검색창에 넣을 수 있게 */
const copyAddr = async (r: CaseTradeRow) => {
  const code = ovDistrictCode.value || region.value?.lawdCd5 || '';
  const sido = ovSido.value || REGION_GROUPS.find((g) => g.districts.some((x) => x.lawdCode === code))?.sido || region.value?.sido || '';
  const gu = (ovDistrictCode.value ? ovDistricts.value.find((x) => x.lawdCode === ovDistrictCode.value)?.label : region.value?.sigungu) || '';
  const text = [sido, gu, r.umdNm, r.jibun, r.name].filter(Boolean).join(' ');
  try { await navigator.clipboard.writeText(text); flash(`복사했습니다 — ${text}`); } catch { flash('복사하지 못했습니다.', 'error'); }
};
const flash = (text: string, tone: 'info' | 'success' | 'error' = 'success') => {
  snapTone.value = tone;
  snapMsg.value = text;
  window.setTimeout(() => { if (snapMsg.value === text) snapMsg.value = ''; }, 1800);
};

/** 저장해 둔 이름 — 덮어쓸 때 그대로 쓴다 */
const snapLabel = ref('');
/** 이름을 묻는 작은 창 */
const savePrompt = ref(false);
const saveName = ref('');
const defaultName = () => chipText.value || address.value.trim();
const askSave = () => {
  if (!canSave.value) { flash('저장할 내용이 없습니다 — 먼저 분석하세요.', 'error'); return; }
  saveName.value = snapLabel.value || defaultName();
  savePrompt.value = true;
};

const collectSnapshot = (): CaseSnapshot => ({
  uid: auth.uid ?? '',
  label: (snapLabel.value || defaultName()).trim(),
  memo: '',
  savedAt: Date.now(),
  address: address.value.trim(),
  kind: kind.value,
  years: years.value,
  spot: chipText.value,
  baseAreaM2: baseArea.value,
  price: price.value,
  rate: jeonseRate.value,
  sale: recentSale.value,
  jeonse: recentJeonse.value,
});

const snapErr = ref('');
const loadSnapList = async () => {
  snapErr.value = '';
  if (!auth.uid) { snapList.value = []; snapErr.value = '로그인한 뒤에 보입니다.'; return; }
  snapBusy.value = true;
  try {
    snapList.value = await listSnapshots(auth.uid);
  } catch (err) {
    // 까닭을 창에 남긴다 — 잠깐 떴다 사라지면 무엇이 잘못됐는지 알 수가 없다
    snapErr.value = err instanceof Error ? err.message : String(err);
    console.warn('[adminSnapshots] 목록 실패:', err);
  } finally {
    snapBusy.value = false;
  }
};
const openSnapPanel = async () => {
  snapOpen.value = true;
  await loadSnapList();
};

const saveSnap = async (overwrite = false) => {
  savePrompt.value = false;
  if (!auth.uid) { flash('로그인한 뒤에 저장됩니다.', 'error'); return; }
  if (!canSave.value) { flash('저장할 내용이 없습니다 — 먼저 분석하세요.', 'error'); return; }
  snapBusy.value = true;
  try {
    const body = collectSnapshot();
    if (overwrite && snapId.value) {
      await updateSnapshot(snapId.value, body);
      flash('덮어썼습니다.');
    } else {
      snapId.value = await addSnapshot(body);
      flash('저장했습니다.');
    }
    if (snapOpen.value) await loadSnapList();
  } catch (err) {
    flash(err instanceof Error ? err.message : String(err), 'error');
  } finally {
    snapBusy.value = false;
  }
};

/** 저장해 둔 값을 화면에 되돌린다 — 표는 '분석'을 눌러야 다시 찬다 */
const openSnap = (snap: CaseSnapshot) => {
  snapId.value = snap.id ?? '';
  snapLabel.value = snap.label ?? '';
  address.value = snap.address ?? '';
  kind.value = snap.kind ?? 'villa';
  years.value = snap.years ?? 10;
  baseArea.value = snap.baseAreaM2 ?? 0;
  price.value = snap.price ?? null;
  rateText.value = String(snap.rate ?? 126);
  restoredSale.value = snap.sale ?? null;
  restoredJeonse.value = snap.jeonse ?? null;
  restoredSpot.value = snap.spot ?? '';
  rows.value = [];
  scanned.value = 0;
  pickedSale.value = ''; pickedJeonse.value = '';
  areaFilter.value = ''; yearFilter.value = ''; tab.value = 'all';
  errorMsg.value = '';
  notice.value = '저장해 둔 값입니다 — 최신 자료로 보려면 분석을 누르세요.';
  snapOpen.value = false;
};

// ===== 웹 — 마지막으로 본 화면을 이 브라우저(IndexedDB)에 남겨, 다른 화면에 갔다 오거나 새로고침해도 그대로 (composables/useScreenSnapshot) =====
type ScreenSnap = {
  address: string; kind: CasePropertyType; years: number;
  region: ResolvedRegion | null; lot: string; ho: string; buildingDong: string;
  price: ApartPrice | null; rows: CaseTradeRow[]; dongRows?: CaseTradeRow[]; mode?: CaseMode;
  condF?: TradeRange; simF?: TradeRange;
  sim?: { sale: string; jeonse: string };
  scanned: number; missed: number; baseArea: number;
  areaFilter: string; areaNote: string; yearFilter: string; tab: 'all' | '매매' | '전세' | '월세';
  pickedSale: string; pickedJeonse: string; rateText: string;
  snapId: string; snapLabel: string; restoredSale: CaseTradeRow | null; restoredJeonse: CaseTradeRow | null; restoredSpot: string;
  notice: string; ovSido: string; ovDistrictCode: string; ovDong: string; ovLot: string;
};
const screen = useScreenSnapshot<ScreenSnap>('adm.case.snapshot.v1');
const screenChip = screen.chip;
let restoringScreen = false;
const collectScreen = (): ScreenSnap => ({
  address: address.value, kind: kind.value, years: years.value,
  region: region.value, lot: lot.value, ho: ho.value, buildingDong: buildingDong.value,
  price: price.value, rows: rows.value, dongRows: dongRows.value, mode: mode.value,
  condF: condF.value, simF: simF.value,
  sim: { sale: simSale.value, jeonse: simJeonse.value },
  scanned: scanned.value, missed: missed.value, baseArea: baseArea.value,
  areaFilter: areaFilter.value, areaNote: areaNote.value, yearFilter: yearFilter.value, tab: tab.value,
  pickedSale: pickedSale.value, pickedJeonse: pickedJeonse.value, rateText: rateText.value,
  snapId: snapId.value, snapLabel: snapLabel.value, restoredSale: restoredSale.value, restoredJeonse: restoredJeonse.value, restoredSpot: restoredSpot.value,
  notice: notice.value, ovSido: ovSido.value, ovDistrictCode: ovDistrictCode.value, ovDong: ovDong.value, ovLot: ovLot.value,
});
let screenTimer = 0;
const saveScreen = () => {
  if (!webEmbed || restoringScreen || props.preset) return;
  // 아무것도 안 본 빈 화면은 남기지 않는다 — 앞서 남긴 것을 지우지 않게
  if (!rows.value.length && !price.value && !restoredSale.value && !restoredJeonse.value) return;
  window.clearTimeout(screenTimer);
  screenTimer = window.setTimeout(() => { void screen.save(collectScreen()); }, 300);
};
// 분석 결과 · 고른 기준 줄 · 거르기가 바뀌면 남긴다
watch([rows, price, pickedSale, pickedJeonse, areaFilter, yearFilter, tab, rateText, restoredSale, restoredJeonse, mode, simSale, simJeonse, simF, condF], saveScreen, { deep: true });
// 물건이 준 주소 · 종류 — 바뀔 때마다 바로 조회
watch(() => props.preset && `${props.preset.address}|${props.preset.kind}`, (v) => {
  if (!v || !props.preset) return;
  address.value = props.preset.address; kind.value = props.preset.kind;
  void run();
}, { immediate: true });
onMounted(async () => {
  if (!webEmbed || props.preset) return;
  const s = await screen.restore();
  if (!s) return;
  restoringScreen = true;
  address.value = s.address ?? ''; kind.value = s.kind ?? 'villa'; years.value = webEmbed ? 4 : (s.years ?? 10);
  region.value = s.region ?? null; lot.value = s.lot ?? ''; ho.value = s.ho ?? ''; buildingDong.value = s.buildingDong ?? '';
  price.value = s.price ?? null; // 예전 저장본에 남은 계약해제 줄은 뺀다(없던 거래)
  rows.value = (s.rows ?? []).filter((r) => r.kind !== '계약해제'); dongRows.value = (s.dongRows ?? []).filter((r) => r.kind !== '계약해제'); mode.value = s.mode ?? MODES[0];
  if (s.condF) condF.value = s.condF;
  if (s.simF) simF.value = s.simF;
  if (s.sim) { simSale.value = s.sim.sale ?? ''; simJeonse.value = s.sim.jeonse ?? ''; }
  scanned.value = s.scanned ?? 0; missed.value = s.missed ?? 0; baseArea.value = s.baseArea ?? 0;
  ovSido.value = s.ovSido ?? ''; ovDistrictCode.value = s.ovDistrictCode ?? ''; ovDong.value = s.ovDong ?? ''; ovLot.value = s.ovLot ?? '';
  snapId.value = s.snapId ?? ''; snapLabel.value = s.snapLabel ?? '';
  restoredSale.value = s.restoredSale ?? null; restoredJeonse.value = s.restoredJeonse ?? null; restoredSpot.value = s.restoredSpot ?? '';
  rateText.value = s.rateText ?? rateText.value;
  lastRunAddress.value = (s.address ?? '').trim();
  areaFilter.value = s.areaFilter ?? ''; areaNote.value = s.areaNote ?? ''; yearFilter.value = s.yearFilter ?? ''; tab.value = s.tab ?? 'all';
  await nextTick();
  // 표를 다시 그린 뒤에 고른 줄을 되돌린다(표가 바뀌며 고른 것을 비우는 일이 있어도 덮는다)
  pickedSale.value = s.pickedSale ?? ''; pickedJeonse.value = s.pickedJeonse ?? '';
  notice.value = s.notice ?? '';
  await nextTick();
  restoringScreen = false;
  // 같은 동 거래가 없는 예전 저장본(4년 · 유사물건 이전) — 사람이 다시 누르지 않게 저절로 한 번 받는다
  if (address.value.trim() && (!s.dongRows?.length || s.years !== years.value)) void run();
});

/** 창에서 이름을 적고 저장 */
const confirmSave = async () => {
  snapLabel.value = saveName.value.trim() || defaultName();
  snapId.value = '';           // 새로 하나 남긴다
  await saveSnap(false);
};

const confirmBox = ref<ConfirmBox | null>(null);
const askDeleteSnap = (snap: CaseSnapshot) => {
  if (!snap.id) return;
  if (skipsToday('adminSnap.removeSkip')) { void deleteSnap(snap); return; }
  confirmBox.value = {
    title: '저장한 분석 지우기',
    desc: `${snap.label || snap.address}\n지우면 되돌릴 수 없습니다.`,
    okLabel: '지우기',
    skipKey: 'adminSnap.removeSkip',
    run: () => { void deleteSnap(snap); },
  };
};

const deleteSnap = async (snap: CaseSnapshot) => {
  if (!snap.id) return;
  snapBusy.value = true;
  try {
    await removeSnapshot(snap.id);
    if (snapId.value === snap.id) snapId.value = '';
    await loadSnapList();
    flash('지웠습니다.');
  } catch (err) {
    flash(err instanceof Error ? err.message : String(err), 'error');
  } finally {
    snapBusy.value = false;
  }
};

const snapWhen = (ms: number) => {
  if (!(ms > 0)) return '';
  const d = new Date(ms);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

const downloadCsv = () => {
  if (tableRows.value.length === 0) return;
  const head = ['구분', '계약일', '거래금액', '전용㎡', '전용평', '층', '읍면동', '지번', '단지명'];
  const body = tableRows.value.map((r) => [
    r.kind, r.contractDate, r.amount,
    r.areaM2.toFixed(2), (r.areaM2 / PYEONG).toFixed(2), r.floor, r.umdNm, r.jibun, r.name,
  ]);
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [head, ...body].map((l) => l.map(esc).join(',')).join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `경매지번_${spotChip.value.replace(/\s·\s/g, '_') || '실거래'}.csv`;
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
          <h1>경매지번 공동주택가 및 실거래가 <em>지번 · 단지</em></h1>
          <p>주소를 입력하여 공동주택가와 실거래가 데이터를 분석한다.</p>
        </div>
        <div class="adm-acts">
          <button type="button" class="adm-csv" :disabled="!canSave || snapBusy" @click="askSave">저장</button>
          <button v-if="snapId" type="button" class="adm-csv" :disabled="!canSave || snapBusy" @click="saveSnap(true)">덮어쓰기</button>
          <button type="button" class="adm-csv" @click="openSnapPanel">저장 목록</button>
          <button type="button" class="adm-csv" :disabled="tableRows.length === 0" @click="downloadCsv">엑셀 내려받기</button>
        </div>
      </div>
    </header>

    <div class="adm-body" @click="tip = ''">
      <!-- 주소 한 줄 -->
      <!-- 지역분석 › 경매지번 탭 안에 붙어 쓸 때는 이 줄을 지역분석의 고르는 줄 자리로 옮긴다 -->
      <Teleport v-if="!preset" defer to="#admTopBarSlot" :disabled="!inDong">
      <div class="adm-bar">
        <label class="adm-f grow">
          <small>주소 입력 <em>시·도부터 지번·호수까지</em></small>
          <input
            v-model="address"
            class="adm-input wide"
            placeholder="예) 인천광역시 서구 검암동 670-4 203호"
            @keyup.enter="run"
            @blur="webEmbed && address.trim() !== lastRunAddress && run()"
          />
        </label>
        <label class="adm-f">
          <small>종류</small>
          <div class="adm-seg">
            <button v-for="k in KINDS" :key="k.key" type="button" :class="['adm-seg-btn', { on: kind === k.key }]" @click="pickKind(k.key)">{{ k.label }}</button>
          </div>
        </label>
        <label v-if="!webEmbed" class="adm-f">
          <small>실거래 기간</small>
          <div class="adm-seg">
            <button v-for="y in YEARS" :key="y" type="button" :class="['adm-seg-btn', { on: years === y }]" @click="years = y">{{ y }}년</button>
          </div>
        </label>
        <!-- 웹 시세조사는 분석 단추가 없다 — 주소(Enter · 칸 벗어남) · 종류를 바꾸면 저절로 받는다 -->
        <span v-if="webEmbed && loading" class="adm-auto-load">받는 중…</span>
        <button v-if="!webEmbed" type="button" class="adm-load" :disabled="loading || !address.trim()" @click="run">
          {{ loading ? '분석 중…' : '분석' }}
        </button>
      </div>
      </Teleport>

      <!-- 웹 — 제목 줄부터 표까지 흰 상자 하나로 감싼다(.adm-case-card) -->
      <div class="adm-case-card">
      <!-- 손품분석 — 손품조사 카드 제목처럼 '시세조사'(아이콘) 아래에 실거래가 조사(아이콘 없음) -->
      <div v-if="preset" class="adm-sise-head"><svg class="adm-h-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><path d="M7.5 7.5h.01"/></svg>시세조사</div>
      <!-- 웹 — 지역분석의 탭 줄 자리: 왼쪽에 화면 이름 · 저장 단추, 오른쪽에 경로(#admCrumbSlot 로 웹 경로를 옮겨 온다) -->
      <div v-if="webEmbed" class="adm-list-head adm-tabs-top adm-case-row">
        <strong class="adm-case-title"><template v-if="!preset"><svg class="adm-h-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><path d="M7.5 7.5h.01"/></svg></template>실거래가 조사</strong>
        <SnapChip :chip="screenChip" />
        <div v-if="!inDong" id="admCrumbSlot" class="adm-crumb-slot" />
      </div>

      <div class="adm-print-only">
        <h2>경매지번 공동주택가 및 실거래가</h2>
      </div>

      <div class="adm-chip-row">
        <span v-if="chipText" class="adm-chip">{{ chipText }}</span>
        <span v-else class="adm-chip dim">주소를 적고 분석을 누르세요 — 국토부 호출 {{ callCount }}번 ({{ years }}년치 매매·전월세)</span>
        <span v-if="areaChip" class="adm-chip area" :class="{ off: !areaFilter }">{{ areaChip }}</span>
        <button type="button" class="adm-chip-btn" @click="manualOpen = !manualOpen">
          {{ manualOpen ? '직접 입력 닫기' : '직접 입력' }}
        </button>
      </div>

      <!-- 카카오가 틀렸을 때만 — 지역·지번을 손으로 고친다 -->
      <div v-if="manualOpen" class="adm-bar manual">
        <label class="adm-f">
          <small>시 · 도</small>
          <select v-model="ovSido" class="adm-input narrow">
            <option value="">주소대로</option>
            <option v-for="g in REGION_GROUPS" :key="g.sido" :value="g.sido">{{ g.sido }}</option>
          </select>
        </label>
        <label class="adm-f">
          <small>시 · 군 · 구</small>
          <select v-model="ovDistrictCode" class="adm-input narrow" :disabled="!ovSido">
            <option value="">주소대로</option>
            <option v-for="d in ovDistricts" :key="d.lawdCode" :value="d.lawdCode">{{ d.label }}</option>
          </select>
        </label>
        <label class="adm-f">
          <small>읍 · 면 · 동</small>
          <input v-model="ovDong" class="adm-input narrow" placeholder="주소대로" />
        </label>
        <label class="adm-f">
          <small>지번 <em>또는 비워 두기</em></small>
          <input v-model="ovLot" class="adm-input narrow" placeholder="주소대로" />
        </label>
        <button type="button" class="adm-load" :disabled="loading || !address.trim()" @click="run">다시 분석</button>
      </div>

      <p v-if="errorMsg" class="adm-msg err">{{ errorMsg }}</p>
      <p v-else-if="notice" class="adm-msg warn">{{ notice }}</p>
      <p v-if="areaNote" class="adm-msg warn">{{ areaNote }}</p>

      <template v-if="canSave">
        <!-- 세 칸 · 세 줄 한 판 — 기준 → 시세 → 추정 전세 → 실제 전세 순.
             맨 왼쪽은 공동주택가 하나(아래는 비움), 오른쪽 세 칸은 줄마다 가격 · 비율 · 평당가:
             매매(실거래가 · 공시대비율) / 보증보험 전세(전세가 · 전세가율/갭) / 실거래 전세(실거래가 · 전세가율/갭) -->
        <!-- 웹 — 손품조사 시세조사의 실거래가 조사와 같은 12칸: 매매 줄 · 전세 줄(전용면적 · 거래일자/층 · 실거래가 · 평당가) · 공시 줄 -->
        <!-- 손품조사 실거래가 조사와 같은 짜임 — 작은 제목 아래 '경매지번 실거래가' 묶음 상자 하나에 12칸 -->
        <section v-if="webEmbed" class="adm-case-block">
          <div class="adm-case-block-head">
            <span>{{ preset ? '① ' : '' }}{{ mode === MODES[0] ? '경매지번' : '유사물건' }} 실거래가<em>(매매·전세)</em></span>
            <!-- 경매물건 / 유사물건 — 손품조사 실거래가 조사의 알약 두 개와 같다. 둘 중 하나를 쓴다 -->
            <span class="adm-mode-pills">
              <button v-for="m in MODES" :key="m" type="button" :class="['adm-mode-pill', { on: mode === m }]" :aria-pressed="mode === m" @click="mode = m; tab = 'all'; areaFilter = ''; yearFilter = ''; colFilter.clearAll()">{{ m }}</button>
            </span>
          </div>
          <div v-for="g in tradeLines" :key="g.key" :class="['adm-kpis grid4 case12', g.row ? `on-${g.key}` : '']">
            <div class="adm-kpi">
              <small>{{ g.label }} 실거래가</small>
              <!-- 고르기 전에는 금액 자리에 안내를 — 줄 수가 같아 칸 높이가 흔들리지 않는다 -->
              <strong v-if="g.row"><UnitText :text="won(g.row.price)" suffix="원" /></strong>
              <strong v-else class="ask">{{ mode === MODES[0] ? `이 건물 ${g.label} 거래 없음` : `리스트에서 ${g.label}를 선택하세요` }}</strong>
            </div>
            <div class="adm-kpi">
              <small>{{ g.label }} 평당가</small><strong><UnitText :text="won(perPyeong(g.row))" suffix="원" /></strong>
            </div>
            <div class="adm-kpi">
              <small>전용면적</small><strong><UnitText :text="tradeArea(g.row)" /></strong>
            </div>
            <div class="adm-kpi">
              <small>거래일자 / 층</small><strong><UnitText :text="tradeWhen(g.row)" /></strong>
            </div>
          </div>
          <div class="adm-kpis grid4 case12">
            <div class="adm-kpi green">
              <small><InfoTip :rows="pubTip" under="box">공동주택가</InfoTip><em v-if="price">{{ price.year }}.01.01 기준</em></small>
              <strong><UnitText :text="won(pubValue)" suffix="원" /></strong>
            </div>
            <div class="adm-kpi">
              <small><InfoTip :rows="jeonseRateTip(jeonseRate)" under="box">전세가</InfoTip><em><input v-model="rateText" class="adm-rate-input" inputmode="numeric" placeholder="126" />%</em></small>
              <strong><UnitText :text="won(jeonsePrice)" suffix="원" /></strong>
            </div>
            <div class="adm-kpi">
              <small><InfoTip :rows="JEONSE_RATIO_TIP" under="box">전세가율 / 갭</InfoTip></small>
              <strong><UnitText :text="jeonseRatioText" /><em v-if="gapText" class="adm-gap"> / <UnitText :text="gapText" suffix="원" /></em></strong>
            </div>
            <div class="adm-kpi">
              <small><InfoTip :rows="PUB_RATIO_TIP" under="box" align="end">공시대비율</InfoTip></small>
              <strong><UnitText :text="pubRatioText" /></strong>
            </div>
          </div>
        </section>
        <div v-else class="adm-kpis grid4 case-grid">
          <div class="adm-kpi green">
            <small>
              공동주택가
              <em v-if="price">{{ price.year }}.01.01 기준</em>
              <template v-if="price && priceUnit"><i class="adm-bar2">|</i><em>{{ priceUnit }}</em></template>
            </small>
            <strong><UnitText :text="won(pubValue)" suffix="원" /></strong>
          </div>

          <div class="adm-kpi">
            <small>보증보험 전세가 <em><input v-model="rateText" class="adm-rate-input" inputmode="numeric" placeholder="126" />%</em></small>
            <strong><UnitText :text="won(jeonsePrice)" suffix="원" /></strong>
            <span class="adm-kpi-sub">공동주택가 × {{ jeonseRate }}%</span>
          </div>
          <div class="adm-kpi tipbox">
            <small>
              보증보험 전세가율 / 갭
              <button
                v-if="jeonseGapSign"
                type="button"
                :class="['adm-tip-btn', jeonseGapSign.tone]"
                aria-label="뜻풀이"
                @mouseenter="tipEnter('gap')"
                @mouseleave="tipLeave()"
                @click.stop="toggleTip('gap')"
              >!</button>
            </small>
            <strong><UnitText :text="jeonseRatioText" /><em v-if="gapText" class="adm-gap"> / <UnitText :text="gapText" suffix="원" /></em></strong>
            <span class="adm-kpi-sub">보증보험 전세가 ÷ 매매 실거래가</span>
            <div
              v-if="tip === 'gap'"
              class="adm-tip"
              @mouseenter="tipEnter('gap')"
              @mouseleave="tipLeave()"
              @click.stop
            >
              <p v-for="(t, i) in gapTipLines" :key="i">{{ t }}</p>
            </div>
          </div>

          <div class="adm-kpi"><small>전세 실거래가 <span v-if="recentJeonse" class="adm-kpi-from pick">선택</span> <em v-if="recentJeonse">{{ rowFace(recentJeonse) }}</em></small><strong><UnitText :text="won(jeonsePriceReal)" suffix="원" /></strong><span v-if="!recentJeonse" class="adm-kpi-sub ask">리스트에서 실거래를 선택하세요</span><span v-if="jeonseVsPubText" class="adm-kpi-sub">{{ jeonseVsPubText }}</span></div>
          <div class="adm-kpi tipbox">
            <small>
              실거래 전세가율 / 갭
              <button
                v-if="realRatioSign"
                type="button"
                :class="['adm-tip-btn', realRatioSign.tone]"
                aria-label="뜻풀이"
                @mouseenter="tipEnter('real')"
                @mouseleave="tipLeave()"
                @click.stop="toggleTip('real')"
              >!</button>
            </small>
            <strong :class="{ over: realRatioNum > 100 }">
              <UnitText :text="realJeonseRatioText" /><em v-if="realGapText" :class="['adm-gap', { neg: realGapValue < 0 }]"> / <UnitText :text="realGapText" suffix="원" /></em>
            </strong>
            <span class="adm-kpi-sub">전세 실거래가 ÷ 매매 실거래가</span>
            <div
              v-if="tip === 'real'"
              class="adm-tip"
              @mouseenter="tipEnter('real')"
              @mouseleave="tipLeave()"
              @click.stop
            >
              <p v-for="(t, i) in realTipLines" :key="i">{{ t }}</p>
            </div>
          </div>

          <div class="adm-kpi"><small>매매 실거래가 <span v-if="recentSale" class="adm-kpi-from pick">선택</span> <em v-if="recentSale">{{ rowFace(recentSale) }}</em></small><strong><UnitText :text="won(recentPrice)" suffix="원" /></strong><span v-if="!recentSale" class="adm-kpi-sub ask">리스트에서 실거래를 선택하세요</span></div>
          <div class="adm-kpi">
            <small>공시대비율</small>
            <strong><UnitText :text="pubRatioText" /></strong>
            <span class="adm-kpi-sub">매매 실거래가 ÷ 공동주택가</span>
          </div>
        </div>

        <!-- 탭 · 거르기 — 웹은 ① 실거래가 조사 상자의 아랫부분(.adm-case-tail)으로 이어 붙는다 -->
        <template v-if="rows.length > 0 || (webEmbed && dongRows.length > 0)">
        <div class="adm-case-tail">
        <!-- 웹 — 가격정보 경매지번 표와 같은 두 줄: 위 전체 · 매매 · 전세 · 월세(상자 끝까지), 아래 면적 · 거래년도 · 초기화 -->
        <div :class="['adm-tabs', { 'two-row': webEmbed }]">
          <button :class="['adm-tab', 't-all', { on: tab === 'all' }]" @click="tab = 'all'">전체 ({{ counts.all }})</button>
          <button :class="['adm-tab', 't-buy', { on: tab === '매매' }]" @click="tab = '매매'">매매 ({{ counts.매매 }})</button>
          <button :class="['adm-tab', 't-jeon', { on: tab === '전세' }]" @click="tab = '전세'">전세 ({{ counts.전세 }})</button>
          <button :class="['adm-tab', 't-wol', { on: tab === '월세' }]" @click="tab = '월세'">월세 ({{ counts.월세 }})</button>
          <span v-if="!webEmbed" class="adm-tab-fill" />
          <button v-if="!webEmbed && colFilter.activeCount.value > 0" type="button" class="adm-flt-clear" @click="colFilter.clearAll()">
            걸러내기 {{ colFilter.activeCount.value }}칸 해제
          </button>
          <!-- 웹은 초기화가 고른 줄까지 푼다 — 선택 풀기는 앱 관리자 화면에만 -->
          <button v-if="!webEmbed && (pickedSale || pickedJeonse)" type="button" class="adm-ghost pick" @click="clearPicks">선택 풀기</button>
          <template v-if="!webEmbed">
            <select v-model="areaFilter" class="adm-input narrow">
              <option value="">전체면적(㎡/평)</option>
              <option v-for="o in areaOptions" :key="o" :value="o">{{ areaOptText(o) }}</option>
            </select>
            <select v-model="yearFilter" class="adm-input narrow">
              <option value="">거래년도</option>
              <option v-for="o in yearOptions" :key="o" :value="o">{{ o }}</option>
            </select>
            <button type="button" class="adm-ghost" @click="resetFilters">초기화</button>
          </template>
        </div>
        <!-- 유사물건 — 예전 가격정보 조건분석과 같은 거르기 칸(기간선택 · 시작~종료일자 · 면적 · 건축년도) -->
        <TradeRangeFilter v-if="webEmbed && mode === MODES[1]" v-model="simF" class="adm-trf">
          <button type="button" class="adm-ghost" @click="resetFilters">초기화</button>
        </TradeRangeFilter>
        <div v-else-if="webEmbed" class="adm-sel-row">
          <select v-model="areaFilter" class="adm-input">
            <option value="">전체면적(㎡/평)</option>
            <option v-for="o in areaOptions" :key="o" :value="o">{{ areaOptText(o) }}</option>
          </select>
          <select v-model="yearFilter" class="adm-input">
            <option value="">거래년도</option>
            <option v-for="o in yearOptions" :key="o" :value="o">{{ o }}</option>
          </select>
          <button v-if="colFilter.activeCount.value > 0" type="button" class="adm-flt-clear" @click="colFilter.clearAll()">걸러내기 {{ colFilter.activeCount.value }}칸 해제</button>
          <button type="button" class="adm-ghost" @click="resetFilters">초기화</button>
        </div>

        <div class="adm-sum under">
          <span v-if="webEmbed && mode === MODES[1]">
            최근 {{ years }}년 · {{ region?.dong || '같은 동' }} {{ dongRows.length.toLocaleString('ko-KR') }}건 중 조건 {{ byAreaYear.length.toLocaleString('ko-KR') }}건
          </span>
          <span v-else>
            최근 {{ years }}년 · 이 지번 {{ rows.length.toLocaleString('ko-KR') }}건<template v-if="areaFilter"> 중 전용 {{ areaFilter }}㎡ {{ byAreaYear.length.toLocaleString('ko-KR') }}건</template>
          </span>
          <span class="dim">시군구 전체 {{ scanned.toLocaleString('ko-KR') }}건에서 추림</span>
          <span v-if="missed > 0" class="dim">{{ missed }}개월치 못 받음</span>
        </div>

        <div class="adm-table-wrap">
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
                    >
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" /></svg>
                    </button>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(r, i) in tableRows.slice(0, 300)"
                :key="`${r.contractDate}-${r.floor}-${i}`"
                :class="{ off: isOff(r.kind), picked: isPicked(r), 'picked-sale': webEmbed ? rowKey(r) === saleKeyNow : rowKey(r) === pickedSale, 'picked-jeonse': webEmbed ? rowKey(r) === jeonseKeyNow : rowKey(r) === pickedJeonse }"
                @click="pickRow(r)"
              >
                <td><span :class="['kind', kindClass(r.kind)]">{{ r.kind }}</span></td>
                <td>{{ r.contractDate }}</td>
                <td class="n strong amt"><span class="v">{{ r.amount }}</span></td>
                <td class="n area"><span class="v">{{ areaText(r.areaM2) }}</span></td>
                <td class="n build">{{ r.buildYear || '-' }}</td>
                <td class="n floor"><span class="v">{{ r.floor || '-' }}</span></td>
                <td class="addr">
                  <span class="addr-in">
                    <span class="addr-t">{{ [r.umdNm, r.jibun, r.name].filter(Boolean).join(' ') }}</span>
                    <button type="button" class="adm-copy" aria-label="주소 복사" title="주소 복사" @click.stop="copyAddr(r)">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                    </button>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="tableRows.length > 300" class="adm-foot">앞의 300줄만 보여 줍니다 — 전체 {{ tableRows.length.toLocaleString('ko-KR') }}줄은 엑셀로 내려받으세요.</p>
        <p v-else-if="tableRows.length === 0" class="adm-foot">{{ countLabel }} 데이터 없음</p>
        </div>
        </template>
        <!-- ② 실거래가 조건분석 그룹 — 자기 조건(면적 · 건축년도 · 계약일)과 그 조건의 같은 동 매매 리스트. ① 고르기와 필터를 같이 쓰지 않는다 -->
        <section v-if="webEmbed && dongRows.length > 0" class="adm-case-block cond">
          <div class="adm-case-block-head"><span>{{ preset ? '② ' : '' }}실거래가 조건분석<em>(같은 동 · 조건 평균)</em></span></div>
          <div class="adm-kpis grid4 case12">
            <div class="adm-kpi"><small>전용면적범위</small><strong class="rng two"><template v-if="condAreaPair"><span><UnitText :text="condAreaPair[0]" /> ~</span><span><UnitText :text="condAreaPair[1]" /></span></template><template v-else>-</template></strong></div>
            <div class="adm-kpi"><small>거래기간</small><strong class="rng"><UnitText :text="condPeriodText" /></strong></div>
            <div class="adm-kpi"><small>사용승인</small><strong class="rng"><UnitText :text="condApprovalText" /></strong></div>
            <div class="adm-kpi">
              <small><InfoTip :rows="condTip" under="box" align="end">국토부 실거래 평균</InfoTip></small>
              <strong v-if="condAvg > 0"><UnitText :text="won(condAvg)" suffix="원" /></strong>
              <strong v-else class="ask">조건에 맞는 매매 없음</strong>
            </div>
          </div>
          <TradeRangeFilter v-model="condF" :month-choices="[3, 6, 12]" class="adm-trf">
            <button type="button" class="adm-ghost" @click="resetCond">초기화</button>
          </TradeRangeFilter>
          <div class="adm-sum under">
            <span>{{ region?.dong || '같은 동' }} 매매 {{ condSales.length.toLocaleString('ko-KR') }}건 = 정상거래 {{ condSales.filter((r) => r.kind === '매매').length.toLocaleString('ko-KR') }}건 + 직거래 {{ condSales.filter((r) => r.kind === '직거래').length.toLocaleString('ko-KR') }}건 · 계약해제 제외</span>
          </div>
          <div class="adm-table-wrap">
            <table class="adm-table">
              <thead>
                <tr>
                  <th v-for="c in COLS" :key="c.key">
                    <span class="th-in">
                      {{ c.label }}
                      <button
                        v-if="c.key !== 'place'"
                        type="button"
                        class="adm-flt"
                        :class="{ on: condColFilter.isActive(c.key), open: condColFilter.openKey.value === c.key }"
                        :aria-label="`${c.label} 걸러내기`"
                        @click.stop="condColFilter.open(c.key, $event)"
                      >
                        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" /></svg>
                      </button>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(r, i) in condSales.slice(0, 300)" :key="`c-${r.contractDate}-${r.floor}-${i}`">
                  <td><span :class="['kind', kindClass(r.kind)]">{{ r.kind }}</span></td>
                  <td>{{ r.contractDate }}</td>
                  <td class="n strong amt"><span class="v">{{ r.amount }}</span></td>
                  <td class="n area"><span class="v">{{ areaText(r.areaM2) }}</span></td>
                  <td class="n build">{{ r.buildYear || '-' }}</td>
                  <td class="n floor"><span class="v">{{ r.floor || '-' }}</span></td>
                  <td class="addr">
                    <span class="addr-in">
                      <span class="addr-t">{{ [r.umdNm, r.jibun, r.name].filter(Boolean).join(' ') }}</span>
                      <button type="button" class="adm-copy" aria-label="주소 복사" title="주소 복사" @click.stop="copyAddr(r)">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                      </button>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="condSales.length > 300" class="adm-foot">앞의 300줄만 보여 줍니다 — 평균은 {{ condSales.length.toLocaleString('ko-KR') }}건 전체로 계산합니다.</p>
        </section>
      </template>
      </div>
    </div>

    <ColumnFilterPanel :ctl="colFilter" />
    <ColumnFilterPanel :ctl="condColFilter" />
    <AppToast :visible="!!snapMsg" :text="snapMsg" :tone="snapTone" />
    <AppConfirm :box="confirmBox" @close="confirmBox = null" />

    <Teleport to="body">
      <div v-if="savePrompt" class="adm-snap-veil" @click="savePrompt = false"></div>
      <div v-if="savePrompt" class="adm-save-ask" @click.stop>
        <strong>저장 이름</strong>
        <input
          v-model="saveName"
          class="adm-input"
          placeholder="이름 (비우면 주소로)"
          @keyup.enter="confirmSave"
        />
        <div class="acts">
          <button type="button" class="ghost" @click="savePrompt = false">취소</button>
          <button type="button" class="go" :disabled="snapBusy" @click="confirmSave">저장</button>
        </div>
      </div>

      <div v-if="snapOpen" class="adm-snap-veil" @click="snapOpen = false"></div>
      <div v-if="snapOpen" class="adm-snap-panel" @click.stop>
        <header>
          <strong>저장 목록</strong>
          <span>{{ snapList.length }}건</span>
          <button type="button" @click="snapOpen = false">닫기</button>
        </header>
        <p v-if="snapErr" class="adm-snap-empty err">{{ snapErr }}</p>
        <p v-else-if="snapBusy" class="adm-snap-empty">불러오는 중…</p>
        <p v-else-if="snapList.length === 0" class="adm-snap-empty">저장해 둔 분석이 없습니다.</p>
        <ul v-else>
          <li v-for="snap in snapList" :key="snap.id">
            <button type="button" class="pick" @click="openSnap(snap)">
              <b>{{ snap.label || snap.address }}</b>
              <span>{{ snap.spot }}</span>
              <em>{{ snapWhen(snap.savedAt) }} · 최근 {{ snap.years }}년<template v-if="snap.memo"> · {{ snap.memo }}</template></em>
            </button>
            <button type="button" class="del" aria-label="지우기" @click="askDeleteSnap(snap)">×</button>
          </li>
        </ul>
      </div>
    </Teleport>
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
.adm-acts { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.adm-acts .adm-csv { margin-left: 0; }
.adm-print-only { display: none; }
.adm-print-only h2 { margin: 0 0 4px; font-size: 16px; font-weight: 800; }
.adm-print-only p { margin: 0 0 8px; font-size: 12px; color: #374151; }

.adm-body { flex: 1 1 auto; width: 100%; max-width: 1680px; margin: 0 auto; padding: 24px 28px 60px; }
.adm-bar { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; background: #fff; border: 1px solid #e8ecf3; border-radius: 14px; padding: 16px 18px; }
.adm-bar.manual { margin-top: 10px; background: #fbfcff; border-style: dashed; }
.adm-f { display: flex; flex-direction: column; gap: 6px; }
.adm-f.grow { flex: 1 1 auto; }
.adm-f small { font-size: 11px; font-weight: 700; color: #6b7280; display: flex; align-items: baseline; gap: 4px; }
.adm-f small em { font-style: normal; color: #aeb8ca; font-weight: 600; }
.adm-input { width: 240px; box-sizing: border-box; height: 36px; border: 1px solid #dde3ee; border-radius: 9px; background: #fff; padding: 0 11px; font-family: inherit; font-size: 13.5px; color: #111827; }
.adm-input.narrow { width: 160px; }
.adm-input.wide { width: 100%; min-width: 320px; }
.adm-input:focus { outline: none; border-color: #2b6df3; }
.adm-seg { display: inline-flex; gap: 4px; background: #f3f5f9; border-radius: 9px; padding: 3px; }
.adm-seg-btn { border: none; background: transparent; border-radius: 7px; padding: 7px 13px; font-family: inherit; font-size: 12.5px; font-weight: 700; color: #6b7280; cursor: pointer; white-space: nowrap; }
.adm-seg-btn.on { background: #fff; color: #1f3a72; box-shadow: 0 1px 3px rgba(17,24,39,0.1); }
.adm-load { height: 36px; padding: 0 20px; border: none; border-radius: 9px; background: #1f3a72; color: #fff; font-family: inherit; font-size: 13px; font-weight: 800; cursor: pointer; }
.adm-load:hover { background: #16305f; }
.adm-load:disabled { background: #aeb8ca; cursor: default; }
.adm-ghost { border: 1px solid #dde3ee; background: #fff; border-radius: 9px; height: 36px; padding: 0 16px; font-family: inherit; font-size: 12.5px; font-weight: 700; color: #374151; cursor: pointer; }
.adm-ghost:hover { border-color: #b9cdf7; color: #2b6df3; }

/* 아래 칸들과 너무 붙어 있어 한 칸 띄운다 */
.adm-chip-row { margin: 12px 2px 20px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.adm-chip { background: #eef3ff; border-radius: 999px; padding: 5px 12px; font-size: 12px; font-weight: 700; color: #1f3a72; }
.adm-chip.dim { background: #f3f5f9; color: #9ca3af; font-weight: 600; }
.adm-chip.area { background: #f1fbf7; color: #0f7a5e; }
/* 공부상 평형이 아닌 것을 보고 있을 때 — 눈에 띄게 둔다 */
.adm-chip.area.off { background: #fff4e5; color: #9a5b00; }
.adm-chip-btn { border: 1px solid #dde3ee; border-radius: 999px; background: #fff; padding: 5px 11px; font-family: inherit; font-size: 11.5px; font-weight: 700; color: #6b7280; cursor: pointer; }
.adm-chip-btn:hover { border-color: #b9cdf7; color: #2b6df3; }

.adm-msg { margin: 14px 0 0; padding: 11px 14px; border-radius: 10px; font-size: 12.5px; font-weight: 600; }
.adm-msg.err { background: #fdecea; color: #c0392b; }
.adm-msg.warn { background: #fff8e8; color: #8a6400; }

.adm-sum { margin: 18px 0 12px; padding-left: 2px; display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; font-size: 12.5px; color: #6b7280; }
.adm-sum strong { font-size: 15px; font-weight: 800; color: #111827; }
.adm-sum .dim { color: #9ca3af; }
/* 표 바로 위 — 이 표가 어느 자료에서 나왔는지.
   '전체' 알약의 글자 시작선에 맞춘다 (테두리 1 + 안여백 14) */
.adm-sum.under { margin: 0 0 8px; padding-left: 15px; font-size: 12px; }

.adm-kpis { display: grid; gap: 12px; }
/* 세 줄이 같은 네 칸 틀을 쓴다 — 줄이 달라도 세로로 맞아떨어진다 */
.adm-kpis.grid4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.adm-kpis.grid4.nextrow { margin-top: 12px; }
/* 웹 12칸 — 네 칸 세 줄, 줄 사이 12 */
.adm-kpis.case12 + .adm-kpis.case12 { margin-top: 12px; }
.adm-kpis.case12 .adm-kpi strong { line-height: 28px; }
/* 칸 이름 — 11.5 는 작아 보였다 */
.adm-kpis.case12 .adm-kpi small { font-size: 13px; }
.adm-kpis.case12 .adm-kpi strong.ask { font-size: 14px; font-weight: 600; letter-spacing: 0; color: #2b6df3; }
/* 말풍선(InfoTip under=box)이 칸 바로 아래에 뜨도록 칸을 기준 상자로 */
.adm-kpis.case12 .adm-kpi { position: relative; }
.adm-kpis.case12 .adm-kpi.green .adm-kpi-sub { padding-left: 0; }
/* 경매지번 실거래가 묶음 — 손품조사 .adp-mkt-block 처럼 얇은 테두리 상자, 맨 위에 이름 */
.adm-case-block { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px 16px; background: #fff; }
.adm-case-block-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 12px; font-size: 15px; font-weight: 800; color: #111827; }
.adm-case-block.cond { margin-top: 16px; }
/* 제목 앞 아이콘 — 손품조사 카드 제목 아이콘과 같은 크기 · 색 */
.adm-sise-head { display: flex; align-items: center; padding: 14px 4px 4px; font-size: 16px; font-weight: 800; color: #111827; }
.adm-h-ico { flex: none; margin-right: 6px; vertical-align: -2px; color: #2b6df3; }
.adm-case-block.cond .cond-bar { margin: 16px 0 10px; }
/* 범위 글은 길어 한 단계 작게 */
.adm-kpis.case12 .adm-kpi strong.rng { font-size: 16px; }
.adm-kpis.case12 .adm-kpi strong.rng.two { display: flex; flex-direction: column; line-height: 24px; }
/* 경매물건 / 유사물건 알약 — 고른 쪽만 파랗게 */
.adm-mode-pills { display: inline-flex; gap: 6px; }
.adm-mode-pill { height: 30px; padding: 0 14px; border: 1px solid #dde3ee; border-radius: 999px; background: #fff; font-family: inherit; font-size: 13px; font-weight: 700; color: #6b7280; cursor: pointer; }
.adm-mode-pill.on { border-color: #2b6df3; background: #eef3ff; color: #2b6df3; }
/* 유사물건 조건 — 시작 ~ 끝 */
.adm-rng { display: inline-flex; align-items: center; gap: 4px; height: 40px; padding: 0 10px; border: 1px solid #dde3ee; border-radius: 8px; background: #fff; font-size: 13px; color: #9aa3b2; box-sizing: border-box; }
.adm-rng small { font-size: 13px; font-weight: 700; color: #374151; margin-right: 4px; }
.adm-rng-in { width: 52px; height: 28px; border: 1px solid #e3e8f0; border-radius: 6px; padding: 0 6px; font-family: inherit; font-size: 13px; color: #111827; text-align: right; box-sizing: border-box; }
.adm-rng-in.date { width: 128px; text-align: left; }
.adm-rng-in:focus { outline: none; border-color: #2b6df3; }
/* 주소 칸 — 글은 왼쪽, 복사 단추는 칸 끝 */
.adm-auto-load { align-self: center; font-size: 13px; color: #6b7280; white-space: nowrap; }
.addr-in { display: flex; align-items: center; gap: 8px; }
.addr-t { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.adm-copy { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 22px; padding: 0; border: 1px solid #dde3ee; border-radius: 6px; background: #fff; color: #6b7280; cursor: pointer; }
.adm-copy:hover { border-color: #2b6df3; color: #2b6df3; }
.adm-case-block-head em { font-style: normal; font-size: 13px; font-weight: 400; color: #6b7280; margin-left: 2px; }
/* 세 칸으로 판 폭을 다 쓴다 — 오른쪽 끝을 아래 표 끝선에 */
.adm-kpis.case-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: auto auto auto; }
/* 상자 차례(템플릿): 1 공동주택가 · 2 보증보험 전세가 · 3 보증보험 전세가율/갭 · 4 전세 실거래가 · 5 실거래 전세가율/갭 · 6 매매 실거래가 · 7 공시대비율
   1열은 공시 · 매매(그 아래 공시대비율 = 매매 ÷ 공시), 2열은 전세가(추정 위 · 실제 아래), 3열은 전세가율/갭(추정 위 · 실제 아래) */
.adm-kpis.case-grid > :nth-child(1) { grid-column: 1; grid-row: 1; }  /* 공동주택가 */
.adm-kpis.case-grid > :nth-child(2) { grid-column: 2; grid-row: 1; }  /* 보증보험 전세가 */
.adm-kpis.case-grid > :nth-child(3) { grid-column: 3; grid-row: 1; }  /* 보증보험 전세가율 / 갭 */
.adm-kpis.case-grid > :nth-child(6) { grid-column: 1; grid-row: 2; }  /* 매매 실거래가 */
.adm-kpis.case-grid > :nth-child(4) { grid-column: 2; grid-row: 2; }  /* 전세 실거래가 */
.adm-kpis.case-grid > :nth-child(5) { grid-column: 3; grid-row: 2; }  /* 실거래 전세가율 / 갭 */
.adm-kpis.case-grid > :nth-child(7) { grid-column: 1; grid-row: 3; }  /* 공시대비율 */

.adm-kpi { background: #fff; border: 1px solid #e8ecf3; border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; }
.adm-kpi small { font-size: 11.5px; font-weight: 700; color: #6b7280; display: flex; align-items: baseline; gap: 4px; }
.adm-kpi small em { font-style: normal; color: #2b6df3; }
/* 제목 줄에서 두 가지를 가르는 막대 */
.adm-kpi small .adm-bar2 { font-style: normal; color: #c3cbd8; margin: 0 2px; }
/* 제목 줄이 길어져도 칸을 넘지 않게 — 넘치면 줄을 내린다 */
.adm-kpi small { flex-wrap: wrap; row-gap: 2px; }
.adm-kpi strong { font-size: 20px; font-weight: 800; letter-spacing: -0.4px; }
.adm-kpi.blue { background: #f4f8ff; border-color: #dbe6ff; }
.adm-kpi.green { background: #f1fbf7; border-color: #cdeee1; }
.adm-kpi.green2 { background: #f1fbf7; border-color: #cdeee1; }
.adm-kpi-sub { font-size: 11.5px; font-weight: 700; color: #6b7280; }
/* 아직 고르지 않았을 때 — 무엇을 해야 하는지 파랗게 적는다 */
.adm-kpi-sub.ask { color: #2b6df3; }
/* 호수·전용 줄을 입력칸 글자 시작점에 맞춘다 (테두리 1 + 안여백 9) */
.adm-kpi.green .adm-kpi-sub { padding-left: 10px; color: #2b6df3; }
.adm-kpi-input {
  width: 100%; box-sizing: border-box; height: 30px;
  border: 1px solid #dde3ee; border-radius: 8px; background: #fff; padding: 0 9px;
  font-family: inherit; font-size: 19px; font-weight: 800; letter-spacing: -0.4px; color: #111827;
}
.adm-kpi-input:focus { outline: none; border-color: #2b6df3; }
.adm-rate-input {
  width: 34px; border: 1px solid #dde3ee; border-radius: 5px; background: #fff;
  padding: 1px 3px; font-family: inherit; font-size: 11px; font-weight: 700; color: #2b6df3; text-align: right;
}
.adm-rate-input:focus { outline: none; border-color: #2b6df3; }
.adm-gap { font-style: normal; font-size: 13px; font-weight: 700; color: #6b7280; }
/* 전세가 매매를 넘어선 자리 — 숫자부터 붉게 해 위험을 바로 알린다 */
.adm-gap.neg { color: #d0342c; }
.adm-kpi strong.over { color: #d0342c; }
/* 뜻풀이는 말풍선으로 — 칸에는 값과 공식만 둔다 */
.adm-kpi.tipbox { position: relative; }
.adm-tip-btn {
  width: 15px; height: 15px; padding: 0; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid currentColor; background: #fff;
  font-family: inherit; font-size: 10px; font-weight: 800; line-height: 1; cursor: pointer;
}
.adm-tip-btn.bad { color: #d0342c; background: #fdecea; }
.adm-tip-btn.warn { color: #b4740f; background: #fff6e8; }
.adm-tip-btn.ok { color: #6b7280; background: #f3f5f9; }
.adm-tip-btn.low { color: #2b6df3; background: #eef3ff; }
.adm-tip {
  position: absolute; z-index: 40; left: 12px; right: 12px; top: 100%;
  background: #1f2937; color: #f3f4f6; border-radius: 10px; padding: 9px 11px;
  box-shadow: 0 10px 24px rgba(17, 24, 39, 0.22);
}
.adm-tip p { margin: 0 0 4px; font-size: 11.5px; font-weight: 600; line-height: 1.5; }
.adm-tip p:last-child { margin-bottom: 0; }

.adm-tabs { margin: 16px 0 10px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.adm-tab { border: 1px solid #e3e8f0; background: #fff; border-radius: 999px; padding: 7px 14px; font-family: inherit; font-size: 12.5px; font-weight: 700; color: #6b7280; cursor: pointer; }
.adm-tab.on { border-color: #1f3a72; background: #1f3a72; color: #fff; }
.adm-tab.t-buy.on { border-color: #2b6df3; background: #2b6df3; }
.adm-tab.t-jeon.on { border-color: #0f9d7a; background: #0f9d7a; }
.adm-tab.t-wol.on { border-color: #e08a1e; background: #e08a1e; }
.adm-tab-fill { flex: 1 1 auto; }

.adm-table-wrap { background: #fff; border: 1px solid #e8ecf3; border-radius: 14px; overflow: hidden; }
.adm-table { width: 100%; border-collapse: collapse; }
.adm-table th, .adm-table td { border-bottom: 1px solid #eef1f6; border-right: 1px solid #eef1f6; padding: 9px 12px; font-size: 12.5px; text-align: center; white-space: nowrap; }
.adm-table th:last-child, .adm-table td:last-child { border-right: none; }
.adm-table thead th { background: #f7f9fc; color: #374151; font-weight: 700; }
.adm-table tbody tr:last-child td { border-bottom: none; }
.adm-table tbody tr:hover td { background: #fafbfe; }
.adm-table td.n { font-variant-numeric: tabular-nums; }
.adm-table td.n.strong { font-weight: 800; }
.adm-table td.addr { text-align: left; color: #6b7280; }
/* 줄끼리 끝자리를 맞춘다 — 값을 같은 폭 상자에 담아 오른쪽에 붙인다 */
.adm-table td .v { display: inline-block; text-align: right; }
.adm-table td.amt .v { min-width: 150px; }
.adm-table td.area .v { min-width: 92px; }
.adm-table td.floor .v { min-width: 24px; }
.kind { display: inline-block; border-radius: 999px; padding: 3px 9px; font-size: 11px; font-weight: 800; }
.kind.tt-buy { background: #eaf1ff; color: #2b6df3; }
.kind.tt-jeon { background: #e8f7f1; color: #0f9d7a; }
.kind.tt-wol { background: #fff3e2; color: #b4740f; }
.kind.tt-off { background: #eef1f6; color: #8b93a1; }
/* 직거래·계약해제는 시세가 아니다 — 줄째로 흐리게 */
.adm-table tbody tr.off td { color: #aab2c0; }
/* 지금 기준으로 쓰고 있는 줄 — 연한 붉은색으로 칠한다 */
.adm-table tbody tr.picked td { background: #fff0f3; }
.adm-table tbody tr.picked:hover td { background: #ffe6ec; }
/* 고른 매매 줄은 파랑 · 전세 줄은 초록(위 알약 색) — 위 12칸의 그 줄도 같은 색으로 찬다 */
.adm-table tbody tr.picked-sale td { background: #eef4ff; }
.adm-table tbody tr.picked-sale:hover td { background: #e3edff; }
.adm-table tbody tr.picked-jeonse td { background: #ebf8f3; }
.adm-table tbody tr.picked-jeonse:hover td { background: #dff3eb; }
.adm-kpis.case12.on-sale .adm-kpi { background: #eef4ff; border-color: #d3e1fd; }
.adm-kpis.case12.on-jeonse .adm-kpi { background: #ebf8f3; border-color: #c9eadc; }
.adm-table tbody tr { cursor: pointer; }
.adm-kpi-from {
  font-size: 10.5px; font-weight: 800; color: #6b7280;
  background: #f3f5f9; border-radius: 999px; padding: 2px 8px;
}
/* 표에서 고른 줄과 같은 색 — 어느 거래를 보고 있는지 한눈에 */
.adm-kpi-from.pick { background: #fff0f3; color: #c2185b; }
.adm-ghost.pick { border-color: #f3c6d1; color: #c2185b; }
.adm-foot { margin: 10px 2px 0; font-size: 11.5px; color: #9ca3af; }

@media (max-width: 1100px) { .adm-kpis.grid4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } .adm-kpis.case-grid > * { grid-column: auto !important; grid-row: auto !important; } }
@media (max-width: 760px) {
  .adm-top-in, .adm-body { padding-left: 14px; padding-right: 14px; }
  .adm-f { flex: 1 1 100%; }
  .adm-input, .adm-input.narrow, .adm-input.wide { width: 100%; min-width: 0; }
  .adm-kpis.grid4 { grid-template-columns: minmax(0, 1fr); }
}
</style>

<style>
/* 저장 목록 창 — body 로 옮겨 가므로 scoped 를 쓰지 않는다 */
.adm-snap-veil { position: fixed; inset: 0; z-index: 9998; background: rgba(17, 24, 39, 0.18); }
.adm-snap-panel {
  position: fixed; z-index: 9999; right: 28px; top: 70px; width: 420px; max-height: 76vh;
  background: #fff; border: 1px solid #dfe5ef; border-radius: 14px;
  box-shadow: 0 18px 40px rgba(17, 24, 39, 0.2);
  display: flex; flex-direction: column; overflow: hidden; font-family: inherit; color: #111827;
}
.adm-snap-panel header {
  display: flex; align-items: baseline; gap: 8px; padding: 12px 14px; border-bottom: 1px solid #eef1f6;
}
.adm-snap-panel header strong { font-size: 14px; font-weight: 800; }
.adm-snap-panel header span { font-size: 11.5px; font-weight: 700; color: #9ca3af; }
.adm-snap-panel header button {
  margin-left: auto; border: 1px solid #e3e8f0; border-radius: 8px; background: #fff;
  padding: 4px 10px; font-family: inherit; font-size: 11.5px; font-weight: 700; color: #6b7280; cursor: pointer;
}
.adm-snap-panel ul { list-style: none; margin: 0; padding: 6px; overflow: auto; }
.adm-snap-panel li { display: flex; align-items: stretch; gap: 6px; }
.adm-snap-panel li + li { border-top: 1px solid #f3f5f9; }
.adm-snap-panel .pick {
  flex: 1 1 auto; text-align: left; border: none; background: transparent; cursor: pointer;
  padding: 9px 10px; border-radius: 9px; display: flex; flex-direction: column; gap: 3px; font-family: inherit;
}
.adm-snap-panel .pick:hover { background: #f5f8ff; }
.adm-snap-panel .pick b { font-size: 12.5px; font-weight: 800; color: #111827; }
.adm-snap-panel .pick span { font-size: 11.5px; font-weight: 700; color: #2b6df3; }
.adm-snap-panel .pick em { font-style: normal; font-size: 11px; color: #9ca3af; }
.adm-snap-panel .del {
  flex: 0 0 30px; border: none; background: transparent; color: #c3c9d4; cursor: pointer;
  font-size: 16px; line-height: 1;
}
.adm-snap-panel .del:hover { color: #d0342c; }
.adm-snap-empty { margin: 16px; text-align: center; font-size: 12px; color: #9ca3af; }
.adm-snap-empty.err { color: #c0392b; }
/* 이름을 묻는 작은 창 */
.adm-save-ask {
  position: fixed; z-index: 9999; left: 50%; top: 22vh; transform: translateX(-50%);
  width: 360px; background: #fff; border: 1px solid #dfe5ef; border-radius: 14px;
  box-shadow: 0 18px 40px rgba(17, 24, 39, 0.2);
  padding: 16px; display: flex; flex-direction: column; gap: 10px; font-family: inherit;
}
.adm-save-ask strong { font-size: 13.5px; font-weight: 800; color: #111827; }
.adm-save-ask .adm-input { width: 100%; }
.adm-save-ask .acts { display: flex; gap: 8px; }
.adm-save-ask .acts button {
  flex: 1 1 0; border-radius: 9px; padding: 8px 0;
  font-family: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer;
}
.adm-save-ask .ghost { border: 1px solid #e3e8f0; background: #fff; color: #6b7280; }
.adm-save-ask .go { border: 1px solid #1f3a72; background: #1f3a72; color: #fff; }

/* 인쇄 — 고르고 적는 자리는 빼고 숫자만 남긴다 */
@media print {
  .adm-top, .adm-bar, .adm-tabs, .adm-acts, .adm-chip-btn,
  .adm-snap-veil, .adm-snap-panel, .adm-flt, .adm-flt-panel, .adm-flt-veil { display: none !important; }
  .adm-print-only { display: block !important; }
  .adm-shell { background: #fff; }
  .adm-body { padding: 0; max-width: none; }
  .adm-kpi, .adm-table-wrap { break-inside: avoid; box-shadow: none; }
}
</style>
