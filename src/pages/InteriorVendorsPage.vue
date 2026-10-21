<script setup lang="ts">
// 인테리어 업체 관리 — 견적을 받아 둔 업체를 한자리에 모아 둔다.
// 낙찰이후의 '업체비딩' 표를 이리로 옮겨 왔다. 물건을 고르지 않고도 적을 수 있다
// (견적은 물건이 정해지기 전에 먼저 받아 두는 일이 많다).
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import AppToast from '../components/AppToast.vue';
import FormattedNumberInput from '../components/FormattedNumberInput.vue';
import { useInteriorStore } from '../stores/interiorStore';
import { formatPhone } from '../utils/phone';
import type { InteriorExpenseRecord } from '../types/finance';

const router = useRouter();
const interior = useInteriorStore();
onMounted(() => interior.initialize());

/** 줄 세우는 차례 — 날짜(최근 먼저) 또는 업체명(가나다) */
const sortKey = ref<'date' | 'name'>('date');

/** 업체 비딩 줄 — 물건에 묶였든 아니든 모두 모아 보여 준다 */
const rows = computed(() => {
  const mine = interior.rows.filter((r) => (r.kind ?? 'cost') === 'bid');
  return [...mine].sort((a, b) => (sortKey.value === 'name'
    ? (a.vendor ?? '').localeCompare(b.vendor ?? '', 'ko')
    : (b.startDate || b.date || '').localeCompare(a.startDate || a.date || '')));
});
const total = computed(() => rows.value.reduce((sum, r) => sum + (r.amountWithVat || 0), 0));

const money = (n: number) => (n || 0).toLocaleString('ko-KR');
/** 표 안의 날짜 — '26.10.19' */
const shortDate = (d: string) => (d && d.length >= 10 ? d.slice(2).replace(/-/g, '.') : (d || ''));
const todayIso = () => new Date().toISOString().slice(0, 10);

const toastText = ref('');
const toast = (text: string) => {
  toastText.value = text;
  window.setTimeout(() => { toastText.value = ''; }, 1600);
};

type Draft = Partial<InteriorExpenseRecord> & { id?: string };
const open = ref(false);
const draft = ref<Draft>({});

const openAdd = () => {
  draft.value = {
    kind: 'bid', status: '', startDate: todayIso(), endDate: '',
    work: '', amountWithVat: 0, vendor: '', phone: '', note: '',
  };
  open.value = true;
};
const openEdit = (row: InteriorExpenseRecord) => { draft.value = { ...row }; open.value = true; };

const save = async () => {
  const d = draft.value;
  await interior.save({
    ...d,
    kind: 'bid',
    // 물건과 묶지 않는다 — 고치던 줄이 물건에 묶여 있었다면 그대로 둔다
    auctionId: d.auctionId ?? '',
    auctionLabel: d.auctionLabel ?? '',
    amountWithVat: Number(d.amountWithVat ?? 0),
  });
  open.value = false;
  toast('저장했습니다.');
};
const remove = async () => {
  const id = draft.value.id;
  if (!id) { open.value = false; return; }
  await interior.remove(id);
  open.value = false;
  toast('지웠습니다.');
};

/** 엑셀(csv)로 내려받기 — 자금관리·낙찰이후와 같은 방식 */
const exportCsv = () => {
  const esc = (v: string | number) => {
    const t = String(v ?? '');
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const table: Array<Array<string | number>> = [
    ['시작', '완료', '작업내용', '협의내용', '견적(VAT포함)', '업체명', '연락처', '비고'],
    ...rows.value.map((r) => [
      r.startDate || r.date || '', r.endDate, r.work, r.status,
      r.amountWithVat, r.vendor, r.phone, r.note,
    ]),
  ];
  const csv = `﻿${table.map((line) => line.map(esc).join(',')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = '인테리어업체비딩.csv';
  a.click();
  URL.revokeObjectURL(url);
};
</script>

<template>
  <section class="ivp-shell">
    <header class="ivp-header">
      <button type="button" class="pg-back-shared" aria-label="뒤로" @click="router.back()"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg></button>
      <h1 class="ivp-title">인테리어 업체 관리</h1>
    </header>

    <p class="ivp-note">
      견적을 받아 둔 <b>인테리어 업체</b>를 한자리에 모읍니다.
      물건을 고르지 않아도 적을 수 있어, 낙찰 전에 받아 둔 견적도 그대로 쌓아 둘 수 있습니다.
    </p>

    <div class="ivp-card">
      <div class="ivp-tools">
        <span class="ivp-sum">합계 <b>{{ money(total) }}</b>원</span>
        <!-- 업체가 늘면 찾기 어렵다 — 날짜순과 가나다순으로 줄을 세운다 -->
        <button type="button" :class="['ivp-sort', { on: sortKey === 'date' }]" @click="sortKey = 'date'">날짜순</button>
        <button type="button" :class="['ivp-sort', { on: sortKey === 'name' }]" @click="sortKey = 'name'">가나다순</button>
        <button type="button" class="ivp-btn" @click="exportCsv">⬇ 엑셀저장</button>
        <button type="button" class="ivp-btn on" @click="openAdd">＋ 업체추가</button>
      </div>

      <table class="ivp-tbl">
        <colgroup>
          <col style="width: 15%" /><col style="width: 16%" />
          <col style="width: 28%" /><col style="width: 18%" /><col style="width: 23%" />
        </colgroup>
        <thead>
          <tr>
            <th>예상일정</th><th>작업내용</th><th>협의내용</th>
            <th>견적{{ '\n' }}(VAT포함)</th><th>업체명{{ '\n' }}연락처</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id" @click="openEdit(r)">
            <td class="span">
              <b>{{ shortDate(r.startDate || r.date || '') }}</b>
              <small v-if="r.endDate">~ {{ shortDate(r.endDate) }}</small>
            </td>
            <td>
              {{ r.work }}
              <small v-if="r.auctionLabel" class="tag">{{ r.auctionLabel }}</small>
            </td>
            <td>{{ r.status }}</td>
            <td>{{ money(r.amountWithVat) }}</td>
            <td class="vend">
              <b>{{ r.vendor }}</b>
              <small v-if="r.phone">{{ formatPhone(r.phone) }}</small>
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="5" class="empty">적어 둔 업체가 없습니다. 위의 ＋ 업체추가를 누르세요.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 적기·고치기 -->
    <template v-if="open">
      <div class="ivp-veil" @click="open = false" />
      <div class="ivp-modal" @click.stop>
        <header class="ivp-modal-head">
          <strong>업체 비딩</strong>
          <button type="button" class="ivp-close" aria-label="닫기" @click="open = false">×</button>
        </header>
        <label class="ivp-fld"><small>시작</small><input v-model="draft.startDate" type="date" class="ivp-input" /></label>
        <label class="ivp-fld"><small>완료</small><input v-model="draft.endDate" type="date" class="ivp-input" /></label>
        <label class="ivp-fld"><small>작업내용</small><input v-model="draft.work" class="ivp-input" placeholder="도배 · 바닥 · 싱크대 …" /></label>
        <label class="ivp-fld"><small>협의내용</small><input v-model="draft.status" class="ivp-input" placeholder="협의한 내용" /></label>
        <label class="ivp-fld">
          <small>견적 (VAT 포함)</small>
          <FormattedNumberInput v-model="draft.amountWithVat" live-group align="left" placeholder="0" class="ivp-input" />
        </label>
        <label class="ivp-fld"><small>업체명</small><input v-model="draft.vendor" class="ivp-input" placeholder="업체 이름" /></label>
        <label class="ivp-fld">
          <small>연락처</small>
          <input
            :value="draft.phone"
            class="ivp-input"
            inputmode="tel"
            placeholder="010-0000-0000"
            @input="draft.phone = formatPhone(($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="ivp-fld"><small>비고</small><input v-model="draft.note" class="ivp-input" /></label>
        <div class="ivp-modal-foot">
          <button v-if="draft.id" type="button" class="ivp-btn del" @click="remove">지우기</button>
          <button type="button" class="ivp-btn" @click="open = false">닫기</button>
          <button type="button" class="ivp-btn on" @click="save">저장</button>
        </div>
      </div>
    </template>

    <AppMobileBottomNav active="more" />
    <AppToast :visible="!!toastText" :text="toastText" tone="success" />
  </section>
</template>

<style scoped>
.ivp-shell { min-height: 100vh; background: #f4f6fb; padding-bottom: 86px; }
.ivp-header { padding: 14px 12px 8px; display: flex; align-items: center; gap: 4px; }
.ivp-title { margin: 0; font-size: 20px; font-weight: 800; color: #111827; }
.ivp-note {
  margin: 0 14px 10px; font-size: 11.5px; line-height: 1.6; color: #6b7280; word-break: keep-all;
}
.ivp-note b { color: #374151; }

.ivp-card { margin: 0 14px; background: #fff; border: 1px solid #e8ebf1; border-radius: 12px; padding: 10px; }
.ivp-tools { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.ivp-sum { margin-right: auto; font-size: 11.5px; color: #4b5563; }
.ivp-sum b { font-size: 13px; font-weight: 800; color: #111827; }
.ivp-btn {
  border: 1px solid #d7dceb; border-radius: 7px; background: #fff;
  padding: 5px 10px; font-family: inherit; font-size: 11.5px; font-weight: 700; color: #4b5563; cursor: pointer;
}
.ivp-btn.on { background: #2a3f8f; border-color: #2a3f8f; color: #fff; }
.ivp-btn.del { color: #c62828; border-color: #f0d4d4; margin-right: auto; }
/* 줄 세우기 단추 — 업체추가 옆에 */
.ivp-sort {
  border: 1px solid #dde3ee; border-radius: 999px; background: #fff;
  padding: 4px 9px; font-family: inherit; font-size: 11px; font-weight: 700; color: #4b5563; cursor: pointer;
}
.ivp-sort.on { background: #2a3f8f; border-color: #2a3f8f; color: #fff; }

/* 표 — 낙찰이후의 업체비딩 표와 같은 꼴 */
.ivp-tbl {
  width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0;
  border: 1px solid #d0d5dd; border-radius: 8px; overflow: hidden; background: #fff;
}
.ivp-tbl th {
  background: #f4f6fb; font-size: 10.5px; font-weight: 700; color: #4b5563;
  padding: 6px 4px; white-space: pre-line; border-bottom: 1px solid #d0d5dd;
}
.ivp-tbl td {
  padding: 7px 5px; font-size: 11.5px; color: #374151; vertical-align: middle;
  border-bottom: 1px solid #e8ebf1; word-break: keep-all;
}
.ivp-tbl tbody tr:last-child td { border-bottom: 0; }
.ivp-tbl tbody tr { cursor: pointer; }
.ivp-tbl tbody tr:hover { background: #f7f9fd; }
.ivp-tbl td.span, .ivp-tbl td.vend { display: table-cell; }
.ivp-tbl td.span b, .ivp-tbl td.vend b { display: block; font-weight: 700; color: #111827; }
.ivp-tbl td.span small, .ivp-tbl td.vend small { display: block; font-size: 10.5px; color: #6b7280; }
.ivp-tbl td small.tag { display: block; font-size: 10px; color: #2b6df3; }
.ivp-tbl td.empty { text-align: center; color: #9ca3af; padding: 18px 6px; cursor: default; }

/* 적기 창 */
.ivp-veil { position: fixed; inset: 0; z-index: 40; background: rgba(17, 24, 39, .4); }
.ivp-modal {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 41;
  width: min(360px, calc(100vw - 32px)); max-height: 86vh; overflow-y: auto;
  background: #fff; border-radius: 14px; padding: 14px;
  display: flex; flex-direction: column; gap: 8px;
}
.ivp-modal-head { display: flex; align-items: center; }
.ivp-modal-head strong { font-size: 14px; font-weight: 800; color: #111827; }
.ivp-close {
  margin-left: auto; width: 26px; height: 26px; border: none; background: transparent;
  font-size: 20px; line-height: 1; color: #6b7280; cursor: pointer;
}
.ivp-fld { display: flex; flex-direction: column; gap: 3px; }
.ivp-fld small { font-size: 10.5px; font-weight: 700; color: #6b7280; }
.ivp-input {
  width: 100%; box-sizing: border-box; height: 32px;
  border: 1px solid #dde3ee; border-radius: 7px; padding: 0 8px;
  font-family: inherit; font-size: 12.5px; color: #111827;
}
.ivp-input:focus { outline: none; border-color: #2a3f8f; }
.ivp-modal-foot { display: flex; gap: 6px; margin-top: 4px; }
</style>
