<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuctionStore } from '../stores/auctionStore';
import type { AuctionDetail } from '../types/auction';
import { resolveRegionFromAddress } from '../services/regionResolver';
import { fetchRealTradeAverage, type RealTradeMatchRow } from '../services/publicDataApi';
import { fetchNaverOfferAverage } from '../services/naverLandApi';

const props = defineProps<{
  mode: 'create' | 'view' | 'edit';
  id?: string;
}>();

const router = useRouter();
const store = useAuctionStore();
const form = ref<AuctionDetail>(store.createNewAuction());
const showDeleteConfirm = ref(false);

const isCreateMode = computed(() => props.mode === 'create');

type CardKey = 'basic' | 'profit' | 'survey' | 'market';
const editing = reactive<Record<CardKey, boolean>>({
  basic: false,
  profit: false,
  survey: false,
  market: false,
});
const snapshots = reactive<Record<CardKey, AuctionDetail | null>>({
  basic: null,
  profit: null,
  survey: null,
  market: null,
});

const loadForm = () => {
  if (props.mode === 'create') {
    form.value = store.createNewAuction();
    return;
  }
  const found = props.id ? store.getById(props.id) : undefined;
  form.value = found ? JSON.parse(JSON.stringify(found)) : store.createNewAuction();
};

watch(
  () => [props.id, props.mode, store.auctions.length] as const,
  () => loadForm(),
  { immediate: true },
);

const startEdit = (key: CardKey) => {
  snapshots[key] = JSON.parse(JSON.stringify(form.value));
  editing[key] = true;
};
const cancelEdit = (key: CardKey) => {
  if (snapshots[key]) {
    form.value = JSON.parse(JSON.stringify(snapshots[key]));
  }
  snapshots[key] = null;
  editing[key] = false;
};
const saveEdit = async (key: CardKey) => {
  await store.saveAuction(form.value);
  snapshots[key] = null;
  editing[key] = false;
};

const fmtWon = (n: number | undefined | null) => {
  if (n === undefined || n === null || !Number.isFinite(n)) return '-';
  if (n === 0) return '0원';
  return `${n.toLocaleString('ko-KR')}원`;
};
const fmtPct = (n: number | undefined | null, digits = 2) => {
  if (n === undefined || n === null || !Number.isFinite(n)) return '-';
  return `${n.toFixed(digits)}%`;
};
const dash = (v: string | number | undefined | null) => {
  if (v === undefined || v === null) return '-';
  const s = String(v).trim();
  return s.length === 0 ? '-' : s;
};

const formatSurveyNote = (v: string | undefined | null) => {
  if (v === undefined || v === null) return '-';
  const s = String(v).trim();
  if (s.length === 0) return '-';
  return s
    .replace(/\s*\/\s*/g, '\n')
    .replace(/\s*▶\s*/g, '\n▶ ')
    .replace(/\n{2,}/g, '\n')
    .trim();
};

const parsePriceToNumber = (v: string | number | undefined | null): number => {
  if (v === undefined || v === null) return NaN;
  const digits = String(v).replace(/[^\d.-]/g, '');
  return digits ? Number(digits) : NaN;
};

const validRealTradeRows = computed(() =>
  (form.value.excelAnalysis?.realTradeRows ?? []).filter((r) => {
    const hasAny = (r.contractDate || r.price || r.area || r.floor || '').toString().trim().length > 0;
    return hasAny;
  }),
);

const displayedRealTradeRows = computed(() =>
  realRowLimit.value === 0 ? validRealTradeRows.value : validRealTradeRows.value.slice(0, realRowLimit.value),
);

const realTradeAvgValue = computed(() => {
  const nums = validRealTradeRows.value
    .map((r) => parsePriceToNumber(r.price))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length === 0) return NaN;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
});

const realTradeAvgLabel = computed(() => {
  const n = realTradeAvgValue.value;
  if (Number.isFinite(n)) return n.toLocaleString('ko-KR');
  const stored = (form.value.excelAnalysis?.realTradeLocalAvg ?? '').trim();
  return stored || '-';
});

const schoolLines = computed(() => {
  const md = form.value.marketDemand;
  if (!md) return [];
  return [md.schoolInfoA, md.schoolInfoB, md.schoolInfoC]
    .map((v) => (v ?? '').trim())
    .filter((v) => v.length > 0);
});

interface SchoolChip {
  name: string;
  distance: string;
}
interface SchoolGroup {
  level: '초' | '중' | '고';
  fullLabel: string;
  items: SchoolChip[];
}

const schoolGroups = computed<SchoolGroup[]>(() => {
  const levelOf = (raw: string): SchoolGroup['level'] | null => {
    const t = raw.trim();
    if (t.startsWith('초')) return '초';
    if (t.startsWith('중')) return '중';
    if (t.startsWith('고')) return '고';
    return null;
  };
  const fullLabelOf = (lvl: SchoolGroup['level']) =>
    lvl === '초' ? '초등학교' : lvl === '중' ? '중학교' : '고등학교';

  return schoolLines.value
    .map((raw) => {
      const level = levelOf(raw);
      if (!level) return null;
      const body = raw.replace(/^[초중고]\s*:?\s*/, '').trim();
      const items: SchoolChip[] = body
        .split(/\s*\/\s*/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .map((part) => {
          const m = part.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
          if (m) return { name: m[1].trim(), distance: m[2].trim() };
          return { name: part, distance: '' };
        });
      return { level, fullLabel: fullLabelOf(level), items };
    })
    .filter((g): g is SchoolGroup => g !== null && g.items.length > 0);
});

const infraLines = computed(() => {
  const raw = (form.value.marketDemand?.infraInfo ?? '').trim();
  if (!raw) return [];
  return raw.split(/\s*\/\s*/).filter((v) => v.length > 0);
});


const parseContractDate = (v: string | undefined | null): Date | null => {
  if (!v) return null;
  const digits = String(v).replace(/[^\d]/g, '');
  if (digits.length < 6) return null;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = digits.length >= 8 ? Number(digits.slice(6, 8)) : 1;
  if (!year || !month) return null;
  return new Date(year, month - 1, day);
};

const tradeVolumeAuto = computed(() => {
  const dates = validRealTradeRows.value
    .map((r) => parseContractDate(r.contractDate))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  if (dates.length === 0) return null;
  const count = dates.length;
  if (count === 1) return { label: `총 ${count}건`, avg: count };
  const first = dates[0];
  const last = dates[dates.length - 1];
  const months = Math.max(
    1,
    (last.getFullYear() - first.getFullYear()) * 12 + (last.getMonth() - first.getMonth()) + 1,
  );
  const avg = count / months;
  return {
    label: `월 ${avg.toFixed(2)}건 (총 ${count}건/${months}개월)`,
    avg,
  };
});

const tradeVolumeMonthsLabel = computed(() => {
  if (tradeVolumeAuto.value) return tradeVolumeAuto.value.label;
  return dash(form.value.marketDemand?.tradeVolumeMonths);
});

const validNearBidRows = computed(() =>
  (form.value.excelAnalysis?.nearBidRows ?? []).filter((r) => {
    const hasAny = [r.saleInfo, r.appraisal, r.minimum, r.winning, r.rate, r.expectedWinning]
      .some((v) => (v || '').toString().trim().length > 0);
    return hasAny;
  }),
);

type TradeListTab = 'near' | 'real' | 'public';
const activeTradeTab = ref<TradeListTab | null>('real');
const selectTradeTab = (tab: TradeListTab) => {
  activeTradeTab.value = activeTradeTab.value === tab ? null : tab;
};

const publicRealTradeRows = ref<RealTradeMatchRow[]>([]);
const publicRealTradeDong = ref<string>('');
const publicRealTradeSigungu = ref<string>('');

const TRADE_ROW_LIMIT_OPTIONS = [3, 5, 10, 0] as const;
type TradeRowLimit = typeof TRADE_ROW_LIMIT_OPTIONS[number];
const realRowLimit = ref<TradeRowLimit>(5);
const publicRowLimit = ref<TradeRowLimit>(5);
const limitLabel = (n: TradeRowLimit) => (n === 0 ? '전체' : `Top ${n}`);

type PublicFilterCol = 'contractDate' | 'price' | 'areaM2' | 'floor' | 'buildYear' | 'apartmentName' | 'propertyTypeLabel';
const PUBLIC_FILTER_COLS: PublicFilterCol[] = ['contractDate', 'price', 'areaM2', 'floor', 'buildYear', 'apartmentName', 'propertyTypeLabel'];
const publicFilters = ref<Record<PublicFilterCol, Set<string>>>({
  contractDate: new Set(),
  price: new Set(),
  areaM2: new Set(),
  floor: new Set(),
  buildYear: new Set(),
  apartmentName: new Set(),
  propertyTypeLabel: new Set(),
});
const activePublicFilterCol = ref<PublicFilterCol | null>(null);
const publicFilterSearch = ref('');

const rowValueFor = (row: RealTradeMatchRow, col: PublicFilterCol): string => {
  if (col === 'contractDate') return row.contractDate || '-';
  if (col === 'price') return row.price > 0 ? formatWonShort(row.price) : '-';
  if (col === 'areaM2') return row.areaM2 ? `${row.areaM2}㎡` : '-';
  if (col === 'floor') return row.floor || '-';
  if (col === 'buildYear') return row.buildYear ? `${row.buildYear}년` : '-';
  if (col === 'apartmentName')
    return row.apartmentName ? `${row.apartmentName}${row.umdNm ? ` · ${row.umdNm}` : ''}` : (row.umdNm || '-');
  if (col === 'propertyTypeLabel') return row.propertyTypeLabel || '-';
  return '';
};

const publicFilterUniqueValues = computed(() => {
  const result: Record<PublicFilterCol, string[]> = {
    contractDate: [],
    price: [],
    areaM2: [],
    floor: [],
    buildYear: [],
    apartmentName: [],
    propertyTypeLabel: [],
  };
  PUBLIC_FILTER_COLS.forEach((col) => {
    const set = new Set<string>();
    publicRealTradeRows.value.forEach((r) => set.add(rowValueFor(r, col)));
    result[col] = [...set].sort((a, b) => a.localeCompare(b, 'ko'));
  });
  return result;
});

const filteredPublicRealTradeRows = computed(() =>
  publicRealTradeRows.value.filter((r) =>
    PUBLIC_FILTER_COLS.every((col) => {
      const sel = publicFilters.value[col];
      if (sel.size === 0) return true;
      return sel.has(rowValueFor(r, col));
    }),
  ),
);

const displayedPublicRealTradeRows = computed(() =>
  publicRowLimit.value === 0
    ? filteredPublicRealTradeRows.value
    : filteredPublicRealTradeRows.value.slice(0, publicRowLimit.value),
);

const publicRealTradeAvg = computed(() => {
  const prices = filteredPublicRealTradeRows.value.map((r) => r.price).filter((p) => p > 0);
  if (prices.length === 0) return NaN;
  return Math.round(prices.reduce((s, n) => s + n, 0) / prices.length);
});

const togglePublicFilterMenu = (col: PublicFilterCol, event: MouseEvent) => {
  event.stopPropagation();
  activePublicFilterCol.value = activePublicFilterCol.value === col ? null : col;
  publicFilterSearch.value = '';
};

const togglePublicFilterValue = (col: PublicFilterCol, value: string) => {
  const all = publicFilterUniqueValues.value[col];
  let set = new Set(publicFilters.value[col]);
  if (set.size === 0) {
    set = new Set(all);
    set.delete(value);
  } else if (set.has(value)) {
    set.delete(value);
  } else {
    set.add(value);
  }
  if (set.size === all.length) set.clear();
  publicFilters.value = { ...publicFilters.value, [col]: set };
};

const selectAllPublicFilter = (col: PublicFilterCol) => {
  publicFilters.value = { ...publicFilters.value, [col]: new Set() };
};

const clearAllPublicFilter = (col: PublicFilterCol) => {
  publicFilters.value = { ...publicFilters.value, [col]: new Set(['__none__']) };
};

const resetPublicFilters = () => {
  PUBLIC_FILTER_COLS.forEach((col) => {
    publicFilters.value[col].clear();
  });
  publicFilters.value = { ...publicFilters.value };
  activePublicFilterCol.value = null;
};

const publicFilterActiveCount = computed(() =>
  PUBLIC_FILTER_COLS.reduce((acc, col) => acc + (publicFilters.value[col].size > 0 ? 1 : 0), 0),
);

const isPublicFilterActive = (col: PublicFilterCol) => publicFilters.value[col].size > 0;

const closePublicFilterMenu = () => {
  activePublicFilterCol.value = null;
};
const publicRealTradeTabLabel = computed(() => {
  const sig = publicRealTradeSigungu.value;
  const dong = publicRealTradeDong.value;
  const prefix = sig && dong ? `${sig} ${dong}` : sig || dong || '공공';
  const filtered = filteredPublicRealTradeRows.value.length;
  const total = publicRealTradeRows.value.length;
  const countText = filtered === total ? `${total}` : `${filtered}/${total}`;
  return `${prefix} 실거래가 (${countText})`;
});
const lowPriceTargetDisplay = computed(() => {
  const manual = (form.value.marketDemand?.lowPriceTarget ?? '').trim();
  if (manual) return manual;
  const n = publicRealTradeAvg.value;
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('ko-KR');
});
const formatWonShort = (won: number): string => {
  if (!Number.isFinite(won) || won <= 0) return '-';
  return won.toLocaleString('ko-KR');
};

const fetchingMarket = ref(false);
const marketFetchNote = ref<string>('');

const mapNaverPropertyType = (
  type: string | undefined,
): 'apt' | 'villa' | 'officetel' => {
  const t = (type ?? '').toLowerCase();
  if (t.includes('오피스텔') || t.includes('officetel')) return 'officetel';
  if (
    t.includes('빌라') ||
    t.includes('연립') ||
    t.includes('다세대') ||
    t.includes('villa')
  ) {
    return 'villa';
  }
  return 'apt';
};

const extractTargetAreaM2 = (): number => {
  const fromExcel = Number(
    String(form.value.excelAnalysis?.realTradeArea ?? '').replace(/[^\d.]/g, ''),
  );
  if (Number.isFinite(fromExcel) && fromExcel > 0) return fromExcel;
  const fromBuilding = form.value.buildingAreaM2;
  if (Number.isFinite(fromBuilding) && (fromBuilding as number) > 0) return fromBuilding as number;
  return 0;
};

const autoFetchMarketPrices = async () => {
  if (fetchingMarket.value) return;
  fetchingMarket.value = true;
  marketFetchNote.value = '';
  try {
    const region = await resolveRegionFromAddress(form.value.address);
    if (!region) {
      marketFetchNote.value = '주소 → 법정동 코드 변환 실패 (카카오 주소검색 확인)';
      return;
    }
    const naverPropertyType = mapNaverPropertyType(form.value.propertyType);
    const areaM2 = extractTargetAreaM2();

    const naverEnabled = import.meta.env.VITE_ENABLE_NAVER_LAND === 'true';

    const [realResult, naverResult] = await Promise.allSettled([
      fetchRealTradeAverage({
        lawdCd5: region.lawdCd5,
        dong: region.dong,
        areaM2,
        propertyType: 'all',
        months: 3,
      }),
      naverEnabled
        ? fetchNaverOfferAverage({
            cortarNo: region.bCode10,
            areaM2,
            propertyType: naverPropertyType,
            months: 3,
          })
        : Promise.resolve({
            average: NaN,
            sampleCount: 0,
            fallbackUsed: false,
            error: '네이버부동산 호가 조회 비활성화 (VITE_ENABLE_NAVER_LAND=true 필요, 백엔드 프록시 권장)',
          }),
    ]);

    const parts: string[] = [];

    if (realResult.status === 'fulfilled' && Number.isFinite(realResult.value.average)) {
      const r = realResult.value;
      publicRealTradeRows.value = r.matchedRows ?? [];
      resetPublicFilters();
      publicRowLimit.value = 5;
      publicRealTradeDong.value = r.dongLabel ?? region.dong ?? '';
      publicRealTradeSigungu.value = region.sigungu ?? '';
      parts.push(
        `실거래가 ${r.sampleCount}건 평균 ${r.average.toLocaleString('ko-KR')}원${
          r.fallbackUsed ? ' (면적필터 해제)' : ''
        }`,
      );
    } else {
      publicRealTradeRows.value = [];
      const err =
        realResult.status === 'fulfilled'
          ? realResult.value.error
          : realResult.reason instanceof Error
          ? realResult.reason.message
          : '';
      parts.push(`실거래가 표본 없음${err ? ` (${err})` : ''}`);
    }

    if (naverResult.status === 'fulfilled' && Number.isFinite(naverResult.value.average)) {
      const n = naverResult.value;
      form.value.excelAnalysis.nearOfferAvgPrice = n.average.toLocaleString('ko-KR');
      parts.push(
        `호가 ${n.sampleCount}건 평균 ${n.average.toLocaleString('ko-KR')}원${
          n.fallbackUsed ? ' (면적필터 해제)' : ''
        }`,
      );
    } else {
      const err =
        naverResult.status === 'fulfilled'
          ? naverResult.value.error
          : naverResult.reason instanceof Error
          ? naverResult.reason.message
          : '';
      if (!naverEnabled) {
        parts.push('호가 자동조회 비활성');
      } else {
        parts.push(`호가 조회 실패${err ? `: ${err}` : ''}`);
      }
    }

    marketFetchNote.value = `${region.sigungu} ${region.dong} · ${parts.join(' / ')}`;
  } catch (error) {
    marketFetchNote.value = error instanceof Error ? error.message : String(error);
  } finally {
    fetchingMarket.value = false;
  }
};

const autoFetchedId = ref<string | null>(null);
watch(
  () => [props.id, props.mode, form.value.address] as const,
  ([id, mode, address]) => {
    if (mode === 'create' || !id || !address) return;
    if (autoFetchedId.value === id) return;
    if (fetchingMarket.value) return;
    autoFetchedId.value = id;
    void autoFetchMarketPrices();
  },
  { immediate: true },
);

const deposit10 = computed(() => Math.round((form.value.metrics?.appraisalValue ?? 0) * 0.1));
const minBidPct = computed(() => {
  const a = form.value.metrics?.appraisalValue ?? 0;
  const m = form.value.metrics?.minimumBidValue ?? 0;
  return a > 0 ? (m / a) * 100 : 0;
});

const myBid = computed(() => form.value.metrics?.myBidValue ?? 0);
const bc = computed(() => form.value.bidCost);
const totalCosts = computed(() => {
  const c = bc.value;
  return (
    (c.acquisitionTaxAmount ?? 0) +
    (c.legalCostAmount ?? 0) +
    (c.interestAmount ?? 0) +
    (c.midRepaymentAmount ?? 0) +
    (c.brokerageAmount ?? 0) +
    (c.arrearsFee ?? 0) +
    (c.repairCost ?? 0) +
    (c.evictionCost ?? 0)
  );
});
const capitalGain = computed(() => (form.value.expectedSaleValue ?? 0) - myBid.value - totalCosts.value);
const transferTax = computed(() => Math.max(0, capitalGain.value) * ((bc.value.incomeTaxRate ?? 0) / 100));
const localTax = computed(() => transferTax.value * ((bc.value.localTaxRate ?? 0) / 100));
const afterTaxProfit = computed(() => capitalGain.value - transferTax.value - localTax.value);
const netAfterTaxProfit = computed(() => afterTaxProfit.value - (bc.value.advertisingCost ?? 0));
const netInvestment = computed(() => myBid.value - (bc.value.loanAmount ?? 0) + totalCosts.value);
const afterTaxRate = computed(() => (netInvestment.value > 0 ? (netAfterTaxProfit.value / netInvestment.value) * 100 : 0));
const pctOfBid = (n: number) => (myBid.value > 0 ? (n / myBid.value) * 100 : 0);

type BidCostAmountKey =
  | 'loanAmount'
  | 'acquisitionTaxAmount'
  | 'legalCostAmount'
  | 'interestAmount'
  | 'midRepaymentAmount'
  | 'brokerageAmount'
  | 'arrearsFee'
  | 'repairCost'
  | 'evictionCost'
  | 'advertisingCost';

const setAmountByPct = (key: BidCostAmountKey, pctRaw: string | number) => {
  if (!form.value.bidCost) return;
  const pct = typeof pctRaw === 'number' ? pctRaw : parseFloat(pctRaw);
  if (!Number.isFinite(pct)) return;
  form.value.bidCost[key] = Math.round((myBid.value * pct) / 100);
};

const save = async () => {
  await store.saveAuction(form.value);
  if (props.mode === 'create' && form.value.id) {
    await router.replace(`/auctions/${form.value.id}`);
  }
};
const confirmDelete = async () => {
  if (!form.value.id) return;
  await store.deleteAuction(form.value.id);
  router.push('/auctions/watchlist');
};
</script>

<template>
  <section class="dv2">
    <header class="dv2-header">
      <button class="dv2-back" type="button" @click="router.back()">←</button>
      <div class="dv2-title">
        <small>{{ form.caseNumber }}</small>
        <h1>{{ form.address }}</h1>
      </div>
      <div class="dv2-actions">
        <template v-if="isCreateMode">
          <button class="dv2-btn dv2-btn-primary" type="button" @click="save">저장</button>
        </template>
        <template v-else>
          <button class="dv2-btn dv2-btn-primary" type="button" @click="save">
            <span class="icon">✓</span> 최종 완료
          </button>
          <button class="dv2-btn dv2-btn-danger" type="button" @click="showDeleteConfirm = true">
            <span class="icon">🗑</span> 삭제
          </button>
        </template>
      </div>
    </header>

    <div class="dv2-grid">
      <!-- 물건 기본정보 -->
      <article class="dv2-card">
        <div class="dv2-card-head">
          <h2><span class="head-ico">🏠</span> 물건 기본정보</h2>
          <div class="head-right">
            <span v-if="!editing.basic && form.propertyType" class="dv2-badge dv2-badge-gray">{{ form.propertyType }}</span>
            <template v-if="editing.basic">
              <button class="dv2-btn" type="button" @click="cancelEdit('basic')">취소</button>
              <button class="dv2-btn dv2-btn-primary" type="button" @click="saveEdit('basic')">
                <span class="icon">✓</span> 저장
              </button>
            </template>
            <button v-else class="dv2-btn dv2-btn-ghost" type="button" @click="startEdit('basic')">
              <span class="icon">✎</span> 편집
            </button>
          </div>
        </div>

        <div class="dv2-row">
          <span class="label">사건번호</span>
          <input v-if="editing.basic" v-model="form.caseNumber" class="dv2-input" />
          <span v-else class="value link">{{ dash(form.caseNumber) }}</span>
        </div>
        <div class="dv2-row">
          <span class="label">관할법원</span>
          <input v-if="editing.basic" v-model="form.courtName" class="dv2-input" />
          <span v-else class="value">{{ dash(form.courtName) }}</span>
        </div>
        <div class="dv2-row">
          <span class="label">주소</span>
          <input v-if="editing.basic" v-model="form.address" class="dv2-input" />
          <span v-else class="value"><span class="mi">📍</span>{{ dash(form.address) }}</span>
        </div>
        <div class="dv2-row">
          <span class="label">사용승인</span>
          <input v-if="editing.basic" v-model="form.approvalDate" type="date" class="dv2-input" />
          <span v-else class="value">{{ dash(form.approvalDate) }}</span>
        </div>
        <div class="dv2-row">
          <span class="label">건물면적</span>
          <template v-if="editing.basic">
            <span class="value-pair">
              <input v-model.number="form.buildingAreaM2" type="number" step="0.01" class="dv2-input mini" /> ㎡ /
              <input v-model.number="form.buildingAreaPyeong" type="number" step="0.01" class="dv2-input mini" /> 평
            </span>
          </template>
          <span v-else class="value"><span class="mi">📐</span>{{ form.buildingAreaM2 || 0 }}㎡ / {{ form.buildingAreaPyeong || 0 }}평</span>
        </div>
        <div class="dv2-row">
          <span class="label">대지면적</span>
          <template v-if="editing.basic">
            <span class="value-pair">
              <input v-model.number="form.landAreaM2" type="number" step="0.01" class="dv2-input mini" /> ㎡ /
              <input v-model.number="form.landAreaPyeong" type="number" step="0.01" class="dv2-input mini" /> 평
            </span>
          </template>
          <span v-else class="value"><span class="mi">📐</span>{{ form.landAreaM2 || 0 }}㎡ / {{ form.landAreaPyeong || 0 }}평</span>
        </div>
        <div class="dv2-row">
          <span class="label">차수</span>
          <input v-if="editing.basic" v-model="form.auctionRound" class="dv2-input" placeholder="예: 2차" />
          <span v-else class="value">
            <span v-if="form.auctionRound" class="dv2-badge dv2-badge-peach">{{ form.auctionRound }} 매각</span>
            <span v-else>-</span>
          </span>
        </div>
        <div v-if="editing.basic" class="dv2-row">
          <span class="label">물건 유형</span>
          <input v-model="form.propertyType" class="dv2-input" placeholder="예: 아파트" />
        </div>

        <div class="dv2-sub-head">감정평가 / 기일내역</div>
        <div class="dv2-row">
          <span class="label">감정가</span>
          <input v-if="editing.basic" v-model.number="form.metrics.appraisalValue" type="number" class="dv2-input" />
          <span v-else class="value strong">{{ fmtWon(form.metrics?.appraisalValue) }}</span>
        </div>
        <div class="dv2-row"><span class="label">보증금 (10%)</span><span class="value strong">{{ fmtWon(deposit10) }}</span></div>

        <div class="dv2-sub-head"><span class="head-ico">👥</span> 임차인 현황</div>
        <div class="dv2-row two"><span class="label">임차인</span><span class="value">-</span><span class="label">보증금</span><span class="value">-</span></div>
        <div class="dv2-row two"><span class="label">점유기간</span><span class="value">-</span><span class="label">전/확/배</span><span class="value">-</span></div>
      </article>

      <!-- 예상 수익분석 -->
      <article class="dv2-card">
        <div class="dv2-card-head">
          <h2><span class="head-ico">↗</span> 예상 수익분석 <span class="auto-pill">✦ 자동계산</span></h2>
          <div class="head-right">
            <template v-if="editing.profit">
              <button class="dv2-btn" type="button" @click="cancelEdit('profit')">취소</button>
              <button class="dv2-btn dv2-btn-primary" type="button" @click="saveEdit('profit')">
                <span class="icon">✓</span> 저장
              </button>
            </template>
            <button v-else class="dv2-btn dv2-btn-ghost" type="button" @click="startEdit('profit')">
              <span class="icon">✎</span> 편집
            </button>
          </div>
        </div>
        <div class="profit-table-wrap">
        <table class="profit-table">
          <thead>
            <tr><th>목록</th><th>상세</th><th>금액</th><th>비중(%)</th></tr>
          </thead>
          <tbody>
            <tr>
              <td rowspan="3" class="cat">입찰정보</td>
              <td>감정가</td>
              <td class="num">
                <input v-if="editing.profit" v-model.number="form.metrics.appraisalValue" type="number" class="dv2-input cell" />
                <template v-else>{{ fmtWon(form.metrics?.appraisalValue) }}</template>
              </td>
              <td></td>
            </tr>
            <tr>
              <td>최저가</td>
              <td class="num">
                <input v-if="editing.profit" v-model.number="form.metrics.minimumBidValue" type="number" class="dv2-input cell" />
                <template v-else>{{ fmtWon(form.metrics?.minimumBidValue) }}</template>
              </td>
              <td class="num">{{ fmtPct(minBidPct) }}</td>
            </tr>
            <tr class="hi">
              <td>입찰가</td>
              <td class="num strong">
                <input v-if="editing.profit" v-model.number="form.metrics.myBidValue" type="number" class="dv2-input cell" />
                <template v-else>{{ fmtWon(form.metrics?.myBidValue) }}</template>
              </td>
              <td></td>
            </tr>
            <tr>
              <td rowspan="9" class="cat">비용</td>
              <td>대출(사업자)</td>
              <td class="num">
                <input v-if="editing.profit" v-model.number="form.bidCost.loanAmount" type="number" class="dv2-input cell" />
                <template v-else>{{ fmtWon(form.bidCost?.loanAmount) }}</template>
              </td>
              <td class="num">
                <template v-if="editing.profit">
                  <input
                    :value="pctOfBid(form.bidCost?.loanAmount ?? 0).toFixed(2)"
                    type="number" step="0.01" class="dv2-input cell tiny"
                    @input="setAmountByPct('loanAmount', ($event.target as HTMLInputElement).value)"
                  />%
                </template>
                <template v-else>{{ fmtPct(pctOfBid(form.bidCost?.loanAmount ?? 0)) }}</template>
              </td>
            </tr>
            <tr>
              <td>취득세</td>
              <td class="num">
                <input v-if="editing.profit" v-model.number="form.bidCost.acquisitionTaxAmount" type="number" class="dv2-input cell" />
                <template v-else>{{ fmtWon(form.bidCost?.acquisitionTaxAmount) }}</template>
              </td>
              <td class="num">
                <template v-if="editing.profit">
                  <input
                    :value="pctOfBid(form.bidCost?.acquisitionTaxAmount ?? 0).toFixed(2)"
                    type="number" step="0.01" class="dv2-input cell tiny"
                    @input="setAmountByPct('acquisitionTaxAmount', ($event.target as HTMLInputElement).value)"
                  />%
                </template>
                <template v-else>{{ fmtPct(pctOfBid(form.bidCost?.acquisitionTaxAmount ?? 0)) }}</template>
              </td>
            </tr>
            <tr>
              <td>법무비/채권</td>
              <td class="num">
                <input v-if="editing.profit" v-model.number="form.bidCost.legalCostAmount" type="number" class="dv2-input cell" />
                <template v-else>{{ fmtWon(form.bidCost?.legalCostAmount) }}</template>
              </td>
              <td class="num">
                <template v-if="editing.profit">
                  <input
                    :value="pctOfBid(form.bidCost?.legalCostAmount ?? 0).toFixed(2)"
                    type="number" step="0.01" class="dv2-input cell tiny"
                    @input="setAmountByPct('legalCostAmount', ($event.target as HTMLInputElement).value)"
                  />%
                </template>
                <template v-else>{{ fmtPct(pctOfBid(form.bidCost?.legalCostAmount ?? 0)) }}</template>
              </td>
            </tr>
            <tr>
              <td>이자</td>
              <td class="num">
                <input v-if="editing.profit" v-model.number="form.bidCost.interestAmount" type="number" class="dv2-input cell" />
                <template v-else>{{ fmtWon(form.bidCost?.interestAmount) }}</template>
              </td>
              <td class="num">
                <template v-if="editing.profit">
                  <input
                    :value="pctOfBid(form.bidCost?.interestAmount ?? 0).toFixed(2)"
                    type="number" step="0.01" class="dv2-input cell tiny"
                    @input="setAmountByPct('interestAmount', ($event.target as HTMLInputElement).value)"
                  />%
                </template>
                <template v-else>{{ fmtPct(pctOfBid(form.bidCost?.interestAmount ?? 0)) }}</template>
              </td>
            </tr>
            <tr>
              <td>중도상환</td>
              <td class="num">
                <input v-if="editing.profit" v-model.number="form.bidCost.midRepaymentAmount" type="number" class="dv2-input cell" />
                <template v-else>{{ fmtWon(form.bidCost?.midRepaymentAmount) }}</template>
              </td>
              <td class="num">
                <template v-if="editing.profit">
                  <input
                    :value="pctOfBid(form.bidCost?.midRepaymentAmount ?? 0).toFixed(2)"
                    type="number" step="0.01" class="dv2-input cell tiny"
                    @input="setAmountByPct('midRepaymentAmount', ($event.target as HTMLInputElement).value)"
                  />%
                </template>
                <template v-else>{{ fmtPct(pctOfBid(form.bidCost?.midRepaymentAmount ?? 0)) }}</template>
              </td>
            </tr>
            <tr>
              <td>매도중개료</td>
              <td class="num">
                <input v-if="editing.profit" v-model.number="form.bidCost.brokerageAmount" type="number" class="dv2-input cell" />
                <template v-else>{{ fmtWon(form.bidCost?.brokerageAmount) }}</template>
              </td>
              <td class="num">
                <template v-if="editing.profit">
                  <input
                    :value="pctOfBid(form.bidCost?.brokerageAmount ?? 0).toFixed(2)"
                    type="number" step="0.01" class="dv2-input cell tiny"
                    @input="setAmountByPct('brokerageAmount', ($event.target as HTMLInputElement).value)"
                  />%
                </template>
                <template v-else>{{ fmtPct(pctOfBid(form.bidCost?.brokerageAmount ?? 0)) }}</template>
              </td>
            </tr>
            <tr>
              <td>미납관리비</td>
              <td class="num">
                <input v-if="editing.profit" v-model.number="form.bidCost.arrearsFee" type="number" class="dv2-input cell" />
                <template v-else>{{ fmtWon(form.bidCost?.arrearsFee) }}</template>
              </td>
              <td class="num">
                <template v-if="editing.profit">
                  <input
                    :value="pctOfBid(form.bidCost?.arrearsFee ?? 0).toFixed(2)"
                    type="number" step="0.01" class="dv2-input cell tiny"
                    @input="setAmountByPct('arrearsFee', ($event.target as HTMLInputElement).value)"
                  />%
                </template>
                <template v-else>{{ fmtPct(pctOfBid(form.bidCost?.arrearsFee ?? 0)) }}</template>
              </td>
            </tr>
            <tr>
              <td>수리비</td>
              <td class="num">
                <input v-if="editing.profit" v-model.number="form.bidCost.repairCost" type="number" class="dv2-input cell" />
                <template v-else>{{ fmtWon(form.bidCost?.repairCost) }}</template>
              </td>
              <td class="num">
                <template v-if="editing.profit">
                  <input
                    :value="pctOfBid(form.bidCost?.repairCost ?? 0).toFixed(2)"
                    type="number" step="0.01" class="dv2-input cell tiny"
                    @input="setAmountByPct('repairCost', ($event.target as HTMLInputElement).value)"
                  />%
                </template>
                <template v-else>{{ fmtPct(pctOfBid(form.bidCost?.repairCost ?? 0)) }}</template>
              </td>
            </tr>
            <tr>
              <td>명도비</td>
              <td class="num">
                <input v-if="editing.profit" v-model.number="form.bidCost.evictionCost" type="number" class="dv2-input cell" />
                <template v-else>{{ fmtWon(form.bidCost?.evictionCost) }}</template>
              </td>
              <td class="num">
                <template v-if="editing.profit">
                  <input
                    :value="pctOfBid(form.bidCost?.evictionCost ?? 0).toFixed(2)"
                    type="number" step="0.01" class="dv2-input cell tiny"
                    @input="setAmountByPct('evictionCost', ($event.target as HTMLInputElement).value)"
                  />%
                </template>
                <template v-else>{{ fmtPct(pctOfBid(form.bidCost?.evictionCost ?? 0)) }}</template>
              </td>
            </tr>
            <tr class="hi">
              <td></td>
              <td>필요비용 합계 ✦</td>
              <td class="num strong">{{ fmtWon(totalCosts) }}</td>
              <td class="num">{{ fmtPct(pctOfBid(totalCosts)) }}</td>
            </tr>
            <tr class="hi">
              <td rowspan="8" class="cat">세후수익</td>
              <td>매도가 (예상)</td>
              <td class="num strong">
                <input v-if="editing.profit" v-model.number="form.expectedSaleValue" type="number" class="dv2-input cell" />
                <template v-else>{{ fmtWon(form.expectedSaleValue) }}</template>
              </td>
              <td></td>
            </tr>
            <tr><td>양도차익 ✦</td><td class="num">{{ fmtWon(capitalGain) }}</td><td class="note">(매도가−입찰가−비용)</td></tr>
            <tr>
              <td>양도세 ✦</td>
              <td class="num">{{ fmtWon(transferTax) }}</td>
              <td class="num">
                <template v-if="editing.profit">
                  <input v-model.number="form.bidCost.incomeTaxRate" type="number" step="0.1" class="dv2-input cell tiny" />%
                </template>
                <template v-else>{{ fmtPct(form.bidCost?.incomeTaxRate, 1) }}</template>
              </td>
            </tr>
            <tr>
              <td>지방세 ✦</td>
              <td class="num">{{ fmtWon(localTax) }}</td>
              <td class="num">
                <template v-if="editing.profit">
                  <input v-model.number="form.bidCost.localTaxRate" type="number" step="0.1" class="dv2-input cell tiny" />%
                </template>
                <template v-else>{{ fmtPct(form.bidCost?.localTaxRate, 1) }}</template>
              </td>
            </tr>
            <tr><td>세후이익 ✦</td><td class="num">{{ fmtWon(afterTaxProfit) }}</td><td></td></tr>
            <tr>
              <td>광고비</td>
              <td class="num">
                <input v-if="editing.profit" v-model.number="form.bidCost.advertisingCost" type="number" class="dv2-input cell" />
                <template v-else>{{ fmtWon(form.bidCost?.advertisingCost) }}</template>
              </td>
              <td class="num">
                <template v-if="editing.profit">
                  <input
                    :value="pctOfBid(form.bidCost?.advertisingCost ?? 0).toFixed(2)"
                    type="number" step="0.01" class="dv2-input cell tiny"
                    @input="setAmountByPct('advertisingCost', ($event.target as HTMLInputElement).value)"
                  />%
                </template>
                <template v-else>{{ fmtPct(pctOfBid(form.bidCost?.advertisingCost ?? 0)) }}</template>
              </td>
            </tr>
            <tr class="hi"><td>세후 순이익 ✦</td><td class="num strong">{{ fmtWon(netAfterTaxProfit) }}</td><td></td></tr>
            <tr class="hi"><td>세후 수익율 ✦</td><td class="num strong">{{ fmtPct(afterTaxRate) }}</td><td class="note">(세후이익/순투자금)</td></tr>
          </tbody>
        </table>
        </div>
      </article>

      <!-- 물건조사 -->
      <article class="dv2-card">
        <div class="dv2-card-head">
          <h2><span class="head-ico">📍</span> 물건조사 (임장 현황)</h2>
          <div class="head-right">
            <template v-if="editing.survey">
              <button class="dv2-btn" type="button" @click="cancelEdit('survey')">취소</button>
              <button class="dv2-btn dv2-btn-primary" type="button" @click="saveEdit('survey')">
                <span class="icon">✓</span> 저장
              </button>
            </template>
            <button v-else class="dv2-btn dv2-btn-ghost" type="button" @click="startEdit('survey')">
              <span class="icon">✎</span> 편집
            </button>
          </div>
        </div>

        <div class="dv2-subsec">
          <div class="dv2-sub-head small"><span class="head-ico">ⓘ</span> 현장 특이사항</div>
          <textarea v-if="editing.survey" v-model="form.fieldSurvey.surveyMemo" class="dv2-input textarea" rows="3"></textarea>
          <p v-else class="dv2-note multiline">{{ formatSurveyNote(form.fieldSurvey?.surveyMemo) }}</p>
        </div>

        <div class="dv2-inline-row">
          <div>
            <span class="label">현황조사서</span>
            <input v-if="editing.survey" v-model="form.surveyStatus" class="dv2-input" />
            <template v-else>
              <span v-if="form.surveyStatus" class="dv2-badge dv2-badge-gray">{{ form.surveyStatus }}</span>
              <span v-else>-</span>
            </template>
          </div>
          <div>
            <span class="label"><span class="mi">🛡</span>대항력 여부</span>
            <select v-if="editing.survey" v-model="form.oppositionStatus" class="dv2-input">
              <option value="대항력O">있음</option>
              <option value="대항력X">없음</option>
            </select>
            <template v-else>
              <span v-if="form.oppositionStatus === '대항력O'" class="dv2-badge dv2-badge-red">있음</span>
              <span v-else-if="form.oppositionStatus === '대항력X'" class="dv2-badge dv2-badge-gray">없음</span>
              <span v-else>-</span>
            </template>
          </div>
        </div>

        <div class="dv2-subsec">
          <div class="dv2-sub-head between">
            <span><span class="head-ico">💳</span> 미납 공과금 상세</span>
            <span class="dv2-badge dv2-badge-red">합계: ₩{{ (form.fieldSurvey?.totalArrears ?? 0).toLocaleString('ko-KR') }}</span>
          </div>
          <div class="dv2-mini-grid">
            <div class="mini">
              <small>미납 세금</small>
              <input v-if="editing.survey" v-model.number="form.fieldSurvey.totalArrears" type="number" class="dv2-input cell" />
              <strong v-else>₩{{ (form.fieldSurvey?.totalArrears ?? 0).toLocaleString('ko-KR') }}</strong>
            </div>
            <div class="mini">
              <small>미납 관리비</small>
              <input v-if="editing.survey" v-model.number="form.fieldSurvey.arrearsMaintenance" type="number" class="dv2-input cell" />
              <strong v-else class="danger">₩{{ (form.fieldSurvey?.arrearsMaintenance ?? 0).toLocaleString('ko-KR') }}</strong>
            </div>
            <div class="mini">
              <small>전기/가스/수도</small>
              <input v-if="editing.survey" v-model.number="form.fieldSurvey.arrearsUtilities" type="number" class="dv2-input cell" />
              <strong v-else>₩{{ (form.fieldSurvey?.arrearsUtilities ?? 0).toLocaleString('ko-KR') }}</strong>
            </div>
          </div>
        </div>

        <div class="dv2-inline-row">
          <div>
            <span class="label"><span class="mi">📬</span>우편물 확인</span>
            <input v-if="editing.survey" v-model="form.mailStatus" class="dv2-input" />
            <template v-else>
              <span v-if="form.mailStatus"><span class="dot-ok">●</span> {{ form.mailStatus }}</span>
              <span v-else>-</span>
            </template>
          </div>
        </div>

        <div class="dv2-subsec">
          <div class="dv2-sub-head small">점유 상세 정보</div>
          <textarea
            v-if="editing.survey"
            v-model="form.fieldSurvey.occupantNote"
            class="dv2-input textarea"
            rows="4"
          ></textarea>
          <p v-else class="dv2-note multiline">{{ formatSurveyNote(form.fieldSurvey?.occupantNote) }}</p>
        </div>

        <div class="dv2-subsec">
          <div class="dv2-sub-head small"><span class="head-ico">🏢</span> 개별 건물 분석</div>
          <div class="dv2-two-col">
            <div class="dv2-row">
              <span class="label">년식</span>
              <input v-if="editing.survey" v-model="form.marketDemand.listingCurrent" class="dv2-input" />
              <span v-else class="value">{{ dash(form.marketDemand?.listingCurrent) }}</span>
            </div>
            <div class="dv2-row">
              <span class="label">향 / 뷰</span>
              <template v-if="editing.survey">
                <span class="value-pair">
                  <input v-model="form.marketDemand.structureHeating" class="dv2-input mini" placeholder="향" /> /
                  <input v-model="form.marketDemand.structureView" class="dv2-input mini" placeholder="뷰" />
                </span>
              </template>
              <span v-else class="value">{{ dash(form.marketDemand?.structureHeating) }} / {{ dash(form.marketDemand?.structureView) }}</span>
            </div>
            <div class="dv2-row">
              <span class="label">층수</span>
              <template v-if="editing.survey">
                <span class="value-pair">
                  <input v-model="form.marketDemand.floorCurrent" class="dv2-input mini" placeholder="현재" /> /
                  <input v-model="form.marketDemand.floorTarget" class="dv2-input mini" placeholder="전체" />
                </span>
              </template>
              <span v-else class="value">{{ dash(form.marketDemand?.floorCurrent) }} / {{ dash(form.marketDemand?.floorTarget) }}</span>
            </div>
            <div class="dv2-row">
              <span class="label">방/화장실</span>
              <template v-if="editing.survey">
                <span class="value-pair">
                  <input v-model="form.marketDemand.roomCount" class="dv2-input mini" placeholder="방" /> /
                  <input v-model="form.marketDemand.bathCount" class="dv2-input mini" placeholder="화장실" />
                </span>
              </template>
              <span v-else class="value">{{ dash(form.marketDemand?.roomCount) }} / {{ dash(form.marketDemand?.bathCount) }}</span>
            </div>
            <div class="dv2-row">
              <span class="label">구조</span>
              <template v-if="editing.survey">
                <span class="value-pair">
                  <input v-model="form.marketDemand.corridorType" class="dv2-input mini" placeholder="복도" /> / 엘베
                  <input v-model="form.marketDemand.elevator" class="dv2-input mini" placeholder="엘베" />
                </span>
              </template>
              <span v-else class="value">{{ dash(form.marketDemand?.corridorType) }} / 엘베 {{ dash(form.marketDemand?.elevator) }}</span>
            </div>
            <div class="dv2-row">
              <span class="label">세대/주차</span>
              <template v-if="editing.survey">
                <span class="value-pair">
                  <input v-model="form.marketDemand.totalHouseholds" class="dv2-input mini" placeholder="세대" /> /
                  <input v-model="form.marketDemand.parking" class="dv2-input mini" placeholder="주차" />
                </span>
              </template>
              <span v-else class="value">{{ dash(form.marketDemand?.totalHouseholds) }} / {{ dash(form.marketDemand?.parking) }}</span>
            </div>
          </div>
        </div>
      </article>

      <!-- 입지 / 매매수요 분석 -->
      <article class="dv2-card">
        <div class="dv2-card-head">
          <h2><span class="head-ico">📍</span> 입지 / 매매수요 분석</h2>
          <div class="head-right">
            <button
              class="dv2-btn dv2-btn-ghost"
              type="button"
              :disabled="fetchingMarket"
              @click="autoFetchMarketPrices"
            >
              <span class="icon">🔄</span>
              {{ fetchingMarket ? '조회중...' : '주변시세 자동조회' }}
            </button>
            <template v-if="editing.market">
              <button class="dv2-btn" type="button" @click="cancelEdit('market')">취소</button>
              <button class="dv2-btn dv2-btn-primary" type="button" @click="saveEdit('market')">
                <span class="icon">✓</span> 저장
              </button>
            </template>
            <button v-else class="dv2-btn dv2-btn-ghost" type="button" @click="startEdit('market')">
              <span class="icon">✎</span> 편집
            </button>
          </div>
        </div>
        <!-- <p v-if="marketFetchNote" class="market-fetch-note">{{ marketFetchNote }}</p> -->

        <div class="dv2-inline-row">
          <div>
            <span class="label">실사용자 타겟</span>
            <input v-if="editing.market" v-model="form.marketDemand.practicalFamilyType" class="dv2-input" />
            <strong v-else class="target-text">{{ dash(form.marketDemand?.practicalFamilyType) }}</strong>
          </div>
          <div>
            <span class="label" style="white-space: nowrap;">입지 등수</span>
            <input v-if="editing.market" v-model="form.marketDemand.districtLocation" class="dv2-input" />
            <span v-else>{{ dash(form.marketDemand?.districtLocation) }}</span>
          </div>
        </div>

        <div class="dv2-infra-grid">
          <div class="infra-box school-box">
            <span class="head-ico">🏫</span>
            <div class="infra-body">
              <small>학군</small>
              <template v-if="editing.market">
                <input v-model="form.marketDemand.schoolInfoA" class="dv2-input" placeholder="초" />
                <input v-model="form.marketDemand.schoolInfoB" class="dv2-input" placeholder="중" />
                <input v-model="form.marketDemand.schoolInfoC" class="dv2-input" placeholder="고" />
              </template>
              <template v-else>
                <strong v-if="schoolGroups.length === 0">-</strong>
                <div
                  v-for="group in schoolGroups"
                  :key="group.level"
                  class="school-group"
                >
                  <span :class="['school-level', `level-${group.level}`]" :title="group.fullLabel">{{ group.level }}</span>
                  <div class="school-chips">
                    <span v-for="(s, i) in group.items" :key="`${group.level}-${i}`" class="school-chip">
                      <span class="school-name">{{ s.name }}</span>
                      <span v-if="s.distance" class="school-dist">{{ s.distance }}</span>
                    </span>
                  </div>
                </div>
              </template>
            </div>
          </div>
          <div class="infra-box">
            <span class="head-ico">🚌</span>
            <div>
              <small>교통</small>
              <input v-if="editing.market" v-model="form.marketDemand.transportInfo" class="dv2-input" />
              <strong v-else>{{ dash(form.marketDemand?.transportInfo) }}</strong>
            </div>
          </div>
          <div class="infra-box">
            <span class="head-ico">🏢</span>
            <div>
              <small>일자리</small>
              <input v-if="editing.market" v-model="form.marketDemand.jobInfo" class="dv2-input" />
              <strong v-else>{{ dash(form.marketDemand?.jobInfo) }}</strong>
            </div>
          </div>
          <div class="infra-box">
            <span class="head-ico">📊</span>
            <div class="infra-body">
              <small>인프라 / 행정기관</small>
              <input v-if="editing.market" v-model="form.marketDemand.infraInfo" class="dv2-input" />
              <template v-else>
                <strong v-if="infraLines.length === 0">-</strong>
                <p v-for="(line, i) in infraLines" :key="`infra-${i}`" class="infra-line">{{ line }}</p>
              </template>
            </div>
          </div>
        </div>

        <div class="dv2-stat-row">
          <div class="stat">
            <div class="stat-head">
              <span>월 거래량</span>
              <input v-if="editing.market" v-model="form.marketDemand.tradeVolumeMonths" class="dv2-input cell" />
              <strong v-else class="green">{{ tradeVolumeMonthsLabel }}</strong>
            </div>
            <div class="bar green-bar"><span style="width:0%"></span></div>
          </div>
          <div class="stat">
            <div class="stat-head">
              <span>매물 적체율</span>
              <input v-if="editing.market" v-model="form.marketDemand.listingRate" class="dv2-input cell" />
              <strong v-else class="green">{{ dash(form.marketDemand?.listingRate) }}</strong>
            </div>
            <div class="bar green-bar"><span style="width:0%"></span></div>
          </div>
        </div>

        <div class="dv2-price-row">
          <div class="price-box">
            <small>실거래가 (평균)</small>
            <input v-if="editing.market" v-model="form.excelAnalysis.realTradeLocalAvg" class="dv2-input" />
            <strong v-else>{{ realTradeAvgLabel }}</strong>
          </div>
          <!--
          <div class="price-box">
            <small>주변낙찰가 (평균)</small>
            <input v-if="editing.market" v-model="form.marketDemand.lowPriceAvgPyeong" class="dv2-input" />
            <strong v-else>{{ nearBidAvgWinningLabel }}</strong>
          </div>
          -->
          <div class="price-box">
            <small>주변 실거래가 평균</small>
            <input v-if="editing.market" v-model="form.marketDemand.lowPriceTarget" class="dv2-input" />
            <strong v-else>{{ lowPriceTargetDisplay }}</strong>
          </div>
        </div>

        <div
          v-if="validNearBidRows.length > 0 || validRealTradeRows.length > 0 || publicRealTradeRows.length > 0"
          class="trade-tabs"
        >
          <div class="trade-tabs-head" role="tablist">
            <button
              v-if="validRealTradeRows.length > 0"
              type="button"
              role="tab"
              class="trade-tab"
              :class="{ active: activeTradeTab === 'real' }"
              :aria-selected="activeTradeTab === 'real'"
              @click="selectTradeTab('real')"
            >
              실거래가 ({{ validRealTradeRows.length }})
            </button>
            <!--
            <button
              v-if="validNearBidRows.length > 0"
              type="button"
              role="tab"
              class="trade-tab"
              :class="{ active: activeTradeTab === 'near' }"
              :aria-selected="activeTradeTab === 'near'"
              @click="selectTradeTab('near')"
            >
              주변낙찰가 ({{ validNearBidRows.length }})
            </button>
            -->
            <button
              v-if="publicRealTradeRows.length > 0"
              type="button"
              role="tab"
              class="trade-tab"
              :class="{ active: activeTradeTab === 'public' }"
              :aria-selected="activeTradeTab === 'public'"
              @click="selectTradeTab('public')"
            >
              <span class="auto-fetched-dot" title="주변시세 자동조회 결과"></span>
              {{ publicRealTradeTabLabel }}
            </button>
          </div>

          <!--
          <div v-if="activeTradeTab === 'near'" class="trade-tab-panel">
            <table class="real-trade-table">
              <thead>
                <tr>
                  <th>기간/매물정보</th>
                  <th>감정가</th>
                  <th>최저가</th>
                  <th>낙찰가</th>
                  <th>낙찰가율</th>
                  <th>예상낙찰가</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in validNearBidRows" :key="`nb-${i}`">
                  <td>{{ dash(row.saleInfo) }}</td>
                  <td class="num">{{ dash(row.appraisal) }}</td>
                  <td class="num">{{ dash(row.minimum) }}</td>
                  <td class="num">{{ dash(row.winning) }}</td>
                  <td>{{ dash(row.rate) }}</td>
                  <td class="num">{{ dash(row.expectedWinning) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          -->

          <div v-if="activeTradeTab === 'real'" class="trade-tab-panel">
            <table class="real-trade-table">
              <thead>
                <tr>
                  <th>계약일</th>
                  <th>거래금액</th>
                  <th>전용면적</th>
                  <th>층</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in displayedRealTradeRows" :key="`rt-${i}`">
                  <td>{{ dash(row.contractDate) }}</td>
                  <td class="num">{{ dash(row.price) }}</td>
                  <td>{{ dash(row.area) }}</td>
                  <td>{{ dash(row.floor) }}</td>
                </tr>
              </tbody>
            </table>
            <div v-if="validRealTradeRows.length > 3" class="trade-limit-bar">
              <span class="trade-limit-info">
                {{ displayedRealTradeRows.length }}/{{ validRealTradeRows.length }}건
              </span>
              <div class="trade-limit-chips">
                <button
                  v-for="opt in TRADE_ROW_LIMIT_OPTIONS"
                  :key="`rl-${opt}`"
                  type="button"
                  class="trade-limit-chip"
                  :class="{ active: realRowLimit === opt }"
                  @click="realRowLimit = opt"
                >{{ limitLabel(opt) }}</button>
              </div>
            </div>
          </div>

          <div v-if="activeTradeTab === 'public'" class="trade-tab-panel" @click="closePublicFilterMenu">
            <div v-if="publicFilterActiveCount > 0" class="real-trade-filter-bar">
              <span>필터 {{ publicFilterActiveCount }}개 적용 · {{ filteredPublicRealTradeRows.length }}/{{ publicRealTradeRows.length }}건</span>
              <button class="real-trade-filter-reset" type="button" @click.stop="resetPublicFilters">필터 초기화</button>
            </div>
            <table class="real-trade-table filterable">
              <thead>
                <tr>
                  <th v-for="col in PUBLIC_FILTER_COLS" :key="col" class="filter-th">
                    <div class="filter-th-inner">
                      <span>{{ {
                        contractDate: '계약일',
                        price: '거래금액',
                        areaM2: '전용면적',
                        floor: '층',
                        buildYear: '연식',
                        apartmentName: '단지/동',
                        propertyTypeLabel: '유형',
                      }[col] }}</span>
                      <button
                        :class="['filter-btn', { active: isPublicFilterActive(col) }]"
                        type="button"
                        :aria-label="`${col} 필터`"
                        @click.stop="togglePublicFilterMenu(col, $event)"
                      >▾</button>
                    </div>
                    <div
                      v-if="activePublicFilterCol === col"
                      class="filter-menu"
                      @click.stop
                    >
                      <div class="filter-menu-head">
                        <input
                          v-model="publicFilterSearch"
                          class="filter-menu-search"
                          placeholder="검색..."
                          type="text"
                        />
                      </div>
                      <div class="filter-menu-actions">
                        <button type="button" @click="selectAllPublicFilter(col)">전체 선택</button>
                        <button type="button" @click="clearAllPublicFilter(col)">전체 해제</button>
                      </div>
                      <ul class="filter-menu-list">
                        <li
                          v-for="value in publicFilterUniqueValues[col].filter((v) => !publicFilterSearch || v.toLowerCase().includes(publicFilterSearch.toLowerCase()))"
                          :key="value"
                        >
                          <label>
                            <input
                              type="checkbox"
                              :checked="publicFilters[col].size === 0 || publicFilters[col].has(value)"
                              @change="togglePublicFilterValue(col, value)"
                            />
                            <span>{{ value }}</span>
                          </label>
                        </li>
                      </ul>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in displayedPublicRealTradeRows" :key="`pr-${i}`">
                  <td>{{ row.contractDate || '-' }}</td>
                  <td class="num">{{ formatWonShort(row.price) }}</td>
                  <td>{{ row.areaM2 ? `${row.areaM2}㎡` : '-' }}</td>
                  <td>{{ row.floor || '-' }}</td>
                  <td>{{ row.buildYear ? `${row.buildYear}년` : '-' }}</td>
                  <td>{{ row.apartmentName ? `${row.apartmentName}${row.umdNm ? ` · ${row.umdNm}` : ''}` : (row.umdNm || '-') }}</td>
                  <td>{{ row.propertyTypeLabel || '-' }}</td>
                </tr>
                <tr v-if="filteredPublicRealTradeRows.length === 0">
                  <td colspan="7" style="text-align:center; color: var(--text-secondary); padding: 18px;">필터 결과가 없습니다.</td>
                </tr>
              </tbody>
            </table>
            <div v-if="filteredPublicRealTradeRows.length > 3" class="trade-limit-bar" @click.stop>
              <span class="trade-limit-info">
                {{ displayedPublicRealTradeRows.length }}/{{ filteredPublicRealTradeRows.length }}건
              </span>
              <div class="trade-limit-chips">
                <button
                  v-for="opt in TRADE_ROW_LIMIT_OPTIONS"
                  :key="`pl-${opt}`"
                  type="button"
                  class="trade-limit-chip"
                  :class="{ active: publicRowLimit === opt }"
                  @click.stop="publicRowLimit = opt"
                >{{ limitLabel(opt) }}</button>
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>

    <div v-if="showDeleteConfirm" class="dv2-modal" @click.self="showDeleteConfirm = false">
      <div class="dv2-modal-box">
        <h3>물건 삭제</h3>
        <p>이 물건을 삭제하면 복구할 수 없습니다. 계속하시겠습니까?</p>
        <p class="addr">{{ form.address }}</p>
        <div class="dv2-modal-actions">
          <button class="dv2-btn" type="button" @click="showDeleteConfirm = false">취소</button>
          <button class="dv2-btn dv2-btn-danger" type="button" @click="confirmDelete">삭제</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dv2 {
  max-width: 1440px;
  margin: 0 auto;
  padding: 20px 24px 40px;
  font-family: inherit;
  color: #1e293b;
}

.dv2-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}
.dv2-back {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #fff;
  font-size: 18px;
  cursor: pointer;
  color: #1e293b;
}
.dv2-title { flex: 1; min-width: 0; }
.dv2-title small { color: #64748b; font-size: 12px; font-weight: 500; display: block; margin-bottom: 2px; }
.dv2-title h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; color: #1e293b; }
.dv2-actions { display: flex; gap: 8px; }
.dv2-btn {
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #1e293b;
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: inherit;
}
.dv2-btn .icon { font-size: 13px; }
.dv2-btn-primary { background: #2563eb; border-color: #2563eb; color: #fff; }
.dv2-btn-danger { background: #dc2626; border-color: #dc2626; color: #fff; }
.dv2-btn-ghost { background: transparent; }
.dv2-icon-btn {
  width: 28px; height: 28px; border-radius: 6px;
  border: 1px solid #e2e8f0; background: #fff; cursor: pointer; font-size: 12px; color: #64748b;
}

.dv2-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.dv2-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px 22px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
}

.dv2-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  gap: 8px;
}
.dv2-card-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: #1a3a6e;
  letter-spacing: -0.01em;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.head-right { display: inline-flex; align-items: center; gap: 6px; }
.head-ico { font-size: 14px; color: #2563eb; }
.auto-pill {
  margin-left: 6px;
  font-size: 11px;
  color: #2563eb;
  background: #dbeafe;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 700;
}

.dv2-row {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 13px;
  gap: 8px;
}
.dv2-row.two { grid-template-columns: 90px minmax(0, 1fr) 90px minmax(0, 1fr); gap: 8px; }
.dv2-row .label { color: #64748b; font-weight: 500; }
.dv2-row .value { color: #1e293b; font-weight: 600; text-align: right; display: inline-flex; justify-content: flex-end; align-items: center; gap: 4px; }
.dv2-row .value.link { color: #2563eb; }
.dv2-row .value.strong { font-weight: 800; }
.dv2-row .value.small-muted { color: #64748b; font-weight: 500; font-size: 12px; }
.value-pair { display: inline-flex; align-items: center; gap: 4px; justify-content: flex-end; width: 100%; color: #64748b; font-size: 12px; }
.mi { font-size: 12px; color: #2563eb; margin-right: 2px; }

.dv2-input {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 13px;
  font-family: inherit;
  color: #1e293b;
  background: #fff;
  outline: none;
}
.dv2-input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12); }
.dv2-input.mini { width: auto; flex: 1; min-width: 60px; }
.dv2-input.cell { max-width: 140px; text-align: right; font-variant-numeric: tabular-nums; }
.dv2-input.cell.tiny { max-width: 60px; }
.dv2-input.textarea { resize: vertical; line-height: 1.5; }
select.dv2-input { cursor: pointer; background: #fff; }

.dv2-sub-head {
  margin: 18px 0 4px;
  font-size: 13px;
  font-weight: 700;
  color: #1a3a6e;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dv2-sub-head.small { font-size: 12px; }
.dv2-sub-head.between { justify-content: space-between; }

.dv2-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.5;
}
.dv2-badge-gray { background: #eef2f7; color: #475569; }
.dv2-badge-red { background: #dc2626; color: #fff; }
.dv2-badge-green { background: #d7f5df; color: #16a34a; }
.dv2-badge-yellow { background: #fef3c7; color: #b45309; }
.dv2-badge-peach { background: #fff2e6; color: #c2410c; }

/* Profit table */
.profit-table-wrap { overflow-x: auto; }
.profit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.profit-table th {
  background: #1a3a6e;
  color: #fff;
  font-weight: 700;
  padding: 8px 10px;
  text-align: left;
  font-size: 12px;
  white-space: nowrap;
}
.profit-table th:nth-child(3),
.profit-table th:nth-child(4) { text-align: right; }
.profit-table td {
  padding: 7px 10px;
  border-bottom: 1px solid #f1f5f9;
  color: #1e293b;
  white-space: nowrap;
}
.profit-table td.cat {
  background: #f8fafc;
  font-weight: 700;
  color: #1a3a6e;
  width: 70px;
  text-align: center;
}
.profit-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.profit-table td.num.strong { font-weight: 800; }
.profit-table td.note { text-align: right; color: #94a3b8; font-size: 11px; }
.profit-table tr.hi td { background: #fefce8; }
.profit-table tr.hi td.cat { background: #f8fafc; }

/* Field survey specifics */
.dv2-subsec { margin-top: 14px; }
.dv2-note {
  margin: 6px 0 0;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 8px;
  font-size: 13px;
  color: #1e293b;
  line-height: 1.5;
}
.dv2-note.multiline {
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.dv2-inline-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 13px;
}
.dv2-inline-row .label { color: #64748b; margin-right: 6px; }
.dv2-inline-row > div { display: flex; align-items: center; gap: 6px; flex: 1 1 220px; min-width: 0; }
.dv2-inline-row > div > .dv2-input { flex: 1 1 auto; }
.dot-ok { color: #16a34a; font-size: 10px; margin-right: 4px; }

.dv2-mini-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}
.dv2-mini-grid .mini {
  background: #f8fafc;
  border-radius: 8px;
  padding: 10px 12px;
  min-width: 0;
}
.dv2-mini-grid .mini small {
  display: block;
  color: #64748b;
  font-size: 11px;
  margin-bottom: 4px;
  font-weight: 500;
}
.dv2-mini-grid .mini strong {
  display: block;
  font-size: 14px;
  font-weight: 800;
  color: #1e293b;
}
.dv2-mini-grid .mini strong.danger { color: #dc2626; }

.dv2-two-col {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  column-gap: 20px;
  margin-top: 6px;
}
.dv2-two-col .dv2-row { grid-template-columns: 80px minmax(0, 1fr); }

/* Market demand */
.target-text { color: #1e293b; font-weight: 700; font-size: 13px; }
.dv2-infra-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  margin-top: 12px;
}
.infra-box {
  background: #f8fafc;
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  gap: 10px;
  align-items: center;
}
.infra-box > div { flex: 1 1 0; min-width: 0; }
.infra-box .head-ico { font-size: 18px; }
.infra-box small {
  display: block;
  color: #64748b;
  font-size: 11px;
  margin-bottom: 2px;
  font-weight: 500;
}
.infra-box strong {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
}
.infra-body { display: flex; flex-direction: column; gap: 2px; }
.infra-body .dv2-input { margin-top: 2px; }
.infra-line {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: #1e293b;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.infra-line + .infra-line { margin-top: 2px; }

.school-box.infra-box { align-items: flex-start; }
.school-group {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  margin-top: 4px;
}
.school-group:first-of-type { margin-top: 2px; }
.school-level {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  margin-top: 1px;
}
.level-초 { background: #22c55e; }
.level-중 { background: #3b82f6; }
.level-고 { background: #f97316; }
.school-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
  flex: 1 1 0;
}
.school-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 0;
  font-size: 11px;
  line-height: 1.4;
  color: #1e293b;
}
.school-chip .school-name { font-weight: 600; }
.school-chip .school-dist { color: #64748b; font-size: 10px; }

.dv2-stat-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  margin-top: 16px;
}
.stat-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #64748b;
  font-weight: 600;
  margin-bottom: 6px;
  gap: 8px;
}
.stat-head strong { font-size: 13px; font-weight: 800; }
.stat-head strong.green { color: #16a34a; }
.bar {
  width: 100%;
  height: 6px;
  background: #eef2f7;
  border-radius: 999px;
  overflow: hidden;
}
.bar > span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: #16a34a;
}
.bar.green-bar > span { background: #16a34a; }
.muted { color: #94a3b8; font-size: 11px; margin: 6px 0 0; }

.dv2-price-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}
.dv2-price-row .price-box { min-width: 0; }
.price-box {
  background: #f8fafc;
  border-radius: 10px;
  padding: 10px 12px;
  text-align: center;
}
.price-box small {
  display: block;
  color: #64748b;
  font-size: 11px;
  margin-bottom: 4px;
  font-weight: 500;
}
.price-box strong {
  display: block;
  font-size: 14px;
  font-weight: 800;
  color: #1e293b;
}

.market-fetch-note {
  margin: 8px 0 0;
  padding: 8px 12px;
  font-size: 12px;
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
}
.trade-tabs { margin-top: 14px; }
.trade-tabs-head {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid #e2e8f0;
}
.trade-tab {
  background: transparent;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  margin-bottom: -1px;
}
.trade-tab:hover { color: #334155; background: #f8fafc; }
.auto-fetched-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.25);
  margin-right: 6px;
  vertical-align: middle;
}
.trade-tab.active {
  color: #1e293b;
  background: #fff;
  border-color: #e2e8f0;
  border-bottom-color: #fff;
}
.trade-tab-panel {
  border: 1px solid #e2e8f0;
  border-top: none;
  border-radius: 0 10px 10px 10px;
  background: #fff;
  overflow-x: auto;
}
.real-trade-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.real-trade-table th,
.real-trade-table td {
  padding: 8px 10px;
  text-align: center;
  border-bottom: 1px solid #f1f5f9;
  white-space: nowrap;
}
.real-trade-table th {
  background: #f8fafc;
  color: #64748b;
  font-weight: 600;
  font-size: 11px;
  white-space: nowrap;
}
.real-trade-table td.num { font-weight: 700; color: #1e293b; }
.real-trade-table tbody tr:last-child td { border-bottom: none; }

.trade-limit-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  font-size: 11px;
  color: #64748b;
}
.trade-limit-info { font-weight: 600; }
.trade-limit-chips { display: flex; gap: 4px; }
.trade-limit-chip {
  padding: 3px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: #fff;
  color: #475569;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.trade-limit-chip:hover { border-color: #cbd5e1; color: #1e293b; }
.trade-limit-chip.active {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

.real-trade-filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  margin-bottom: 6px;
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-card));
  border: 1px solid color-mix(in srgb, var(--accent) 25%, var(--line));
  border-radius: 8px;
  font-size: 11.5px;
  color: var(--accent);
  font-weight: 600;
}
.real-trade-filter-reset {
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line));
  color: var(--accent);
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.real-trade-filter-reset:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }

.real-trade-table.filterable th.filter-th { position: relative; padding: 6px 4px; }
.filter-th-inner {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.filter-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 10px;
  line-height: 1;
}
.filter-btn:hover { background: var(--bg-soft); color: var(--text-primary); }
.filter-btn.active {
  background: var(--accent);
  color: #fff;
}

.filter-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 20;
  min-width: 180px;
  max-width: 260px;
  background: var(--bg-card);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
  padding: 6px;
  text-align: left;
  font-size: 11.5px;
  color: var(--text-primary);
}
.filter-menu-head { padding: 0 2px 6px; }
.filter-menu-search {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  font-size: 11.5px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-family: inherit;
}
.filter-menu-search:focus { outline: none; border-color: var(--accent); }
.filter-menu-actions {
  display: flex;
  gap: 4px;
  padding: 4px 2px 6px;
  border-bottom: 1px solid var(--line);
}
.filter-menu-actions button {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--line);
  background: var(--bg-card);
  color: var(--text-secondary);
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.filter-menu-actions button:hover { background: var(--bg-soft); color: var(--text-primary); }
.filter-menu-list {
  list-style: none;
  margin: 0;
  padding: 4px 2px 2px;
  max-height: 220px;
  overflow-y: auto;
}
.filter-menu-list li label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 400;
  color: var(--text-primary);
}
.filter-menu-list li label:hover { background: var(--bg-soft); }
.filter-menu-list input[type='checkbox'] { margin: 0; }

/* Delete modal */
.dv2-modal {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(15, 23, 42, 0.5);
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(4px);
}
.dv2-modal-box {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 28px 32px;
  max-width: 420px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.2);
}
.dv2-modal-box h3 { margin: 0 0 10px; font-size: 18px; font-weight: 800; color: #dc2626; }
.dv2-modal-box p { margin: 0 0 8px; font-size: 13px; color: #64748b; line-height: 1.5; }
.dv2-modal-box .addr {
  font-weight: 700; color: #1e293b; font-size: 14px;
  padding: 10px 12px; background: #f8fafc; border-radius: 8px;
  margin: 12px 0;
}
.dv2-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }

@media (max-width: 1000px) {
  .dv2-grid { grid-template-columns: 1fr; }
  .dv2-two-col { grid-template-columns: 1fr; }
  .dv2-infra-grid { grid-template-columns: 1fr; }
  .dv2-stat-row { grid-template-columns: 1fr; }
  .dv2-price-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .dv2 { padding: 8px 10px 20px; font-size: 12px; }
  .dv2-header {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    grid-template-rows: auto auto;
    column-gap: 8px;
    row-gap: 6px;
    margin-bottom: 10px;
    align-items: start;
  }
  .dv2-back { width: 28px; height: 28px; font-size: 14px; border-radius: 6px; grid-row: 1; grid-column: 1; }
  .dv2-title { grid-row: 1; grid-column: 2; min-width: 0; }
  .dv2-title small { font-size: 10.5px; margin-bottom: 1px; }
  .dv2-title h1 {
    font-size: 13.5px;
    line-height: 1.3;
    word-break: keep-all;
    overflow-wrap: anywhere;
  }
  .dv2-actions { grid-row: 2; grid-column: 1 / -1; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
  .dv2-btn { padding: 5px 9px; font-size: 11.5px; border-radius: 6px; gap: 4px; }
  .dv2-btn .icon { font-size: 11.5px; }
  .dv2-grid { gap: 8px; }
  .dv2-card { padding: 10px 12px; border-radius: 9px; }
  .dv2-card-head { margin-bottom: 8px; }
  .dv2-card-head h2 { font-size: 12.5px; }
  .head-ico { font-size: 13px; }
  .dv2-row {
    grid-template-columns: 82px minmax(0, 1fr);
    padding: 5px 0;
    font-size: 11.5px;
    gap: 6px;
  }
  .dv2-row .label { font-size: 11px; }
  .dv2-row.two { grid-template-columns: 66px minmax(0, 1fr) 66px minmax(0, 1fr); gap: 5px; }
  .dv2-sub-head { margin: 10px 0 2px; font-size: 11.5px; }
  .dv2-input { padding: 3px 6px; font-size: 11.5px; }
  .dv2-badge { font-size: 10px; padding: 1px 5px; }
  .profit-table { font-size: 11px; }
  .profit-table th, .profit-table td { padding: 4px 6px; }
  .real-trade-table { font-size: 10.5px; }
  .real-trade-table th, .real-trade-table td { padding: 3px 5px; }
}
</style>
