<script setup lang="ts">
// 세금관리 — 연도별로 낙찰·매도 건을 모아 사업소득과 세금을 가늠한다.
// 값은 물건상세 '입찰가산정'에 적어 둔 금액과 낙찰일·매도일에서 끌어온다.
import { computed, ref } from 'vue';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import { useAuctionStore } from '../stores/auctionStore';
import type { AuctionDetail } from '../types/auction';

const store = useAuctionStore();

const thisYear = new Date().getFullYear();
const year = ref(thisYear);
/** 가운데가 선택한 해, 양옆이 앞뒤 해 */
const yearWindow = computed(() => [year.value + 1, year.value, year.value - 1]);

const yearOf = (date?: string) => (date ? Number(date.slice(0, 4)) : 0);

const soldThisYear = computed(() => store.auctions.filter((a) => yearOf(a.sellDate) === year.value));
const wonThisYear = computed(() => store.auctions.filter((a) => yearOf(a.wonDate) === year.value));
const holdingCount = computed(() => store.auctions.filter((a) => a.wonDate && !a.sellDate).length);

/** 입찰가산정의 비용 항목 합계 — 대출은 빌린 돈이라 뺀다 */
const costsOf = (a: AuctionDetail) => {
  const c = a.bidCost;
  if (!c) return 0;
  return (c.acquisitionTaxAmount ?? 0)
    + (c.legalCostAmount ?? 0)
    + (c.interestAmount ?? 0)
    + (c.midRepaymentAmount ?? 0)
    + (c.brokerageAmount ?? 0)
    + (c.arrearsFee ?? 0)
    + (c.repairCost ?? 0)
    + (c.evictionCost ?? 0)
    + (c.advertisingCost ?? 0);
};
const incomeOf = (a: AuctionDetail) =>
  (a.expectedSaleValue ?? 0) - (a.metrics?.myBidValue ?? 0) - costsOf(a);

const totalIncome = computed(() => soldThisYear.value.reduce((sum, a) => sum + incomeOf(a), 0));

/** 종합소득세 누진세율 — 개인소득세율표와 같은 구간 */
const progressiveTax = (base: number) => {
  if (base <= 0) return 0;
  if (base <= 14_000_000) return base * 0.06;
  if (base <= 50_000_000) return base * 0.15 - 1_260_000;
  if (base <= 88_000_000) return base * 0.24 - 5_760_000;
  if (base <= 150_000_000) return base * 0.35 - 15_440_000;
  if (base <= 300_000_000) return base * 0.38 - 19_940_000;
  if (base <= 500_000_000) return base * 0.4 - 25_940_000;
  if (base <= 1_000_000_000) return base * 0.42 - 35_940_000;
  return base * 0.45 - 65_940_000;
};
/** 과세표준이 걸리는 구간의 세율 */
const taxRateLabel = computed(() => {
  const L = totalIncome.value;
  if (L <= 0) return '';
  if (L <= 14_000_000) return '6%';
  if (L <= 50_000_000) return '15%';
  if (L <= 88_000_000) return '24%';
  if (L <= 150_000_000) return '35%';
  if (L <= 300_000_000) return '38%';
  if (L <= 500_000_000) return '40%';
  if (L <= 1_000_000_000) return '42%';
  return '45%';
});
/** 종합소득세 + 지방소득세 10% */
const incomeTax = computed(() => Math.round(progressiveTax(totalIncome.value) * 1.1));
const acqTaxTotal = computed(() =>
  wonThisYear.value.reduce((sum, a) => sum + (a.bidCost?.acquisitionTaxAmount ?? 0), 0),
);

/** 세금까지 낸 뒤 손에 남는 돈 */
const netProfit = computed(() => totalIncome.value - incomeTax.value);
/** 매도한 건들의 매입비용(입찰가+경비) 합과 매도가 합 */
const totalBuyCost = computed(() =>
  soldThisYear.value.reduce((sum, a) => sum + (a.metrics?.myBidValue ?? 0) + costsOf(a), 0),
);
const totalSalePrice = computed(() =>
  soldThisYear.value.reduce((sum, a) => sum + (a.expectedSaleValue ?? 0), 0),
);

/** 1억 이상은 억, 그 아래는 만 단위로 줄여 쓴다 */
const won = (n: number, signed = false) => {
  if (!n) return '–';
  const sign = n < 0 ? '-' : signed ? '+' : '';
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(2)}억`;
  return `${sign}${Math.round(abs / 10_000).toLocaleString('ko-KR')}만`;
};

/** 주소에서 지번 뒤 건물명·호수만 뽑는다 */
const shortName = (a: AuctionDetail) => {
  const parts = (a.address ?? '').trim().split(/\s+/);
  const lotIdx = parts.findIndex((v) => /^\d+(-\d+)?$/.test(v));
  const tail = lotIdx >= 0 ? parts.slice(lotIdx + 1) : parts.slice(-2);
  return tail.join('') || a.caseNumber || '-';
};
const fmtDate = (d?: string) => (d ? `${d.replace(/-/g, '. ')}.` : '–');
const holdMonths = (a: AuctionDetail) => {
  if (!a.wonDate || !a.sellDate) return '';
  const from = new Date(a.wonDate);
  const to = new Date(a.sellDate);
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return months > 0 ? `(${months}개월 보유)` : '';
};
/** 건별 계산 — 그 물건만 단독으로 봤을 때 */
const acqTaxOf = (a: AuctionDetail) => a.bidCost?.acquisitionTaxAmount ?? 0;
const etcCostOf = (a: AuctionDetail) => costsOf(a) - acqTaxOf(a);
const buyCostOf = (a: AuctionDetail) => (a.metrics?.myBidValue ?? 0) + costsOf(a);
const ownIncomeTaxOf = (a: AuctionDetail) => Math.round(progressiveTax(incomeOf(a)));
const ownLocalTaxOf = (a: AuctionDetail) => Math.round(ownIncomeTaxOf(a) * 0.1);
const ownTotalTaxOf = (a: AuctionDetail) => ownIncomeTaxOf(a) + ownLocalTaxOf(a);
const ownNetOf = (a: AuctionDetail) => incomeOf(a) - ownTotalTaxOf(a);
const bracketOf = (a: AuctionDetail) => {
  const L = incomeOf(a);
  if (L <= 0) return '–';
  if (L <= 14_000_000) return '6%';
  if (L <= 50_000_000) return '15%';
  if (L <= 88_000_000) return '24%';
  if (L <= 150_000_000) return '35%';
  if (L <= 300_000_000) return '38%';
  if (L <= 500_000_000) return '40%';
  if (L <= 1_000_000_000) return '42%';
  return '45%';
};
/** 확정신고는 매도한 해의 다음 해 5월 */
const filingLabel = (a: AuctionDetail) => {
  const y = yearOf(a.sellDate);
  return y > 0 ? `${y + 1}년 5월` : '–';
};

const openId = ref<string | null>(null);
const toggleRow = (id: string) => { openId.value = openId.value === id ? null : id; };

type SubTab = 'income' | 'schedule' | 'guide';
const subTab = ref<SubTab>('income');

/** 아직 안 판 채로 그 해에 낙찰만 한 건 */
const wonOnlyRows = computed(() => wonThisYear.value.filter((a) => !a.sellDate));
const hasRows = computed(() => soldThisYear.value.length > 0 || wonOnlyRows.value.length > 0);

/* ===== 신고 일정 ===== */
type TaxKind = '양도세' | '취득세' | '재산세' | '종부세';
const KINDS: TaxKind[] = ['양도세', '취득세', '재산세', '종부세'];
const kindFilter = ref<TaxKind>('양도세');

type MonthEvent = { kind: TaxKind; tone: 'orange' | 'blue' | 'green' | 'gray'; when: string; title: string; note: string };

/** 날짜에 일수를 더한다 */
const addDays = (iso: string, days: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d;
};

const monthBuckets = computed(() => {
  const buckets: MonthEvent[][] = Array.from({ length: 12 }, () => []);
  const y = year.value;

  // 매도 건 — 사업소득 발생
  store.auctions.forEach((a) => {
    if (yearOf(a.sellDate) !== y || !a.sellDate) return;
    const m = Number(a.sellDate.slice(5, 7)) - 1;
    buckets[m].push({
      kind: '양도세', tone: 'orange', when: '매도 완료',
      title: `사업소득 발생 — ${a.address}`,
      note: `매도일: ${fmtDate(a.sellDate)} · 다음해 5월 종합소득세 신고`,
    });
  });

  // 낙찰 건 — 취득세 신고·납부 기한(낙찰 후 60일)
  store.auctions.forEach((a) => {
    if (!a.wonDate) return;
    const due = addDays(a.wonDate, 60);
    if (due.getFullYear() !== y) return;
    buckets[due.getMonth()].push({
      kind: '취득세', tone: 'blue',
      when: `${due.getMonth() + 1}월 ${due.getDate()}일까지`,
      title: `취득세 신고·납부 — ${a.address}`,
      note: `낙찰일: ${fmtDate(a.wonDate)} · 낙찰 후 60일 이내`,
    });
  });

  // 해마다 돌아오는 일정
  buckets[4].push({
    kind: '양도세', tone: 'orange', when: '1일 ~ 31일',
    title: `${y - 1}년 귀속 종합소득세 확정신고`,
    note: '사업소득(매매사업자) 포함 — 전년도 매도 건 모두 합산',
  });
  buckets[6].push({
    kind: '재산세', tone: 'green', when: '16일 ~ 31일',
    title: '재산세 납부 (건물분)', note: '6/1 기준 보유 중인 물건에 한함',
  });
  buckets[8].push({
    kind: '재산세', tone: 'green', when: '16일 ~ 30일',
    title: '재산세 납부 (토지분)', note: '6/1 기준 보유 중인 물건에 한함',
  });
  buckets[11].push({
    kind: '종부세', tone: 'gray', when: '1일 ~ 15일',
    title: '종합부동산세 납부',
    note: '6/1 기준 보유 + 주택 공시가 합산 9억원 초과 시에만 해당',
  });
  return buckets;
});

const filteredMonths = computed(() =>
  monthBuckets.value.map((list) => list.filter((e) => e.kind === kindFilter.value)),
);

/* ===== 세금 안내 ===== */
const INCOME_BRACKETS = [
  { base: '1,400만원 이하', rate: '6%' },
  { base: '1,400만 ~ 5,000만원', rate: '15%' },
  { base: '5,000만 ~ 8,800만원', rate: '24%' },
  { base: '8,800만 ~ 1.5억원', rate: '35%' },
  { base: '1.5억 ~ 3억원', rate: '38%' },
  { base: '3억 ~ 5억원', rate: '40%' },
  { base: '5억 ~ 10억원', rate: '42%' },
  { base: '10억원 초과', rate: '45%' },
];
const ACQ_RATES = [
  { base: '주택 6억 이하', rate: '1.0%' },
  { base: '주택 6억 ~ 9억', rate: '선형증가' },
  { base: '주택 9억 초과', rate: '3.0%' },
  { base: '비주택(상가·토지 등)', rate: '4.0%' },
];
const DENIED = [
  { title: '전 소유자 미납 관리비 대납', body: '낙찰 후 협의 과정에서 전 소유자의 미납 관리비를 낙찰자가 대신 납부한 금액. 납부 의무자 외의 자가 납부한 공과금은 필요경비 불산입 (소득세법 §33①). 자금관리에는 기입하되 세금 신고 시 제외.' },
  { title: '보유 기간 중 관리비', body: '보유 기간 동안 납부한 월 관리비. 주거용 부동산의 경우 개인 소비 성격으로 간주되어 사업 필요경비 불인정. 상업용은 일부 인정 가능하나 세무서 판단에 따라 다름.' },
  { title: '소득세·지방소득세 자체', body: '당해 연도 납부한 사업소득세 및 지방소득세. 필요경비 불산입 (소득세법 §33①제1호).' },
  { title: '벌금·과태료·가산금·연체료', body: '세금 연체 가산금, 관리비 연체료, 각종 과태료 등. 소득세법 §33①제2호 명시 불인정 항목.' },
  { title: '업무 무관 개인 경비', body: '사업과 직접 관련 없는 식비·교통비·개인 차량 유지비 등. 사업 목적 입증이 어려운 경우 불인정.' },
];
const CONDITIONAL = [
  { title: '이사 지원금 (이사비)', body: '점유자를 내보내기 위해 지급한 이사 지원금. 명도 협의의 실질적 대가임을 입증(합의서·계좌이체 내역 등)하면 명도비로 인정 가능. 단, 세무서에 따라 다툼 여지 있음.' },
  { title: '대규모 수리·리모델링 (자본적 지출)', body: '내용연수를 연장하거나 자산 가치를 현저히 높이는 공사비(도배·장판 교체 수준 초과). 즉시 경비 처리 불가 — 취득원가에 가산하여 양도 시 공제 대상. 소규모 유지보수(누수 수선 등)는 당기 경비 처리 가능.' },
  { title: '대출 이자', body: '사업용 부동산 취득 목적 대출의 이자는 인정. 단, 개인 소비 목적 대출 또는 취득 완료 후 발생한 이자는 근거 서류(금융 거래 내역, 대출 계약서)가 있어야 인정.' },
  { title: '입찰 전 조사 비용', body: '낙찰 받지 못한 물건의 현장 조사비·교통비. 해당 물건 취득이 불발되면 사업소득금액에서 공제하기 어려움. 낙찰 물건의 조사비는 취득 부대비용으로 처리 가능.' },
];
const MAIN_SCHEDULE = [
  { icon: '🏠', title: '취득세', lines: ['취득일부터 60일 이내 신고·납부 (소유권 이전 등기 전)'] },
  { icon: '📋', title: '종합소득세 확정신고 (사업소득)', lines: ['다음 해 5월 1일 ~ 5월 31일', '＊ 개인 부동산매매사업자는 매도 물건의 사업소득을 종합소득세로 신고 (양도소득세 아님)', '＊ 동일 연도 매도 건 전부 합산 후 누진세율 적용'] },
  { icon: '🏢', title: '재산세', lines: ['7월 16일~31일 (건물분) / 9월 16일~30일 (토지분)', '＊ 매년 6월 1일 기준 소유자에게 부과 — 그 날짜에 보유 중인 물건만 해당'] },
  { icon: '💰', title: '종합부동산세', lines: ['12월 1일 ~ 12월 15일', '＊ 6월 1일 기준 보유 + 주택 공시가 합산 9억원(1세대 1주택 12억원) 초과 시에만 해당'] },
];
</script>

<template>
  <section class="tax-shell">
    <header class="tax-header">
      <h1 class="tax-title">부동산 세금 신고</h1>
      <span class="tax-eyebrow">세금 관리 · TAX MANAGEMENT</span>
    </header>

    <div class="tax-years">
      <button type="button" class="yr-nav" aria-label="이전 해" @click="year += 1">‹</button>
      <button
        v-for="y in yearWindow"
        :key="y"
        type="button"
        :class="['yr', { on: y === year }]"
        @click="year = y"
      >{{ y }}년</button>
      <button type="button" class="yr-nav" aria-label="다음 해" @click="year -= 1">›</button>
    </div>

    <div class="tax-cards">
      <div class="tax-card green">
        <small>매도 완료</small>
        <strong>{{ soldThisYear.length }}건</strong>
        <em>보유 중 {{ holdingCount }}건</em>
      </div>
      <div class="tax-card red">
        <small>총 사업소득</small>
        <strong class="green">{{ won(totalIncome, true) }}</strong>
        <em>매도가 − 모든 지출</em>
      </div>
      <div class="tax-card blue">
        <small>연간 합산 종합소득세</small>
        <strong class="orange">{{ won(incomeTax) }}</strong>
        <em>{{ taxRateLabel ? `세율 ${taxRateLabel} · 지방세 포함` : '매도 후 확정' }}</em>
      </div>
      <div class="tax-card">
        <small>납부 취득세 합계</small>
        <strong class="blue">{{ won(acqTaxTotal) }}</strong>
        <em>낙찰 후 60일 이내 납부</em>
      </div>
    </div>

    <!-- 세후 순수익 -->
    <div class="tax-net">
      <div class="net-main">
        <p class="net-head">세후 순수익 — 세금 납부 후 실질 수익 <span>(비인정 경비 포함 모든 지출 차감)</span></p>
        <strong class="net-value">{{ won(netProfit, true) }}</strong>
        <p class="net-formula">사업소득 {{ won(totalIncome, true) }} − 종합소득세 {{ won(incomeTax) }}</p>
      </div>
      <div class="net-side">
        <small>총 매입비용</small>
        <strong>{{ won(totalBuyCost) }}</strong>
        <small>총 매도가</small>
        <strong>{{ won(totalSalePrice) }}</strong>
      </div>
    </div>

    <nav class="tax-subtabs">
      <button type="button" :class="['sub', { on: subTab === 'income' }]" @click="subTab = 'income'">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="3" width="16" height="18" rx="2" /><path d="M12 7v10M14.5 9.5a2.5 2.5 0 0 0-5 .5c0 2 5 1.5 5 3.5a2.5 2.5 0 0 1-5 .5" />
        </svg>
        소득세 현황
      </button>
      <button type="button" :class="['sub', { on: subTab === 'schedule' }]" @click="subTab = 'schedule'">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" />
        </svg>
        신고 일정
      </button>
      <button type="button" :class="['sub', { on: subTab === 'guide' }]" @click="subTab = 'guide'">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" />
        </svg>
        세금 안내
      </button>
    </nav>

    <!-- 소득세 현황 -->
    <template v-if="subTab === 'income'">
      <div v-if="hasRows" class="tax-list">
        <template v-if="soldThisYear.length > 0">
          <p class="list-head"><span class="ico">↗</span>매도 완료 — 양도소득세 신고 대상</p>
          <article v-for="a in soldThisYear" :key="a.id" class="tax-row" @click="toggleRow(a.id)">
            <div class="row-top">
              <span class="tag done">매도완료</span>
              <div class="row-main">
                <p class="addr">{{ shortName(a) }}</p>
                <p class="meta">낙찰 {{ fmtDate(a.wonDate) }} → 매도 {{ fmtDate(a.sellDate) }} <i>{{ holdMonths(a) }}</i></p>
              </div>
              <span :class="['chev', { up: openId === a.id }]">⌄</span>
            </div>
            <div v-if="openId === a.id" class="row-detail" @click.stop>
              <div class="dgrid">
                <div class="dcell">
                  <small>낙찰가 <i>(취득원가)</i></small>
                  <strong>{{ won(a.metrics?.myBidValue ?? 0) }}</strong>
                </div>
                <div class="dcell">
                  <small>취득세</small>
                  <strong class="orange">{{ won(acqTaxOf(a)) }}</strong>
                  <em>취득세 1% + 지방교육세 0.1% (주택 6억 이하)</em>
                </div>
                <div class="dcell">
                  <small>기타 필요경비</small>
                  <strong>{{ won(etcCostOf(a)) }}</strong>
                  <em>법무+수리+이자 등</em>
                </div>
                <div class="dcell">
                  <small>총 취득비용</small>
                  <strong>{{ won(buyCostOf(a)) }}</strong>
                </div>
              </div>

              <div class="dsep" />

              <div class="dgrid">
                <div class="dcell">
                  <small>매도가</small>
                  <strong class="green">{{ won(a.expectedSaleValue ?? 0) }}</strong>
                </div>
                <div class="dcell">
                  <small>사업소득금액</small>
                  <strong :class="incomeOf(a) < 0 ? 'neg' : 'green'">{{ won(incomeOf(a), true) }}</strong>
                  <em>매도가 − 총취득비용</em>
                </div>
                <div class="dcell">
                  <small>개별 소득세 <i>(참고용)</i></small>
                  <strong class="orange">{{ won(ownIncomeTaxOf(a)) }}</strong>
                  <em>단독 계산 · {{ bracketOf(a) }} 구간</em>
                </div>
                <div class="dcell">
                  <small>개별 지방소득세 <i>(참고용)</i></small>
                  <strong class="orange">{{ won(ownLocalTaxOf(a)) }}</strong>
                  <em>소득세 × 10%</em>
                </div>
              </div>

              <div class="dpanel orange">
                <div class="dp-main">
                  <p class="dp-head">예상 세금 (개별 단독 기준)</p>
                  <strong>{{ won(ownTotalTaxOf(a)) }}</strong>
                  <p class="dp-sub">소득세 {{ won(ownIncomeTaxOf(a)) }} + 지방세 {{ won(ownLocalTaxOf(a)) }}</p>
                </div>
                <div class="dp-side">
                  <small>확정신고</small>
                  <strong>{{ filingLabel(a) }}</strong>
                  <small>＊ 연간 합산 시 세율 변동</small>
                </div>
              </div>

              <div class="dpanel green">
                <p class="dp-head">세후 순수익 (개별, 참고용)</p>
                <strong>{{ won(ownNetOf(a), true) }}</strong>
                <p class="dp-sub">비인정 경비 포함 모든 지출 차감 후</p>
              </div>
            </div>
          </article>
        </template>
        <template v-if="wonOnlyRows.length > 0">
          <p class="list-head"><span class="ico">◷</span>낙찰 보유 — 매도 시 신고 대상</p>
          <article v-for="a in wonOnlyRows" :key="a.id" class="tax-row" @click="toggleRow(a.id)">
            <div class="row-top">
              <span class="tag hold">보유중</span>
              <div class="row-main">
                <p class="addr">{{ shortName(a) }}</p>
                <p class="meta">낙찰 {{ fmtDate(a.wonDate) }}</p>
              </div>
              <span :class="['chev', { up: openId === a.id }]">⌄</span>
            </div>
            <dl v-if="openId === a.id" class="row-detail">
              <div><dt>입찰가</dt><dd>{{ won(a.metrics?.myBidValue ?? 0) }}</dd></div>
              <div><dt>취득세</dt><dd>{{ won(a.bidCost?.acquisitionTaxAmount ?? 0) }}</dd></div>
              <div><dt>필요경비</dt><dd>{{ won(costsOf(a)) }}</dd></div>
            </dl>
          </article>
        </template>
      </div>
      <div v-else class="tax-empty">
        <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="#d6dae2" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 21V4.5a.5.5 0 0 1 .76-.43L8 5.4l2.24-1.33a.5.5 0 0 1 .52 0L13 5.4l2.24-1.33a.5.5 0 0 1 .52 0L18 5.4l2.24-1.33a.5.5 0 0 1 .76.43V21" />
          <path d="M12 8v8M14 10a2 2 0 0 0-4 .4c0 1.6 4 1.2 4 2.8a2 2 0 0 1-4 .4" />
        </svg>
        <p>{{ year }}년 낙찰·매도 내역이 없습니다</p>
      </div>
    </template>

    <!-- 신고 일정 -->
    <template v-else-if="subTab === 'schedule'">
      <div class="kind-chips">
        <button
          v-for="k in KINDS"
          :key="k"
          type="button"
          :class="['chip', `k-${k}`, { on: kindFilter === k }]"
          @click="kindFilter = k"
        >{{ k }}</button>
      </div>
      <div class="tax-list">
        <article v-for="(list, i) in filteredMonths" :key="i" class="month-card">
          <p class="month-head">{{ year }}년 {{ i + 1 }}월</p>
          <p v-if="list.length === 0" class="month-none">일정 없음</p>
          <div v-for="(e, j) in list" :key="j" :class="['ev', e.tone]">
            <p class="ev-when"><span class="cal">📅</span>{{ e.when }}</p>
            <p class="ev-title">{{ e.title }}</p>
            <p class="ev-note">{{ e.note }}</p>
          </div>
        </article>
      </div>
    </template>

    <!-- 세금 안내 -->
    <div v-else class="tax-list">
      <section class="g-card">
        <h2>부동산 매매 사업자 과세 구조</h2>
        <div class="g-box">
          <p class="g-t">사업소득금액 계산</p>
          <p class="g-b">사업소득금액 = 매도가 − 낙찰가 − 취득세 − 필요경비(수리비·이자·중개료 등)</p>
          <p class="g-s">＊ 근거: 소득세법 제19조 제1항 제12호</p>
        </div>
        <div class="g-box">
          <p class="g-t">산출세액 계산</p>
          <p class="g-b">산출세액 = 사업소득금액 × 종합소득세 누진세율<br>지방소득세 = 산출세액 × 10%</p>
          <p class="g-s">＊ 근거: 소득세법 제55조</p>
        </div>
        <div class="g-box info">
          <p class="g-t">ⓘ 연간 합산 과세 방식</p>
          <p class="g-b">동일 연도에 여러 물건을 매도한 경우 모든 사업소득을 합산하여 종합소득세 누진세율 적용</p>
          <p class="g-s">→ 합산 소득이 높을수록 적용 세율 구간이 상승하여 납부세액이 증가할 수 있음</p>
        </div>
      </section>

      <section class="g-card">
        <h2>종합소득세 누진세율 <i>(2024년 기준)</i></h2>
        <table class="g-table">
          <thead><tr><th>과세표준</th><th class="r">세율</th></tr></thead>
          <tbody>
            <tr v-for="b in INCOME_BRACKETS" :key="b.base"><td>{{ b.base }}</td><td class="r">{{ b.rate }}</td></tr>
          </tbody>
        </table>
      </section>

      <section class="g-card">
        <h2>취득세율 <i>(1세대 1주택 기준)</i></h2>
        <table class="g-table">
          <thead><tr><th>취득가액</th><th class="r">취득세율</th></tr></thead>
          <tbody>
            <tr v-for="r in ACQ_RATES" :key="r.base"><td>{{ r.base }}</td><td class="r">{{ r.rate }}</td></tr>
          </tbody>
        </table>
      </section>

      <section class="g-card">
        <h2 class="warn">⚠ 비인정 경비 — 자금관리 기입 O, 세금 계산 제외</h2>
        <p class="g-lead">
          아래 항목은 지출로 기록하되 <b>필요경비로 인정되지 않아</b> 사업소득금액 계산 시 공제 불가합니다.
          자금관리에는 실제 지출로 기입하되 세금 신고 시 제외해야 합니다.
        </p>
        <p class="g-sub red">● 완전 불인정 항목 (소득세법 §33)</p>
        <div v-for="d in DENIED" :key="d.title" class="g-item red">
          <p class="g-t">{{ d.title }}</p>
          <p class="g-b">{{ d.body }}</p>
        </div>
        <p class="g-sub amber">● 조건부 인정 — 입증 자료 필수</p>
        <div v-for="c in CONDITIONAL" :key="c.title" class="g-item amber">
          <p class="g-t">{{ c.title }}</p>
          <p class="g-b">{{ c.body }}</p>
        </div>
        <div class="g-item plain">
          <p class="g-t">실무 포인트</p>
          <p class="g-b">
            비인정 경비는 자금관리에서 <b>실지출로 기록</b>해 두되, 세금 신고 시 세무사와 협의하여
            제외 여부를 확정하세요. 특히 전 소유자 미납 관리비 대납·명도 이사비는 세무서마다
            판단이 다를 수 있어 <b>입증 서류(합의서·영수증·계좌이체 내역)</b>를 반드시 보관하는 것이 중요합니다.
          </p>
        </div>
      </section>

      <section class="g-card">
        <h2>주요 세금 신고·납부 일정</h2>
        <div v-for="m in MAIN_SCHEDULE" :key="m.title" class="g-sched">
          <span class="g-ico">{{ m.icon }}</span>
          <div>
            <p class="g-t">{{ m.title }}</p>
            <p v-for="(l, i) in m.lines" :key="i" class="g-b">{{ l }}</p>
          </div>
        </div>
      </section>
    </div>

    <AppMobileBottomNav active="tax" />
  </section>
</template>

<style scoped>
.tax-shell {
  min-height: 100vh;
  background: #f5f7fb;
  padding-bottom: 86px;
}

/* Header — 제목은 다른 화면과 같은 자리, 안내는 제목 오른쪽 */
.tax-header {
  padding: 9px 14px 7px;
  display: flex; align-items: baseline; gap: 8px;
  /* 제목줄 아래 구분선 — 물건상세와 같게 */
  border-bottom: 1px solid #e5e7eb;
}
.tax-eyebrow {
  margin: 0; min-width: 0;
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 9.5px; font-weight: 400; color: #2b6df3; letter-spacing: 0.2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tax-title { margin: 0; flex: 0 0 auto; font-size: 20px; font-weight: 800; color: #111827; letter-spacing: -0.5px; }

/* 연도 선택 */
.tax-years {
  margin: 10px 16px 14px; padding: 5px;
  background: #e2e8f2; border-radius: 12px;
  display: grid; grid-template-columns: 28px repeat(3, 1fr) 28px; gap: 2px;
  align-items: center;
}
.yr-nav {
  border: none; background: transparent; cursor: pointer;
  font-size: 16px; color: #6b7280; padding: 4px 0; line-height: 1;
}
.yr {
  border: none; background: transparent; cursor: pointer;
  padding: 7px 0; border-radius: 9px;
  font-size: 12.5px; font-weight: 700; color: #8a93a4; white-space: nowrap;
}
.yr.on { background: #fff; color: #111827; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08); }

/* 요약 카드 2×2 */
.tax-cards {
  margin: 0 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
}
.tax-card {
  background: #eceff5; border-radius: 12px; padding: 14px 12px;
  display: flex; flex-direction: column; gap: 6px; min-width: 0;
}
.tax-card small { font-size: 11px; font-weight: 600; color: #6b7280; }
.tax-card strong {
  font-size: 19px; font-weight: 800; color: #111827;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tax-card strong.blue { color: #2b6df3; }
.tax-card strong.green { color: #16a34a; }
.tax-card strong.orange { color: #ea580c; }
/* 패널 색 — 매도완료 초록 / 사업소득 빨강 / 종합소득세 파랑 */
.tax-card.green { background: #e8f6ee; }
.tax-card.red { background: #fdecec; }
.tax-card.blue { background: #e9f0fd; }
.tax-card em { font-style: normal; font-size: 10.5px; color: #8a93a4; }

/* 세후 순수익 */
.tax-net {
  margin: 10px 16px 0; padding: 14px 13px;
  background: #eefaf2; border: 1.5px solid #bfe9d2; border-radius: 14px;
  display: flex; align-items: flex-start; gap: 10px;
}
.net-main { flex: 1 1 auto; min-width: 0; }
.net-head {
  margin: 0; font-size: 11px; font-weight: 800; color: #15803d; line-height: 1.4;
}
.net-head span { font-weight: 600; }
.net-value {
  display: block; margin: 6px 0 4px;
  font-size: 26px; font-weight: 800; color: #16a34a; letter-spacing: -0.6px;
}
.net-formula { margin: 0; font-size: 10.5px; color: #6f8b7b; }
.net-side {
  flex: 0 0 auto; text-align: right;
  display: flex; flex-direction: column; gap: 1px;
}
.net-side small { font-size: 9.5px; color: #6f8b7b; font-weight: 600; }
.net-side strong { font-size: 14px; font-weight: 800; color: #14532d; margin-bottom: 4px; }

/* 목록 머리글 */
.list-head {
  margin: 6px 0 0; display: flex; align-items: center; gap: 5px;
  font-size: 13px; font-weight: 800; color: #4b5563;
}
.list-head .ico { color: #16a34a; font-weight: 800; }

/* 목록 줄 */
.row-top { display: flex; align-items: center; gap: 9px; }
.row-main { flex: 1 1 auto; min-width: 0; }
.tag {
  flex: 0 0 auto; border-radius: 999px; padding: 3px 9px;
  font-size: 10.5px; font-weight: 800; white-space: nowrap;
}
.tag.done { background: #eafaf0; color: #16a34a; border: 1px solid #bfe9d2; }
.tag.hold { background: #eef2fb; color: #2b6df3; border: 1px solid #ccdbf8; }
.chev { flex: 0 0 auto; color: #9ca3af; font-size: 15px; line-height: 1; transition: transform 0.15s; }
.chev.up { transform: rotate(180deg); }
.row-detail {
  margin: 11px -13px -12px; padding: 12px 13px;
  border-top: 1px solid #eef0f5; cursor: default;
}
.dgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 10px; }
.dcell { min-width: 0; }
.dcell small { display: block; font-size: 11px; color: #8a93a4; font-weight: 600; }
.dcell small i { font-style: normal; color: #b6bcc7; font-weight: 500; }
.dcell strong {
  display: block; margin-top: 3px;
  font-size: 17px; font-weight: 800; color: #111827; letter-spacing: -0.3px;
}
.dcell strong.orange { color: #ea580c; }
.dcell strong.green { color: #16a34a; }
.dcell strong.neg { color: #dc2626; }
.dcell em {
  display: block; margin-top: 2px; font-style: normal;
  font-size: 9.5px; color: #a3abb8; line-height: 1.35;
}
.dsep { height: 1px; background: #eef0f5; margin: 14px 0; }

.dpanel { margin-top: 12px; padding: 12px 13px; border-radius: 12px; }
.dpanel.orange { background: #fff8ef; border: 1px solid #fae0c0; }
.dpanel.green { background: #f1fbf5; border: 1px solid #c9ecd8; }
.dpanel.orange { display: flex; align-items: flex-start; gap: 10px; }
.dp-main { flex: 1 1 auto; min-width: 0; }
.dp-head { margin: 0; font-size: 11.5px; font-weight: 800; }
.dpanel.orange .dp-head { color: #c2410c; }
.dpanel.green .dp-head { color: #15803d; }
.dpanel strong {
  display: block; margin: 5px 0 3px;
  font-size: 23px; font-weight: 800; letter-spacing: -0.5px;
}
.dpanel.orange .dp-main strong { color: #ea580c; }
.dpanel.green strong { color: #16a34a; }
.dp-sub { margin: 0; font-size: 10px; }
.dpanel.orange .dp-sub { color: #cf8a5c; }
.dpanel.green .dp-sub { color: #7aa38c; }
.dp-side { flex: 0 0 auto; text-align: right; }
.dp-side small { display: block; font-size: 9.5px; color: #cf8a5c; font-weight: 600; }
.dp-side strong { margin: 2px 0; font-size: 14px; color: #9a3412; }

/* 하위 탭 */
.tax-subtabs {
  margin: 16px 16px 12px; padding: 4px;
  background: #e2e8f2; border-radius: 12px;
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px;
}
.sub {
  border: 1px solid transparent; background: transparent; cursor: pointer;
  border-radius: 9px; padding: 8px 2px;
  display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  font-size: 11.5px; font-weight: 700; color: #8a93a4; white-space: nowrap;
}
.sub.on {
  background: #fff; color: #111827;
}
.sub.on svg { color: #2a5fbf; }
.sub.on {
  border-color: #dce2ee; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}

/* 목록 */
.tax-list { margin: 0 16px; display: flex; flex-direction: column; gap: 8px; }
.tax-row {
  background: #fff; border: 1px solid #e8ebf1; border-radius: 12px;
  padding: 12px 13px; cursor: pointer;
}
.tax-row .when { margin: 0 0 4px; font-size: 11px; font-weight: 800; color: #2b6df3; }
.tax-row .addr {
  margin: 0; font-size: 13px; font-weight: 800; color: #111827;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tax-row .meta {
  margin: 3px 0 0; font-size: 11px; color: #8a93a4;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tax-row .meta i { font-style: normal; color: #b6bcc7; }
.tax-row .body { margin: 5px 0 0; font-size: 11.5px; line-height: 1.5; color: #4b5563; }
.tax-row .amt {
  margin: 8px 0 0; padding-top: 8px; border-top: 1px solid #f1f3f7;
  display: flex; align-items: center; justify-content: space-between;
  font-size: 11.5px; color: #6b7280;
}
.tax-row .amt strong { font-size: 13.5px; font-weight: 800; color: #111827; }
.tax-row .amt strong.neg { color: #dc2626; }

/* ===== 신고 일정 ===== */
.kind-chips { margin: 0 16px 10px; display: flex; gap: 6px; flex-wrap: wrap; }
.chip {
  border: 1px solid #e3e7ef; background: #fff; border-radius: 999px;
  padding: 4px 12px; font-size: 11px; font-weight: 700; color: #8a93a4; cursor: pointer;
}
.chip.on.k-양도세 { background: #fff4e6; border-color: #fac98f; color: #c2410c; }
.chip.on.k-취득세 { background: #eef3fe; border-color: #bfd3fa; color: #1d4ed8; }
.chip.on.k-재산세 { background: #eefaf2; border-color: #bfe9d2; color: #15803d; }
.chip.on.k-종부세 { background: #f3f0fb; border-color: #d4c9f0; color: #6d28d9; }

.month-card {
  background: #fff; border: 1px solid #e8ebf1; border-radius: 12px; padding: 12px 13px;
}
.month-head { margin: 0; font-size: 12.5px; font-weight: 800; color: #111827; }
.month-none { margin: 4px 0 0; font-size: 11px; color: #b6bcc7; }
.ev { margin-top: 8px; padding: 10px 11px; border-radius: 10px; }
.ev.orange { background: #fff7ed; border: 1px solid #fadcb8; }
.ev.blue { background: #eff4fe; border: 1px solid #cfdefa; }
.ev.green { background: #f0faf4; border: 1px solid #c9ecd8; }
.ev.gray { background: #f5f3fb; border: 1px solid #ddd5f3; }
.ev-when {
  margin: 0; display: flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 800;
}
.ev .cal { font-size: 10px; }
.ev.orange .ev-when { color: #c2410c; }
.ev.blue .ev-when { color: #1d4ed8; }
.ev.green .ev-when { color: #15803d; }
.ev.gray .ev-when { color: #6d28d9; }
.ev-title { margin: 4px 0 0; font-size: 11.5px; font-weight: 600; color: #374151; line-height: 1.45; }
.ev-note { margin: 3px 0 0; font-size: 10px; color: #9ca3af; line-height: 1.45; }

/* ===== 세금 안내 ===== */
.g-card {
  background: #fff; border: 1px solid #e8ebf1; border-radius: 14px; padding: 14px 13px;
}
.g-card h2 { margin: 0 0 10px; font-size: 15.3px; font-weight: 800; color: #111827; }
.g-card h2 i { font-style: normal; font-size: 11px; font-weight: 600; color: #9ca3af; }
.g-card h2.warn { color: #dc2626; }
.g-lead { margin: 0 0 12px; font-size: 11.5px; line-height: 1.6; color: #4b5563; }
.g-lead b { color: #dc2626; }
.g-box {
  background: #f7f8fb; border-radius: 10px; padding: 11px 12px; margin-bottom: 8px;
}
.g-box.info { background: #eff4fe; border: 1px solid #d8e4fb; }
.g-t { margin: 0; font-size: 13px; font-weight: 800; color: #111827; }
.g-box.info .g-t { color: #1d4ed8; }
.g-b { margin: 5px 0 0; font-size: 11px; line-height: 1.6; color: #4b5563; }
.g-b b { color: #111827; }
.g-s { margin: 5px 0 0; font-size: 9.5px; color: #9ca3af; }
.g-sub { margin: 14px 0 8px; font-size: 11.5px; font-weight: 800; }
.g-sub.red { color: #dc2626; }
.g-sub.amber { color: #d97706; }
.g-item { border-radius: 10px; padding: 11px 12px; margin-bottom: 8px; }
.g-item.red { background: #fef4f4; border: 1px solid #f8dada; }
.g-item.amber { background: #fffbef; border: 1px solid #f6e5bb; }
.g-item.plain { background: #f7f8fb; }
.g-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.g-table th, .g-table td { padding: 9px 4px; border-bottom: 1px solid #f1f3f7; text-align: left; }
.g-table th { font-size: 11px; font-weight: 700; color: #8a93a4; }
.g-table td { color: #374151; }
.g-table .r { text-align: right; font-weight: 800; color: #111827; }
.g-table tbody tr:last-child td { border-bottom: none; }
.g-sched { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid #f1f3f7; }
.g-sched:last-child { border-bottom: none; }
.g-ico { flex: 0 0 auto; font-size: 17px; line-height: 1.3; }

/* 빈 화면 */
.tax-empty {
  margin: 40px 16px; display: flex; flex-direction: column;
  align-items: center; gap: 14px;
}
.tax-empty p { margin: 0; font-size: 13px; color: #8a93a4; }
</style>
