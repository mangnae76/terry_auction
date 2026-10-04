<script setup lang="ts">
import L from 'leaflet';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import chevronDownIcon from '../assets/icones/chevron-down.png';
import {
  fetchRawAptTrades,
  fetchTradeVolumeStats,
  type PropertyType,
  type RawAptTrade,
  type TradeVolumeStat,
} from '../services/publicDataApi';
import { geocodeAddress } from '../services/routeOptimizer';

type TabKey = 'weekly' | 'regional' | 'ranking';
const activeTab = ref<TabKey>('weekly');

// === 주간 추이 (10주) — 국토부 RTMS API 실거래가 기반 ===
interface WeeklyTrendPoint { week: string; priceChange: number; dealChange: number; }
const weeklyTrendData = ref<WeeklyTrendPoint[]>([]);
const weeklyTrendDateRange = ref('');
const trendLoading = ref(false);
const trendError = ref('');

// 차트 좌표 계산 (viewBox: 800x300, 좌우 padding 40, 상하 padding 30)
const W_CHART = 800;
const H_CHART = 280;
const W_PAD_X = 40;
const W_PAD_Y = 30;
const W_PRICE_MAX_DEFAULT = 1.2;
const W_DEAL_MAX_DEFAULT = 16;
// 데이터 분포에 맞춰 동적으로 ±스케일을 잡되, 최소값을 보장해 너무 펑퍼짐해지지 않도록 한다.
const weeklyPriceScale = computed(() => {
  const max = Math.max(0, ...weeklyTrendData.value.map((p) => Math.abs(p.priceChange)));
  return Math.max(W_PRICE_MAX_DEFAULT, Math.ceil(max * 1.2));
});
const weeklyDealScale = computed(() => {
  const max = Math.max(0, ...weeklyTrendData.value.map((p) => Math.abs(p.dealChange)));
  return Math.max(W_DEAL_MAX_DEFAULT, Math.ceil(max * 1.2));
});
const xWeekly = (i: number) => {
  const n = weeklyTrendData.value.length;
  if (n <= 1) return W_PAD_X;
  return W_PAD_X + ((W_CHART - 2 * W_PAD_X) * i) / (n - 1);
};
const yPriceWeekly = (v: number) => {
  const max = weeklyPriceScale.value;
  const t = (v + max) / (2 * max);
  return H_CHART - W_PAD_Y - t * (H_CHART - 2 * W_PAD_Y);
};
const yDealWeekly = (v: number) => {
  const max = weeklyDealScale.value;
  const t = (v + max) / (2 * max);
  return H_CHART - W_PAD_Y - t * (H_CHART - 2 * W_PAD_Y);
};
const weeklyPricePath = computed(() =>
  weeklyTrendData.value
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xWeekly(i).toFixed(1)} ${yPriceWeekly(p.priceChange).toFixed(1)}`)
    .join(' '),
);
const weeklyDealPath = computed(() =>
  weeklyTrendData.value
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xWeekly(i).toFixed(1)} ${yDealWeekly(p.dealChange).toFixed(1)}`)
    .join(' '),
);

// === 지역별 시세 — 국토부 RTMS API 실거래가 기반 ===
interface RegionalRow {
  name: string; priceAvg: number; prevPrice: number;
  priceChange: number; deals: number; prevDeals: number; dealChange: number;
}
// 수도권 16개 자치구 (LAWD_CD 5자리)
// `sido`/`district`는 검색폼(regionGroups)과 매칭 — 행정시 sub-district인 경우 부모 시(시) 라벨 사용
const REGIONAL_LAWD: Array<{ name: string; code: string; sido: string; district: string }> = [
  { name: '강남구',        code: '11680', sido: '서울특별시', district: '강남구' },
  { name: '서초구',        code: '11650', sido: '서울특별시', district: '서초구' },
  { name: '송파구',        code: '11710', sido: '서울특별시', district: '송파구' },
  { name: '용산구',        code: '11170', sido: '서울특별시', district: '용산구' },
  { name: '마포구',        code: '11440', sido: '서울특별시', district: '마포구' },
  { name: '성동구',        code: '11200', sido: '서울특별시', district: '성동구' },
  { name: '노원구',        code: '11350', sido: '서울특별시', district: '노원구' },
  { name: '양천구',        code: '11470', sido: '서울특별시', district: '양천구' },
  { name: '영등포구',      code: '11560', sido: '서울특별시', district: '영등포구' },
  { name: '강서구',        code: '11500', sido: '서울특별시', district: '강서구' },
  { name: '성남시 분당구', code: '41135', sido: '경기도',     district: '성남시' },
  { name: '용인시 수지구', code: '41465', sido: '경기도',     district: '용인시' },
  { name: '수원시 영통구', code: '41117', sido: '경기도',     district: '수원시' },
  { name: '화성시 동탄구', code: '41590', sido: '경기도',     district: '화성시' },
  { name: '고양시 덕양구', code: '41281', sido: '경기도',     district: '고양시' },
  { name: '인천 연수구',   code: '28185', sido: '인천광역시', district: '연수구' },
  { name: '인천 중구',     code: '28110', sido: '인천광역시', district: '중구' },
];
const regionalData = ref<RegionalRow[]>([]);
const regionalDateRange = ref('');
const regionalLoading = ref(false);
const regionalError = ref('');
// 마지막에 fetch한 raw 거래 (TOP 랭킹 카드들이 공유)
const rawTrades = ref<RawAptTrade[]>([]);
type RegionalProperty = 'apt' | 'villa' | 'single';
type RegionalMetric = 'price' | 'deal';
const regionalProperty = ref<RegionalProperty>('apt');
const regionalMetric = ref<RegionalMetric>('price');
const regionalChartMax = computed(() => {
  const vals = regionalData.value.map((r) => Math.abs(regionalMetric.value === 'price' ? r.priceChange : r.dealChange));
  return Math.max(...vals, regionalMetric.value === 'price' ? 2.7 : 16);
});

// === 거래랭킹 탭 — 지역/아파트/거래량 TOP 10 ===
type ToplistTab = 'region' | 'apt' | 'volume';
const toplistTab = ref<ToplistTab>('region');
interface ToplistRow { rank: number; name: string; pct: number; valueLabel: string; }

const lawdNameMap = new Map(REGIONAL_LAWD.map((r) => [r.code, r.name]));

const medianN = (arr: number[]): number => {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

interface MonthBuckets<T> { curr: T[]; prev: T[]; }
const splitByMonth = <T extends { date: string }>(rows: T[]): MonthBuckets<T> => {
  const months = Array.from(new Set(rows.map((r) => r.date.slice(0, 7)))).sort();
  if (months.length < 2) return { curr: rows, prev: [] };
  const currKey = months[months.length - 1];
  const prevKey = months[months.length - 2];
  return {
    curr: rows.filter((r) => r.date.startsWith(currKey)),
    prev: rows.filter((r) => r.date.startsWith(prevKey)),
  };
};

const toplistDateRange = computed(() => {
  if (rawTrades.value.length === 0) return '';
  const months = Array.from(new Set(rawTrades.value.map((t) => t.date.slice(0, 7)))).sort();
  if (months.length === 0) return '';
  const last = months[months.length - 1];
  return `기준일 : ${last.replace('-', '-')}-01 ~ ${last.replace('-', '-')}-28`;
});

// 1) 지역(시군구) TOP — 평균 시세(만원/m²) 상승률
const toplistRegion = computed<ToplistRow[]>(() => {
  if (rawTrades.value.length === 0) return [];
  const out: Array<{ name: string; currMed: number; prevMed: number; pct: number }> = [];
  for (const r of REGIONAL_LAWD) {
    const rows = rawTrades.value.filter((t) => t.lawdCd === r.code);
    if (rows.length === 0) continue;
    const { curr, prev } = splitByMonth(rows);
    if (curr.length < 3 || prev.length < 3) continue;
    const cm = medianN(curr.map((x) => x.pricePerM2));
    const pm = medianN(prev.map((x) => x.pricePerM2));
    if (pm <= 0) continue;
    out.push({ name: r.name, currMed: cm, prevMed: pm, pct: ((cm - pm) / pm) * 100 });
  }
  return out
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 10)
    .map((it, i) => ({
      rank: i + 1,
      name: it.name,
      pct: it.pct,
      valueLabel: `${Math.round(it.currMed).toLocaleString('ko-KR')}만원/㎡`,
    }));
});

// 2) 아파트(단지) TOP — 평균 거래가(억원) 상승률 (단지명 + 시군구로 키)
const toplistApt = computed<ToplistRow[]>(() => {
  if (rawTrades.value.length === 0) return [];
  const map = new Map<string, RawAptTrade[]>();
  for (const t of rawTrades.value) {
    if (!t.apartment) continue;
    const key = `${t.lawdCd}|${t.apartment}`;
    const arr = map.get(key) ?? [];
    arr.push(t);
    map.set(key, arr);
  }
  const out: Array<{ name: string; currMed: number; pct: number }> = [];
  for (const [key, rows] of map) {
    const { curr, prev } = splitByMonth(rows);
    if (curr.length < 2 || prev.length < 2) continue;
    const cm = medianN(curr.map((x) => x.dealAmount)); // 만원
    const pm = medianN(prev.map((x) => x.dealAmount));
    if (pm <= 0) continue;
    const [, name] = key.split('|');
    out.push({ name, currMed: cm, pct: ((cm - pm) / pm) * 100 });
  }
  return out
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 10)
    .map((it, i) => ({
      rank: i + 1,
      name: it.name,
      pct: it.pct,
      valueLabel: `${(it.currMed / 10000).toFixed(2)}억원`,
    }));
});

// 3) 거래량(시군구) TOP — 거래 건수 증가율
const toplistVolume = computed<ToplistRow[]>(() => {
  if (rawTrades.value.length === 0) return [];
  const out: Array<{ name: string; currCount: number; prevCount: number; pct: number }> = [];
  for (const r of REGIONAL_LAWD) {
    const rows = rawTrades.value.filter((t) => t.lawdCd === r.code);
    const { curr, prev } = splitByMonth(rows);
    if (prev.length < 1) continue;
    const pct = ((curr.length - prev.length) / prev.length) * 100;
    out.push({ name: r.name, currCount: curr.length, prevCount: prev.length, pct });
  }
  return out
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 10)
    .map((it, i) => ({
      rank: i + 1,
      name: it.name,
      pct: it.pct,
      valueLabel: `${it.currCount}건`,
    }));
});

const currentToplist = computed(() => {
  if (toplistTab.value === 'region') return toplistRegion.value;
  if (toplistTab.value === 'apt') return toplistApt.value;
  return toplistVolume.value;
});
void lawdNameMap;

// 지역/거래량 TOP 행 클릭 → 조건검색 자동 입력 + 검색 실행
const onClickToplistRow = async (row: ToplistRow) => {
  if (toplistTab.value === 'apt') return; // 단지 클릭은 검색 매핑 모호 — 비활성
  const meta = REGIONAL_LAWD.find((r) => r.name === row.name);
  if (!meta) return;
  const sg = regionGroups.find((g) => g.sido === meta.sido);
  if (!sg) return;
  const district = sg.districts.find((d) => d.label === meta.district);
  if (!district) return;
  // selectedSido 변경 시 watch가 selectedDistrict를 첫 옵션(전체)으로 자동 리셋한다.
  // → nextTick으로 그 watch가 끝난 뒤 district를 덮어써야 사용자가 원한 시군구가 유지됨.
  selectedSido.value = meta.sido;
  await nextTick();
  selectedDistrict.value = district.label;
  await nextTick();
  void loadStats();
};

// 주차/주의 월요일 시작일 산정 (Mon=시작)
const startOfWeekIso = (dateStr: string): string => {
  const d = new Date(dateStr);
  const day = d.getDay(); // 0=Sun .. 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
};
const weekLabel = (mondayIso: string): string => {
  const d = new Date(mondayIso);
  const m = d.getMonth() + 1;
  const wk = Math.ceil(d.getDate() / 7);
  return `${m}/${wk}주`;
};
const formatYmd = (iso: string): string => iso.replaceAll('-', '.');

const loadStatsTrendAndRegional = async () => {
  trendLoading.value = true;
  regionalLoading.value = true;
  trendError.value = '';
  regionalError.value = '';
  try {
    const codes = REGIONAL_LAWD.map((r) => r.code);
    const { trades, errors } = await fetchRawAptTrades(codes, 4, regionalProperty.value);
    rawTrades.value = trades;
    if (trades.length === 0) {
      trendError.value = errors[0] || '실거래 데이터 없음';
      regionalError.value = errors[0] || '실거래 데이터 없음';
      weeklyTrendData.value = [];
      regionalData.value = [];
      return;
    }
    // === 주간추이 ===
    // mean 대신 median을 쓰면 그 주에 우연히 강남 고가 매물이 많이 거래되어
    // 평균을 흔드는 표본 편향(mix shift)을 상당히 완화할 수 있다.
    const median = (arr: number[]): number => {
      if (arr.length === 0) return 0;
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };
    const MIN_TRADES_PER_WEEK = 5;
    const weekMap = new Map<string, typeof trades>();
    for (const t of trades) {
      const wk = startOfWeekIso(t.date);
      const arr = weekMap.get(wk) ?? [];
      arr.push(t);
      weekMap.set(wk, arr);
    }
    const sortedWeeks = Array.from(weekMap.entries())
      .filter(([, ts]) => ts.length >= MIN_TRADES_PER_WEEK)
      .sort((a, b) => a[0].localeCompare(b[0]));
    const last10 = sortedWeeks.slice(-10);
    const trend: WeeklyTrendPoint[] = [];
    for (let i = 0; i < last10.length; i += 1) {
      const [, ts] = last10[i];
      const med = median(ts.map((t) => t.pricePerM2));
      const count = ts.length;
      let priceChange = 0;
      let dealChange = 0;
      if (i > 0) {
        const prev = last10[i - 1][1];
        const prevMed = median(prev.map((t) => t.pricePerM2));
        priceChange = prevMed > 0 ? ((med - prevMed) / prevMed) * 100 : 0;
        dealChange = prev.length > 0 ? ((count - prev.length) / prev.length) * 100 : 0;
      }
      trend.push({ week: weekLabel(last10[i][0]), priceChange, dealChange });
    }
    weeklyTrendData.value = trend;
    if (last10.length > 0) {
      const start = last10[0][0];
      const endMonday = last10[last10.length - 1][0];
      const endSunday = (() => {
        const d = new Date(endMonday);
        d.setDate(d.getDate() + 6);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })();
      weeklyTrendDateRange.value = `${formatYmd(start)} ~ ${formatYmd(endSunday)}`;
    }

    // === 지역별 시세 (이번 주 vs 직전 주) ===
    const recent2 = sortedWeeks.slice(-2);
    if (recent2.length < 2) {
      regionalError.value = '주간 비교를 위한 데이터가 부족합니다 (최소 2주 필요).';
      regionalData.value = [];
      return;
    }
    const [prevKey, prevTrades] = recent2[0];
    const [currKey, currTrades] = recent2[1];
    const grouped = (rows: typeof trades) => {
      const map = new Map<string, typeof trades>();
      for (const r of rows) {
        const arr = map.get(r.lawdCd) ?? [];
        arr.push(r);
        map.set(r.lawdCd, arr);
      }
      return map;
    };
    const currByCode = grouped(currTrades);
    const prevByCode = grouped(prevTrades);
    const regional: RegionalRow[] = [];
    for (const r of REGIONAL_LAWD) {
      const curr = currByCode.get(r.code) ?? [];
      const prev = prevByCode.get(r.code) ?? [];
      // mean보다 mix shift에 강한 median 사용
      const currAvg = median(curr.map((t) => t.pricePerM2));
      const prevAvg = median(prev.map((t) => t.pricePerM2));
      const priceChange = prevAvg > 0 ? ((currAvg - prevAvg) / prevAvg) * 100 : 0;
      const dealChange = prev.length > 0 ? ((curr.length - prev.length) / prev.length) * 100 : 0;
      regional.push({
        name: r.name,
        priceAvg: Math.round(currAvg),
        prevPrice: Math.round(prevAvg),
        priceChange,
        deals: curr.length,
        prevDeals: prev.length,
        dealChange,
      });
    }
    regionalData.value = regional;
    const endSunday = (() => {
      const d = new Date(currKey);
      d.setDate(d.getDate() + 6);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    regionalDateRange.value = `${formatYmd(currKey)} ~ ${formatYmd(endSunday)}`;
    if (errors.length > 0) {
      const summary = `일부 지역 조회 실패 (${errors.length}건)`;
      trendError.value = trendError.value || summary;
      regionalError.value = regionalError.value || summary;
    }
    void prevKey;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    trendError.value = msg;
    regionalError.value = msg;
  } finally {
    trendLoading.value = false;
    regionalLoading.value = false;
  }
};

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
      { label: '계양구', lawdCode: '28245' }, { label: '서해구', lawdCode: '28260' },
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
  void loadStatsTrendAndRegional();
});

watch(regionalProperty, () => {
  void loadStatsTrendAndRegional();
});
</script>

<template>
  <section class="tsp-shell">
    <header class="tsp-topbar">
      <h1 class="tsp-page-title">부동산 시장정보</h1>
      <button class="tsp-topbar-btn" type="button" :disabled="loading" @click="loadStats" aria-label="새로고침">
        <img :src="chevronDownIcon" alt="" />
      </button>
    </header>

    <nav class="tsp-tabs">
      <button
        type="button"
        :class="['tsp-tab', { active: activeTab === 'weekly' }]"
        @click="activeTab = 'weekly'"
      >주간추이</button>
      <button
        type="button"
        :class="['tsp-tab', { active: activeTab === 'regional' }]"
        @click="activeTab = 'regional'"
      >지역별시세</button>
      <button
        type="button"
        :class="['tsp-tab', { active: activeTab === 'ranking' }]"
        @click="activeTab = 'ranking'"
      >거래랭킹</button>
    </nav>

    <div class="tsp-body">
      <!-- 주간 추이 -->
      <template v-if="activeTab === 'weekly'">
        <section class="tsp-card tsp-trend-card">
          <header class="tsp-trend-head">
            <h2 class="tsp-trend-title"><span class="tsp-trend-icon">📊</span> 주간 수도권 시세·거래 추이</h2>
            <p class="tsp-trend-sub">최근 10주<span v-if="weeklyTrendDateRange"> ({{ weeklyTrendDateRange }})</span></p>
          </header>
          <div class="tsp-trend-legend">
            <span class="lg"><span class="dot price"></span>중간가격 변동률</span>
            <span class="lg"><span class="dot deal"></span>거래량 변동률</span>
          </div>
          <p v-if="trendLoading" class="tsp-note">실거래 데이터 불러오는 중…</p>
          <p v-else-if="weeklyTrendData.length === 0" class="tsp-note warn">{{ trendError || '표시할 데이터가 없습니다.' }}</p>
          <div v-else class="tsp-trend-chart-wrap">
            <svg :viewBox="`0 0 ${W_CHART} ${H_CHART}`" class="tsp-trend-svg" preserveAspectRatio="none">
              <g class="tsp-grid">
                <line v-for="t in [0.25, 0.5, 0.75]" :key="t"
                  :x1="W_PAD_X" :x2="W_CHART - W_PAD_X"
                  :y1="W_PAD_Y + t * (H_CHART - 2 * W_PAD_Y)"
                  :y2="W_PAD_Y + t * (H_CHART - 2 * W_PAD_Y)" />
              </g>
              <path :d="weeklyDealPath" class="tsp-trend-line deal" />
              <circle v-for="(p, i) in weeklyTrendData" :key="`d-${i}`"
                :cx="xWeekly(i)" :cy="yDealWeekly(p.dealChange)" r="4" class="tsp-trend-dot deal" />
              <path :d="weeklyPricePath" class="tsp-trend-line price" />
              <circle v-for="(p, i) in weeklyTrendData" :key="`p-${i}`"
                :cx="xWeekly(i)" :cy="yPriceWeekly(p.priceChange)" r="4" class="tsp-trend-dot price" />
            </svg>
            <div class="tsp-trend-xaxis">
              <span v-for="(p, i) in weeklyTrendData" :key="i"
                :style="{ left: `${weeklyTrendData.length > 1 ? (i / (weeklyTrendData.length - 1)) * 100 : 50}%` }">
                {{ p.week }}
              </span>
            </div>
            <div class="tsp-trend-yaxis-l">
              <span>+{{ weeklyPriceScale.toFixed(1) }}%</span>
              <span>+{{ (weeklyPriceScale / 2).toFixed(1) }}%</span>
              <span>0%</span>
              <span>-{{ (weeklyPriceScale / 2).toFixed(1) }}%</span>
              <span>-{{ weeklyPriceScale.toFixed(1) }}%</span>
            </div>
            <div class="tsp-trend-yaxis-r">
              <span>+{{ weeklyDealScale }}%</span>
              <span>+{{ Math.round(weeklyDealScale / 2) }}%</span>
              <span>0%</span>
              <span>-{{ Math.round(weeklyDealScale / 2) }}%</span>
              <span>-{{ weeklyDealScale }}%</span>
            </div>
          </div>
          <p class="tsp-trend-source">출처: 국토교통부 RTMS 아파트 매매 실거래가(최근 4개월) — 16개 수도권 자치구. 가격은 주차별 만원/m²의 중간값(median) 변동률, 표본 5건 미만 주는 제외 (한국부동산원 공식 시세지수와는 다른 단순 계산값입니다).</p>
        </section>
      </template>

      <!-- 지역별 시세 -->
      <template v-if="activeTab === 'regional'">
        <section class="tsp-card tsp-region-card">
          <header class="tsp-region-head">
            <h2 class="tsp-trend-title"><span class="tsp-trend-icon">📊</span> 주간 수도권 부동산 시세 동향</h2>
            <p class="tsp-trend-sub">전주 대비 변동률<span v-if="regionalDateRange"> ({{ regionalDateRange }})</span></p>
          </header>
          <div class="tsp-region-controls">
            <div class="tsp-seg">
              <button :class="['tsp-seg-btn', { active: regionalProperty === 'apt' }]" @click="regionalProperty = 'apt'">아파트</button>
              <button :class="['tsp-seg-btn', { active: regionalProperty === 'villa' }]" @click="regionalProperty = 'villa'">다세대</button>
              <button :class="['tsp-seg-btn', { active: regionalProperty === 'single' }]" @click="regionalProperty = 'single'">단독주택</button>
            </div>
            <div class="tsp-seg">
              <button :class="['tsp-seg-btn', { active: regionalMetric === 'price' }]" @click="regionalMetric = 'price'">시세변동</button>
              <button :class="['tsp-seg-btn', { active: regionalMetric === 'deal' }]" @click="regionalMetric = 'deal'">거래변동</button>
            </div>
          </div>
          <div class="tsp-region-legend">
            <span class="lg"><span class="dot up"></span>상승</span>
            <span class="lg"><span class="dot down"></span>하락</span>
          </div>
          <p v-if="regionalLoading" class="tsp-note">실거래 데이터 불러오는 중…</p>
          <p v-else-if="regionalData.length === 0" class="tsp-note warn">{{ regionalError || '표시할 데이터가 없습니다.' }}</p>
          <div v-else class="tsp-region-bars">
            <div v-for="r in regionalData" :key="r.name" class="tsp-region-bar-cell">
              <div class="tsp-region-bar-track">
                <div
                  :class="['tsp-region-bar', (regionalMetric === 'price' ? r.priceChange : r.dealChange) >= 0 ? 'up' : 'down']"
                  :style="{ height: `${(Math.abs(regionalMetric === 'price' ? r.priceChange : r.dealChange) / regionalChartMax) * 100}%`,
                            top: (regionalMetric === 'price' ? r.priceChange : r.dealChange) >= 0
                              ? `calc(50% - ${(Math.abs(regionalMetric === 'price' ? r.priceChange : r.dealChange) / regionalChartMax) * 50}%)`
                              : '50%' }"
                >
                  <span class="tsp-region-bar-label">
                    {{ (regionalMetric === 'price' ? r.priceChange : r.dealChange) >= 0 ? '+' : '' }}{{ (regionalMetric === 'price' ? r.priceChange : r.dealChange).toFixed(1) }}%
                  </span>
                </div>
                <div class="tsp-region-axis"></div>
              </div>
              <div class="tsp-region-bar-name">{{ r.name }}</div>
            </div>
          </div>
          <table v-if="regionalData.length > 0" class="tsp-region-table">
            <thead>
              <tr>
                <th>지역구</th>
                <th class="r">평균 시세 <small>(만원/m²)</small></th>
                <th class="r">시세 변동</th>
                <th class="r">거래건수</th>
                <th class="r">거래 변동</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in regionalData" :key="r.name">
                <td>{{ r.name }}</td>
                <td class="r">{{ r.priceAvg.toLocaleString('ko-KR') }} <span class="prev">(전주 {{ r.prevPrice.toLocaleString('ko-KR') }})</span></td>
                <td :class="['r', r.priceChange >= 0 ? 'up' : 'down']">{{ r.priceChange >= 0 ? '+' : '' }}{{ r.priceChange.toFixed(2) }}%</td>
                <td class="r">{{ r.deals }}건 <span class="prev">(전주 {{ r.prevDeals }})</span></td>
                <td :class="['r', r.dealChange >= 0 ? 'up' : 'down']">{{ r.dealChange >= 0 ? '+' : '' }}{{ r.dealChange.toFixed(1) }}%</td>
              </tr>
            </tbody>
          </table>
          <p class="tsp-trend-source">출처: 국토교통부 RTMS 아파트 매매 실거래가 — 이번 주 vs 직전 주 비교</p>
        </section>
      </template>

      <!-- 거래랭킹 (기존 컨텐츠) -->
      <template v-if="activeTab === 'ranking'">
      <section class="tsp-card tsp-toplist-card">
        <nav class="tsp-toplist-tabs">
          <button :class="['tsp-toplist-tab', { active: toplistTab === 'region' }]" @click="toplistTab = 'region'">지역 TOP</button>
          <button :class="['tsp-toplist-tab', { active: toplistTab === 'apt' }]" @click="toplistTab = 'apt'">아파트 TOP</button>
          <button :class="['tsp-toplist-tab', { active: toplistTab === 'volume' }]" @click="toplistTab = 'volume'">거래량 TOP</button>
        </nav>
        <div class="tsp-toplist-header">
          <span class="tsp-toplist-icon-sm">{{ toplistTab === 'volume' ? '💰' : toplistTab === 'apt' ? '🏢' : '🗺️' }}</span>
          <span class="tsp-toplist-meta">{{ toplistDateRange || '-' }} · 수도권 16개 자치구 기준</span>
        </div>
        <p v-if="trendLoading" class="tsp-note">실거래 데이터 불러오는 중…</p>
        <p v-else-if="currentToplist.length === 0" class="tsp-note warn">집계 가능한 데이터가 부족합니다.</p>
        <div v-else class="tsp-toplist-body">
          <div class="tsp-toplist-top3">
            <div
              v-for="r in currentToplist.slice(0, 3)"
              :key="r.rank"
              :class="['tsp-top3-item', { clickable: toplistTab !== 'apt' }]"
              @click="onClickToplistRow(r)"
            >
              <span class="rank">{{ r.rank }}</span>
              <strong class="name">{{ r.name }}</strong>
              <div class="metrics">
                <span class="pct" :class="r.pct >= 0 ? 'up' : 'down'">{{ r.pct >= 0 ? '↑' : '↓' }}{{ Math.abs(r.pct).toFixed(2) }}%</span>
                <span class="value">{{ r.valueLabel }}</span>
              </div>
            </div>
          </div>
          <ul class="tsp-toplist-rest">
            <li
              v-for="r in currentToplist.slice(3)"
              :key="r.rank"
              :class="['tsp-rest-item', { clickable: toplistTab !== 'apt' }]"
              @click="onClickToplistRow(r)"
            >
              <span class="rank">{{ r.rank }}</span>
              <span class="name">{{ r.name }}</span>
              <span class="pct" :class="r.pct >= 0 ? 'up' : 'down'">{{ r.pct >= 0 ? '↑' : '↓' }}{{ Math.abs(r.pct).toFixed(2) }}%</span>
              <span class="value">{{ r.valueLabel }}</span>
            </li>
          </ul>
        </div>
      </section>

      <section class="tsp-card">
        <header class="tsp-card-head">
          <h2>조건 검색</h2>
        </header>
        <div class="tsp-filter">
          <div class="tsp-filter-row three">
            <select class="tsp-select" v-model="selectedSido">
              <option v-for="sido in sidoOptions" :key="sido" :value="sido">{{ sido }}</option>
            </select>
            <select class="tsp-select" v-model="selectedDistrict" :disabled="isNationwide">
              <option v-for="district in districtOptions" :key="district.lawdCode" :value="district.label">
                {{ district.label }}
              </option>
            </select>
            <select class="tsp-select" v-model="selectedPropertyType">
              <option v-for="opt in propertyOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
          <div class="tsp-filter-row three">
            <select class="tsp-select" v-model.number="selectedPeriod">
              <option v-for="m in periodOptions" :key="m" :value="m">{{ m }}개월</option>
            </select>
            <select class="tsp-select" v-model.number="selectedTopN">
              <option v-for="opt in topNOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
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
      </template>
    </div>

    <AppMobileBottomNav active="culture" />
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

.tsp-tabs {
  display: flex; gap: 24px; padding: 0 18px;
  background: #fff; border-bottom: 1px solid #eef0f5;
}
.tsp-tab {
  border: none; background: transparent; padding: 12px 0 14px;
  font-size: 17px; font-weight: 700; color: #9ca3af; cursor: pointer;
  position: relative;
}
.tsp-tab.active { color: #111827; font-weight: 800; }
.tsp-tab.active::after {
  content: ''; position: absolute; left: -4px; right: -4px; bottom: -1px;
  height: 3px; background: #111827; border-radius: 2px;
}

.tsp-body { flex: 1 1 auto; padding: 14px 12px; display: flex; flex-direction: column; gap: 14px; }

.tsp-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; }
.tsp-card-head { display: flex; align-items: baseline; justify-content: space-between; padding: 16px 16px 12px; }
.tsp-card-head h2 { margin: 0; font-size: 15.3px; font-weight: 800; color: #111827; }
.tsp-card-sub { font-size: 12px; color: #9ca3af; font-weight: 500; }

.tsp-filter { display: flex; flex-direction: column; gap: 10px; padding: 0 14px 16px; }
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

/* === 거래랭킹 TOP 카드 === */
.tsp-toplist-card { padding: 0; overflow: hidden; }
.tsp-toplist-tabs {
  display: grid; grid-template-columns: 1fr 1fr 1fr;
  border-bottom: 1px solid #e5e7eb;
}
.tsp-toplist-tab {
  border: none; background: #fff; padding: 12px 8px;
  font-size: 13px; font-weight: 700; color: #9ca3af; cursor: pointer;
  border-right: 1px solid #f1f5f9;
}
.tsp-toplist-tab:last-child { border-right: none; }
.tsp-toplist-tab.active { background: #1e3a5f; color: #fff; }
.tsp-toplist-header {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px 4px;
}
.tsp-toplist-icon-sm { font-size: 16px; flex: 0 0 auto; }
.tsp-toplist-meta { font-size: 11px; color: #9ca3af; flex: 1 1 auto; text-align: right; }
.tsp-toplist-body { padding: 6px 12px 14px; display: flex; flex-direction: column; gap: 8px; }

.tsp-toplist-top3 { display: flex; flex-direction: column; gap: 6px; }
.tsp-top3-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 4px; border-bottom: 1px solid #f1f5f9;
}
.tsp-top3-item.clickable { cursor: pointer; }
.tsp-top3-item.clickable:hover { background: #f3f6fc; border-radius: 6px; }
.tsp-top3-item:last-child { border-bottom: none; }
.tsp-top3-item .rank {
  flex: 0 0 auto; width: 18px; height: 18px;
  background: #1e3a5f; color: #fff; border-radius: 4px;
  font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center;
}
.tsp-top3-item .name { flex: 1 1 auto; min-width: 0; font-size: 14px; font-weight: 800; color: #1e3a5f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tsp-top3-item .metrics { display: inline-flex; align-items: baseline; gap: 8px; flex: 0 0 auto; }
.tsp-top3-item .pct { font-size: 13px; font-weight: 800; }
.tsp-top3-item .pct.up { color: #ef4444; }
.tsp-top3-item .pct.down { color: #2563eb; }
.tsp-top3-item .value { font-size: 12px; color: #6b7280; font-weight: 600; }

.tsp-toplist-rest { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.tsp-rest-item {
  display: grid; grid-template-columns: 18px 1fr auto auto;
  align-items: center; gap: 8px; padding: 6px 4px;
  font-size: 12px;
}
.tsp-rest-item.clickable { cursor: pointer; border-radius: 6px; }
.tsp-rest-item.clickable:hover { background: #f3f6fc; }
.tsp-rest-item .rank {
  width: 18px; height: 18px; background: #cbd5e1; color: #1e3a5f;
  border-radius: 4px; font-size: 10.5px; font-weight: 800;
  display: inline-flex; align-items: center; justify-content: center;
}
.tsp-rest-item .name { color: #374151; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tsp-rest-item .pct { font-size: 11.5px; font-weight: 800; }
.tsp-rest-item .pct.up { color: #ef4444; }
.tsp-rest-item .pct.down { color: #2563eb; }
.tsp-rest-item .value { font-size: 11px; color: #6b7280; font-weight: 600; }

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

/* === 주간 추이 === */
.tsp-trend-card { padding: 16px; }
.tsp-trend-head { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.tsp-trend-title {
  margin: 0; font-size: 15px; font-weight: 800; color: #111827;
  display: inline-flex; align-items: center; gap: 6px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tsp-trend-sub { margin: 0; font-size: 11.5px; color: #6b7280; font-weight: 500; }
.tsp-trend-icon { font-size: 14px; }
.tsp-trend-legend { display: flex; gap: 14px; font-size: 11px; color: #6b7280; margin-bottom: 8px; }
.tsp-trend-legend .lg { display: inline-flex; align-items: center; gap: 4px; }
.tsp-trend-legend .dot { width: 14px; height: 2px; border-radius: 2px; display: inline-block; }
.tsp-trend-legend .dot.price { background: #ef4444; }
.tsp-trend-legend .dot.deal { background: #3b82f6; }
.tsp-trend-chart-wrap { position: relative; padding: 0 32px 24px 32px; }
.tsp-trend-svg { width: 100%; height: 220px; }
.tsp-trend-svg .tsp-grid line { stroke: #e5e7eb; stroke-width: 1; stroke-dasharray: 3 3; }
.tsp-trend-line { fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.tsp-trend-line.price { stroke: #ef4444; }
.tsp-trend-line.deal { stroke: #3b82f6; }
.tsp-trend-dot { stroke-width: 2; fill: #fff; }
.tsp-trend-dot.price { stroke: #ef4444; }
.tsp-trend-dot.deal { stroke: #3b82f6; }
.tsp-trend-xaxis {
  position: absolute; left: 32px; right: 32px; bottom: 4px; height: 14px;
  font-size: 9.5px; color: #6b7280;
}
.tsp-trend-xaxis span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
.tsp-trend-yaxis-l, .tsp-trend-yaxis-r {
  position: absolute; top: 0; bottom: 24px; width: 30px;
  display: flex; flex-direction: column; justify-content: space-between;
  font-size: 9.5px; color: #6b7280;
}
.tsp-trend-yaxis-l { left: 0; align-items: flex-start; }
.tsp-trend-yaxis-r { right: 0; align-items: flex-end; }
.tsp-trend-yaxis-l span:first-child { color: #ef4444; font-weight: 700; }
.tsp-trend-yaxis-l span:last-child { color: #ef4444; }
.tsp-trend-yaxis-r span:first-child { color: #3b82f6; font-weight: 700; }
.tsp-trend-yaxis-r span:last-child { color: #3b82f6; }

/* === 지역별 시세 === */
.tsp-region-card { padding: 14px; }
.tsp-region-head { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.tsp-region-controls { display: flex; gap: 8px; flex-wrap: wrap; margin: 6px 0 10px; }
.tsp-seg { display: inline-flex; background: #f3f4f6; border-radius: 8px; padding: 2px; }
.tsp-seg-btn {
  border: none; background: transparent; padding: 5px 10px; border-radius: 6px;
  font-size: 11px; font-weight: 700; color: #6b7280; cursor: pointer;
}
.tsp-seg-btn.active { background: #fff; color: #111827; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
.tsp-region-legend { display: flex; gap: 12px; font-size: 11px; color: #6b7280; margin-bottom: 6px; }
.tsp-region-legend .lg { display: inline-flex; align-items: center; gap: 4px; }
.tsp-region-legend .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.tsp-region-legend .dot.up { background: #ef4444; }
.tsp-region-legend .dot.down { background: #3b82f6; }
.tsp-region-bars {
  display: grid; grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 4px; padding: 4px 2px 8px;
  overflow-x: auto;
}
.tsp-region-bar-cell { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 40px; }
.tsp-region-bar-track { position: relative; width: 100%; height: 110px; }
.tsp-region-axis { position: absolute; left: 0; right: 0; top: 50%; height: 1px; background: #111827; }
.tsp-region-bar {
  position: absolute; left: 14%; right: 14%;
  display: flex; align-items: flex-start; justify-content: center;
}
.tsp-region-bar.up { background: #fca5a5; }
.tsp-region-bar.up.strong { background: #ef4444; }
.tsp-region-bar.down { background: #93c5fd; }
.tsp-region-bar-label { position: absolute; top: -14px; font-size: 9px; font-weight: 700; color: #374151; white-space: nowrap; }
.tsp-region-bar.down .tsp-region-bar-label { top: auto; bottom: -14px; }
.tsp-region-bar-name {
  font-size: 9px; color: #6b7280; text-align: center; line-height: 1.1;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
  transform: rotate(-30deg); transform-origin: top center; height: 24px;
}

.tsp-region-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
.tsp-region-table th, .tsp-region-table td { padding: 8px 4px; border-bottom: 1px solid #f1f5f9; text-align: left; }
.tsp-region-table th { background: #f9fafb; color: #6b7280; font-weight: 700; }
.tsp-region-table th.r, .tsp-region-table td.r { text-align: right; }
.tsp-region-table td.up { color: #dc2626; font-weight: 800; }
.tsp-region-table td.down { color: #2563eb; font-weight: 800; }
.tsp-region-table .prev { color: #9ca3af; font-size: 10px; margin-left: 2px; }
.tsp-trend-source { font-size: 10.5px; color: #9ca3af; margin: 8px 0 0; text-align: right; }
.tsp-seg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
