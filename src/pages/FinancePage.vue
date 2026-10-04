<script setup lang="ts">
// 자금관리 — 4개 탭. 모든 데이터는 Firestore에 사용자별로 저장됨.
// 탭: 사업계좌 자금입출금 / 사업지출내역 / 유류비 & 식대지출 / 물품구매 지출상세

import { computed, onMounted, onUnmounted, ref } from 'vue';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import DateWheelPicker from '../components/DateWheelPicker.vue';
import { useFinanceStore } from '../stores/financeStore';
import { useAuctionStore } from '../stores/auctionStore';
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
const auctionStore = useAuctionStore();

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

const auctionOptions = computed(() =>
  auctionStore.auctions.map((a) => ({
    id: a.id,
    label: `${a.caseNumber} - ${a.address}`,
  })),
);

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
      if (a) beDraft.value.auctionLabel = a.caseNumber;
      await finance.saveBusinessExpense(beDraft.value);
    } else if (modalKind.value === 'fuelMeal') {
      await finance.saveFuelMeal(fmDraft.value);
    } else if (modalKind.value === 'itemPurchase') {
      const a = auctionStore.auctions.find((x) => x.id === ipDraft.value.auctionId);
      if (a) ipDraft.value.auctionLabel = a.caseNumber;
      await finance.saveItemPurchase(ipDraft.value);
    }
    closeModal();
  } catch (e) {
    alert(e instanceof Error ? e.message : '저장 실패');
  }
};

const onDelete = async () => {
  if (!confirm('이 항목을 삭제하시겠습니까?')) return;
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

// 사용자 입력 (콤마 구분)
const fmUsersInput = computed({
  get: () => (fmDraft.value.users || []).join(', '),
  set: (v: string) => {
    fmDraft.value.users = v.split(',').map((s) => s.trim()).filter(Boolean);
  },
});

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

const exportExcel = () => {
  if (activeTab.value === 'cashFlow') {
    downloadCsv('자금입출금.csv', [
      ['구분(소유자)', '일자', '종류', '금액', '비고'],
      ...filteredCashFlows.value.map((r) => [r.ownerName, r.date, r.flowType, r.amount, r.note]),
    ]);
  } else if (activeTab.value === 'businessExpense') {
    downloadCsv('사업지출.csv', [
      ['결제일', '물건', '구분', '명세', '비용(VAT포함)', '비고'],
      ...filteredBusiness.value.map((r) => [r.date, r.auctionLabel, r.memo, r.detail, r.amountWithVat, r.note]),
    ]);
  } else if (activeTab.value === 'fuelMeal') {
    downloadCsv('유류식대.csv', [
      ['사용일', '사용지역', '사용처', '사용구분', '지출', '카드', '사용자', '비고'],
      ...filteredFuelMeal.value.map((r) => [r.date, r.region, r.store, r.category, r.amount, r.card, r.users.join(','), r.note]),
    ]);
  } else if (activeTab.value === 'itemPurchase') {
    downloadCsv('물품구매.csv', [
      ['사용일', '물건', '구분', '상세내역', '수량', '단가', '계', '합계(VAT)', '구매업체', '카드', '사용자', '배송비', '비고'],
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
    <header class="fin-header">
      <h1 class="fin-page-title">자금관리</h1>
      <nav class="fin-tabs">
        <button :class="['fin-tab', { active: activeTab === 'cashFlow' }]" @click="activeTab = 'cashFlow'">사업계좌자금<br>입출금관리</button>
        <button :class="['fin-tab', { active: activeTab === 'businessExpense' }]" @click="activeTab = 'businessExpense'">사업<br>지출내역</button>
        <button :class="['fin-tab', { active: activeTab === 'fuelMeal' }]" @click="activeTab = 'fuelMeal'">유류&amp;식대<br>지출내역</button>
        <button :class="['fin-tab', { active: activeTab === 'itemPurchase' }]" @click="activeTab = 'itemPurchase'">물품구매<br>지출내역</button>
      </nav>
    </header>

    <div class="fin-toolbar">
      <h2 class="fin-title">
        <template v-if="activeTab === 'cashFlow'">사업계좌 자금입출금 관리</template>
        <template v-else-if="activeTab === 'businessExpense'">사업지출내역</template>
        <template v-else-if="activeTab === 'fuelMeal'">유류&식대 지출내역</template>
        <template v-else>물품구매 지출내역</template>
        <small v-if="activeTab !== 'cashFlow'" class="fin-vat-note">VAT 포함 입력 바랍니다</small>
      </h2>
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
        <table class="fin-table">
          <thead>
            <tr><th>구분</th><th>일자</th><th>입출금</th><th class="r">개인 자금</th><th>비고</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in filteredCashFlows" :key="r.id" @click="openEdit('cashFlow', r)">
              <td :title="r.ownerName">{{ r.ownerName }}</td>
              <td>{{ r.date }}</td>
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
        <table class="fin-table">
          <thead>
            <tr><th>결제일</th><th>물건</th><th>구분</th><th>명세</th><th class="r">비용(VAT포함)</th><th>비고</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in filteredBusiness" :key="r.id" @click="openEdit('businessExpense', r)">
              <td>{{ r.date }}</td>
              <td :title="r.auctionLabel">{{ r.auctionLabel || '-' }}</td>
              <td :title="r.memo"><span class="pill memo">{{ r.memo || '-' }}</span></td>
              <td :title="r.detail">{{ r.detail }}</td>
              <td class="r"><strong>{{ fmtMoney(r.amountWithVat) }}</strong></td>
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
        <table class="fin-table">
          <thead>
            <tr><th>사용일</th><th>사용지역</th><th>사용처/구매처</th><th>사용구분</th><th class="r">지출</th><th>구매카드</th><th>사용자</th><th>비고</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in filteredFuelMeal" :key="r.id" @click="openEdit('fuelMeal', r)">
              <td>{{ r.date }}</td>
              <td :title="r.region">{{ r.region }}</td>
              <td :title="r.store">{{ r.store }}</td>
              <td :title="r.category"><span class="pill cat">{{ r.category }}</span></td>
              <td class="r">{{ fmtMoney(r.amount) }}원</td>
              <td :title="r.card">{{ r.card }}</td>
              <td :title="(r.users || []).join(',')">{{ (r.users || []).join(',') }}</td>
              <td :title="r.note">{{ r.note }}</td>
            </tr>
            <tr v-if="filteredFuelMeal.length === 0">
              <td colspan="8" class="empty">
                <template v-if="finance.fuelMeal.length === 0">데이터가 없습니다.</template>
                <template v-else>이 기간에 해당하는 데이터가 없습니다. (전체 {{ finance.fuelMeal.length }}건)</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ========== TAB 4: 물품구매 ========== -->
    <template v-else>
      <div class="fin-table-wrap">
        <table class="fin-table">
          <thead>
            <tr>
              <th>사용일</th><th>물건</th><th>구분</th><th>상세내역</th>
              <th class="r">수량</th><th class="r">단가</th><th class="r">계</th><th class="r">합계(VAT)</th>
              <th>구매업체</th><th>카드</th><th>사용자</th><th class="r">배송비</th><th>비고</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in filteredItemPurchases" :key="r.id" @click="openEdit('itemPurchase', r)">
              <td>{{ r.date }}</td>
              <td :title="r.auctionLabel">{{ r.auctionLabel || '-' }}</td>
              <td :title="r.category"><span class="pill cat">{{ r.category }}</span></td>
              <td :title="r.description">{{ r.description }}</td>
              <td class="r">{{ r.quantity }}</td>
              <td class="r">{{ fmtMoney(r.unitPrice) }}원</td>
              <td class="r">{{ fmtMoney(r.subtotal) }}원</td>
              <td class="r"><strong>{{ fmtMoney(r.totalWithVat) }}원</strong></td>
              <td :title="r.vendor">{{ r.vendor }}</td>
              <td :title="r.card">{{ r.card }}</td>
              <td :title="r.user">{{ r.user }}</td>
              <td class="r">{{ r.shippingFee ? fmtMoney(r.shippingFee) + '원' : '-' }}</td>
              <td :title="r.note">{{ r.note }}</td>
            </tr>
            <tr v-if="filteredItemPurchases.length === 0">
              <td colspan="13" class="empty">
                <template v-if="finance.itemPurchases.length === 0">데이터가 없습니다.</template>
                <template v-else>이 기간에 해당하는 데이터가 없습니다. (전체 {{ finance.itemPurchases.length }}건)</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ========== 모달 ========== -->
    <div v-if="modalKind" class="fin-modal-backdrop" @click.self="closeModal">
      <div class="fin-modal">
        <header>
          <h3>항목 편집</h3>
          <button class="x" @click="closeModal">×</button>
        </header>

        <!-- 자금입출금 -->
        <template v-if="modalKind === 'cashFlow'">
          <label>소유자<input type="text" v-model="cfDraft.ownerName" /></label>
          <div class="row2">
            <label>종류
              <select v-model="cfDraft.flowType">
                <option value="출금">출금</option>
                <option value="입금">입금</option>
              </select>
            </label>
            <label>금액<input type="number" v-model.number="cfDraft.amount" /></label>
          </div>
          <div class="row2">
            <label>날짜<input type="date" v-model="cfDraft.date" /></label>
            <label>비고<input type="text" v-model="cfDraft.note" /></label>
          </div>
        </template>

        <!-- 사업지출 -->
        <template v-else-if="modalKind === 'businessExpense'">
          <label>물건
            <select v-model="beDraft.auctionId">
              <option value="">선택 안함</option>
              <option v-for="o in auctionOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
            </select>
          </label>
          <label>수익분석 항목
            <select v-model="beDraft.profitCategory">
              <option>기타사업비</option>
              <option>소유권이전</option>
              <option>인테리어</option>
              <option>대출이자</option>
              <option>관리비</option>
              <option>세금</option>
              <option>중개수수료</option>
            </select>
          </label>
          <div class="row2">
            <label>구분 (메모)<input type="text" v-model="beDraft.memo" /></label>
            <label>명세<input type="text" v-model="beDraft.detail" /></label>
          </div>
          <div class="row2">
            <label>비용 (VAT포함)<input type="number" v-model.number="beDraft.amountWithVat" /></label>
            <label>날짜<input type="date" v-model="beDraft.date" /></label>
          </div>
          <label>비고<input type="text" v-model="beDraft.note" /></label>
        </template>

        <!-- 유류·식대 -->
        <template v-else-if="modalKind === 'fuelMeal'">
          <div class="row2">
            <label>지역<input type="text" v-model="fmDraft.region" /></label>
            <label>사용처<input type="text" v-model="fmDraft.store" /></label>
          </div>
          <div class="row2">
            <label>카테고리
              <select v-model="fmDraft.category">
                <option>유류</option>
                <option>식음료</option>
                <option>문구류</option>
                <option>쓰레기봉투</option>
                <option>기타</option>
              </select>
            </label>
            <label>금액<input type="number" v-model.number="fmDraft.amount" /></label>
          </div>
          <label>사용카드<input type="text" v-model="fmDraft.card" /></label>
          <label>사용자 (콤마구분)<input type="text" v-model="fmUsersInput" /></label>
          <div class="row2">
            <label>날짜<input type="date" v-model="fmDraft.date" /></label>
            <label>비고<input type="text" v-model="fmDraft.note" /></label>
          </div>
        </template>

        <!-- 물품구매 -->
        <template v-else-if="modalKind === 'itemPurchase'">
          <label>물건 지정
            <select v-model="ipDraft.auctionId">
              <option value="">선택 안함</option>
              <option v-for="o in auctionOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
            </select>
          </label>
          <div class="row2">
            <label>카테고리
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
            <label>단가<input type="number" v-model.number="ipDraft.unitPrice" @input="updateItemTotals" /></label>
          </div>
          <div class="row2">
            <label>합계<input type="number" :value="(ipDraft.quantity || 0) * (ipDraft.unitPrice || 0)" disabled /></label>
            <label>VAT 포함 합계<input type="number" v-model.number="ipDraft.totalWithVat" /></label>
          </div>
          <div class="row2">
            <label>구매처<input type="text" v-model="ipDraft.vendor" /></label>
            <label>사용카드<input type="text" v-model="ipDraft.card" /></label>
          </div>
          <label>사용자<input type="text" v-model="ipDraft.user" /></label>
          <div class="row2">
            <label>배송비<input type="number" v-model.number="ipDraft.shippingFee" /></label>
            <label>날짜<input type="date" v-model="ipDraft.date" /></label>
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

    <AppMobileBottomNav active="finance" />
  </section>
</template>

<style scoped>
.fin-shell {
  min-height: 100vh;
  background: #f5f7fb;
  padding-bottom: 80px;
}

/* Header — title + tab nav (TradeStatsPage 스타일과 동일) */
.fin-header {
  background: #fff; border-bottom: 1px solid #eef0f5;
}
.fin-page-title {
  margin: 0; padding: 9px 14px 7px;
  font-size: 20px; font-weight: 800; color: #111827;
  /* 제목줄 아래 구분선 — 물건상세와 같게 */
  border-bottom: 1px solid #e5e7eb;
}
.fin-tabs {
  /* 네 칸을 정확히 4등분한 알약 카드 */
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px;
  margin: 0 14px 12px; padding: 4px;
  background: #e2e8f2; border-radius: 12px;
}
.fin-tab {
  border: 1px solid transparent; background: transparent;
  padding: 7px 2px; min-height: 50px; border-radius: 9px;
  /* 선택 여부와 상관없이 같은 크기·굵기 — 글자 폭이 흔들리지 않게 색만 바꾼다 */
  font-size: 14.5px; font-weight: 700; line-height: 1.3; letter-spacing: -0.3px; color: #6b7280;
  text-align: center; white-space: normal; cursor: pointer;
  display: flex; align-items: flex-start; justify-content: center;
}
.fin-tab.active {
  background: #fff; color: #111827;
  border-color: #e3e7ef; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}

/* Toolbar */
.fin-toolbar {
  padding: 14px 14px 8px;
  display: flex; flex-direction: column; gap: 10px;
}
.fin-title {
  margin: 0; font-size: 15.3px; font-weight: 800; color: #111827;
  display: flex; align-items: center; gap: 8px;
}
.fin-vat-note { font-size: 11px; font-weight: 600; color: #2b6df3; }
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
  gap: 6px; padding: 8px 14px 12px;
}
.sum-card {
  padding: 10px 8px; border-radius: 10px;
  display: flex; flex-direction: column; gap: 4px;
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
.sum-card.bal { background: #f1f5f9; border: 1px solid #e2e8f0; }
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
  width: 100%; border-collapse: collapse; font-size: 11px;
}
.fin-table thead {
  background: #1f2a4d; color: #fff;
}
.fin-table th, .fin-table td {
  padding: 8px 6px; text-align: left;
  border-bottom: 1px solid #eef0f5;
  white-space: nowrap; vertical-align: middle;
}
.fin-table th { font-weight: 700; font-size: 10.5px; white-space: nowrap; }
.fin-table tbody tr:nth-child(even) { background: #fafbfd; }
.fin-table tbody tr { cursor: pointer; }
.fin-table tbody tr:hover { background: #f9fafb; }
.fin-table td.r, .fin-table th.r { text-align: right; }
.fin-table td.amt.blue { color: #2563eb; font-weight: 700; }
.fin-table td.amt.red  { color: #dc2626; font-weight: 700; }
.fin-table .empty { text-align: center; color: #9ca3af; padding: 20px; white-space: normal; font-size: 11px; }
/* 텍스트 셀은 너무 길면 말줄임 — 한 줄 유지. 마우스 오버 시 title 속성으로 전체 표시 */
.fin-table td:not(.r):not(.empty) {
  max-width: 110px; overflow: hidden; text-overflow: ellipsis;
}

.pill {
  display: inline-block; padding: 1px 7px; border-radius: 999px;
  font-size: 10px; font-weight: 700; white-space: nowrap;
}
.pill.in  { background: #fee2e2; color: #dc2626; }
.pill.out { background: #dbeafe; color: #2563eb; }
.pill.memo, .pill.cat { background: #e0e7ff; color: #4338ca; }

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
