<script setup lang="ts">
// 자금관리 — 4개 탭. 모든 데이터는 Firestore에 사용자별로 저장됨.
// 탭: 사업계좌 자금입출금 / 사업지출내역 / 유류비 & 식대지출 / 물품구매 지출상세

import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import FormattedNumberInput from '../components/FormattedNumberInput.vue';
import TaxPage from './TaxPage.vue';
import AppConfirm from '../components/AppConfirm.vue';
import { skipsToday, type ConfirmBox } from '../services/confirmBox';
import DateWheelPicker from '../components/DateWheelPicker.vue';
import { useFinanceStore } from '../stores/financeStore';
import { useAuctionStore } from '../stores/auctionStore';
import { bidStageOf } from '../utils/stageLabel';
import { bidPriceOf, costsOf, incomeOf, shortCourt } from '../utils/auctionSummary';
import type { AuctionDetail } from '../types/auction';
import type {
  BusinessExpenseRecord,
  CashFlowRecord,
  FinanceTabKey,
  FuelMealRecord,
  ItemPurchaseRecord,
  PeriodKey,
} from '../types/finance';

// 직접선택 기간 — 입찰가산정의 낙찰일과 같은 휠 날짜 선택기를 쓴다
const rangeTarget = ref<'' | 'start' | 'end'>('');
const rangeValue = computed({
  get: () => (rangeTarget.value === 'start' ? customStart.value : rangeTarget.value === 'end' ? customEnd.value : ''),
  set: (value: string) => {
    if (rangeTarget.value === 'start') customStart.value = value;
    if (rangeTarget.value === 'end') customEnd.value = value;
  },
});

const finance = useFinanceStore();
const router = useRouter();
const auctionStore = useAuctionStore();
/** 머리줄에 적는 건수 — 지금 낙찰로 들고 있는 물건과 판 물건.
 *  단계(bidStatus)를 그대로 센다 — 세금신고가 보는 날짜와 같은 자리에서 온다 */
const stageRows = (stage: string) => auctionStore.auctions.filter((a) => bidStageOf(a) === stage);
const wonCount = computed(() => stageRows('낙찰').length);
const soldCount = computed(() => stageRows('매도').length);

/** 머리줄의 낙찰·매도를 누르면 그 물건들을 카드로 펼친다 */
const stageListOpen = ref<'' | '낙찰' | '매도'>('');
/** 카드를 누르면 그 자리에서 입찰가 산정표(A안)를 편다 — 목록을 떠나지 않는다 */
const openCardId = ref('');
const toggleCard = (id: string) => { openCardId.value = openCardId.value === id ? '' : id; };
/** 물건 상세로 가는 길은 따로 둔다 */
const openAuction = (id: string) => { void router.push(`/auctions/${id}`); };

/** 수익현황 표 — 물건상세 산정표(A안)의 값을 그대로 읽어 적는다. 여기서는 보기만 한다.
 *  칸은 구분 · 항목 · 금액 · 세율/근거 넷이다. */
type CalcRow = {
  cat?: string; catSpan?: number;
  label: string; amount?: number; text?: string; note?: string;
  cls?: string; strong?: boolean;
};
const pctText = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(2)}%` : '');
const calcRows = (a: AuctionDetail): CalcRow[] => {
  const c = a.bidCost ?? ({} as NonNullable<AuctionDetail['bidCost']>);
  const appr = a.metrics?.appraisalValue ?? 0;
  const low = a.metrics?.minimumBidValue ?? 0;
  const bid = bidPriceOf(a) || low;
  const cost = costsOf(a);
  const sale = a.expectedSaleValue ?? 0;
  const gain = sale - bid - cost;
  const tax = c.incomeTaxAmount ?? 0;
  const local = c.localTaxAmount ?? 0;
  const net = bid - (c.loanAmount ?? 0) + cost;
  const after = gain - tax - local;
  const rate = (v?: number) => (v && v > 0 ? `${v}%` : '');
  return [
    { cat: '취득원가', catSpan: 4, label: '감정가', amount: appr },
    { label: a.auctionRound ? `${a.auctionRound}(최저가)` : '최저가', amount: low, note: pctText(low, appr) },
    { label: '낙찰가', amount: bid, cls: 'hi', strong: true, note: pctText(bid, appr) },
    { label: '취득세', amount: c.acquisitionTaxAmount ?? 0, note: rate(c.acquisitionTaxRate) },
    { cat: '필요경비', catSpan: 10, label: '대출(사업자)', amount: c.loanAmount ?? 0, note: pctText(c.loanAmount ?? 0, bid) },
    { label: '법무비/채권', amount: c.legalCostAmount ?? 0, note: rate(c.legalCostRate) },
    { label: '이자비용', amount: c.interestAmount ?? 0, note: rate(c.interestRate3m) },
    { label: '중도상환', amount: c.midRepaymentAmount ?? 0, note: rate(c.midRepaymentRate) },
    { label: '매도중개료', amount: c.brokerageAmount ?? 0, note: rate(c.brokerageRate) },
    { label: '미납관리비', amount: c.arrearsFee ?? 0 },
    { label: '수리비', amount: c.repairCost ?? 0 },
    { label: '명도비', amount: c.evictionCost ?? 0 },
    { label: '광고비', amount: c.advertisingCost ?? 0, note: '3.3%' },
    { label: '필요경비 합계', amount: cost, cls: 'hi', strong: true, note: pctText(cost, bid) },
    // 줄 수와 rowspan 이 어긋나면 마지막 줄이 한 칸 밀린다 — 여덟 줄이다
    { cat: '세후수익', catSpan: 8, label: '매도확정가', amount: sale, cls: 'pink', strong: true },
    { label: '총투자금', amount: bid + cost, note: '낙찰가+필요경비' },
    { label: '실투자금', amount: net, note: '낙찰가-대출+필요경비' },
    { label: '사업소득금액', amount: gain, strong: true, note: '매도가-낙찰가-필요경비' },
    { label: '사업소득세', amount: tax, strong: true, note: '과세표준' },
    { label: '지방소득세', amount: local, strong: true, note: '사업소득세 × 10%' },
    { label: '세후 순이익', amount: after, cls: 'hi', strong: true, note: '매도가-총투자금-세금' },
    { label: '세후 수익률', text: net > 0 ? `${((after / net) * 100).toFixed(2)}%` : '-', cls: 'hi', strong: true, note: '세후이익/실투자금' },
  ];
};

const toggleStageList = (stage: '낙찰' | '매도') => {
  stageListOpen.value = stageListOpen.value === stage ? '' : stage;
};
const stageListRows = computed(() => (stageListOpen.value ? stageRows(stageListOpen.value) : []));
/** 주소는 동(洞)부터 — 시·도와 시군구는 뗀다.
 *  '동 + 지번 + 건물명 + 동호수'면 어느 집인지 알아보는 데 넉넉하다.
 *  (낙찰·매도 카드에서만 이렇게 줄인다) */
const shortAddr = (address?: string) => {
  const parts = String(address ?? '').trim().split(/\s+/).filter(Boolean);
  const dong = parts.findIndex((v) => /[동읍면리]\d*$/.test(v) && !/^\d/.test(v));
  if (dong >= 0) return parts.slice(dong).join(' ');
  return parts.length > 2 ? parts.slice(-2).join(' ') : parts.join(' ');
};
/** 날짜 — 앞의 '20'을 뗀다 ('26. 10. 10'). 비어 있으면 빈 칸 */
const shortYmd = (d?: string) => (d && /^\d{4}[-./]/.test(d) ? d.slice(2).replace(/-/g, '. ') : '');
/** 카드 안의 돈 — 칸이 좁아 억·만으로 줄여 쓴다 */
const shortMoney = (won: number) => {
  if (!Number.isFinite(won) || won === 0) return '–';
  const sign = won < 0 ? '-' : '';
  const abs = Math.abs(won);
  const eok = Math.floor(abs / 100000000);
  const man = Math.round((abs % 100000000) / 10000);
  if (eok > 0) return man > 0 ? `${sign}${eok}억 ${man.toLocaleString('ko-KR')}만` : `${sign}${eok}억`;
  return `${sign}${man.toLocaleString('ko-KR')}만`;
};

onMounted(() => {
  finance.initialize();
});
onUnmounted(() => {
  // 다른 사용자의 finance 데이터가 잔존하지 않도록 — store는 watch로 재구독
});

const activeTab = ref<FinanceTabKey>('cashFlow');
const period = ref<PeriodKey>('all');
const customStart = ref('');
const customEnd = ref('');

// === 기간 필터 ===
const isWithinPeriod = (dateStr: string): boolean => {
  if (!dateStr) return period.value === 'all';
  const today = new Date();
  const recordDate = new Date(dateStr.includes('-') ? dateStr : dateStr.replace(/\./g, '-'));
  if (Number.isNaN(recordDate.getTime())) return period.value === 'all';

  if (period.value === 'all') return true;
  if (period.value === 'thisMonth') {
    return recordDate.getFullYear() === today.getFullYear() && recordDate.getMonth() === today.getMonth();
  }
  if (period.value === 'thisYear') {
    return recordDate.getFullYear() === today.getFullYear();
  }
  if (period.value === 'custom') {
    if (customStart.value && dateStr < customStart.value) return false;
    if (customEnd.value && dateStr > customEnd.value) return false;
    return true;
  }
  return true;
};

// 정렬: 날짜 내림차순
const byDateDesc = <T extends { date: string }>(arr: T[]) =>
  [...arr].sort((a, b) => b.date.localeCompare(a.date));

const filteredCashFlows = computed(() => byDateDesc(finance.cashFlows.filter((r) => isWithinPeriod(r.date))));
const filteredBusiness = computed(() => byDateDesc(finance.businessExpenses.filter((r) => isWithinPeriod(r.date))));
const filteredFuelMeal = computed(() => byDateDesc(finance.fuelMeal.filter((r) => isWithinPeriod(r.date))));
const filteredItemPurchases = computed(() => byDateDesc(finance.itemPurchases.filter((r) => isWithinPeriod(r.date))));

// === 자금입출금 요약 ===
const totalIn = computed(() =>
  filteredCashFlows.value.filter((r) => r.flowType === '입금').reduce((s, r) => s + r.amount, 0),
);
const totalOut = computed(() =>
  filteredCashFlows.value.filter((r) => r.flowType === '출금').reduce((s, r) => s + r.amount, 0),
);
const balance = computed(() => totalIn.value - totalOut.value);

// === 포맷터 ===
const fmtMoney = (n: number) => n.toLocaleString('ko-KR');
const fmtMoneyWon = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const fmtMoneySigned = (n: number, sign: '+' | '-') =>
  `${sign}${n.toLocaleString('ko-KR')}원`;

// === 모달 상태 ===
type ModalKind = '' | 'cashFlow' | 'businessExpense' | 'fuelMeal' | 'itemPurchase';
const modalKind = ref<ModalKind>('');
const cfDraft = ref<Partial<CashFlowRecord>>({});
const beDraft = ref<Partial<BusinessExpenseRecord>>({});
const fmDraft = ref<Partial<FuelMealRecord>>({});
const ipDraft = ref<Partial<ItemPurchaseRecord>>({});

const todayIso = () => new Date().toISOString().slice(0, 10);

const openAdd = (kind: ModalKind) => {
  modalKind.value = kind;
  if (kind === 'cashFlow') {
    cfDraft.value = { flowType: '출금', amount: 0, date: todayIso() };
  } else if (kind === 'businessExpense') {
    beDraft.value = {
      auctionId: '',
      profitCategory: '기타사업비',
      memo: '',
      detail: '',
      amountWithVat: 0,
      date: todayIso(),
    };
  } else if (kind === 'fuelMeal') {
    fmDraft.value = { region: '', store: '', category: '', amount: 0, card: '국민신용카드', users: [], date: todayIso() };
  } else if (kind === 'itemPurchase') {
    ipDraft.value = {
      auctionId: '', category: '인테리어', description: '', quantity: 1, unitPrice: 0,
      vendor: '', card: '국민신용카드', user: '', shippingFee: 0, date: todayIso(),
    };
  }
};

const openEdit = (kind: ModalKind, record: unknown) => {
  modalKind.value = kind;
  if (kind === 'cashFlow') cfDraft.value = { ...(record as CashFlowRecord) };
  else if (kind === 'businessExpense') beDraft.value = { ...(record as BusinessExpenseRecord) };
  else if (kind === 'fuelMeal') {
    const r = record as FuelMealRecord;
    fmDraft.value = { ...r, users: [...(r.users || [])] };
  }
  else if (kind === 'itemPurchase') ipDraft.value = { ...(record as ItemPurchaseRecord) };
};

const closeModal = () => {
  modalKind.value = '';
};

/** 주소에서 빌라 이름만 — '…검암동 678-8 프리스틴 106동 4층402호' → '프리스틴' */
const villaName = (address?: string) => {
  const parts = String(address ?? '').split(/\s+/).filter(Boolean);
  let lot = -1;
  parts.forEach((t, i) => { if (/^\d+(-\d+)?$/.test(t)) lot = i; });
  const tail = (lot >= 0 ? parts.slice(lot + 1) : parts)
    .filter((t) => !/^\d+동$/.test(t) && !/^\d+층$/.test(t) && !/\d+호$/.test(t) && t !== '산');
  return tail.join(' ').trim();
};

/** 돈을 쓰는 자리는 낙찰받은 물건이다 — 낙찰일이 적힌 물건만 고르게 한다.
 *  (낙찰일은 물건상세 '입찰가산정 → 예상 수익 분석' 에서 적는다)
 *  아직 낙찰된 물건이 없으면 전부 보여 준다 — 고를 것이 없으면 더 곤란하다 */
/** 사업지출 항목 — 알약으로 고른다 (드롭다운보다 한눈에 들어온다) */
const EXPENSE_CATEGORIES = [
  '기타사업비', '소유권이전', '인테리어', '대출이자', '관리비', '세금', '중개수수료',
];

const auctionOptions = computed(() => {
  const label = (a: { caseNumber: string; address?: string }) =>
    villaName(a.address) || a.address || a.caseNumber;
  const won = auctionStore.auctions.filter((a) => !!a.wonDate);
  const list = won.length > 0 ? won : auctionStore.auctions;
  return list.map((a) => ({ id: a.id, label: label(a) }));
});

// ipDraft: quantity/unitPrice 변경 시 합계 자동 계산
const updateItemTotals = () => {
  const q = Number(ipDraft.value.quantity || 0);
  const u = Number(ipDraft.value.unitPrice || 0);
  ipDraft.value.subtotal = q * u;
  // VAT 합계는 사용자가 직접 입력하거나 같은 값으로 (이미지에서는 동일)
  if (!ipDraft.value.totalWithVat) {
    ipDraft.value.totalWithVat = q * u;
  }
};

const onSave = async () => {
  try {
    if (modalKind.value === 'cashFlow') {
      await finance.saveCashFlow(cfDraft.value);
    } else if (modalKind.value === 'businessExpense') {
      const a = auctionStore.auctions.find((x) => x.id === beDraft.value.auctionId);
      if (a) beDraft.value.auctionLabel = villaName(a.address) || a.caseNumber;
      await finance.saveBusinessExpense(beDraft.value);
    } else if (modalKind.value === 'fuelMeal') {
      await finance.saveFuelMeal(fmDraft.value);
    } else if (modalKind.value === 'itemPurchase') {
      const a = auctionStore.auctions.find((x) => x.id === ipDraft.value.auctionId);
      if (a) ipDraft.value.auctionLabel = villaName(a.address) || a.caseNumber;
      await finance.saveItemPurchase(ipDraft.value);
    }
    closeModal();
  } catch (e) {
    alert(e instanceof Error ? e.message : '저장 실패');
  }
};

// 확인창은 앱 전체가 같은 것을 쓴다 (AppConfirm)
const confirmBox = ref<ConfirmBox | null>(null);
const askConfirm = (box: ConfirmBox) => {
  if (skipsToday(box.skipKey)) { void box.run(); return; }
  confirmBox.value = box;
};
const onDelete = () => {
  askConfirm({
    title: '이 항목을 삭제할까요?',
    desc: '삭제하면 되살릴 수 없습니다.',
    okLabel: '삭제',
    skipKey: 'fin.skip.deleteItem',
    run: () => runDelete(),
  });
};

const runDelete = async () => {
  try {
    if (modalKind.value === 'cashFlow' && cfDraft.value.id) {
      await finance.deleteCashFlow(cfDraft.value.id);
    } else if (modalKind.value === 'businessExpense' && beDraft.value.id) {
      await finance.deleteBusinessExpense(beDraft.value.id);
    } else if (modalKind.value === 'fuelMeal' && fmDraft.value.id) {
      await finance.deleteFuelMeal(fmDraft.value.id);
    } else if (modalKind.value === 'itemPurchase' && ipDraft.value.id) {
      await finance.deleteItemPurchase(ipDraft.value.id);
    }
    closeModal();
  } catch (e) {
    alert(e instanceof Error ? e.message : '삭제 실패');
  }
};

// === CSV (엑셀 호환) 내보내기 ===
const escapeCsv = (s: unknown): string => {
  const str = String(s ?? '');
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
};
const downloadCsv = (filename: string, rows: Array<Array<string | number>>) => {
  const bom = '﻿'; // Excel UTF-8 인식용
  const text = bom + rows.map((r) => r.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** 카드 이름은 끝의 '카드' 를 뗀다 — '국민신용카드' → '국민신용' */
const cardShort = (v?: string) => String(v ?? '').replace(/\s*카드$/, '').trim();

/** 표에 적는 날짜 — '2026-10-14' → '26-10-14'. 엑셀에는 원래대로 넣는다 */
const shortDate = (d?: string) => (d && /^\d{4}[-./]/.test(d) ? d.slice(2) : (d ?? ''));

const exportExcel = () => {
  if (activeTab.value === 'cashFlow') {
    downloadCsv('자금입출금.csv', [
      ['일자', '명세', '입출금', '금액', '비고'],
      ...filteredCashFlows.value.map((r) => [r.date, r.ownerName, r.flowType, r.amount, r.note]),
    ]);
  } else if (activeTab.value === 'businessExpense') {
    downloadCsv('사업지출.csv', [
      ['결제일', '물건구분', '사용구분', '명세', '비용(VAT포함)', '비고'],
      ...filteredBusiness.value.map((r) => [r.date, r.auctionLabel, r.profitCategory || r.memo, r.detail, r.amountWithVat, r.note]),
    ]);
  } else if (activeTab.value === 'fuelMeal') {
    downloadCsv('유류식대.csv', [
      ['사용일', '사용지역', '사용처', '사용구분', '지출', '카드', '사용자', '비고'],
      ...filteredFuelMeal.value.map((r) => [r.date, r.region, r.store, r.category, r.amount, r.card, r.users.join(','), r.note]),
    ]);
  } else if (activeTab.value === 'itemPurchase') {
    downloadCsv('물품구매.csv', [
      ['결제일', '물건구분', '사용구분', '상세내역', '수량', '단가', '계', '합계(VAT포함)', '구매처', '카드', '사용자', '배송비', '비고'],
      ...filteredItemPurchases.value.map((r) => [
        r.date, r.auctionLabel, r.category, r.description,
        r.quantity, r.unitPrice, r.subtotal, r.totalWithVat,
        r.vendor, r.card, r.user, r.shippingFee, r.note,
      ]),
    ]);
  }
};
</script>

<template>
  <section class="fin-shell">
    <div class="fin-fixed-top">
    <header class="fin-header">
      <h1 class="fin-page-title">
        사업자금관리
        <!-- 낙찰로 들고 있는 물건과 판 물건 — 돈 이야기의 바탕이라 제목 옆에 적어 둔다 -->
        <span class="fin-stage-count">
          <!-- 건수 앞에 곱하기 — 선정물건의 휴지통·보관함 단추와 같은 표기 -->
          <button type="button" :class="['won', { on: stageListOpen === '낙찰' }]" @click="toggleStageList('낙찰')">낙찰 <i>×</i>{{ wonCount }}</button>
          <button type="button" :class="['sold', { on: stageListOpen === '매도' }]" @click="toggleStageList('매도')">매도 <i>×</i>{{ soldCount }}</button>
        </span>
      </h1>
      <nav class="fin-tabs">
        <button :class="['fin-tab', { active: activeTab === 'cashFlow' }]" @click="activeTab = 'cashFlow'">자금입출금</button>
        <button :class="['fin-tab', { active: activeTab === 'businessExpense' }]" @click="activeTab = 'businessExpense'">사업지출</button>
        <button :class="['fin-tab', { active: activeTab === 'fuelMeal' }]" @click="activeTab = 'fuelMeal'">유류&amp;식대</button>
        <button :class="['fin-tab', { active: activeTab === 'itemPurchase' }]" @click="activeTab = 'itemPurchase'">물품구매</button>
        <button :class="['fin-tab', { active: activeTab === 'tax' }]" @click="activeTab = 'tax'">세금신고</button>
      </nav>
    </header>

    <div v-if="activeTab !== 'tax'" class="fin-toolbar">
      <!-- 제목·안내 줄은 적지 않는다 — 탭 이름과 겹친다 -->
      <div class="fin-toolbar-right">
        <div class="fin-period">
          <button :class="['fin-period-btn', { active: period === 'thisMonth' }]" @click="period = 'thisMonth'">이번달</button>
          <button :class="['fin-period-btn', { active: period === 'thisYear' }]" @click="period = 'thisYear'">올해</button>
          <button :class="['fin-period-btn', { active: period === 'all' }]" @click="period = 'all'">총기간</button>
          <button :class="['fin-period-btn', { active: period === 'custom' }]" @click="period = 'custom'">직접선택</button>
        </div>
        <button type="button" class="fin-excel" @click="exportExcel"><i>⬇</i>엑셀저장</button>
        <button type="button" class="fin-add" @click="openAdd(activeTab as ModalKind)"><i>+</i>항목추가</button>
      </div>
    </div>

    <div v-if="period === 'custom'" class="fin-custom-range">
      <button type="button" class="fin-date-box" @click="rangeTarget = 'start'">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" />
        </svg>
        <span>{{ customStart || '날짜입력' }}</span>
      </button>
      <span class="fin-date-sep">~</span>
      <button type="button" class="fin-date-box" @click="rangeTarget = 'end'">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" />
        </svg>
        <span>{{ customEnd || '날짜입력' }}</span>
      </button>
    </div>
    </div>

    <div class="fin-body">
    <!-- ========== TAB 1: 자금입출금 ========== -->
    <template v-if="activeTab === 'cashFlow'">
      <div class="fin-summary">
        <div class="sum-card in">
          <small>총 입금</small>
          <strong>{{ fmtMoneyWon(totalIn) }}</strong>
        </div>
        <div class="sum-card out">
          <small>총 출금</small>
          <strong>{{ fmtMoneyWon(totalOut) }}</strong>
        </div>
        <div class="sum-card bal">
          <small>잔액</small>
          <strong>{{ fmtMoneyWon(balance) }}</strong>
        </div>
      </div>

      <div class="fin-table-wrap">
        <table class="fin-table cash">
          <!-- 칸 너비를 못 박는다 — 글자가 왼쪽에 몰리지 않게 -->
          <colgroup>
            <col style="width: 16%" /><col style="width: 19%" /><col style="width: 14%" />
            <col style="width: 21%" /><col />
          </colgroup>
          <thead>
            <tr><th>일자</th><th>명세</th><th>입출금</th><th class="r">개인 자금</th><th>비고</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in filteredCashFlows" :key="r.id" @click="openEdit('cashFlow', r)">
              <td>{{ shortDate(r.date) }}</td>
              <td :title="r.ownerName">{{ r.ownerName }}</td>
              <td><span :class="['pill', r.flowType === '입금' ? 'in' : 'out']">{{ r.flowType }}</span></td>
              <td :class="['r', 'amt', r.flowType === '입금' ? 'red' : 'blue']">{{ fmtMoneySigned(r.amount, r.flowType === '입금' ? '+' : '-') }}</td>
              <td :title="r.note">{{ r.note }}</td>
            </tr>
            <tr v-if="filteredCashFlows.length === 0">
              <td colspan="5" class="empty">
                <template v-if="finance.cashFlows.length === 0">데이터가 없습니다.</template>
                <template v-else>이 기간에 해당하는 데이터가 없습니다. (전체 {{ finance.cashFlows.length }}건 — 다른 기간 선택)</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ========== TAB 2: 사업지출내역 ========== -->
    <template v-else-if="activeTab === 'businessExpense'">
      <div class="fin-table-wrap">
        <table class="fin-table mid">
          <!-- 칸 너비를 못 박는다 — 글자가 왼쪽에 몰리지 않게 -->
          <colgroup>
            <col style="width: 17%" /><col style="width: 17%" /><col style="width: 16%" />
            <col style="width: 18%" /><col style="width: 18%" /><col />
          </colgroup>
          <thead>
            <tr><th>결제일</th><th>물건구분</th><th>사용구분</th><th>명세</th><th class="r two">비용{{ '\n' }}(VAT포함)</th><th>비고</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in filteredBusiness" :key="r.id" @click="openEdit('businessExpense', r)">
              <td>{{ shortDate(r.date) }}</td>
              <td :title="r.auctionLabel">{{ r.auctionLabel || '-' }}</td>
              <td :title="r.profitCategory || r.memo"><span class="pill memo">{{ r.profitCategory || r.memo || '-' }}</span></td>
              <td :title="r.detail">{{ r.detail }}</td>
              <td class="r">{{ fmtMoney(r.amountWithVat) }}</td>
              <td :title="r.note">{{ r.note }}</td>
            </tr>
            <tr v-if="filteredBusiness.length === 0">
              <td colspan="6" class="empty">
                <template v-if="finance.businessExpenses.length === 0">데이터가 없습니다.</template>
                <template v-else>이 기간에 해당하는 데이터가 없습니다. (전체 {{ finance.businessExpenses.length }}건)</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ========== TAB 3: 유류비 & 식대 ========== -->
    <template v-else-if="activeTab === 'fuelMeal'">
      <div class="fin-table-wrap">
        <table class="fin-table mid">
          <colgroup>
            <col style="width: 16%" /><col style="width: 20%" /><col style="width: 15%" />
            <col style="width: 18%" /><col style="width: 15%" /><col />
          </colgroup>
          <thead>
            <tr><th>사용일</th><th>사용처</th><th>사용구분</th><th>비용</th><th>사용카드</th><th>비고</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in filteredFuelMeal" :key="r.id" @click="openEdit('fuelMeal', r)">
              <td>{{ shortDate(r.date) }}</td>
              <td :title="r.store">{{ r.store }}</td>
              <td :title="r.category"><span class="pill cat">{{ r.category || '-' }}</span></td>
              <td>{{ fmtMoney(r.amount) }}원</td>
              <td :title="r.card">{{ cardShort(r.card) || '-' }}</td>
              <td :title="r.note">{{ r.note }}</td>
            </tr>
            <tr v-if="filteredFuelMeal.length === 0">
              <td colspan="6" class="empty">
                <template v-if="finance.fuelMeal.length === 0">데이터가 없습니다.</template>
                <template v-else>이 기간에 해당하는 데이터가 없습니다. (전체 {{ finance.fuelMeal.length }}건)</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ========== TAB 4: 물품구매 ========== -->
    <template v-else-if="activeTab === 'itemPurchase'">
      <div class="fin-table-wrap">
        <table class="fin-table mid">
          <thead>
            <tr>
              <th>결제일</th><th>물건구분</th><th>사용구분</th><th>상세내역</th>
              <th>수량</th><th>단가</th><th class="two">합계{{ '\n' }}(VAT포함)</th>
              <th>구매처</th><th>카드</th><th>비고</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in filteredItemPurchases" :key="r.id" @click="openEdit('itemPurchase', r)">
              <td>{{ shortDate(r.date) }}</td>
              <td :title="r.auctionLabel">{{ r.auctionLabel || '-' }}</td>
              <td :title="r.category"><span class="pill cat">{{ r.category }}</span></td>
              <td :title="r.description">{{ r.description }}</td>
              <td>{{ r.quantity }}</td>
              <td>{{ fmtMoney(r.unitPrice) }}원</td>
              <!-- 합계는 적어 둔 값이 있으면 그 값, 없으면 수량 × 단가 -->
              <td>{{ fmtMoney(r.totalWithVat || (r.quantity || 0) * (r.unitPrice || 0)) }}원</td>
              <td :title="r.vendor">{{ r.vendor }}</td>
              <td :title="r.card">{{ cardShort(r.card) }}</td>
              <td :title="r.note">{{ r.note }}</td>
            </tr>
            <tr v-if="filteredItemPurchases.length === 0">
              <td colspan="10" class="empty">
                <template v-if="finance.itemPurchases.length === 0">데이터가 없습니다.</template>
                <template v-else>이 기간에 해당하는 데이터가 없습니다. (전체 {{ finance.itemPurchases.length }}건)</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ========== TAB 5: 세금신고 — 세금관리 화면을 그대로 들여온다 ========== -->
    <TaxPage v-else-if="activeTab === 'tax'" embedded />
    </div>

    <!-- ========== 모달 ========== -->
    <div v-if="modalKind" class="fin-modal-backdrop" @click.self="closeModal">
      <div class="fin-modal">
        <header>
          <h3>항목 편집</h3>
          <button class="x" @click="closeModal">×</button>
        </header>

        <!-- 자금입출금 -->
        <template v-if="modalKind === 'cashFlow'">
          <label>날짜<input type="date" v-model="cfDraft.date" /></label>
          <label>명세<input type="text" v-model="cfDraft.ownerName" /></label>
          <div class="row2">
            <label>입출금 종류
              <select v-model="cfDraft.flowType">
                <option value="출금">출금</option>
                <option value="입금">입금</option>
              </select>
            </label>
            <label>금액<FormattedNumberInput v-model="cfDraft.amount" live-group align="left" placeholder="0" /></label>
          </div>
          <label>비고<input type="text" v-model="cfDraft.note" /></label>
        </template>

        <!-- 사업지출 -->
        <template v-else-if="modalKind === 'businessExpense'">
          <label>날짜<input type="date" v-model="beDraft.date" /></label>
          <label>물건
            <select v-model="beDraft.auctionId">
              <option value="">선택 안함</option>
              <option v-for="o in auctionOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
            </select>
          </label>
          <label>사업지출 항목
            <select v-model="beDraft.profitCategory">
              <option v-for="c in EXPENSE_CATEGORIES" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
          <label>명세<input type="text" v-model="beDraft.detail" /></label>
          <label>비용 (VAT포함)<FormattedNumberInput v-model="beDraft.amountWithVat" live-group align="left" placeholder="0" /></label>
          <label>비고<input type="text" v-model="beDraft.note" /></label>
        </template>

        <!-- 유류·식대 -->
        <template v-else-if="modalKind === 'fuelMeal'">
          <label>날짜<input type="date" v-model="fmDraft.date" /></label>
          <label>사용처<input type="text" v-model="fmDraft.store" /></label>
          <div class="row2">
            <label>사용구분
              <select v-model="fmDraft.category">
                <option>유류</option>
                <option>식음료</option>
                <option>기타</option>
              </select>
            </label>
            <label>금액<FormattedNumberInput v-model="fmDraft.amount" live-group align="left" placeholder="0" /></label>
          </div>
          <label>사용카드<input type="text" v-model="fmDraft.card" /></label>
          <label>비고<input type="text" v-model="fmDraft.note" /></label>
        </template>

        <!-- 물품구매 -->
        <template v-else-if="modalKind === 'itemPurchase'">
          <label>결제일<input type="date" v-model="ipDraft.date" /></label>
          <div class="row2">
            <label>사용구분
              <select v-model="ipDraft.category">
                <option>인테리어</option>
                <option>가전</option>
                <option>소모품</option>
                <option>공구</option>
                <option>기타</option>
              </select>
            </label>
            <label>내용<input type="text" v-model="ipDraft.description" /></label>
          </div>
          <div class="row2">
            <label>수량<input type="number" v-model.number="ipDraft.quantity" @input="updateItemTotals" /></label>
            <label>단가<FormattedNumberInput v-model="ipDraft.unitPrice" live-group align="left" placeholder="0" @update:model-value="updateItemTotals" /></label>
          </div>
          <label>VAT 포함 합계<FormattedNumberInput v-model="ipDraft.totalWithVat" live-group align="left" placeholder="0" /></label>
          <div class="row2">
            <label>구매처<input type="text" v-model="ipDraft.vendor" /></label>
            <label>사용카드<input type="text" v-model="ipDraft.card" /></label>
          </div>
          <label>비고<input type="text" v-model="ipDraft.note" /></label>
        </template>

        <footer>
          <button
            v-if="(modalKind === 'cashFlow' && cfDraft.id)
              || (modalKind === 'businessExpense' && beDraft.id)
              || (modalKind === 'fuelMeal' && fmDraft.id)
              || (modalKind === 'itemPurchase' && ipDraft.id)"
            class="del"
            @click="onDelete"
          >삭제</button>
          <span class="spacer" />
          <button class="cancel" @click="closeModal">취소</button>
          <button class="save" @click="onSave">저장</button>
        </footer>
      </div>
    </div>

    <DateWheelPicker
      v-model="rangeValue"
      :open="rangeTarget !== ''"
      @close="rangeTarget = ''"
    />

    <AppConfirm :box="confirmBox" @close="confirmBox = null" />


    <!-- 낙찰·매도 물건 — 팝업으로 띄운다. 가짓수가 늘어도 아래 내용이 밀리지 않는다 -->
    <Teleport to="body">
      <div v-if="stageListOpen" class="fin-pop-veil" @click="stageListOpen = ''" />
      <section v-if="stageListOpen" :class="['fin-pop', stageListOpen === '매도' ? 'sold' : 'won']" @click.stop>
        <header class="fin-pop-head">
          <strong>{{ stageListOpen }} <em>{{ stageListRows.length }}건</em></strong>
          <button type="button" class="fin-pop-close" aria-label="닫기" @click="stageListOpen = ''">×</button>
        </header>
        <div class="fin-pop-body">
          <p v-if="stageListRows.length === 0" class="fin-stage-empty">{{ stageListOpen }}한 물건이 없습니다.</p>
          <article
            v-for="a in stageListRows"
            :key="a.id"
            :class="['fin-stage-card', { open: openCardId === a.id }]"
            @click="toggleCard(a.id)"
          >
            <!-- 날짜는 글자로만 — 칸을 그리지 않는다. 고르지 않은 날은 빈자리로 둔다.
                 폭을 못 박아 카드가 여럿이어도 날짜가 한 줄로 맞아떨어진다 -->
            <p class="top">
              <span class="pd"><em>낙찰일</em><b>{{ shortYmd(a.wonDate) }}</b></span>
              <span class="pd"><em>매도일</em><b>{{ shortYmd(a.sellDate) }}</b></span>
              <span class="court">{{ shortCourt(a.courtName) }}</span>
            </p>
            <!-- 주소 오른쪽 끝에 '펴기/접기' — 카드를 누르면 수익현황이 열리고 닫힌다 -->
            <p class="addr">
              <span class="addr-t">{{ shortAddr(a.address) }}</span>
              <em class="fold">{{ openCardId === a.id ? '접기 ▴' : '펴기 ▾' }}</em>
            </p>
            <div class="nums">
              <span><small>감정가</small><b>{{ shortMoney(a.metrics?.appraisalValue ?? 0) }}</b></span>
              <span><small>낙찰가</small><b class="bid">{{ shortMoney(bidPriceOf(a)) }}</b></span>
              <span><small>비용</small><b class="cost">{{ shortMoney(costsOf(a)) }}</b></span>
              <span><small>수익</small><b :class="incomeOf(a) >= 0 ? 'plus' : 'minus'">{{ shortMoney(incomeOf(a)) }}</b></span>
            </div>

            <!-- 수익현황 — 누른 카드 밑에 산정표(A안)를 그대로 편다 (보기만 한다) -->
            <div v-if="openCardId === a.id" class="fin-calc" @click.stop>
              <p class="fin-calc-head">
                수익현황 <em>A안</em>
                <button type="button" class="fin-calc-go" @click="openAuction(a.id)">해당 물건 보기 ›</button>
              </p>
              <table class="fin-calc-tbl">
                <thead>
                  <tr><th>구분</th><th>항목</th><th class="r">금액</th><th class="r">세율/근거</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(r, ri) in calcRows(a)" :key="`${r.label}-${ri}`" :class="r.cls">
                    <td v-if="r.catSpan" :rowspan="r.catSpan" class="cat">{{ r.cat }}</td>
                    <td :class="{ b: r.strong }">{{ r.label }}</td>
                    <td class="r" :class="{ b: r.strong, neg: (r.amount ?? 0) < 0 }">
                      {{ r.text ?? ((r.amount ?? 0) !== 0 ? `${(r.amount ?? 0).toLocaleString('ko-KR')}원` : '–') }}
                    </td>
                    <td class="r f">{{ r.note }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </section>
    </Teleport>

    <AppMobileBottomNav active="finance" />
  </section>
</template>

<style scoped>
/* 위는 붙박이, 아래만 구른다 — 선정물건(.wlp-shell)과 같은 짜임 */
.fin-shell {
  position: fixed; inset: 0;
  display: flex; flex-direction: column;
  background: #f5f7fb;
  overflow: hidden;
}
.fin-fixed-top { flex: 0 0 auto; background: #f5f7fb; }
.fin-body {
  flex: 1 1 auto; overflow-y: auto;
  padding-bottom: 96px;
  -webkit-overflow-scrolling: touch;
}

/* Header — title + tab nav (TradeStatsPage 스타일과 동일) */
.fin-header {
  background: #fff; border-bottom: 1px solid #eef0f5;
}
.fin-page-title {
  margin: 0; padding: 9px 14px 7px;
  display: flex; align-items: baseline; gap: 8px;
  font-size: 20px; font-weight: 800; color: #111827;
  /* 제목줄 아래 구분선 — 물건상세와 같게 */
  border-bottom: 1px solid #e5e7eb;
}
/* 낙찰·매도 건수 — 제목 오른쪽의 알약 둘. 누르면 그 물건을 카드로 펼친다 */
.fin-stage-count { margin-left: auto; display: inline-flex; gap: 5px; }
.fin-stage-count button {
  border: 1px solid transparent; font-family: inherit;
  font-size: 11.5px; font-weight: 800; cursor: pointer;
  padding: 3px 9px; border-radius: 999px; white-space: nowrap;
}
.fin-stage-count i { font-style: normal; font-size: 9.5px; font-weight: 700; opacity: 0.6; margin: 0 1px; }
.fin-stage-count .won { background: #dce5ff; color: #2a3f8f; }
.fin-stage-count .won.on { border-color: #2a3f8f; }
.fin-stage-count .sold { background: #e8f7f1; color: #0f7a5c; }
.fin-stage-count .sold.on { border-color: #0f7a5c; }

/* 펼친 산정표 — 카드 안쪽에 들어간다 */
.fin-stage-card.open { border-color: #9fb3d4; }
.fin-calc { margin-top: 9px; padding-top: 8px; border-top: 1px solid #e3e8f0; }
.fin-calc-head {
  margin: 0 0 6px; display: flex; align-items: center; gap: 5px;
  font-size: 11.5px; font-weight: 700; color: #374151;
}
.fin-calc-head em { font-style: normal; font-size: 10.5px; font-weight: 800; color: #2b6df3; }
.fin-calc-go {
  margin-left: auto; border: none; background: transparent; cursor: pointer;
  font-family: inherit; font-size: 11px; font-weight: 700; color: #2b6df3; padding: 0;
}
/* 물건상세의 산정표와 같은 꼴 — 머리줄은 남색, 구분 칸은 회색, 짚을 줄은 노랑·분홍 */
.fin-calc-tbl { width: 100%; border-collapse: collapse; table-layout: fixed; }
.fin-calc-tbl th,
.fin-calc-tbl td {
  border: 1px solid #e5e7eb; padding: 4px 5px;
  font-size: 11px; font-weight: 500; color: #111827; word-break: keep-all;
}
.fin-calc-tbl thead th { background: #1f3a72; color: #fff; border-bottom: none; font-weight: 700; }
.fin-calc-tbl thead th:nth-child(1) { width: 15%; }
.fin-calc-tbl thead th:nth-child(2) { width: 26%; }
.fin-calc-tbl thead th:nth-child(3) { width: 30%; }
/* 금액은 줄을 바꾸지 않는다 — 깨져 보이던 자리다 */
.fin-calc-tbl td.r { white-space: nowrap; }
.fin-calc-tbl td.f { white-space: normal; line-height: 1.3; }
.fin-calc-tbl .r { text-align: right; font-variant-numeric: tabular-nums; }
.fin-calc-tbl .cat {
  background: #f3f4f6; font-weight: 700; text-align: center; vertical-align: middle;
}
.fin-calc-tbl .f { color: #6b7280; font-size: 10px; }
.fin-calc-tbl .b { font-weight: 800; }
.fin-calc-tbl .neg { color: #e0574a; }
.fin-calc-tbl tr.hi td { background: #fefae0; }
.fin-calc-tbl tr.hi td.cat { background: #f3f4f6; }
.fin-calc-tbl tr.pink td { background: #fdeef0; }
.fin-calc-tbl tr.pink td.cat { background: #f3f4f6; }

/* 팝업 — 가짓수가 늘어도 아래 내용이 밀리지 않게 화면 위에 띄운다 */
.fin-pop-veil { position: fixed; inset: 0; z-index: 70; background: rgba(17, 24, 39, 0.35); }
/* 제목줄 바로 아래에서 시작하고, 좌우는 꽉 채운다 — 표가 넉넉히 펴져야 읽힌다 */
.fin-pop {
  position: fixed; z-index: 71; left: 8px; right: 8px; top: 52px;
  width: auto; max-height: calc(100vh - 110px);
  display: flex; flex-direction: column;
  background: #fff; border: 1px solid #e3e8f0; border-radius: 14px;
  box-shadow: 0 18px 44px rgba(17, 24, 39, 0.22);
}
.fin-pop-head {
  flex: 0 0 auto; display: flex; align-items: center;
  padding: 12px 14px 10px; border-bottom: 1px solid #eef1f6;
}
/* 머리글은 그 단계 알약과 같은 색으로 — 어느 쪽을 열었는지 한눈에 */
.fin-pop-head strong { font-size: 14px; font-weight: 800; color: #111827; }
.fin-pop.won .fin-pop-head { background: #dce5ff; }
.fin-pop.won .fin-pop-head strong { color: #2a3f8f; }
.fin-pop.won .fin-pop-head em { color: #5b6fae; }
.fin-pop.sold .fin-pop-head { background: #e8f7f1; }
.fin-pop.sold .fin-pop-head strong { color: #0f7a5c; }
.fin-pop.sold .fin-pop-head em { color: #4f9a85; }
.fin-pop-head { border-radius: 13px 13px 0 0; }
.fin-pop-head em { font-style: normal; font-size: 12px; font-weight: 700; color: #9ca3af; margin-left: 4px; }
.fin-pop-close {
  margin-left: auto; border: none; background: transparent; cursor: pointer;
  font-size: 19px; line-height: 1; color: #9ca3af; padding: 0 2px;
}
.fin-pop-body { flex: 1 1 auto; overflow-y: auto; padding: 10px; -webkit-overflow-scrolling: touch; }
.fin-stage-empty { margin: 14px 0; text-align: center; font-size: 12px; color: #9ca3af; }
/* 카드 테두리는 또렷하게 — 옅으면 여러 장이 한 덩어리로 보인다 */
.fin-stage-card {
  border: 1px solid #c9d3e3; border-radius: 10px; padding: 8px 10px 9px;
  margin-bottom: 8px; cursor: pointer; background: #fff;
  box-shadow: 0 1px 2px rgba(17, 24, 39, 0.05);
}
.fin-stage-card:active { background: #f7f9fd; }
.fin-stage-card:last-child { margin-bottom: 0; }
.fin-stage-card .top { margin: 0; display: flex; align-items: baseline; gap: 10px; }
/* 날짜 — 이름표(회색)와 값(검정)을 나란히. 폭을 못 박아 줄이 맞는다 */
.fin-stage-card .pd { display: inline-flex; align-items: baseline; gap: 5px; flex: 0 0 auto; }
.fin-stage-card .pd em {
  font-style: normal; font-size: 10.5px; font-weight: 500; color: #9ca3af; white-space: nowrap;
}
/* 굵게 쓰는 것은 금액뿐 — 날짜·주소·법원은 보통 굵기로 담담하게 */
.fin-stage-card .pd b {
  min-width: 66px; font-size: 12px; font-weight: 500; color: #111827; white-space: nowrap;
}
.fin-stage-card .court { margin-left: auto; font-size: 11px; font-weight: 500; color: #6b7280; }
.fin-stage-card .addr {
  margin: 3px 0 0; display: flex; align-items: baseline; gap: 8px;
  font-size: 12px; font-weight: 500; color: #374151;
}
.fin-stage-card .addr .addr-t {
  flex: 1 1 auto; min-width: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* 펴기·접기 — 누르는 자리는 카드 전체지만, 어디를 누르면 되는지 알려 준다 */
.fin-stage-card .addr .fold {
  flex: 0 0 auto; font-style: normal; font-size: 11px; font-weight: 700; color: #2b6df3;
}
/* 줄 하나 긋고 아래에 돈 이야기 */
.fin-stage-card .nums {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px;
  margin-top: 7px; padding-top: 7px; border-top: 1px solid #eef1f6;
}
.fin-stage-card .nums span { min-width: 0; text-align: center; }
.fin-stage-card .nums small { display: block; font-size: 9.5px; font-weight: 500; color: #9ca3af; }
.fin-stage-card .nums b {
  display: block; margin-top: 1px; font-size: 12px; font-weight: 800; color: #111827;
  white-space: nowrap;
}
/* 숫자마다 뜻이 다르다 — 낙찰가는 기준값이라 검정, 비용 파랑, 수익 빨강 */
.fin-stage-card .nums b.bid { color: #111827; }
.fin-stage-card .nums b.cost { color: #2b6df3; }
.fin-stage-card .nums b.plus,
.fin-stage-card .nums b.minus { color: #e0574a; }

.fin-tabs {
  /* 네 칸을 정확히 4등분한 알약 카드 */
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px;
  /* 제목줄 아래 구분선에 알약 상자가 닿아 선을 덮었다 — 한 칸 띄운다 */
  margin: 8px 14px 6px; padding: 3px;
  background: #e2e8f2; border-radius: 12px;
}
.fin-tab {
  border: 1px solid transparent; background: transparent;
  padding: 5px 2px; min-height: 36px; border-radius: 9px;
  /* 선택 여부와 상관없이 같은 크기·굵기 — 글자 폭이 흔들리지 않게 색만 바꾼다 */
  font-size: 13.5px; font-weight: 700; line-height: 1.3; letter-spacing: -0.4px; color: #6b7280;
  text-align: center; white-space: normal; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.fin-tab.active {
  background: #fff; color: #111827;
  border-color: #e3e7ef; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}

/* Toolbar */
.fin-toolbar {
  padding: 8px 14px 4px;
  display: flex; flex-direction: column; gap: 7px;
}
/* 기간 칩 4개 + 엑셀저장 + 항목추가 = 한 줄 6등분 */
.fin-toolbar-right {
  display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px;
  align-items: stretch;
}
.fin-period { display: contents; }
.fin-period-btn {
  padding: 7px 2px; border: 1px solid #d5ddeb; background: #e2e8f2;
  font-size: 11px; font-weight: 700; color: #6b7280; letter-spacing: -0.3px;
  border-radius: 8px; cursor: pointer; white-space: nowrap; text-align: center;
}
.fin-period-btn.active {
  background: #fff; color: #111827;
  border-color: #c7d2e8; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}
.fin-excel, .fin-add {
  padding: 7px 2px; border: 1px solid #d1d5db; border-radius: 8px;
  background: #fff; font-size: 11px; font-weight: 700; cursor: pointer;
  white-space: nowrap; text-align: center; letter-spacing: -0.3px;
}
.fin-add { background: #2b6df3; color: #fff; border-color: #2b6df3; }
/* 아이콘은 글자보다 작게 — 좁은 칸에서 글자를 밀어내지 않게 */
.fin-excel i, .fin-add i { font-style: normal; font-size: 9px; margin-right: 2px; }
.fin-custom-range {
  padding: 0 14px 8px; display: flex; align-items: center; gap: 8px;
}
.fin-date-box {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  width: 112px; box-sizing: border-box;
  border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 5px 8px; background: #fff; cursor: pointer;
}
.fin-date-box svg { color: #9ca3af; flex: 0 0 auto; }
.fin-date-box span { font-size: 12px; font-weight: 400; color: #9ca3af; }
.fin-date-sep { color: #9ca3af; }

/* Summary cards */
.fin-summary {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 6px; padding: 6px 14px 8px;
}
.sum-card {
  padding: 7px 8px; border-radius: 10px;
  display: flex; flex-direction: column; gap: 2px;
  align-items: center; text-align: center;
  min-width: 0;
}
.sum-card small { font-size: 11px; color: #6b7280; font-weight: 600; }
.sum-card strong {
  font-size: 14px; font-weight: 800; color: #111827;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sum-card.in { background: #fdecec; border: 1px solid #f7d5d5; }
.sum-card.out { background: #e9f0fd; border: 1px solid #d3e0fa; }
.sum-card.bal { background: #e4e9f0; border: 1px solid #cfd8e3; }
/* 표의 입금(빨강)·출금(파랑) 색과 맞춘다 */
.sum-card.in strong { color: #dc2626; }
.sum-card.out strong { color: #2563eb; }
.sum-card.bal strong { color: #111827; }

/* Table */
.fin-table-wrap {
  margin: 0 14px;
  background: #fff; border-radius: 10px;
  overflow-x: auto;
  border: 1px solid #e5e7eb;
}
.fin-table {
  width: 100%; border-collapse: separate; border-spacing: 0; font-size: 11px;
}
.fin-table thead {
  background: #1f2a4d; color: #fff;
}
/* 머리줄 위 두 모서리는 둥글게 */
.fin-table thead tr:first-child th:first-child { border-top-left-radius: 8px; }
.fin-table thead tr:first-child th:last-child { border-top-right-radius: 8px; }
.fin-table th, .fin-table td {
  padding: 8px 6px; text-align: left;
  border-bottom: 1px solid #eef0f5;
  white-space: nowrap; vertical-align: middle;
}
.fin-table th { font-weight: 700; font-size: 10.5px; white-space: nowrap; }
/* 두 줄로 쓰는 머리글 — 합계(VAT포함)처럼 긴 이름 */
.fin-table th.two { white-space: pre-line; line-height: 1.25; }
.fin-table tbody tr:nth-child(even) { background: #fafbfd; }
.fin-table tbody tr { cursor: pointer; }
.fin-table tbody tr:hover { background: #f9fafb; }
.fin-table td.r, .fin-table th.r { text-align: right; }
/* 날짜·구분·카드처럼 짧은 칸은 가운데 — 긴 글 칸만 왼쪽에 둔다 */
.fin-table td.c, .fin-table th.c { text-align: center; }
/* 가운데로 세우는 표 — 글자가 왼쪽에 몰려 칸 제목과 어긋나 보였다.
   금액만 오른쪽에 둔다 */
.fin-table.cash th, .fin-table.cash td,
.fin-table.mid th, .fin-table.mid td { text-align: center; }
.fin-table.mid th.r, .fin-table.mid td.r { text-align: right; }
/* 칸이 많은 표는 글자에 폭을 맡기되 너무 붙지 않게 숨통을 둔다 */
.fin-table.mid th, .fin-table.mid td { padding-left: 10px; padding-right: 10px; }
.fin-table.mid td:not(.r):not(.empty) { max-width: none; }
.fin-table.cash th.r, .fin-table.cash td.r { text-align: right; }
.fin-table.cash th.l, .fin-table.cash td.l { text-align: left; }
.fin-table.cash td:not(.r):not(.empty) { max-width: none; }
.fin-table td.amt.blue { color: #2563eb; }
.fin-table td.amt.red  { color: #dc2626; }
.fin-table .empty { text-align: center; color: #9ca3af; padding: 20px; white-space: normal; font-size: 11px; }
/* 텍스트 셀은 너무 길면 말줄임 — 한 줄 유지. 마우스 오버 시 title 속성으로 전체 표시 */
.fin-table td:not(.r):not(.empty) {
  max-width: 110px; overflow: hidden; text-overflow: ellipsis;
}

.pill {
  display: inline-block; padding: 1px 7px; border-radius: 999px;
  font-size: 10px; font-weight: 500; white-space: nowrap;
}
/* 자금입출금의 알약 색을 네 표가 함께 쓴다 —
   입금은 빨강, 그 밖의 알약(출금·사업지출 항목·사용구분)은 파랑 */
.pill.in { background: #fee2e2; color: #dc2626; }
.pill.out { background: #dbeafe; color: #2563eb; }
/* 사업지출의 사용구분 · 유류&식대의 사용구분 — 회색 */
.pill.memo, .pill.cat { background: #eceff4; color: #4b5563; }

/* Modal */
.fin-modal-backdrop {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; padding: 12px;
}
.fin-modal {
  width: 100%; max-width: 480px; max-height: 90vh;
  overflow-y: auto; overflow-x: hidden;
  background: #fff; border-radius: 14px;
  padding: 16px;
  box-sizing: border-box;
}
.fin-modal header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 14px;
}
.fin-modal h3 { margin: 0; font-size: 17px; font-weight: 800; }
.fin-modal .x {
  border: none; background: transparent; font-size: 22px;
  cursor: pointer; color: #6b7280; line-height: 1;
}
.fin-modal label {
  display: flex; flex-direction: column; gap: 4px;
  font-size: 12px; font-weight: 600; color: #374151;
  margin-bottom: 10px;
  min-width: 0;
}
.fin-modal input, .fin-modal select {
  padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px;
  font-size: 13px; color: #111827; outline: none; background: #fff;
  width: 100%; box-sizing: border-box; min-width: 0;
}
.fin-modal input:focus, .fin-modal select:focus {
  border-color: #2b6df3; box-shadow: 0 0 0 3px rgba(43, 109, 243, 0.12);
}
.fin-modal input:disabled { background: #f3f4f6; color: #6b7280; }
.row2 {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  min-width: 0;
}

.fin-modal footer {
  display: flex; gap: 8px; align-items: center; margin-top: 8px;
}
.fin-modal footer .spacer { flex: 1; }
.fin-modal .del {
  padding: 9px 14px; border: 1px solid #fecaca; background: #fef2f2;
  color: #dc2626; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 13px;
}
.fin-modal .cancel {
  padding: 9px 16px; border: 1px solid #d1d5db; background: #fff;
  border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;
}
.fin-modal .save {
  padding: 9px 18px; border: none; background: #2b6df3; color: #fff;
  border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 14px;
}
</style>
