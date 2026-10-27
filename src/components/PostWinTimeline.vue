<script setup lang="ts">
// 낙찰이후 · 진행절차 (웹) — 고른 낙찰 물건의 낙찰일(없으면 입찰기일)에서 시작해
// 단계마다 '앞 단계 + N일'로 날짜를 셈한다. [완료]를 누르면 그날이 적히고 뒤 단계가 따라 밀린다.
// 단계는 물건마다 저장한다(auction.postWinFlow). 처음 열면 기본 절차로 채운다.
import { computed, ref } from 'vue';
import type { AuctionDetail, PostWinFlow, PostWinStep } from '../types/auction';

const props = defineProps<{ auction: AuctionDetail | null }>();
const emit = defineEmits<{ (e: 'save', auction: AuctionDetail): void }>();

/** 기본 절차 — 경매 낙찰 뒤 흔한 흐름(날짜는 대략) */
const DEFAULT_STEPS: Array<Omit<PostWinStep, 'id'>> = [
  { name: '입찰 기일 (시작)', days: 0, base: 'start', note: '경매 입찰 진행' },
  { name: '매각 결정 기일', days: 7, base: 'prev', note: '법원의 매각 결정' },
  { name: '매각 허가 확정일', days: 7, base: 'prev', note: '이의신청 기간 종료 후 확정' },
  { name: '잔금 납부 기한', days: 30, base: 'prev', note: '소유권 이전 및 인도명령 신청' },
  { name: '인도명령 결정', days: 7, base: 'prev', note: '법원의 인도명령 인용 결정' },
  { name: '송달 완료 (공시송달)', days: 28, base: 'prev', note: '폐문부재 등으로 인한 공시송달 기간 반영' },
  { name: '강제집행 계고', days: 14, base: 'prev', note: '송달 후 집행관 사무소 신청' },
  { name: '강제집행 완료 (종료)', days: 14, base: 'prev', note: '최종 명도 완료 예상일' },
];
const newId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const defaultFlow = (): PostWinFlow => ({ steps: DEFAULT_STEPS.map((s) => ({ ...s, id: newId() })) });

/** 한국 시간 그대로 YYYY-MM-DD */
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (v: string) => { const [y, m, d] = v.slice(0, 10).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const addDays = (v: string, n: number) => { const d = parse(v); d.setDate(d.getDate() + n); return iso(d); };
const todayIso = () => iso(new Date());

/** 시작일 — 낙찰일, 없으면 입찰기일 */
const startDate = computed(() => {
  const a = props.auction;
  if (!a) return '';
  const v = String(a.wonDate || a.eventDate || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '';
});
const startLabel = computed(() => (props.auction?.wonDate ? '낙찰일' : '입찰일'));

/** 저장된 흐름(없으면 기본) — 고칠 때는 사본을 만들어 저장한다 */
const flow = computed<PostWinFlow>(() => props.auction?.postWinFlow ?? defaultFlow());
const commit = (next: PostWinFlow) => {
  const a = props.auction;
  if (!a) return;
  a.postWinFlow = JSON.parse(JSON.stringify(next));
  emit('save', a);
};
const edit = (fn: (f: PostWinFlow) => void) => { const f: PostWinFlow = JSON.parse(JSON.stringify(flow.value)); fn(f); commit(f); };

/** 단계마다 날짜 · 기준 글 · D-날 */
const rows = computed(() => {
  const out: Array<PostWinStep & { date: string; baseText: string; dday: number; next: boolean }> = [];
  let prevDate = startDate.value;
  let prevName = startLabel.value;
  let nextMarked = false;
  flow.value.steps.forEach((s) => {
    const baseDate = s.base === 'start' ? startDate.value : prevDate;
    const baseName = s.base === 'start' ? startLabel.value : prevName;
    const planned = baseDate ? addDays(baseDate, s.days) : '';
    const date = s.doneDate || planned;
    const dday = date ? Math.round((parse(todayIso()).getTime() - parse(date).getTime()) / 86400000) : 0;
    const next = !s.doneDate && !nextMarked && !flow.value.endedAt;
    if (next) nextMarked = true;
    out.push({ ...s, date, baseText: `${baseName} ${s.days >= 0 ? '+' : ''}${s.days}일`, dday, next });
    prevDate = date; prevName = s.name;
  });
  return out;
});
const ddayText = (n: number) => (n === 0 ? 'D-DAY' : n > 0 ? `D+${n}` : `D${n}`);

// ===== 고치기 =====
/** 체크 — 예정일이 이미 지났으면 그 날짜 그대로(뒤 일정이 괜히 밀리지 않게), 앞당겨 끝냈으면 오늘로(뒤 일정도 당겨진다) */
const toggleDone = (id: string) => {
  const planned = rows.value.find((x) => x.id === id)?.date || '';
  edit((f) => {
    const s = f.steps.find((x) => x.id === id);
    if (!s) return;
    const today = todayIso();
    s.doneDate = s.doneDate ? undefined : (planned && planned < today ? planned : today);
  });
};
const move = (i: number, d: -1 | 1) => edit((f) => {
  const j = i + d;
  if (j < 0 || j >= f.steps.length) return;
  [f.steps[i], f.steps[j]] = [f.steps[j], f.steps[i]];
});
const remove = (id: string) => edit((f) => { f.steps = f.steps.filter((x) => x.id !== id); });
const editingId = ref('');
const draft = ref<{ name: string; days: number; note: string; base: 'prev' | 'start' }>({ name: '', days: 7, note: '', base: 'prev' });
const startEdit = (s: PostWinStep) => { editingId.value = s.id; draft.value = { name: s.name, days: s.days, note: s.note ?? '', base: s.base }; };
const saveEdit = () => edit((f) => {
  const s = f.steps.find((x) => x.id === editingId.value);
  if (s) { s.name = draft.value.name.trim() || s.name; s.days = Number(draft.value.days) || 0; s.note = draft.value.note.trim(); s.base = draft.value.base; }
  editingId.value = '';
});
// 단계 더하기
const addName = ref('');
const addBase = ref<'prev' | 'start'>('prev');
const addDaysN = ref(7);
const addStep = () => {
  const name = addName.value.trim();
  if (!name) return;
  edit((f) => { f.steps.push({ id: newId(), name, days: Number(addDaysN.value) || 0, base: addBase.value }); });
  addName.value = ''; addDaysN.value = 7; addBase.value = 'prev';
};
const endByDeal = () => edit((f) => { f.endedAt = f.endedAt ? undefined : todayIso(); });
const resetDefault = () => {
  if (!window.confirm('기본 절차로 되돌릴까요? 고친 단계와 완료 표시가 지워집니다.')) return;
  commit(defaultFlow());
};
</script>

<template>
  <section class="pwt">
    <header class="pwt-head">
      <h2>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
        진행절차
      </h2>
      <button v-if="auction" type="button" :class="['pwt-btn', 'deal', { on: !!flow.endedAt }]" @click="endByDeal">{{ flow.endedAt ? `협의 완료 (${flow.endedAt}) — 되돌리기` : '협의 완료로 종료' }}</button>
      <button v-if="auction" type="button" class="pwt-btn" @click="resetDefault">기본 절차로 초기화</button>
    </header>

    <p v-if="!auction" class="pwt-empty">위에서 낙찰 물건을 고르면 그 물건의 낙찰일부터 절차 일정이 잡힙니다.</p>
    <template v-else>
      <!-- 설명 없이 쓰게 — 기준일만 한 줄 -->
      <p class="pwt-guide">
        <template v-if="startDate">{{ startLabel }} {{ startDate }} 기준</template>
        <template v-else>낙찰일이 비어 있습니다 — 물건상세에서 낙찰일을 적어 주세요.</template>
      </p>

      <ol class="pwt-list">
        <li v-for="(r, i) in rows" :key="r.id" :class="['pwt-row', { done: !!r.doneDate, now: r.next }]">
          <!-- 체크하면 그날로 적히고 뒤 일정이 따라 밀린다 -->
          <input type="checkbox" class="pwt-chk" :checked="!!r.doneDate" :aria-label="`${r.name} 마침`" @change="toggleDone(r.id)" />
          <div class="pwt-main">
            <template v-if="editingId === r.id">
              <div class="pwt-edit">
                <input v-model="draft.name" class="pwt-in" placeholder="단계 이름" />
                <select v-model="draft.base" class="pwt-in sm"><option value="prev">이전 단계 후</option><option value="start">{{ startLabel }} 후</option></select>
                <input v-model.number="draft.days" type="number" class="pwt-in xs" /> <span class="pwt-unit">일</span>
                <input v-model="draft.note" class="pwt-in" placeholder="설명" />
                <button type="button" class="pwt-btn primary" @click="saveEdit">저장</button>
                <button type="button" class="pwt-btn" @click="editingId = ''">취소</button>
              </div>
            </template>
            <template v-else>
              <p class="pwt-name">{{ r.name }}</p>
              <p class="pwt-meta">
                <b>{{ r.date || '—' }}</b>
                <span v-if="r.date && !r.doneDate" :class="['pwt-dday', { soon: r.dday <= 0 && r.dday >= -7 }]">{{ ddayText(r.dday) }}</span>
                <span class="pwt-base">{{ r.doneDate ? '완료한 날' : r.baseText }}</span>
              </p>
              <p v-if="r.note" class="pwt-note">{{ r.note }}</p>
            </template>
          </div>
          <div v-if="editingId !== r.id" class="pwt-ctrl">
            <button type="button" aria-label="위로" :disabled="i === 0" @click="move(i, -1)">▲</button>
            <button type="button" aria-label="아래로" :disabled="i === rows.length - 1" @click="move(i, 1)">▼</button>
            <button type="button" aria-label="고치기" @click="startEdit(r)">✎</button>
            <button type="button" aria-label="지우기" @click="remove(r.id)">✕</button>
          </div>
        </li>
      </ol>

      <div class="pwt-add">
        <span class="pwt-add-lab">+ 단계 추가</span>
        <input v-model="addName" class="pwt-in" placeholder="예: 관리비 정산" @keyup.enter="addStep" />
        <select v-model="addBase" class="pwt-in sm"><option value="prev">이전 단계 후</option><option value="start">{{ startLabel }} 후</option></select>
        <input v-model.number="addDaysN" type="number" class="pwt-in xs" /> <span class="pwt-unit">일</span>
        <button type="button" class="pwt-btn primary" :disabled="!addName.trim()" @click="addStep">추가</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.pwt { color-scheme: light; background: #fff; border-radius: 10px; padding: 18px 22px 20px; color: #111827; }
.pwt-head { display: flex; align-items: center; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid #eef1f6; }
.pwt-head h2 { margin: 0 auto 0 0; display: inline-flex; align-items: center; gap: 6px; font-size: 16px; font-weight: 800; color: #111827; }
.pwt-btn { height: 34px; padding: 0 14px; border: 1px solid #d5dbe6; border-radius: 8px; background: #fff; font: inherit; font-size: 14px; font-weight: 700; color: #374151; cursor: pointer; }
.pwt-btn:hover { background: #f5f7fb; }
.pwt-btn.deal.on { background: #374151; border-color: #374151; color: #fff; }
.pwt-btn.primary { border-color: #2b6df3; background: #2b6df3; color: #fff; }
.pwt-btn:disabled { opacity: .45; cursor: default; }
.pwt-guide { margin: 12px 0 10px; font-size: 14px; color: #6b7280; }
.pwt-empty { margin: 24px 0 8px; text-align: center; font-size: 14px; color: #6b7280; }
.pwt-list { list-style: none; margin: 0; padding: 0; }
.pwt-row { display: flex; align-items: flex-start; gap: 14px; padding: 14px 10px; border-bottom: 1px solid #eef1f6; border-radius: 8px; }
.pwt-row.done :is(.pwt-name, .pwt-meta, .pwt-note) { color: #9ca3af; }
/* 지금 시작할 단계(아직 체크 안 한 첫 단계) — 흐린 빨강 칸 */
.pwt-row.now { background: #fdeeee; border: 1px solid #f6c9c9; border-bottom-color: #f6c9c9; }
.pwt-chk { flex: 0 0 auto; width: 20px; height: 20px; margin: 2px 4px 0 0; accent-color: #2b6df3; cursor: pointer; }
.pwt-main { flex: 1 1 auto; min-width: 0; }
.pwt-name { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 800; }
.pwt-meta { margin: 6px 0 0; display: flex; align-items: baseline; gap: 8px; font-size: 14px; }
.pwt-meta b { font-weight: 700; }
.pwt-dday { font-weight: 800; color: #111827; }
.pwt-dday.soon { color: #dc2626; }   /* 7일 안쪽만 빨강, 나머지는 검정 */
.pwt-base { color: #9ca3af; }
.pwt-note { margin: 5px 0 0; font-size: 14px; color: #4b5563; }
.pwt-ctrl { flex: 0 0 auto; display: flex; gap: 6px; }
.pwt-ctrl button { width: 34px; height: 30px; border: 0; border-radius: 6px; background: #f1f4f9; color: #4b5563; font-size: 13px; cursor: pointer; }
.pwt-ctrl button:hover { background: #e3e8f2; }
.pwt-ctrl button:disabled { opacity: .35; cursor: default; }
.pwt-edit, .pwt-add { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.pwt-add { margin-top: 16px; padding: 14px; border: 1px dashed #d5dbe6; border-radius: 10px; background: #fafbfd; }
.pwt-add-lab { font-size: 14px; font-weight: 800; color: #374151; }
.pwt-in { height: 36px; padding: 0 10px; border: 1px solid #d5dbe6; border-radius: 8px; font: inherit; font-size: 14px; color: #111827; background: #fff; flex: 1 1 200px; min-width: 0; }
.pwt-in.sm { flex: 0 0 150px; }
.pwt-in.xs { flex: 0 0 80px; text-align: right; }
.pwt-unit { font-size: 14px; color: #6b7280; }
</style>
