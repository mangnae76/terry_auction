<script setup lang="ts">
// 물건별 비용 장부(웹) — 필요경비 · 사업경비 한 갈래의 표 + 적기 창.
// 낙찰이후 진행절차(물건 하나)와 자금관리(모든 물건)가 같이 쓴다 — 저장 자리가 같아 어느 쪽에서 적어도 양쪽에 보인다.
// 분류는 services/expenseBook. 물품구매는 수량 × 단가로 비용을 셈한다.
import { computed, ref, watch } from 'vue';
import { useAuctionStore } from '../stores/auctionStore';
import { useFinanceStore } from '../stores/financeStore';
import { useInteriorStore } from '../stores/interiorStore';
import { BOOK_HINT, BOOK_NAME, groupsOf, ledgerRows, planAmountsOf, planRowsOf, withPlan, type Book, type LedgerRow } from '../services/expenseBook';
import { cleanupLegacyOnce } from '../services/legacyCleanup';
import { shortAddr } from '../utils/address';
import FormattedNumberInput from './FormattedNumberInput.vue';
import AppConfirm from './AppConfirm.vue';
import { skipsToday, type ConfirmBox } from '../services/confirmBox';

const props = withDefaults(defineProps<{
  book: Book;
  /** 물건 하나만 — 비우면(null) 모든 물건, 물건 칸이 보이고 적을 때 고른다 */
  auctionId?: string | null;
  /** 기간 거르기(자금관리 기간 단추) */
  inPeriod?: (date: string) => boolean;
  /** 표 위 합계 · 엑셀 · 항목추가 줄(낙찰이후) — 자금관리는 위 필터 줄의 단추를 쓴다 */
  tools?: boolean;
}>(), { auctionId: null, inPeriod: undefined, tools: false });

const auctions = useAuctionStore();
const finance = useFinanceStore();
const interior = useInteriorStore();
finance.initialize();
interior.initialize();
cleanupLegacyOnce();

const many = computed(() => props.auctionId === null);
/** A안 기본 줄을 깔 물건 — 낙찰이후는 그 물건, 자금관리는 낙찰한 물건 전부 */
const planAuctions = computed(() => (many.value
  ? auctions.auctions.filter((a) => !!a.wonDate)
  : auctions.auctions.filter((a) => a.id === props.auctionId)));
const all = computed(() => withPlan(ledgerRows({ be: finance.businessExpenses, interior: interior.rows }), planAuctions.value));
const rows = computed(() => all.value.filter((r) => r.book === props.book
  && (many.value || r.auctionId === props.auctionId)
  && (!props.inPeriod || props.inPeriod(r.date))));
const total = computed(() => rows.value.reduce((s, r) => s + r.amount, 0));

// 정렬 — 머리글을 누르면 그 칸으로, 다시 누르면 거꾸로. 기본은 날짜 늦은 순
type SortKey = 'date' | 'auction' | 'category' | 'detail' | 'amount' | 'vendor' | 'note';
const sort = ref<{ key: SortKey; desc: boolean }>({ key: 'date', desc: true });
const GET: Record<SortKey, (r: LedgerRow) => string | number> = {
  date: (r) => r.date, auction: (r) => r.auctionLabel, category: (r) => r.category, detail: (r) => r.detail,
  amount: (r) => r.amount, vendor: (r) => r.vendor, note: (r) => r.note,
};
const sorted = computed(() => [...rows.value].sort((a, b) => {
  const x = GET[sort.value.key](a); const y = GET[sort.value.key](b);
  const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ko');
  return sort.value.desc ? -d : d;
}));
const toggleSort = (key: SortKey) => {
  sort.value = sort.value.key === key ? { key, desc: !sort.value.desc } : { key, desc: key === 'date' || key === 'amount' };
};
const mark = (key: SortKey) => (sort.value.key === key ? (sort.value.desc ? '↓' : '↑') : '⇅');
const cols = computed<Array<[SortKey, string]>>(() => [
  ['date', '날짜'], ...(many.value ? [['auction', '물건'] as [SortKey, string]] : []), ['category', '사용구분'], ['detail', '명세'],
  ['amount', '비용(VAT포함)'], ...(props.book === 'biz' ? [['vendor', '업체 · 연락처'] as [SortKey, string]] : []), ['note', '비고'],
]);

const money = (n: number) => (n || 0).toLocaleString('ko-KR');
const shortDate = (d: string) => (d && d.length >= 10 ? d.slice(2).replace(/-/g, '.') : d);
const labelOf = (id: string) => {
  const a = auctions.auctions.find((x) => x.id === id);
  return a ? (shortAddr(a.address) || a.caseNumber) : '';
};
/** 물건 고르기 — 낙찰한 물건만(없으면 전부) */
const auctionOptions = computed(() => {
  const won = auctions.auctions.filter((a) => !!a.wonDate);
  return (won.length ? won : auctions.auctions).map((a) => ({ id: a.id, label: shortAddr(a.address) || a.caseNumber }));
});

// === 적기 창 ===
const GROUPS = computed(() => groupsOf(props.book));
interface Draft { src: 'be' | 'in' | ''; id: string; auctionId: string; date: string; category: string; detail: string; custom: boolean; qty: number; unit: number; amount: number; vendor: string; phone: string; status: string; note: string }
const open = ref(false);
const draft = ref<Draft>({ src: '', id: '', auctionId: '', date: '', category: '', detail: '', custom: false, qty: 0, unit: 0, amount: 0, vendor: '', phone: '', status: '', note: '' });
const today = () => new Date().toISOString().slice(0, 10);
const itemsOf = (cat: string) => GROUPS.value.find(([g]) => g === cat)?.[1] ?? [];
/** 곱해서 셈하는 사업경비 — [수 칸 이름, 단가 칸 이름, 표에 붙는 단위]. 비용 = 수 × 단가 */
const UNIT_CATS: Record<string, [string, string, string]> = {
  물품구매: ['수량', '단가', '개'],
  대출이자: ['개월', '월이자', '개월'],
  '관리비·공과금': ['개월', '월금액', '개월'],
};
const unitOf = (cat: string) => (props.book === 'biz' ? UNIT_CATS[cat] : undefined);
const unitCat = computed(() => unitOf(draft.value.category));
const isItem = computed(() => !!unitCat.value);
watch(() => [draft.value.qty, draft.value.unit, isItem.value] as const, ([q, u, on]) => {
  if (on) draft.value.amount = Number(q || 0) * Number(u || 0);
});
/** 대출이자 한 달 몫 — 입찰가산정 A안의 3개월 이자 ÷ 3 */
const monthlyInterestOf = (id: string) => {
  const a = auctions.auctions.find((x) => x.id === id);
  return a ? Math.round(planAmountsOf(a).interest / 3) : 0;
};
const openAdd = () => {
  const [cat, items] = GROUPS.value[0];
  draft.value = { src: '', id: '', auctionId: props.auctionId ?? '', date: today(), category: cat, detail: items[0] ?? '', custom: false, qty: 1, unit: 0, amount: 0, vendor: '', phone: '', status: '예정', note: '' };
  open.value = true;
};
const openRow = (r: LedgerRow) => {
  // A안 줄은 그 값을 채운 새 기록으로 연다 — 저장하면 실제 기록이 되고 A안 줄은 숨는다
  const plan = r.src === 'plan';
  draft.value = {
    src: r.src === 'plan' ? '' : r.src, id: plan ? '' : r.id, auctionId: r.auctionId, date: plan ? today() : r.date, category: r.category, detail: r.detail,
    custom: !!r.detail && !itemsOf(r.category).includes(r.detail), qty: r.qty || 1, unit: r.unit || 0, amount: r.amount,
    vendor: r.vendor, phone: r.phone, status: r.status || '예정', note: plan ? '' : r.note,
  };
  open.value = true;
};
const pickCategory = (c: string) => {
  draft.value.category = c;
  // 대출이자는 A안 한 달 이자를 먼저 넣어 둔다 — 개월만 고치면 된다
  if (c === '대출이자' && !draft.value.unit) draft.value.unit = monthlyInterestOf(draft.value.auctionId);
  if (!draft.value.custom && !itemsOf(c).includes(draft.value.detail)) draft.value.detail = itemsOf(c)[0] ?? '';
};
const detailPick = computed({
  get: () => (draft.value.custom ? '__custom' : draft.value.detail),
  set: (v: string) => {
    if (v === '__custom') { draft.value.custom = true; draft.value.detail = ''; return; }
    draft.value.custom = false; draft.value.detail = v;
  },
});
const busy = ref(false);
/** 지금 적는 줄에 해당하는 입찰가산정A 줄(있으면) — 0 · 빈칸으로 저장하면 이 값으로 돌아간다 */
const planMatch = computed(() => {
  const d = draft.value;
  const a = auctions.auctions.find((x) => x.id === d.auctionId);
  if (!a) return null;
  return planRowsOf(a).find((p) => p.book === props.book && p.category === d.category
    && (p.category === '수리·인테리어' || p.category === '명도비' || p.detail === d.detail)) ?? null;
});
const save = async () => {
  const d = draft.value;
  // 0 · 빈칸 — 기록을 남기지 않는다(고치던 줄은 지운다). 입찰가산정A 항목이면 그 값으로 돌아간다
  if (!Number(d.amount)) {
    if (d.id && d.src === 'be') await finance.deleteBusinessExpense(d.id);
    else if (d.id && d.src === 'in') await interior.remove(d.id);
    open.value = false;
    return;
  }
  busy.value = true;
  try {
    const label = labelOf(d.auctionId);
    if (props.book === 'need') {
      await finance.saveBusinessExpense({
        ...(d.src === 'be' ? { id: d.id } : {}), auctionId: d.auctionId, auctionLabel: label,
        profitCategory: d.category, memo: '', detail: d.detail, amountWithVat: Number(d.amount || 0), date: d.date, note: d.note,
      });
    } else {
      await interior.save({
        ...(d.src === 'in' ? { id: d.id } : {}), kind: 'cost', auctionId: d.auctionId, auctionLabel: label,
        category: d.category, work: d.detail, status: d.category === '수리·인테리어' ? d.status : '',
        startDate: d.date, endDate: '', amountWithVat: Number(d.amount || 0), vendor: d.vendor, phone: d.phone, note: d.note,
        quantity: isItem.value ? Number(d.qty || 0) : 0, unitPrice: isItem.value ? Number(d.unit || 0) : 0,
      });
    }
    open.value = false;
  } catch (e) {
    alert(e instanceof Error ? e.message : '저장 실패');
  } finally { busy.value = false; }
};
// 확인창은 앱 전체가 같은 것(AppConfirm) — 자금관리 지우기와 같은 '오늘 다시 묻지 않기'
const confirmBox = ref<ConfirmBox | null>(null);
const remove = () => {
  const d = draft.value;
  if (!d.id) return;
  const box: ConfirmBox = {
    title: '이 항목을 삭제할까요?', desc: '삭제하면 되살릴 수 없습니다.', okLabel: '삭제', skipKey: 'fin.skip.deleteItem',
    run: async () => {
      if (d.src === 'be') await finance.deleteBusinessExpense(d.id);
      else if (d.src === 'in') await interior.remove(d.id);
      open.value = false;
    },
  };
  if (skipsToday(box.skipKey)) { void box.run(); return; }
  confirmBox.value = box;
};

/** 엑셀(csv) */
const exportCsv = () => {
  const esc = (v: string | number) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const head = ['날짜', '물건', '사용구분', '명세', '수량', '단가', '비용(VAT포함)', '업체', '연락처', '비고'];
  const body = sorted.value.map((r) => [r.date, r.auctionLabel || labelOf(r.auctionId), r.category, r.detail, r.qty || '', r.unit || '', r.amount, r.vendor, r.phone, r.note]);
  const text = '﻿' + [head, ...body].map((r) => r.map(esc).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${BOOK_NAME[props.book]}.csv`; a.click();
  URL.revokeObjectURL(url);
};
defineExpose({ openAdd, exportCsv, total });
</script>

<template>
  <section class="xl">
    <div v-if="tools" class="xl-tools">
      <span class="xl-sum">합계 <b>{{ money(total) }}</b>원</span>
      <span class="xl-hint">{{ BOOK_HINT[book] }} · 자금관리 › {{ BOOK_NAME[book] }}와 같은 기록<br><b class="xl-plan">입찰가산정A</b> 입찰가산정A에서 가져옵니다. 필요시 직접 입력하세요.</span>
      <button type="button" class="xl-btn" @click="exportCsv">⬇ 엑셀저장</button>
      <button type="button" class="xl-btn on" :disabled="auctionId === ''" @click="openAdd">＋ 항목추가</button>
    </div>
    <p v-else class="xl-head"><span class="xl-sum">합계 <b>{{ money(total) }}</b>원</span><span class="xl-hint">{{ BOOK_HINT[book] }} · 낙찰이후 › 진행절차 › {{ BOOK_NAME[book] }}와 같은 기록<br><b class="xl-plan">입찰가산정A</b> 입찰가산정A에서 가져옵니다. 필요시 직접 입력하세요.</span></p>
    <table class="xl-tbl">
      <thead>
        <tr>
          <th v-for="[k, label] in cols" :key="k" :class="`xc-${k}`"><button type="button" @click="toggleSort(k)">{{ label }}<i :class="{ on: sort.key === k }">{{ mark(k) }}</i></button></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in sorted" :key="r.key" :class="{ plan: r.src === 'plan' }" @click="openRow(r)">
          <td>{{ shortDate(r.date) }}</td>
          <td v-if="many" :title="r.auctionLabel">{{ r.auctionLabel || labelOf(r.auctionId) || '공통' }}</td>
          <td><span class="xl-pill">{{ r.category }}</span></td>
          <td :title="r.detail" class="l">{{ r.detail }}<span v-if="r.qty && unitOf(r.category)" class="xl-qty">{{ money(r.qty) }}{{ unitOf(r.category)?.[2] }} × {{ money(r.unit) }}원</span><em v-if="r.status" class="xl-st">{{ r.status }}</em><em v-if="r.src === 'plan'" class="xl-plan" title="입찰가산정A에서 가져왔습니다 — 누르면 직접 입력합니다">입찰가산정A</em></td>
          <td class="r">{{ money(r.amount) }}원</td>
          <td v-if="book === 'biz'" :title="[r.vendor, r.phone].filter(Boolean).join(' · ')">{{ [r.vendor, r.phone].filter(Boolean).join(' · ') }}</td>
          <td :title="r.note" class="l">{{ r.note }}</td>
        </tr>
        <tr v-if="!sorted.length"><td :colspan="cols.length" class="xl-empty">적어 둔 {{ BOOK_NAME[book] }}가 없습니다. ＋ 항목추가를 누르세요.</td></tr>
      </tbody>
    </table>

    <Teleport to="body">
      <div v-if="open" class="xl-veil" @click.self="open = false">
        <div class="xl-modal" role="dialog">
          <header><h3>{{ BOOK_NAME[book] }} {{ draft.id ? '고치기' : '적기' }}</h3><button type="button" class="x" aria-label="닫기" @click="open = false">✕</button></header>
          <div class="xl-form">
            <label>날짜<input v-model="draft.date" type="date" /></label>
            <label v-if="many">물건
              <select v-model="draft.auctionId">
                <option value="">{{ book === 'biz' ? '공통(물건 없음)' : '선택 안함' }}</option>
                <option v-for="o in auctionOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
              </select>
            </label>
            <label>사용구분
              <select :value="draft.category" @change="pickCategory(($event.target as HTMLSelectElement).value)">
                <option v-if="!GROUPS.some(([g]) => g === draft.category)" :value="draft.category">{{ draft.category }}</option>
                <option v-for="[g] in GROUPS" :key="g" :value="g">{{ g }}</option>
              </select>
            </label>
            <label>명세
              <select v-model="detailPick">
                <option v-for="d in itemsOf(draft.category)" :key="d" :value="d">{{ d }}</option>
                <option value="__custom">직접입력</option>
              </select>
              <input v-if="draft.custom" v-model="draft.detail" type="text" placeholder="명세를 적어 주세요" />
            </label>
            <template v-if="isItem">
              <label>{{ unitCat?.[0] }}<FormattedNumberInput v-model="draft.qty" live-group align="left" placeholder="0" /></label>
              <label>{{ unitCat?.[1] }}<FormattedNumberInput v-model="draft.unit" live-group align="left" placeholder="0" /><small v-if="draft.category === '대출이자'" class="xl-sub">입찰가산정A 3개월 이자 ÷ 3</small></label>
            </template>
            <label>비용(VAT포함)<FormattedNumberInput v-model="draft.amount" live-group align="left" placeholder="0" :disabled="isItem" /><small v-if="isItem" class="xl-sub">{{ unitCat?.[0] }} × {{ unitCat?.[1] }}로 계산합니다</small><small v-if="planMatch" class="xl-sub">0이나 빈칸으로 저장하면 입찰가산정A {{ money(planMatch.amount) }}원으로 돌아갑니다</small></label>
            <label v-if="book === 'biz' && draft.category === '수리·인테리어'">현황
              <select v-model="draft.status"><option v-for="st in ['예정', '진행', '완료']" :key="st" :value="st">{{ st }}</option></select>
            </label>
            <template v-if="book === 'biz'">
              <label>업체명<input v-model="draft.vendor" type="text" /></label>
              <label>연락처<input v-model="draft.phone" type="tel" /></label>
            </template>
            <label class="wide">비고<input v-model="draft.note" type="text" /></label>
          </div>
          <p class="xl-mhint">{{ BOOK_HINT[book] }}</p>
          <footer>
            <!-- 취소는 ✕ 로 — 삭제 · 저장은 오른쪽에 나란히 -->
            <span class="sp" />
            <button v-if="draft.id" type="button" class="del" @click="remove">삭제</button>
            <button type="button" class="on" :disabled="busy" @click="save">저장</button>
          </footer>
        </div>
      </div>
    </Teleport>
    <Teleport to="body"><AppConfirm :box="confirmBox" @close="confirmBox = null" /></Teleport>
  </section>
</template>

<style scoped>
.xl { color-scheme: light; }
.xl-tools, .xl-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin: 0 0 10px; }
.xl-sum { font-size: 15px; color: #111827; }
.xl-sum b { font-weight: 800; }
.xl-hint { margin-right: auto; font-size: 13px; color: #6b7280; }
.xl-btn { height: 34px; padding: 0 14px; border: 1px solid #2b6df3; border-radius: 6px; background: #fff; color: #1d4ed8; font-size: 14px; cursor: pointer; }
.xl-btn.on { background: #2b6df3; color: #fff; }
.xl-btn:disabled { opacity: .5; cursor: default; }
.xl-tbl { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; background: #fff; border: 1px solid #d0d5dd; border-radius: 8px; overflow: hidden; }
.xl-tbl th { background: #1f2a44; color: #fff; padding: 0; font-size: 14px; font-weight: 700; }
.xl-tbl th button { width: 100%; height: 42px; padding: 0 10px; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; display: flex; align-items: center; justify-content: center; }
/* 머리글은 칸 글과 같은 쪽으로 — 명세 · 비고는 왼쪽, 비용은 오른쪽 */
.xl-tbl th:is(.xc-detail, .xc-note) button { justify-content: flex-start; }
.xl-tbl th.xc-amount button { justify-content: flex-end; }
.xl-tbl th i { margin-left: 4px; font-style: normal; font-size: 12px; opacity: .55; }
.xl-tbl th i.on { opacity: 1; }
.xl-tbl th.xc-date { width: 10%; } .xl-tbl th.xc-auction { width: 13%; } .xl-tbl th.xc-category { width: 12%; }
.xl-tbl th.xc-detail { width: 26%; } .xl-tbl th.xc-amount { width: 12%; } .xl-tbl th.xc-vendor { width: 15%; }
/* 비고가 남는 폭을 가진다 — 명세가 지나치게 넓어지지 않게 */
.xl-tbl td { padding: 12px 10px; font-size: 14px; color: #111827; text-align: center; border-top: 1px solid #e5e7eb; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.xl-tbl tbody tr:first-child td { border-top: 0; }
.xl-tbl td.l { text-align: left; }
.xl-tbl td.r { text-align: right; }
.xl-tbl tbody tr { cursor: pointer; }
.xl-tbl tbody tr:hover td { background: #f5f8ff; }
.xl-pill { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #e9f0fd; color: #1d4ed8; font-size: 13px; }
.xl-st { margin-left: 6px; padding: 1px 6px; border-radius: 4px; background: #f1f3f6; color: #4b5563; font-style: normal; font-size: 12px; }
.xl-plan { margin-left: 6px; padding: 1px 6px; border-radius: 4px; background: #fff4e5; color: #b45309; font-style: normal; font-weight: 600; font-size: 12px; }
.xl-hint .xl-plan { margin: 0 4px 0 0; }
.xl-tbl tr.plan td { color: #6b7280; }
.xl-qty { margin-left: 10px; font-size: 13px; color: #6b7280; }
.xl-sub { font-size: 12px; font-weight: 400; color: #6b7280; }
.xl-form :deep(input:disabled) { background: #f5f7fa; color: #374151; }
.xl-empty { padding: 28px 10px !important; color: #6b7280 !important; cursor: default; }
.xl-veil { position: fixed; inset: 0; z-index: 150; background: rgba(15, 23, 42, .45); display: grid; place-items: center; padding: 20px; }
.xl-modal { color-scheme: light; width: min(560px, 100%); background: #fff; border-radius: 14px; padding: 20px 22px 18px; color: #111827; box-shadow: 0 20px 40px rgba(15, 23, 42, .25); }
.xl-modal header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.xl-modal h3 { margin: 0; font-size: 16px; font-weight: 800; }
.xl-modal .x { border: 0; background: none; font-size: 16px; color: #6b7280; cursor: pointer; }
.xl-form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 14px; }
.xl-form label { display: flex; flex-direction: column; gap: 6px; font-size: 14px; font-weight: 600; color: #374151; }
.xl-form label.wide { grid-column: 1 / -1; }
.xl-form :is(input, select), .xl-form :deep(input) { height: 40px; padding: 0 10px; border: 1px solid #d0d5dd; border-radius: 6px; background: #fff; color: #111827; font: inherit; font-size: 14px; font-weight: 400; box-sizing: border-box; width: 100%; }
.xl-mhint { margin: 12px 0 0; font-size: 12px; color: #6b7280; }
.xl-modal footer { display: flex; align-items: center; gap: 8px; margin-top: 16px; }
.xl-modal footer .sp { flex: 1; }
.xl-modal footer button { height: 38px; padding: 0 16px; border: 1px solid #d0d5dd; border-radius: 6px; background: #fff; color: #374151; font-size: 14px; cursor: pointer; }
.xl-modal footer button.on { border-color: #2b6df3; background: #2b6df3; color: #fff; }
.xl-modal footer button.del { border-color: #f1c4c4; color: #b44545; }
</style>
