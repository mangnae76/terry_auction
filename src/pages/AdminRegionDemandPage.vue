<script setup lang="ts">
// 실거래 분석 (시군구) — 관리자 도구. 첫 화면의 '실거래 분석' 카드가 여기로 온다.
//
// 시군구 하나를 고르면 그 안의 읍면동을 한 줄씩 늘어놓고, 읍면동마다
// 거래량·평균가와 네 가지 지표를 본다.
//
// 국토부 실거래는 '시군구 + 달' 로 부르면 읍면동이 한꺼번에 오므로,
// 12개월치 열두 번이면 표가 다 찬다 (동마다 부르지 않는다).
// 총 세대수는 건축물대장에서 동마다 받아 채운다 — 연립·다세대 · 아파트 · 오피스텔(호수) 종류별로, 30일 저장.
// 연립·다세대 값은 물건상세 손품조사와 같은 셈이다.
// 손으로 적으면 그 값이 우선. 총 매물수는 공식 API 가 아니라 손으로 적는다.
import { naverListingUrl } from '../services/naverListing';
import { geocodeAddress } from '../services/routeOptimizer';
import { dealCountTip, type TipRow } from '../services/tipRows';
import { DEMAND_TOTAL_TIP, demandFitText, demandGradeOf, demandTip, demandTotalGrade } from '../services/demandGrade';
import InfoTip from '../components/InfoTip.vue';
import SnapChip from '../components/SnapChip.vue';
import { useScreenSnapshot } from '../composables/useScreenSnapshot';
import UnitText from '../components/UnitText.vue';
import YmCount from '../components/YmCount.vue';
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/authStore';
import { REGION_GROUPS, districtsOf, type DistrictOption } from '../services/regionCodes';
import { dongStatsFromRows, fetchDongUnits, fetchDongTradeStats, tradeWindowOf, ymd8Of, type DongTradeDetailRow, type DongTradeStat } from '../services/publicDataApi';
import { resolveRegionFromAddress } from '../services/regionResolver';
import { cachedEntryOrStale, cacheKey, CACHE_TTL, readCacheEntry } from '../services/marketCache';
import { loadUserPrefs, saveUserPrefs } from '../services/userPrefsRepository';

type Kind = 'villa' | 'apt' | 'officetel';
const KINDS: Array<{ key: Kind; label: string }> = [
  { key: 'villa', label: '연립다세대' },
  { key: 'apt', label: '아파트' },
  { key: 'officetel', label: '오피스텔' },
];

const router = useRouter();
/** 웹 시장분석 › 지역분석에 띄웠는가 — 웹(shared.entry.js)이 넣어 준다. 분석 도구에서는 false */
const webEmbed = inject<boolean>('webEmbed', false);
/** 웹 지역분석의 '수요공급' 탭으로 들어갔을 때 — 고르는 줄 · 조회는 지역분석 것을 쓴다.
 *  token 이 바뀌면(조회 · 되살림) 받은 조건으로 다시 받는다. 같은 국토부 요청이라 워커 저장분을 그대로 쓴다 */
type EmbedFilter = {
  sido: string; districtCode: string; dong: string; kind: Kind; dealKind: 'sale' | 'jeonse'; months: number; token: number;
  /** 지역분석이 받아 둔 거래(기간 안) · 조회 기준 시각 · 이름 — 있으면 다시 묻지 않고 이것으로 센다 */
  rows?: DongTradeDetailRow[]; asOf?: number; label?: string;
};
const props = defineProps<{ embed?: EmbedFilter | null; chip?: { tone: string; text: string } | null }>();
const embedded = computed(() => !!props.embed);
const auth = useAuthStore();

// 시도 → 시군구 → 읍면동 차례로 좁힌다.
// 이름을 쳐서 찾던 방식은 '인천광역시 서구' 처럼 갈라진 구에서 엉뚱한 데를
// 집었다. 표에서 고르면 그럴 일이 없다.
const SIDO_PICK = '';
const sido = ref<string>(SIDO_PICK);
const districtCode = ref<string>('');   // 빈 값이면 '전체'
const dongFilter = ref('');
const kind = ref<Kind>('villa');
// 분석 도구는 1년치로 못 박는다 — 지표가 모두 연 기준이다(웹은 3 · 6 · 12개월을 고르고, 연 · 월 칸이 연 기준으로 환산한다)
const months = ref(12);
const WEB_PERIODS = [3, 6, 12];
/** 웹 — 매매 / 전세 (전세는 전월세 자료에서 월세 없는 것, 값은 보증금). 바꾸면 '조회' 로 다시 받는다 */
const DEAL_KINDS = [{ key: 'sale', label: '매매' }, { key: 'jeonse', label: '전세' }] as const;
const dealKind = ref<'sale' | 'jeonse'>('sale');
/** 지금 받아 둔 자료가 매매인지 전세인지 — '평균 거래가 / 평균 전세가' 이름표를 맞춘다 */
const loadedDeal = ref<'sale' | 'jeonse'>('sale');

const districts = computed<DistrictOption[]>(() => districtsOf(sido.value));
/** 전체를 고르면 그 시도의 시군구를 다 돈다 — 몇 번 부르는지 미리 알려 준다 */
const targets = computed<DistrictOption[]>(() => (
  districtCode.value
    ? districts.value.filter((d) => d.lawdCode === districtCode.value)
    : districts.value
));
const callCount = computed(() => targets.value.length * months.value);
let restoring = false;
watch(sido, () => { if (restoring) return; districtCode.value = ''; dongFilter.value = ''; });

const loading = ref(false);
const errorMsg = ref('');
const notice = ref('');
type StatRow = DongTradeStat & { sigungu: string };
const stats = ref<StatRow[]>([]);
const period = ref({ from: '', to: '' });
const loadedLabel = ref('');

/** 손으로 적는 두 칸 — 읍면동 이름을 열쇠로 들고 있는다 */
type Manual = { units?: number; listings?: number };
const manual = ref<Record<string, Manual>>({});
// 열쇠에 시군구를 넣는다 — '중구'·'남구'처럼 동 이름이 시군구마다 겹치고,
// 전체로 받든 한 곳만 받든 같은 자리를 가리켜야 한다

// 적어 둔 세대수·매물수는 사용자별로 남긴다 — 매번 다시 적을 값이 아니다
const prefsLoaded = ref(false);
const loadManual = async () => {
  if (!auth.uid) return;
  const prefs = await loadUserPrefs(auth.uid);
  if (prefs?.adminRegionManual) manual.value = { ...prefs.adminRegionManual };
  prefsLoaded.value = true;
};
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const saveManualSoon = () => {
  if (!prefsLoaded.value || !auth.uid) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveUserPrefs(auth.uid, { adminRegionManual: manual.value });
  }, 700);
};
onMounted(() => { void loadManual(); });
watch(() => auth.uid, () => { void loadManual(); });

const rowKey = (sigungu: string, umdNm: string) => `${kind.value}|${sigungu}|${umdNm}`;
const manualOf = (sigungu: string, umdNm: string): Manual => manual.value[rowKey(sigungu, umdNm)] ?? {};
const setManual = (sigungu: string, umdNm: string, field: keyof Manual, raw: string) => {
  const n = Number(raw.replace(/[^\d]/g, ''));
  const next = { ...manualOf(sigungu, umdNm), [field]: Number.isFinite(n) && n > 0 ? n : undefined };
  manual.value = { ...manual.value, [rowKey(sigungu, umdNm)]: next };
  saveManualSoon();
};

/** 건축물대장 세대수 — 읍면동마다(연립·다세대). 열쇠는 손 입력과 같은 rowKey.
 *  0 = 받았는데 연립·다세대가 없음 · -1 = 못 받음(한도 · 오류) — 둘을 화면에서 가른다 */
const autoUnits = ref<Record<string, number>>({});
let unitsJob = 0;
const fetchAutoUnits = async () => {
  const job = ++unitsJob;
  const k = kind.value;
  const targets = stats.value.filter((r) => !(rowKey(r.sigungu, r.umdNm) in autoUnits.value));
  // 동은 한 곳씩 차례로(한꺼번에 부르면 429 로 막힌다) — 한 번 받은 동은 30일 저장
  for (let i = 0; i < targets.length; i += 1) {
    await Promise.all(targets.slice(i, i + 1).map(async (r) => {
      const key = rowKey(r.sigungu, r.umdNm);
      let value = -1;
      try {
        const region = await resolveRegionFromAddress(`${sido.value} ${r.sigungu} ${r.umdNm}`);
        if (region?.bCode10) {
          // 한 번 받으면 세 종류가 다 나온다 — 종류를 바꿔도 다시 부르지 않게 동 하나에 한 벌로 저장
          const got = await cachedEntryOrStale('cacheDongUnitsAll', cacheKey(region.bCode10), CACHE_TTL.units,
            () => fetchDongUnits(region.bCode10), (u) => u.villa + u.apt + u.officetel > 0, 365 * 24 * 60 * 60 * 1000);
          if (got.value !== null) value = got.value[k];
          // 오늘 한도에 걸려 못 받았으면 — 앱 물건상세가 받아 둔 그 동의 연립·다세대 세대수(cacheDongUnits)라도 쓴다
          else if (k === 'villa') {
            const old = await readCacheEntry<number>('cacheDongUnits', cacheKey(region.bCode10), 365 * 24 * 60 * 60 * 1000);
            if (old && old.value > 0) value = old.value;
          }
        }
      } catch { /* 못 받음 */ }
      if (job !== unitsJob) return;
      autoUnits.value = { ...autoUnits.value, [key]: value };
    }));
    if (job !== unitsJob) return;
  }
};
watch([stats, kind], () => { void fetchAutoUnits(); });
/** 총 세대수 칸의 흐린 글 — 받은 값 · 0(없음) · 못 받음 · 받는 중 */
const unitsHint = (sigungu: string, umdNm: string) => {
  const what = kind.value === 'apt' ? '아파트 세대수' : kind.value === 'officetel' ? '오피스텔 호수' : '연립·다세대 세대수';
  const v = autoUnits.value[rowKey(sigungu, umdNm)];
  if (v === undefined) return { text: '받는 중', tip: '건축물대장에서 세대수를 받는 중' };
  if (v < 0) return { text: webEmbed ? '받기실패' : '못 받음', fail: true, tip: '건축물대장 조회 실패(하루 한도 · 오류) — 내일 다시 조회해 주세요' };
  if (v === 0) return { text: '0', tip: `건축물대장에 해당 건물이 없음(${what} 0)` };
  return { text: v.toLocaleString('ko-KR'), tip: `건축물대장 ${what} 합` };
};

/** 네 지표 — 손품+현장의 매매수요와 같은 식이다 */
type Row = StatRow & {
  units: number; listings: number;
  turnover: number; absorb: number; burden: number; clearMonths: number;
};
const rows = computed<Row[]>(() => stats.value
  .filter((r) => !dongFilter.value || r.umdNm === dongFilter.value)
  .map((s) => {
  const m = manualOf(s.sigungu, s.umdNm);
  const units = Math.max(0, autoUnits.value[rowKey(s.sigungu, s.umdNm)] ?? 0); // 건축물대장 자동값만
  const listings = m.listings ?? 0;
  const deals = dealOf(s);   // 웹은 정상 + 직거래(총 거래건수와 같은 셈)
  const monthly = deals / Math.max(1, months.value);
  // 회전율·소화율은 1년치로 환산한다 — 24개월을 받아도 뜻이 같아야
  // 손품+현장의 등급 기준(연 거래량 ÷ 세대수)과 그대로 견줄 수 있다
  const yearly = deals / Math.max(1, months.value / 12);
  const turnover = units > 0 ? (yearly / units) * 100 : 0;
  const absorb = listings > 0 ? (yearly / listings) * 100 : 0;
  const burden = units > 0 ? (listings / units) * 100 : 0;
  const clearMonths = monthly > 0 && listings > 0 ? listings / monthly : 0;
  return {
    ...s,
    units,
    listings,
    turnover, absorb, burden, clearMonths,
  };
}));

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
watch([districtCode, kind], () => { if (!restoring) dongFilter.value = ''; peekDongs(); });

const dongOptions = computed(() => {
  const loaded = stats.value.map((r) => r.umdNm);
  const peeked = dongPeek.value[peekKey.value] ?? [];
  return Array.from(new Set([...loaded, ...peeked])).sort((a, b) => a.localeCompare(b, 'ko'));
});
const totalCount = computed(() => rows.value.reduce((s, r) => s + r.count, 0));
// 직거래·해제도 보고 있는 줄만큼만 센다 — 동을 좁히면 그 동의 수가 나온다
const excludedShown = computed(() => rows.value.reduce((s, r) => s + (r.excludedCount ?? 0), 0));
const directShown = computed(() => rows.value.reduce((s, r) => s + (r.directCount ?? 0), 0));
const cancelShown = computed(() => rows.value.reduce((s, r) => s + (r.cancelCount ?? 0), 0));
const sumLabel = computed(() => (
  dongFilter.value ? `${loadedLabel.value} · ${dongFilter.value}` : loadedLabel.value
));

const won = (n: number) => (n > 0 ? n.toLocaleString('ko-KR') : '-');

/** 웹 요약 줄 — 지금 보는 범위(예: 옹진군 전체 / 한 읍면동) 전체를 한 줄로 셈한다.
 *  지표는 표의 동별 식과 같다: 회전율 = 연 거래 ÷ 세대수, 소화율 = 연 거래 ÷ 매물수,
 *  부담률 = 매물수 ÷ 세대수, 소진기간 = 매물수 ÷ 월 거래 */
const navStats = computed(() => {
  const list = rows.value;
  const count = list.reduce((sum, r) => sum + r.count, 0);
  const priced = list.filter((r) => r.avgPrice > 0);
  const priceN = priced.reduce((sum, r) => sum + r.count, 0);
  const avgPrice = priceN > 0 ? priced.reduce((sum, r) => sum + r.avgPrice * r.count, 0) / priceN : 0;
  const aged = list.filter((r) => r.avgBuildYear > 0);
  const ageN = aged.reduce((sum, r) => sum + r.count, 0);
  const avgYear = ageN > 0 ? aged.reduce((sum, r) => sum + r.avgBuildYear * r.count, 0) / ageN : 0;
  const units = list.reduce((sum, r) => sum + r.units, 0);
  const listings = list.reduce((sum, r) => sum + r.listings, 0);
  const deals = list.reduce((sum, r) => sum + dealOf(r), 0);   // 웹은 정상 + 직거래(표와 같은 셈)
  const monthly = deals / Math.max(1, months.value);
  const yearly = deals / Math.max(1, months.value / 12);
  const turnover = units > 0 ? (yearly / units) * 100 : 0;
  const absorb = listings > 0 ? (yearly / listings) * 100 : 0;
  const burden = units > 0 ? (listings / units) * 100 : 0;
  const clearMonths = monthly > 0 && listings > 0 ? listings / monthly : 0;
  return {
    count, avgPrice, monthly, yearly, units, listings,
    age: avgYear > 0 ? new Date().getFullYear() - Math.round(avgYear) + 1 : 0,
    turnover, absorb, burden, clearMonths,
    // 앱 매매수요와 같은 등급 — 준비 조건도 같다(세대수 · 매물수가 있어야)
    grades: {
      turnover: demandGradeOf('turnover', units > 0, turnover),
      absorb: demandGradeOf('absorb', listings > 0, absorb),
      burden: demandGradeOf('burden', units > 0 && listings > 0, burden),
      clear: demandGradeOf('clear', units > 0 && listings > 0, clearMonths),
    },
  };
});
/** 말풍선 속 종류 이름 */
const kindWhat = computed(() => (kind.value === 'apt' ? '아파트' : kind.value === 'officetel' ? '오피스텔' : '연립·다세대'));
/** 제목 — '인천광역시 서해구' (읍면동을 고르면 '… 검암동') 뒤에 '수요분석' */
const dmArea = computed(() => [loadedLabel.value, dongFilter.value].filter(Boolean).join(' '));
// ===== 웹 요약 — 앱 매매수요(① 수치 · ② 지표)와 같은 칸 · 같은 연계 =====
type DmId = 'deal' | 'units' | 'listings' | 'turn' | 'absorb' | 'burden' | 'clear';
/** 칸을 짚으면 켜지는 칸 — 앱 AuctionDetailPage 의 DM_LIT_LINKS 와 같다 */
const DM_LIT_LINKS: Record<DmId, DmId[]> = {
  turn: ['turn', 'deal', 'units'],          // 거래 회전율 = 거래량 ÷ 총세대수
  absorb: ['absorb', 'deal', 'listings'],   // 매물 소화율 = 거래량 ÷ 총매물수
  burden: ['burden', 'listings', 'units'],  // 매물 부담률 = 총매물수 ÷ 총세대수
  clear: ['clear', 'listings', 'deal'],     // 매물 소진기간 = 총매물수 ÷ 월평균 거래량
  deal: ['deal', 'turn', 'absorb', 'clear'],
  units: ['units', 'turn', 'burden'],
  listings: ['listings', 'absorb', 'burden', 'clear'],
};
const dmLitKey = ref<DmId | ''>('');
const dmLit = (id: DmId) => (dmLitKey.value ? DM_LIT_LINKS[dmLitKey.value].includes(id) : false);
const dmInputs = computed(() => {
  const v = navStats.value;
  // 20251030 → 2025-10-30 (말풍선은 2025.10.30 꼴)
  const day = (x: string) => (x.length >= 6 ? [x.slice(0, 4), x.slice(4, 6), x.slice(6, 8)].filter(Boolean).join('-') : x);
  const n = (x: number) => (x > 0 ? x.toLocaleString('ko-KR') : '-');
  return [
    { id: 'deal' as DmId, label: '총 거래건수', value: '', ym: { year: v.yearly, month: v.monthly },
      tip: dealCountTip({ normal: v.count, direct: directShown.value, cancel: cancelShown.value, months: months.value, from: day(period.value.from), to: day(period.value.to) }) },
    { id: 'units' as DmId, label: '총 세대수', value: n(v.units), ym: null,
      tip: [['출처', '건축HUB(건축물대장) · 자동 입력'], ['갱신', '30일 후 업데이트'], ['범위', `${dmArea.value} ${kindWhat.value}`], ['합산', '건물마다의 세대수를 모두 더한 값']] as TipRow[] },
    { id: 'listings' as DmId, label: '총 매물수', value: n(v.listings), ym: null,
      tip: [['입력', '아래 표 총 매물수 칸에 직접 입력'], ['합산', '동마다 적은 매물수를 모두 더한 값'], ['찾기', `네이버 부동산 · ${kindWhat.value} 매물 수`]] as TipRow[] },
  ];
});
/** 동 줄의 '네이버 매물 ↗' — 그 동 가운데 자리를 찾아 '그 동만 보기' 지도로 연다.
 *  자리를 찾는 동안 새 창이 막히지 않게 창부터 열고 주소를 나중에 넣는다 */
const openDongListing = async (r: Row) => {
  const q = [sido.value, r.sigungu, r.umdNm].filter(Boolean).join(' ');
  const w = window.open('', '_blank');
  const p = await geocodeAddress(q).catch(() => null);
  const url = p ? naverListingUrl({ lat: p.lat, lng: p.lng }, kind.value) : 'https://fin.land.naver.com/map';
  if (w) w.location.href = url; else window.open(url, '_blank');
};
const dmTotal = computed(() => demandTotalGrade(Object.values(navStats.value.grades)));
const dmResults = computed(() => {
  const v = navStats.value;
  const pct = (x: number) => (x > 0 ? `${x.toFixed(1)}%` : '-');
  return [
    { id: 'turn' as DmId, label: '거래 회전율', value: pct(v.turnover), grade: v.grades.turnover, tip: demandTip('turnover', kindWhat.value) },
    { id: 'absorb' as DmId, label: '매물 소화율', value: pct(v.absorb), grade: v.grades.absorb, tip: demandTip('absorb', kindWhat.value) },
    { id: 'burden' as DmId, label: '매물 부담률', value: pct(v.burden), grade: v.grades.burden, tip: demandTip('burden', kindWhat.value) },
    { id: 'clear' as DmId, label: '매물 소진기간', value: v.clearMonths > 0 ? `${v.clearMonths.toFixed(1)}개월` : '-', grade: v.grades.clear, tip: demandTip('clear', kindWhat.value) },
  ];
});
const areaText = (n: number) => (n > 0 ? n.toFixed(1) : '-');
/** 건축연수 — 올해에서 평균 건축연도를 뺀다 */
const THIS_YEAR = new Date().getFullYear();
const ageText = (buildYear: number) => (
  buildYear > 1800 ? String(Math.max(0, THIS_YEAR - buildYear)) : '-'
);
const pct = (n: number) => (n > 0 ? `${n.toFixed(1)}%` : '-');
/** 거래량을 연·월로 가른다 — 24개월을 받아도 1년치로 환산해 견준다 */
/** 표의 거래 칸 — 웹은 총 거래건수(정상 + 직거래, 계약해제 제외), 분석 도구는 정상거래만(예전 그대로) */
const dealOf = (r: { count: number; directCount?: number }) => (webEmbed ? r.count + (r.directCount ?? 0) : r.count);
const yearlyOf = (count: number) => count / Math.max(1, months.value / 12);
const monthlyOf = (count: number) => count / Math.max(1, months.value);
/** 작은 동은 월 0건으로 뭉개진다 — 10건 아래는 소수 한 자리까지.
    일의 자리를 세로로 맞추려고 정수부와 소수부를 갈라 둔다 */
const cntRound = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
const cntInt = (n: number) => {
  if (!(n > 0)) return '-';
  return Math.floor(cntRound(n)).toLocaleString('ko-KR');
};
const cntFrac = (n: number) => {
  if (!(n > 0)) return '';
  const t = cntRound(n);
  return Number.isInteger(t) ? '' : `.${Math.round((t - Math.floor(t)) * 10)}`;
};
/** 소진기간 — 한 줄로 달 수와 해로 환산한 값 ('96개월 / 8년', '130개월 / 10.8년') */
const clearHead = (n: number) => (n > 0 ? String(Math.round(n)) : '');
/** 해 환산 — 칸 하나에 한 줄로 들어가게 '8년' · '10.8년' 처럼 소수 한 자리. 1년이 안 되면 적지 않는다 */
const clearSub = (n: number) => {
  const m = Math.round(n);
  if (!(m >= 12)) return '';
  const y = Math.round((m / 12) * 10) / 10;
  return Number.isInteger(y) ? `${y}년` : `${y.toFixed(1)}년`;
};
/** 20251015 → 2025년 10월 15일, 202510 → 2025년 10월 */
const ym = (v: string) => {
  if (v.length === 8) return `${v.slice(0, 4)}년 ${Number(v.slice(4, 6))}월 ${Number(v.slice(6))}일`;
  if (v.length === 6) return `${v.slice(0, 4)}년 ${Number(v.slice(4))}월`;
  return v;
};

const progress = ref({ done: 0, total: 0 });

// ===== 웹 — 마지막으로 받은 자료를 이 브라우저에 남겨 새로고침해도 요약 · 표가 그대로 (composables/useScreenSnapshot) =====
type Snapshot = { sido: string; districtCode: string; dongFilter: string; kind: Kind; dealKind?: 'sale' | 'jeonse'; months?: number; stats: StatRow[]; period: { from: string; to: string }; loadedLabel: string };
const snap = useScreenSnapshot<Snapshot>('adm.region.snapshot.v1');
onMounted(async () => {
  if (!webEmbed || embedded.value) return;   // 탭으로 들어가면 지역분석이 조건을 넘겨준다
  const s = await snap.restore();
  if (!s || !Array.isArray(s.stats) || s.stats.length === 0) { snap.state.value = null; return; }
  restoring = true;
  sido.value = s.sido; districtCode.value = s.districtCode; dongFilter.value = s.dongFilter; kind.value = s.kind;
  stats.value = s.stats; period.value = s.period; loadedLabel.value = s.loadedLabel;
  if (s.dealKind) { dealKind.value = s.dealKind; loadedDeal.value = s.dealKind; }
  if (s.months) months.value = s.months;
  await nextTick();
  restoring = false;
});
// 읍면동을 바꿔 보면 그것도 남긴다
watch(dongFilter, (v) => { if (webEmbed && !restoring) void snap.patch({ dongFilter: v }); });

// 탭으로 들어갔을 때 — 지역분석의 조건이 오면(조회 · 동 바꿈) 따라간다
const applyEmbed = async (e: EmbedFilter, fetch: boolean) => {
  restoring = true;
  sido.value = e.sido; districtCode.value = e.districtCode; kind.value = e.kind; dealKind.value = e.dealKind; months.value = e.months;
  await nextTick();
  dongFilter.value = e.dong;
  restoring = false;
  // 지역분석이 받아 둔 거래가 있으면 그것으로 센다 — 같은 거래 · 같은 기준일이라 두 탭 숫자가 하나다
  if (e.rows && e.asOf) {
    const w = tradeWindowOf(e.asOf, e.months);
    const label = e.label || `${e.sido} ${targets.value[0]?.label ?? ''}`.trim();
    const sigungu = targets.value[0]?.label ?? '';
    stats.value = dongStatsFromRows(e.rows).map((r) => ({ ...r, sigungu }));
    period.value = { from: ymd8Of(w.start), to: ymd8Of(w.end) };
    loadedLabel.value = label;
    loadedDeal.value = e.dealKind;
    notice.value = ''; errorMsg.value = '';
    return;
  }
  if (fetch && e.districtCode) await load();
};
watch(() => props.embed?.token, () => { if (props.embed) void applyEmbed(props.embed, true); });
// 기간(3 · 6 · 12개월)이나 받아 둔 거래가 바뀌면 다시 센다(묻지 않고)
watch(() => [props.embed?.rows, props.embed?.months, props.embed?.asOf], () => { if (props.embed?.rows) void applyEmbed(props.embed, false); });
watch(() => props.embed?.dong, (d) => { if (props.embed && d !== undefined) dongFilter.value = d; });
onMounted(() => { if (props.embed) void applyEmbed(props.embed, true); });

const load = async () => {
  if (loading.value || targets.value.length === 0) return;
  errorMsg.value = '';
  notice.value = '';
  loading.value = true;
  progress.value = { done: 0, total: targets.value.length };
  try {
    const merged = new Map<string, DongTradeStat & { sigungu: string }>();
    const errs = new Set<string>();
    let from = ''; let to = '';
    // 시군구를 하나씩 — 한꺼번에 던지면 국토부가 막는다
    for (const d of targets.value) {
      const res = await fetchDongTradeStats({
        lawdCd5: d.lawdCode,
        propertyType: kind.value,
        months: months.value,
        dealKind: webEmbed ? dealKind.value : 'sale',
      });
      from = res.periodFromDate || res.periodFrom; to = res.periodToDate || res.periodTo;
      if (res.error) errs.add(res.error);
      res.rows.forEach((r) => {
        // 시군구가 달라도 동 이름은 겹친다 — 시군구를 붙여 열쇠로 쓴다
        merged.set(`${d.label}|${r.umdNm}`, { ...r, sigungu: d.label });
      });
      progress.value = { done: progress.value.done + 1, total: targets.value.length };
    }
    // 거래량 랭킹 — 시군구 전체를 받아도 거래 많은 동이 위로 온다
    stats.value = Array.from(merged.values()).sort((a, b) => b.count - a.count);
    period.value = { from, to };
    loadedLabel.value = districtCode.value
      ? `${sido.value} ${targets.value[0]?.label ?? ''}`.trim()
      : `${sido.value} 전체`;
    if (errs.size > 0) notice.value = Array.from(errs).join(' / ');
    if (stats.value.length === 0 && errs.size === 0) notice.value = '그 기간에 거래가 없습니다.';
    loadedDeal.value = webEmbed ? dealKind.value : 'sale';
    if (webEmbed && stats.value.length > 0) {
      void snap.save({ sido: sido.value, districtCode: districtCode.value, dongFilter: dongFilter.value, kind: kind.value, dealKind: dealKind.value, months: months.value, stats: stats.value, period: period.value, loadedLabel: loadedLabel.value });
    }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
};

/** 엑셀에서 열 수 있게 — 쉼표가 든 값은 따옴표로 감싼다 */
const downloadCsv = () => {
  if (rows.value.length === 0) return;
  const head = ['소속 구', '읍면동', '총세대수', '총매물수', `총거래량(최근 ${months.value}개월)`, '평균가', '회전율(%)', '매물소화율(%)', '매물부담율(%)', '매물소진기간(개월)', '평균전용(㎡)', '평균건축연수', '평균평당가', '직거래·해제'];
  const body = rows.value.map((r) => [
    r.sigungu, r.umdNm,
    r.units || '', r.listings || '',
    r.count, r.avgPrice || '',
    r.turnover ? r.turnover.toFixed(1) : '',
    r.absorb ? r.absorb.toFixed(1) : '',
    r.burden ? r.burden.toFixed(1) : '',
    r.clearMonths ? Math.round(r.clearMonths) : '',
    r.avgAreaM2 || '', ageText(r.avgBuildYear), r.avgUnitPrice || '', r.excludedCount || '',
  ]);
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [head, ...body].map((line) => line.map(esc).join(',')).join('\n');
  // 엑셀이 한글을 깨지 않게 BOM 을 붙인다
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `수요공급_${loadedLabel.value}_${kind.value}_${period.value.from}-${period.value.to}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};
</script>

<template>
  <section class="adm-shell">
    <header v-if="!embedded" class="adm-top">
      <div class="adm-top-in">
        <button type="button" class="adm-back" aria-label="뒤로" @click="router.push('/admin')">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg>
        </button>
        <div class="adm-title">
          <h1>실거래 분석 <em>지역 단위</em></h1>
          <p>지역 세부 단위(읍면동)의 거래량·평균가를 통해 수요공급을 분석한다.</p>
        </div>
        <button
          type="button"
          class="adm-csv"
          :disabled="rows.length === 0"
          @click="downloadCsv"
        >엑셀 내려받기</button>
      </div>
    </header>

    <div class="adm-body">
      <div v-if="!embedded" class="adm-bar">
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
            <option value="">{{ webEmbed ? '시군구 선택' : '전체' }}</option>
            <option v-for="d in districts" :key="d.lawdCode" :value="d.lawdCode">{{ d.label }}</option>
          </select>
        </label>
        <label class="adm-f">
          <small>읍 · 면 · 동</small>
          <select v-model="dongFilter" :class="['adm-input', 'narrow', { ph: !dongFilter }]" :disabled="dongOptions.length === 0">
            <option value="">{{ dongPeeking ? '불러오는 중…' : (webEmbed ? '읍면동 선택' : '전체') }}</option>
            <option v-for="d in dongOptions" :key="d" :value="d">{{ d }}</option>
          </select>
        </label>
        <label class="adm-f">
          <small>종류</small>
          <div class="adm-seg">
            <button
              v-for="k in KINDS"
              :key="k.key"
              type="button"
              :class="['adm-seg-btn', { on: kind === k.key }]"
              @click="kind = k.key"
            >{{ k.label }}</button>
          </div>
        </label>
        <!-- 웹 — 지역분석과 같은 고르는 줄: 매매 · 전세, 기간 3 · 6 · 12개월 (엑셀내려받기는 뺐다) -->
        <label v-if="webEmbed" class="adm-f">
          <small>거래</small>
          <div class="adm-seg">
            <button v-for="k in DEAL_KINDS" :key="k.key" type="button" :class="['adm-seg-btn', { on: dealKind === k.key }]" @click="dealKind = k.key">{{ k.label }}</button>
          </div>
        </label>
        <label v-if="webEmbed" class="adm-f">
          <small>기간</small>
          <div class="adm-seg">
            <button v-for="m in WEB_PERIODS" :key="m" type="button" :class="['adm-seg-btn', { on: months === m }]" @click="months = m">{{ m }}개월</button>
          </div>
        </label>
        <button type="button" class="adm-load" :disabled="loading || !sido" @click="load">
          <template v-if="loading && progress.total > 1">{{ progress.done }}/{{ progress.total }} 불러오는 중…</template>
          <template v-else-if="loading">불러오는 중…</template>
          <template v-else>{{ webEmbed ? '조회' : '데이터 로드' }}</template>
        </button>
      </div>

      <!-- 전체를 고르면 시군구마다 열두 번씩 부른다 — 하루 한도가 있으니 미리 알린다 -->
      <p v-if="!embedded && sido && !districtCode" class="adm-msg warn">
        <b>{{ sido }} 전체</b> — 시군구 {{ districts.length }}곳을 차례로 받습니다
        (국토부 호출 {{ callCount.toLocaleString('ko-KR') }}번). 한 곳만 보려면 시·군·구를 고르세요.
      </p>

      <!-- 웹 — 고른 범위 전체를 한눈에: 요약 상자 줄 (고르는 칸 바로 아래) -->
      <!-- 앱 매매수요와 같은 짜임 — 위 ① 수치(거래량 · 세대수 · 매물수) 3칸, 아래 ② 지표 4칸. 두 줄은 시작과 끝이 같다.
           칸에 마우스를 대면 그 값과 이어진 칸이 같이 빨갛게 켜진다(앱 DM_LIT_LINKS 와 같은 짝) -->
      <section v-if="webEmbed && rows.length > 0" class="adm-nav dm">
        <p class="adm-nav-scope"><span><span class="area">{{ dmArea }}</span> 수요분석</span><SnapChip :chip="embedded ? (props.chip ?? null) : snap.chip.value" /></p>
        <p class="dm-block-head">① 기초수치</p>
        <div class="dm-row c3">
          <div v-for="c in dmInputs" :key="c.id" :class="['dm-cell', { lit: dmLit(c.id) }]" @mouseenter="dmLitKey = c.id" @mouseleave="dmLitKey = ''">
            <div class="dm-head"><InfoTip :rows="c.tip">{{ c.label }}</InfoTip></div>
            <div class="dm-body"><b><YmCount v-if="c.ym" :year="c.ym.year" :month="c.ym.month" /><UnitText v-else :text="c.value" /></b></div>
          </div>
        </div>
        <p class="dm-block-head">② 수요지표</p>
        <div class="dm-row c5">
          <div v-for="c in dmResults" :key="c.id" :class="['dm-cell', { lit: dmLit(c.id) }]" @mouseenter="dmLitKey = c.id" @mouseleave="dmLitKey = ''">
            <div class="dm-head"><InfoTip :rows="c.tip">{{ c.label }}</InfoTip></div>
            <div class="dm-body"><b><UnitText :text="c.value" /><template v-if="c.grade !== '-'"><em class="nbar">|</em><span :class="['gd', `g-${c.grade}`]">{{ c.grade }}</span><span :class="['fit', { bad: c.grade === 'C' }]">/ {{ demandFitText(c.grade) }}</span></template></b></div>
          </div>
          <!-- 종합 — 손품조사 매매수요의 종합 칸과 같다(등급 동그라미 + 적합) -->
          <div class="dm-cell total">
            <div class="dm-head"><InfoTip :rows="DEMAND_TOTAL_TIP" align="end">종합</InfoTip></div>
            <div class="dm-body"><b><template v-if="dmTotal !== '-'"><span :class="['gd', `g-${dmTotal}`]">{{ dmTotal }}</span><span :class="['fit', { bad: dmTotal === 'C' }]">{{ demandFitText(dmTotal) }}</span></template><template v-else>-</template></b></div>
          </div>
        </div>
      </section>
      <p v-if="errorMsg" class="adm-msg err">{{ errorMsg }}</p>
      <p v-else-if="notice" class="adm-msg warn">{{ notice }}</p>

      <div v-if="!webEmbed && rows.length > 0" class="adm-sum"><!-- 웹은 위 요약 상자가 대신한다 -->
        <strong>{{ sumLabel }}</strong>
        <span>기간 {{ ym(period.from) }} ~ {{ ym(period.to) }}</span>
        <span>읍면동 {{ rows.length }}곳</span>
        <!-- 거래는 파랑, 뺀 것(직거래 · 해제)은 초록으로 따로 센다 -->
        <!-- 웹 — 총 거래건수 = 정상 + 직거래 (계약해제 제외) -->
        <template v-if="webEmbed">
          <span>총 거래건수 <b class="adm-sum-deal">{{ (totalCount + directShown).toLocaleString('ko-KR') }}건</b></span>
          <span>정상 <b class="adm-sum-ex">{{ totalCount.toLocaleString('ko-KR') }}건</b></span>
          <span>직거래 <b class="adm-sum-ex">{{ directShown.toLocaleString('ko-KR') }}건</b></span>
          <span>해제 <b class="adm-sum-ex">{{ cancelShown.toLocaleString('ko-KR') }}건</b></span>
          <span class="dim">(계약해제는 제외하고 셈)</span>
        </template>
        <template v-else>
          <span>거래 <b class="adm-sum-deal">{{ totalCount.toLocaleString('ko-KR') }}건</b></span>
          <template v-if="excludedShown > 0">
            <span>직거래 <b class="adm-sum-ex">{{ directShown.toLocaleString('ko-KR') }}건</b></span>
            <span>해제 <b class="adm-sum-ex">{{ cancelShown.toLocaleString('ko-KR') }}건</b></span>
            <span class="dim">(직거래 · 해제는 제외하고 셈)</span>
          </template>
        </template>
      </div>

      <div v-if="rows.length > 0" class="adm-table-wrap">
        <!-- 지역분석 안 탭(embedded)은 시군구 하나만 보므로 '소속 구' 칸은 뺀다 — 모든 줄이 같은 값이다 -->
        <table :class="['adm-table', { even: embedded }]">
          <!-- 웹 — 동 이름 옆 '네이버 매물 ↗'이 들어가게 첫 칸만 넓히고(160) 나머지 열 칸이 남은 폭을 고르게 나눈다 -->
          <colgroup v-if="webEmbed && embedded"><col style="width: 160px" /><col v-for="i in 10" :key="i" /></colgroup>
          <thead>
            <!-- 웹은 묶음 머리(구분 · 수요지표)를 뺀다 -->
            <tr v-if="!webEmbed" class="grp">
              <!-- 구분이 총 매물수까지 덮는다 — 손으로 적는 칸은 총 매물수 하나라 따로 묶지 않고 그 칸 머리만 파랗게 -->
              <th :colspan="embedded ? 3 : 4">{{ embedded ? '구분' : '주소지 정보' }}</th>
              <th colspan="8">수요지표</th>
            </tr>
            <tr>
              <th v-if="!embedded">소속 구</th>
              <th>{{ embedded ? '동/지역' : '읍면동' }}</th>
              <th>{{ webEmbed ? '세대수' : '총 세대수' }}</th>
              <th class="in">{{ webEmbed ? '매물수' : '총 매물수' }}<small v-if="webEmbed">(네이버 매물수)</small></th>
              <th>{{ webEmbed ? '거래건수' : '총 거래량' }}<small>(최근 {{ months }}개월)</small></th>
              <th>평균가<small>(최근 {{ months }}개월)</small></th>
              <th>평균 전용면적<small>(㎡)</small></th>
              <th>평균 건축연수<small>(년)</small></th>
              <th>회전율<small>(%)</small></th>
              <th>매물 소화율<small>(%)</small></th>
              <th>매물 부담율<small>(%)</small></th>
              <th v-if="webEmbed">매물<br>소진기간</th>
              <th v-else>매물 소진기간</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="`${r.sigungu}|${r.umdNm}`">
              <td v-if="!embedded" class="gu">{{ r.sigungu }}</td>
              <td class="nm">{{ r.umdNm }}<button v-if="webEmbed" type="button" class="nv-btn" :title="`${r.umdNm}만 보기 — 네이버 부동산 매매 매물`" @click="openDongListing(r)">네이버매물<svg viewBox="0 0 12 12" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2.5h5.5V8" /><path d="M9.5 2.5 2.5 9.5" /></svg></button></td>
              <!-- 총 세대수 — 건축물대장 자동값을 글로만(손으로 적지 않는다) -->
              <td :class="['units', { miss: unitsHint(r.sigungu, r.umdNm).fail, wait: webEmbed && unitsHint(r.sigungu, r.umdNm).text === '받는 중' }]" :title="unitsHint(r.sigungu, r.umdNm).tip">{{ unitsHint(r.sigungu, r.umdNm).text }}</td>
              <td class="in">
                <input
                  class="adm-cell"
                  inputmode="numeric"
                  placeholder="입력"
                  :value="r.listings ? r.listings.toLocaleString('ko-KR') : ''"
                  @input="setManual(r.sigungu, r.umdNm, 'listings', ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td :class="['n', 'deal', { strong: !webEmbed }]">
                <span class="grp y"><em class="pre">연</em><i>{{ cntInt(yearlyOf(dealOf(r))) }}</i></span><b>{{ cntFrac(yearlyOf(dealOf(r))) }}</b>
                <em class="bar">|</em>
                <span class="grp m"><em class="pre">월</em><i>{{ cntInt(monthlyOf(dealOf(r))) }}</i></span><b>{{ cntFrac(monthlyOf(dealOf(r))) }}</b>
              </td>
              <td :class="['n', 'amt', { strong: !webEmbed }]"><span class="v">{{ won(r.avgPrice) }}</span></td>
              <td class="n area"><span class="v">{{ areaText(r.avgAreaM2) }}</span></td>
              <td class="n age"><span class="v">{{ ageText(r.avgBuildYear) }}</span></td>
              <td class="n rate"><em v-if="r.turnover > 0" class="pre">연</em><span class="v">{{ pct(r.turnover) }}</span></td>
              <td class="n rate"><em v-if="r.absorb > 0" class="pre">연</em><span class="v">{{ pct(r.absorb) }}</span></td>
              <td class="n rate"><span class="v">{{ pct(r.burden) }}</span></td>
              <td class="n clear">
                <template v-if="r.clearMonths > 0">
                  <span class="v">{{ clearHead(r.clearMonths) }}개월</span><small v-if="clearSub(r.clearMonths)"> / {{ clearSub(r.clearMonths) }}</small>
                </template>
                <template v-else>-</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 웹은 표 밑 셈 설명을 뺀다(요약 칸의 ⓘ 말풍선에 같은 내용이 있다) -->
      <p v-if="!webEmbed && rows.length > 0" class="adm-foot">
        회전율 = 1년 거래량 ÷ 세대수 &nbsp;·&nbsp; 소화율 = 1년 거래량 ÷ 매물수 &nbsp;·&nbsp;
        부담율 = 매물수 ÷ 세대수 &nbsp;·&nbsp; 소진기간 = 매물수 ÷ 월평균 거래량.
        총 세대수는 건축물대장에서 자동으로 채웁니다(연립·다세대 · 아파트는 세대수, 오피스텔은 호수). 파란 칸(총 매물수)은 손으로 적습니다 — 적어 두면 다음에도 남습니다.
      </p>
    </div>
  </section>
</template>

<style scoped>
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
.adm-csv {
  margin-left: auto; border: 1px solid #c7d7f8; background: #fff; border-radius: 9px;
  padding: 8px 14px; font-family: inherit; font-size: 12.5px; font-weight: 700; color: #2b6df3; cursor: pointer;
}
.adm-csv:disabled { border-color: #e5e7eb; color: #c3c9d4; cursor: default; }

.adm-body { flex: 1 1 auto; width: 100%; max-width: 1680px; margin: 0 auto; padding: 24px 28px 60px; }

/* 고르는 줄 */
.adm-bar {
  display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap;
  background: #fff; border: 1px solid #e8ecf3; border-radius: 14px; padding: 16px 18px;
}
.adm-f { display: flex; flex-direction: column; gap: 6px; }
.adm-f small { font-size: 11px; font-weight: 700; color: #6b7280; }
.adm-f.narrow { flex: 0 0 auto; }
.adm-input {
  width: 260px; box-sizing: border-box; height: 36px;
  border: 1px solid #dde3ee; border-radius: 9px; background: #fff;
  padding: 0 11px; font-family: inherit; font-size: 13.5px; color: #111827;
}
.adm-input:focus { outline: none; border-color: #2b6df3; }
.adm-seg { display: inline-flex; gap: 4px; background: #f3f5f9; border-radius: 9px; padding: 3px; }
.adm-seg-btn {
  border: none; background: transparent; border-radius: 7px;
  padding: 7px 13px; font-family: inherit; font-size: 12.5px; font-weight: 700;
  color: #6b7280; cursor: pointer; white-space: nowrap;
}
.adm-seg-btn.on { background: #fff; color: #1f3a72; box-shadow: 0 1px 3px rgba(17, 24, 39, 0.1); }
.adm-load {
  margin-left: auto; height: 36px; padding: 0 20px;
  border: none; border-radius: 9px; background: #1f3a72; color: #fff;
  font-family: inherit; font-size: 13px; font-weight: 800; cursor: pointer;
}
.adm-load:hover { background: #16305f; }
.adm-load:disabled { background: #aeb8ca; cursor: default; }

.adm-msg { margin: 14px 0 0; padding: 11px 14px; border-radius: 10px; font-size: 12.5px; font-weight: 600; }
.adm-msg.err { background: #fef2f2; color: #b91c1c; }
.adm-msg.warn { background: #fffbeb; color: #92400e; }

/* 웹 요약 줄 — 상자마다 위 작은 이름, 아래 굵은 값 */
/* 요약 상자 줄 — 지역분석(.adm-gunav)과 크기 · 글자를 똑같이 맞춘다 */
.adm-nav { margin: 18px 0 14px; padding: 16px 18px 18px; border-radius: 10px; background: #f5f7fa; }
.adm-nav-scope { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 14px; font-size: 18px; font-weight: 800; color: #2b6df3; }
/* 웹 수요분석 요약 — 제목은 지역(파랑) + '수요분석'(검정). 위 3칸 · 아래 4칸, 두 줄 시작과 끝을 맞춘다 */
.adm-nav.dm .adm-nav-scope { color: #111827; }
.adm-nav.dm .adm-nav-scope .area { color: #2b6df3; }
.dm-row { display: grid; gap: 12px; }
.dm-row.c3 { grid-template-columns: repeat(3, minmax(0, 1fr)); margin-bottom: 16px; }
/* 두 줄 제목 — 앱 매매수요의 ① 기초수치 · ② 수요지표와 같은 이름 */
.dm-block-head { margin: 0 0 8px 2px; font-size: 14px; font-weight: 700; color: #111827; }
.dm-row.c5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.dm-cell.total .fit { margin-left: 6px; }
/* 칸 — 앱 매매수요 칸처럼 위 이름 띠(회색) + 아래 값(흰색). 이어진 칸은 빨갛게(앱 .lit 와 같은 색) */
.dm-cell { min-width: 0; border: 1px solid #e3e8f0; border-radius: 8px; background: #fff; overflow: visible; transition: background .12s, border-color .12s; }
.dm-head { display: flex; justify-content: center; padding: 8px 6px; border-bottom: 1px solid #e3e8f0; border-radius: 8px 8px 0 0; background: #f3f6fb; font-size: 14px; color: #6b7280; white-space: nowrap; }
.dm-body { display: flex; justify-content: center; align-items: center; padding: 14px 6px; }
.dm-body b { font-size: 18px; font-weight: 800; color: #2b6df3; white-space: nowrap; display: inline-flex; align-items: center; }
.dm-cell.lit { background: #fdecea; border-color: #f3c2bc; }
.dm-cell.lit .dm-head { background: #fbdcd8; border-bottom-color: #f3c2bc; }
.dm-cell .nbar { font-style: normal; font-weight: 400; color: #c3c9d4; margin: 0 7px; }
.dm-cell .gd { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; font-size: 13px; font-weight: 800; line-height: 1; }
.dm-cell .gd.g-A { background: #fde2e2; color: #c22e2e; }
.dm-cell .gd.g-B { background: #cfdeff; color: #1d4ed8; }
.dm-cell .gd.g-C { background: #e5e7eb; color: #111827; }
.dm-cell .fit { margin-left: 3px; font-size: 12px; font-weight: 800; color: #1f7a45; }
.dm-cell .fit.bad { color: #c22e2e; }
.adm-sum {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  margin: 18px 2px 10px; font-size: 12.5px; color: #6b7280; font-weight: 600;
}
.adm-sum strong { font-size: 14.5px; font-weight: 800; color: #111827; }
.adm-sum .dim { color: #9ca3af; font-weight: 500; }
.adm-sum b { font-weight: 800; }
.adm-sum .adm-sum-deal { color: #2b6df3; }
.adm-sum .adm-sum-ex { color: #16a34a; }
.adm-sum .code {
  font-size: 11px; font-weight: 700; color: #6b7280;
  background: #eef1f6; border-radius: 999px; padding: 2px 8px;
}

/* 표 */
.adm-table-wrap { background: #fff; border: 1px solid #e8ecf3; border-radius: 14px; overflow: hidden; }
.adm-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.adm-table th, .adm-table td {
  border-bottom: 1px solid #eef1f6; border-right: 1px solid #eef1f6;
  padding: 10px 12px; font-size: 12.5px; text-align: center; white-space: nowrap;
}
.adm-table th:last-child, .adm-table td:last-child { border-right: none; }
.adm-table thead th { background: #f7f9fc; color: #374151; font-weight: 700; }
.adm-table thead tr.grp th { background: #eef2f7; font-size: 12px; font-weight: 800; color: #1f3a72; }
/* 손으로 적는 칸은 파랗게 — 엑셀에서 쓰던 표시 그대로 */
/* 손으로 적는 칸(총 매물수) 머리 — 아래 입력 칸과 같은 흐린 파랑 */
.adm-table thead th.in, .adm-table thead tr.grp th.in { background: #f7faff; color: #1b3f8f; }
.adm-table th small { display: block; font-size: 10px; font-weight: 600; color: #9ca3af; }
.adm-table thead th.in small { color: #4b6cb7; }
.adm-table tbody tr:last-child td { border-bottom: none; }
.adm-table tbody tr:hover td { background: #fafbfe; }
.adm-table td.gu { font-weight: 700; color: #374151; white-space: nowrap; }
.adm-table td.nm { font-weight: 800; white-space: nowrap; }
/* 웹 — 동 이름 옆 '네이버 매물 ↗' (그 동만 보기 · 매매 · 종류 필터로 연다) */
.nv-btn { display: inline-flex; align-items: center; gap: 2px; height: 20px; margin-left: 6px; padding: 0 6px; border: 1px solid #dde3ee; border-radius: 999px; background: #fff; color: #6b7280; font-family: inherit; font-size: 12px; font-weight: 400; vertical-align: middle; cursor: pointer; } /* 링크일 뿐이라 작게 · 회색 · 굵기 없이(웹 글자 하한 12) */
.nv-btn:hover { border-color: #2b6df3; color: #2b6df3; }
.adm-table td.n { font-variant-numeric: tabular-nums; }
.adm-table td.n.strong { font-weight: 800; }
.adm-table td.in { background: #f7faff; padding: 6px 8px; }
/* 총 거래량 — 연 | 월 두 값을 가운데 막대로 가른다 (손품+현장과 같은 꼴) */
.adm-table td.deal { white-space: nowrap; letter-spacing: -0.3px; font-size: 11.5px; }
.adm-table td em.pre { font-style: normal; font-size: 10.5px; font-weight: 600; color: #6b7280; margin-right: 3px; }
.adm-table td.deal em.bar { font-style: normal; font-weight: 400; color: #c3cbd8; margin: 0 3px; }
/* 숫자 자리를 못 박는다 — 연은 세 자리, 월은 두 자리.
   앞붙임(연·월)은 제자리에 서고 숫자는 그 안에서 오른쪽에 붙어,
   줄이 달라도 끝자리가 세로로 맞는다. 소수점 아래는 뒤로 흘린다 */
.adm-table td.deal { padding-left: 6px; padding-right: 6px; font-variant-numeric: tabular-nums; }
.adm-table td.deal .grp { display: inline-block; }
.adm-table td.deal .grp i { display: inline-block; font-style: normal; text-align: right; }
.adm-table td.deal .grp.y i { min-width: 3ch; }
.adm-table td.deal .grp.m i { min-width: 2ch; }
/* 소수점 아래 자리도 폭을 잡아 둔다 — 없는 줄과 있는 줄의 전체 너비가
   달라지면 가운데 정렬 때문에 끝선이 어긋난다 */
.adm-table td.deal b { display: inline-block; width: 11px; text-align: left; font-weight: inherit; }
/* 매물 소진기간 — '96개월 / 8년' 한 줄로(해 환산이 아래로 떨어지지 않게) */
.adm-table td.clear { line-height: 1.25; white-space: nowrap; }
.adm-table td.clear em { font-style: normal; font-size: 10.5px; font-weight: 600; color: #6b7280; margin-left: 1px; }
.adm-table td.clear small { font-size: inherit; font-weight: inherit; color: inherit; }
/* 줄끼리 끝자리를 맞춘다 — 값을 같은 폭 상자에 담아 오른쪽으로 붙인다.
   상자째로는 칸 가운데에 서므로 머리글과도 어긋나 보이지 않는다 */
.adm-table td .v { display: inline-block; text-align: right; }
/* 금액 칸 이름은 'amt' — 'price' 로 쓰면 웹 선정목록 카드의 .price(바탕 · 둥근 상자)가 덮여 상자가 한 겹 더 생긴다 */
.adm-table td.amt .v { min-width: 84px; }
.adm-table td.area .v { min-width: 36px; }
.adm-table td.age .v { min-width: 22px; }
.adm-table td.rate .v { min-width: 44px; }
.adm-table td.clear .v { min-width: 26px; }
.adm-table td.clear small { width: 54px; margin: 0 auto; text-align: right; }
.adm-cell {
  width: 100%; box-sizing: border-box; height: 30px;
  border: 1px solid #cfdcf6; border-radius: 7px; background: #fff;
  padding: 0 8px; font-family: inherit; font-size: 12.5px; color: #1b3f8f;
  font-weight: 700; text-align: right;
}
.adm-cell:focus { outline: none; border-color: #2b6df3; }
/* 총 세대수 — 자동값을 글로만(칸 없음), 다른 숫자 칸과 같은 검은 글씨 */
.adm-table td.units { text-align: right; color: #111827; font-weight: 600; }
.adm-table td.units.miss { color: #b44545; font-weight: 500; }
.adm-table td.units.wait { font-weight: 400; }   /* 웹 — 받는 중은 굵게 하지 않는다 */
.adm-cell::placeholder { color: #aebbd6; font-weight: 400; }

.adm-foot { margin: 14px 2px 0; font-size: 11.5px; line-height: 1.7; color: #9ca3af; }

@media (max-width: 860px) {
  .adm-top-in, .adm-body { padding-left: 16px; padding-right: 16px; }
  .adm-input { width: 100%; }
  .adm-f { flex: 1 1 100%; }
  .adm-load { margin-left: 0; }
}
</style>
