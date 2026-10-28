<script setup lang="ts">
// 낙찰이후 · 진행절차 (웹) — 고른 낙찰 물건의 낙찰일(없으면 입찰기일)에서 시작해
// 단계마다 '앞 단계 + N일'로 날짜를 셈한다. [완료]를 누르면 그날이 적히고 뒤 단계가 따라 밀린다.
// 단계는 물건마다 저장한다(auction.postWinFlow). 처음 열면 기본 절차로 채운다.
import { computed, ref } from 'vue';
import type { AuctionDetail, PostWinFlow, PostWinStep } from '../types/auction';
import { STEP_KEY_BY_NAME, STEP_TODOS, type StepTodo } from '../services/postWinTodos';
import AppConfirm from './AppConfirm.vue';
import type { ConfirmBox } from '../services/confirmBox';

const props = defineProps<{
  auction: AuctionDetail | null;
  /** 큰일의 진행도 [한 것, 모두] — 세부 체크가 없는 일은 null */
  progress?: (t: StepTodo) => [number, number] | null;
}>();
const emit = defineEmits<{
  (e: 'save', auction: AuctionDetail): void;
  /** 큰일 바로가기 — 절차상세 · 가이드의 그 상자로 */
  (e: 'go', todo: StepTodo): void;
}>();
/** 단계의 큰일 — 기본 단계만 있다(열쇠, 없으면 이름으로) */
const allTodosOf = (s: PostWinStep): StepTodo[] => STEP_TODOS[s.key || STEP_KEY_BY_NAME[s.name] || ''] ?? [];
// 갈래(명도 · 대출 · 절차) 거르기는 뺐다 — 중심은 법원 절차의 흐름, 해야 할 일은 그 흐름대로 본다
const todosOf = allTodosOf;
const progOf = (t: StepTodo) => props.progress?.(t) ?? null;
const isFull = (t: StepTodo) => { const p = progOf(t); return !!p && p[0] >= p[1]; };
const goTitle = (t: StepTodo) => (t.page ? (t.page.tab === 'tax' ? '세금신고로 가기' : '자금관리로 가기')
  : t.tab === 'repair' ? '인테리어로 가기' : t.tab === 'sell' ? '매도·임대로 가기' : t.group || t.tab === 'biz' ? '자세히 보기' : '');

/** 기본 절차 — 경매 낙찰 뒤 흔한 흐름(날짜는 대략). 명도 뒤 인테리어 · 매도까지 잇는다 */
const DEFAULT_STEPS: Array<Omit<PostWinStep, 'id'>> = [
  { key: 'bid', name: '입찰 기일 (시작)', days: 0, base: 'start', note: '경매 입찰 진행' },
  { key: 'decide', name: '매각 결정 기일', days: 7, base: 'prev', note: '법원의 매각 결정' },
  { key: 'confirm', name: '매각 허가 확정일', days: 7, base: 'prev', note: '이의신청 기간 종료 후 확정' },
  { key: 'balance', name: '잔금 납부 기한', days: 30, base: 'prev', note: '소유권 이전 및 인도명령 신청' },
  { key: 'order', name: '인도명령 결정', days: 7, base: 'prev', note: '법원의 인도명령 인용 결정' },
  { key: 'serve', name: '송달 완료 (공시송달)', days: 28, base: 'prev', note: '폐문부재 등으로 인한 공시송달 기간 반영' },
  { key: 'warn', name: '강제집행 계고', days: 14, base: 'prev', note: '송달 후 집행관 사무소 신청' },
  { key: 'exec', name: '강제집행 완료 (종료)', days: 14, base: 'prev', note: '최종 명도 완료 예상일' },
  { key: 'repairStart', name: '인테리어 시작', days: 7, base: 'prev', note: '업체를 골라 공사 시작' },
  { key: 'repairDone', name: '인테리어 완료', days: 30, base: 'prev', note: '공사 마치고 비용 정리' },
  { key: 'list', name: '매물 내놓기', days: 7, base: 'prev', note: '중개업소에 내놓기' },
  { key: 'contract', name: '매도·임대 계약', days: 30, base: 'prev', note: '계약하고 잔금 일정 잡기' },
  { key: 'close', name: '매도 잔금', days: 30, base: 'prev', note: '잔금 받고 소유권 넘기기' },
  { key: 'taxPre', name: '매매차익 예정신고', days: 60, base: 'prev', note: '잔금 달 말일부터 2개월 안에 신고·납부' },
  { key: 'taxFinal', name: '종합소득세 확정신고', days: 0, base: 'prev', note: '이듬해 5월 31일까지' },
];
const newId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const FLOW_VER = 2;
const defaultFlow = (): PostWinFlow => ({ ver: FLOW_VER, steps: DEFAULT_STEPS.map((s) => ({ ...s, id: newId() })) });
/** 옛 판(명도에서 끝남)에는 인테리어 · 매도 · 세금 단계를 한 번만 뒤에 붙인다 — 그 뒤에 지운 단계는 되살리지 않는다 */
const TAIL_KEYS = ['repairStart', 'repairDone', 'list', 'contract', 'close', 'taxPre', 'taxFinal'];
const upgrade = (f: PostWinFlow): PostWinFlow => {
  if ((f.ver ?? 1) >= FLOW_VER) return f;
  const has = new Set(f.steps.map((x) => x.key || STEP_KEY_BY_NAME[x.name] || ''));
  const tail = DEFAULT_STEPS.filter((d) => TAIL_KEYS.includes(d.key as string) && !has.has(d.key as string))
    .map((d) => ({ ...d, id: `tail-${d.key}` }));   // 저장 전에도 id 가 흔들리지 않게
  return { ...f, ver: FLOW_VER, steps: [...f.steps, ...tail] };
};

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
const savedFlow = computed<PostWinFlow>(() => (props.auction?.postWinFlow ? upgrade(props.auction.postWinFlow) : defaultFlow()));
/** 끄는 동안의 차례(단계 id) — 놓을 때 한 번만 저장한다 */
const dragOrder = ref<string[] | null>(null);
const dragId = ref('');
const flow = computed<PostWinFlow>(() => {
  const f = savedFlow.value;
  if (!dragOrder.value) return f;
  const by = new Map(f.steps.map((x) => [x.id, x]));
  return { ...f, steps: dragOrder.value.map((id) => by.get(id)).filter((x): x is PostWinStep => !!x) };
});
const commit = (next: PostWinFlow) => {
  const a = props.auction;
  if (!a) return;
  a.postWinFlow = JSON.parse(JSON.stringify(next));
  emit('save', a);
};
const edit = (fn: (f: PostWinFlow) => void) => { const f: PostWinFlow = JSON.parse(JSON.stringify(savedFlow.value)); fn(f); commit(f); };

/** 단계마다 날짜 · 기준 글 · D-날 */
const rows = computed(() => {
  const out: Array<PostWinStep & { date: string; baseText: string; dday: number; next: boolean }> = [];
  let prevDate = startDate.value;
  let prevName = startLabel.value;
  let nextMarked = false;
  flow.value.steps.forEach((s) => {
    const baseDate = s.base === 'start' ? startDate.value : prevDate;
    const baseName = s.base === 'start' ? startLabel.value : prevName;
    // 예정신고는 잔금 달 말일부터 2개월, 확정신고는 이듬해 5월 31일 — 날 수가 아니라 달력으로 정해진다
    const planned = !baseDate ? ''
      : s.key === 'taxPre' ? iso(new Date(parse(baseDate).getFullYear(), parse(baseDate).getMonth() + 3, 0))
        : s.key === 'taxFinal' ? `${parse(baseDate).getFullYear() + 1}-05-31`
          : addDays(baseDate, s.days);
    const date = s.doneDate || planned;
    const dday = date ? Math.round((parse(todayIso()).getTime() - parse(date).getTime()) / 86400000) : 0;
    const next = !s.doneDate && !nextMarked && !flow.value.endedAt;
    if (next) nextMarked = true;
    const baseText = s.key === 'taxPre' ? `${baseName} 달 말일 +2개월` : s.key === 'taxFinal' ? '이듬해 5월 말' : `${baseName} ${s.days >= 0 ? '+' : ''}${s.days}일`;
    out.push({ ...s, date, baseText, dday, next });
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
// ===== 끌어서 차례 바꾸기 — 임장경로처럼 상자를 잡고 위아래로. 체크 상자 · 연필 · 지우기 자리는 잡히지 않는다 =====
const onDragStart = (id: string, e: PointerEvent) => {
  if (editingId.value || (e.target as HTMLElement).closest('input, button, select, textarea')) return;
  dragId.value = id;
  dragOrder.value = savedFlow.value.steps.map((x) => x.id);
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
};
const onDragMove = (e: PointerEvent) => {
  if (!dragId.value || !dragOrder.value) return;
  e.preventDefault();
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.pwt-row') as HTMLElement | null;
  const overId = el?.dataset.id;
  if (!overId || overId === dragId.value) return;
  const order = [...dragOrder.value];
  const from = order.indexOf(dragId.value); const to = order.indexOf(overId);
  if (from < 0 || to < 0) return;
  order.splice(from, 1); order.splice(to, 0, dragId.value);
  dragOrder.value = order;
};
const onDragEnd = () => {
  if (!dragId.value) return;
  const order = dragOrder.value;
  const id = dragId.value;
  dragId.value = '';
  // 끌지 않고 누르기만 했으면 그 칸을 고른다(다시 누르면 풀린다) — 고른 칸에 행삽입 단추가 뜬다
  const moved = !!order && order.join() !== savedFlow.value.steps.map((x) => x.id).join();
  selectedId.value = moved || selectedId.value !== id ? id : '';
  if (order) {
    const changed = order.join() !== savedFlow.value.steps.map((x) => x.id).join();
    if (changed) commit({ ...savedFlow.value, steps: flow.value.steps });
  }
  dragOrder.value = null;
};
const selectedId = ref('');
/** 방금 행삽입한 칸 — 이름을 적기 전에 취소하면 그 칸을 도로 지운다 */
const freshId = ref('');
const cancelEdit = () => {
  const id = freshId.value;
  editingId.value = ''; freshId.value = '';
  if (id) { remove(id); selectedId.value = ''; }
};
/** 행삽입 — 고른 칸 바로 아래에 새 단계를 넣고 곧장 고치기로 연다 */
const insertBelow = (id: string) => {
  const nid = newId();
  edit((f) => {
    const at = f.steps.findIndex((x) => x.id === id);
    f.steps.splice(at < 0 ? f.steps.length : at + 1, 0, { id: nid, name: '새 단계', days: 7, base: 'prev' });
  });
  selectedId.value = nid;
  freshId.value = nid;
  editingId.value = nid;
  const near = rows.value.find((x) => x.id === id)?.date ?? '';
  draft.value = { name: '', date: near ? addDays(near, 7) : '', note: '' };
};
const remove = (id: string) => edit((f) => { f.steps = f.steps.filter((x) => x.id !== id); });
const editingId = ref('');
// 고치기 — 날짜는 달력으로 고르고, 저장할 때 '낙찰일 후 N일'로 바꿔 둔다(차례는 끌어서 옮기니 '이전 단계 후'는 고르지 않는다)
const draft = ref<{ name: string; date: string; note: string }>({ name: '', date: '', note: '' });
const startEdit = (s: PostWinStep & { date?: string }) => { editingId.value = s.id; draft.value = { name: s.name, date: s.date ?? '', note: s.note ?? '' }; };
/** 낙찰일에서 며칠 뒤인지 */
const daysFromStart = (d: string) => (startDate.value && d ? Math.round((parse(d).getTime() - parse(startDate.value).getTime()) / 86400000) : null);
const saveEdit = () => edit((f) => {
  const s = f.steps.find((x) => x.id === editingId.value);
  if (s) {
    s.name = draft.value.name.trim() || s.name;
    s.note = draft.value.note.trim();
    const d = draft.value.date;
    if (d && s.doneDate) s.doneDate = d;   // 끝낸 단계는 끝낸 날을 고친다
    else if (d) { const n = daysFromStart(d); if (n != null) { s.base = 'start'; s.days = n; } }
  }
  editingId.value = ''; freshId.value = '';
});
// 단계 더하기
const addName = ref('');
const addDate = ref('');
const addStep = () => {
  const name = addName.value.trim();
  if (!name) return;
  const n = daysFromStart(addDate.value);
  edit((f) => { f.steps.push({ id: newId(), name, days: n ?? 0, base: 'start' }); });
  addName.value = ''; addDate.value = '';
};
// 되돌릴 때는 빈 글자로 — undefined 는 저장 때 빠지고, 합쳐 쓰기(merge)라 예전 종결일이 서버에 그대로 남는다
// 확인창 — 앱과 같은 공용 창(AppConfirm). 종결 · 초기화는 한 번 더 묻는다
const confirmBox = ref<ConfirmBox | null>(null);
const endByDeal = () => {
  if (flow.value.endedAt) { edit((f) => { f.endedAt = ''; }); return; }   // 되돌리기는 바로
  confirmBox.value = {
    title: '명도 협의를 종결할까요?',
    desc: '명도 협의를 마치셨군요, 축하드려요. 종결하면 남은 단계는 진행하지 않는 것으로 표시됩니다. 적어 둔 날짜 · 완료 표시는 지워지지 않고, 나중에 되돌릴 수 있어요.',
    okLabel: '종결하기',
    skipKey: '',
    tone: 'calm',
    run: () => edit((f) => { f.endedAt = todayIso(); }),
  };
};
const resetDefault = () => {
  confirmBox.value = {
    title: '기본 절차로 초기화할까요?',
    desc: '고친 단계 · 더한 단계 · 완료 표시가 모두 지워지고 처음 절차로 돌아갑니다. 되돌릴 수 없어요.',
    okLabel: '초기화',
    skipKey: '',
    run: () => commit(defaultFlow()),
  };
};
</script>

<template>
  <section class="pwt">
    <header class="pwt-head">
      <h2>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
        진행절차
      </h2>
      <span v-if="auction?.caseNumber" class="pwt-cap">경매 <b>{{ auction.caseNumber }}</b> 사건을 기록 관리합니다</span>
      <button v-if="auction" type="button" :class="['pwt-btn', 'deal', { on: !!flow.endedAt }]" @click="endByDeal">{{ flow.endedAt ? `명도협의종결 (${flow.endedAt}) — 되돌리기` : '명도협의종결' }}</button>
      <button v-if="auction" type="button" class="pwt-btn" @click="resetDefault">초기화</button>
    </header>

    <p v-if="!auction" class="pwt-empty">위에서 낙찰 물건을 고르면 그 물건의 낙찰일부터 절차 일정이 잡힙니다.</p>
    <template v-else>
      <!-- 기준일 줄은 두지 않는다 — 낙찰일이 비었을 때만 알린다 -->
      <p v-if="!startDate" class="pwt-guide">낙찰일이 비어 있습니다 — 물건상세에서 낙찰일을 적어 주세요.</p>

      <!-- 구분 줄 — 왼쪽 법원 진행절차 · 오른쪽 해야 할 일(누르면 상세보기). 칸 폭은 아래 줄과 같다 -->
      <div class="pwt-colhead" aria-hidden="true">
        <span class="c-main">법원 진행절차</span>
        <span class="c-todo">해야 할 일<em>누르면 상세보기</em></span>
        <span class="c-ctrl" />
      </div>
      <ol class="pwt-list">
        <li
          v-for="r in rows"
          :key="r.id"
          :data-id="r.id"
          :class="['pwt-row', { done: !!r.doneDate, now: r.next, sel: selectedId === r.id, dragging: dragId === r.id }]"
          @pointerdown="onDragStart(r.id, $event)"
          @pointermove="onDragMove"
          @pointerup="onDragEnd"
          @pointercancel="onDragEnd"
        >
          <!-- 체크하면 그날로 적히고 뒤 일정이 따라 밀린다 -->
          <input type="checkbox" class="pwt-chk" :checked="!!r.doneDate" :aria-label="`${r.name} 마침`" @change="toggleDone(r.id)" />
          <div class="pwt-main">
            <template v-if="editingId === r.id">
              <div class="pwt-edit">
                <input v-model="draft.name" class="pwt-in" placeholder="단계 이름" :autofocus="freshId === r.id" @keyup.enter="saveEdit" />
                <input v-model="draft.date" type="date" class="pwt-in sm" />
                <span v-if="daysFromStart(draft.date) != null" class="pwt-unit">{{ startLabel }} 후 {{ daysFromStart(draft.date) }}일</span>
                <input v-model="draft.note" class="pwt-in" placeholder="설명" />
                <button type="button" class="pwt-btn primary" @click="saveEdit">저장</button>
                <button type="button" class="pwt-btn" @click="cancelEdit">취소</button>
              </div>
            </template>
            <template v-else>
              <p class="pwt-name">
                <!-- 완료(초록) · 진행(빨강) · 예정(파랑) — 이름 앞에 두어 칩 자리가 단계마다 같다 -->
                <span v-if="r.doneDate" class="pwt-chip done">완료</span>
                <span v-else-if="r.next" class="pwt-chip next">진행</span>
                <span v-else-if="!flow.endedAt" class="pwt-chip plan">예정</span>
                {{ r.name }}
              </p>
              <p class="pwt-meta">
                <b>{{ r.date || '—' }}</b>
                <span v-if="r.date && !r.doneDate" :class="['pwt-dday', { soon: r.dday <= 0 && r.dday >= -7 }]">{{ ddayText(r.dday) }}</span>
                <span class="pwt-base">{{ r.doneDate ? '완료일' : r.baseText }}</span>
              </p>
              <p v-if="r.note" class="pwt-note">{{ r.note }}</p>
            </template>
          </div>
          <!-- 이 단계에 해야 할 큰일 — 세부 체크는 바로가기로 간 절차상세에서 -->
          <ul v-if="editingId !== r.id && todosOf(r).length" class="pwt-todos">
            <!-- 한 줄은 글만(다 한 일은 회색) — 글을 누르면 그 상세(창) · 가이드(창) · 화면으로 -->
            <li v-for="t in todosOf(r)" :key="t.text" :class="['pwt-todo', { full: isFull(t) }]">
              <button type="button" class="pwt-todo-t" :title="goTitle(t)" @click="emit('go', t)">{{ t.text }}<i class="pwt-arrow">›</i></button>
            </li>
          </ul>
          <div v-if="editingId !== r.id" class="pwt-ctrl">
            <!-- 행삽입(고른 칸에서만) · 연필 · 지우기 — 다른 화면과 같은 둥근 네모 단추, 같은 크기 -->
            <button v-if="selectedId === r.id" type="button" class="ins" aria-label="아래로 행삽입" title="아래로 행삽입" @click="insertBelow(r.id)">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="8" rx="1.5" /><path d="M12 14v7M8.5 17.5h7" /></svg>
            </button>
            <button type="button" aria-label="고치기" title="고치기" @click="startEdit(r)">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
            </button>
            <button type="button" aria-label="지우기" title="지우기" @click="remove(r.id)">
              <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true"><path d="M2 2l10 10M12 2 2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
            </button>
          </div>
        </li>
      </ol>

      <!-- 단계 더하기는 칸을 고른 뒤 행삽입 단추로 — 단계가 하나도 없을 때만 여기서 -->
      <div v-if="!rows.length" class="pwt-add">
        <span class="pwt-add-lab">+ 단계 추가</span>
        <input v-model="addName" class="pwt-in" placeholder="예: 관리비 정산" @keyup.enter="addStep" />
        <input v-model="addDate" type="date" class="pwt-in sm" />
        <span v-if="daysFromStart(addDate) != null" class="pwt-unit">{{ startLabel }} 후 {{ daysFromStart(addDate) }}일</span>
        <button type="button" class="pwt-btn primary" :disabled="!addName.trim()" @click="addStep">추가</button>
      </div>
    </template>
    <AppConfirm :box="confirmBox" @close="confirmBox = null" />
  </section>
</template>

<style scoped>
.pwt { color-scheme: light; background: #fff; border-radius: 10px; padding: 18px 22px 20px; color: #111827; }
.pwt-head { display: flex; align-items: center; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid #eef1f6; }
.pwt-cap { font-size: 14px; color: #6b7280; }
.pwt-cap b { color: #111827; font-weight: 700; }
.pwt-head > button:first-of-type { margin-left: auto; }
.pwt-head h2 { margin: 0 12px 0 0; display: inline-flex; align-items: center; gap: 6px; font-size: 16px; font-weight: 800; color: #111827; }
.pwt-btn { height: 34px; padding: 0 14px; border: 1px solid #d5dbe6; border-radius: 8px; background: #fff; font: inherit; font-size: 14px; font-weight: 700; color: #374151; cursor: pointer; }
.pwt-btn:hover { background: #f5f7fb; }
.pwt-btn.deal.on { background: #374151; border-color: #374151; color: #fff; }
.pwt-btn.primary { border-color: #2b6df3; background: #2b6df3; color: #fff; }
.pwt-btn:disabled { opacity: .45; cursor: default; }
.pwt-guide { margin: 12px 0 10px; font-size: 14px; color: #6b7280; }
.pwt-empty { margin: 24px 0 8px; text-align: center; font-size: 14px; color: #6b7280; }
.pwt-colhead { display: flex; align-items: center; gap: 14px; margin-top: 12px; padding: 9px 11px; border-radius: 8px; background: #f5f7fa; font-size: 14px; font-weight: 700; color: #4b5563; }
.pwt-colhead .c-main { flex: 1 1 auto; min-width: 0; }
.pwt-colhead .c-todo { flex: 0 0 50%; padding-left: 17px; }
.pwt-colhead .c-todo em { margin-left: 8px; font-style: normal; font-weight: 400; color: #9ca3af; }
.pwt-colhead .c-ctrl { flex: 0 0 102px; }
.pwt-list { list-style: none; margin: 4px 0 0; padding: 0; }
.pwt-row { display: flex; align-items: flex-start; gap: 14px; padding: 14px 10px; border-bottom: 1px solid #eef1f6; border-radius: 8px; }
.pwt-row.done :is(.pwt-name, .pwt-meta, .pwt-note) { color: #9ca3af; }
/* 지금 시작할 단계(아직 체크 안 한 첫 단계) — 흐린 빨강 칸 */
.pwt-row.now { background: #fdeeee; border-bottom-color: transparent; }   /* 테두리 없이 바탕만 */
.pwt-chk { flex: 0 0 auto; width: 20px; height: 20px; margin: 2px 4px 0 0; accent-color: #2b6df3; cursor: pointer; }
.pwt-main { flex: 1 1 auto; min-width: 0; }
.pwt-name { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 800; }
/* 큰일 — 단계 옆 칸. 다 한 일은 초록 체크 · 회색 글 */
.pwt-todos { flex: 0 0 50%; margin: 0; padding: 0 0 0 16px; list-style: none; border-left: 1px solid #eef1f6; display: flex; flex-direction: column; gap: 6px; }
.pwt-todo { display: flex; align-items: center; gap: 8px; min-height: 28px; }
.pwt-todo-t { flex: 0 1 auto; max-width: 100%; min-width: 0; padding: 0; border: 0; background: none; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 15px; font-weight: 700; color: #111827; cursor: pointer; }
.pwt-todo-t:hover { text-decoration: underline; text-underline-offset: 3px; }
/* 누르는 자리는 글자 길이만큼 — 그 옆 빈 곳은 줄 고르기 · 끌어 옮기기. 화살표는 처음부터 보여 눌러도 된다는 걸 알린다 */
.pwt-arrow { margin-left: 5px; font-style: normal; color: #9ca3af; }
.pwt-todo-t:hover .pwt-arrow { color: #111827; }
.pwt-todo.full .pwt-todo-t { color: #9ca3af; }
.pwt-chip { display: inline-flex; align-items: center; height: 18px; padding: 0 5px; border-radius: 5px; font-size: 12px; font-weight: 700; line-height: 1; }
.pwt-chip.done { background: #4f9a68; color: #fff; }
.pwt-chip.next { background: #c95b5b; color: #fff; }
.pwt-chip.plan { background: #4f72b8; color: #fff; }
.pwt-meta { margin: 6px 0 0; display: flex; align-items: baseline; gap: 8px; font-size: 14px; }
.pwt-meta b { font-weight: 700; }
.pwt-dday { font-weight: 800; color: #111827; }
.pwt-dday.soon { color: #dc2626; }   /* 7일 안쪽만 빨강, 나머지는 검정 */
.pwt-base { color: #9ca3af; }
.pwt-note { margin: 5px 0 0; font-size: 14px; color: #4b5563; }
.pwt-ctrl { flex: 0 0 102px; display: flex; justify-content: flex-end; gap: 6px; }   /* 단추 세 개(행삽입 · 연필 · 지우기) 자리를 늘 잡아 둔다 — 골라도 큰일 글이 밀리지 않게 */
.pwt-ctrl button { width: 30px; height: 30px; padding: 0; border: 1px solid #e3e8f0; border-radius: 6px; background: #fff; color: #4b5563; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; line-height: 0; }
.pwt-ctrl button:hover { background: #f3f4f6; color: #111827; }
/* 끌어 옮기기 — 상자를 잡으면 파란 테두리 · 옅은 파랑 바탕, 체크 상자도 파랗게 테를 두른다 */
.pwt-row { cursor: grab; touch-action: none; user-select: none; border: 1px solid transparent; border-bottom-color: #eef1f6; }
.pwt-row:active { cursor: grabbing; }
.pwt-row.sel { border-color: #2b6df3; }
.pwt-ctrl button.ins { color: #2b6df3; border-color: #bcd0f7; }
.pwt-row.dragging { border-color: #2b6df3; border-width: 2px; padding: 13px 9px; background: #e8f0ff; box-shadow: 0 6px 16px rgba(43, 109, 243, .18); }
.pwt-row.dragging .pwt-chk { outline: 2px solid #2b6df3; outline-offset: 2px; }
.pwt-row :is(input, button, select) { cursor: pointer; }
.pwt-row input:not([type=checkbox]) { cursor: text; user-select: text; }
.pwt-edit, .pwt-add { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.pwt-add { margin-top: 16px; padding: 14px; border: 1px dashed #d5dbe6; border-radius: 10px; background: #fafbfd; }
.pwt-add-lab { font-size: 14px; font-weight: 800; color: #374151; }
.pwt-in { height: 36px; padding: 0 10px; border: 1px solid #d5dbe6; border-radius: 8px; font: inherit; font-size: 14px; color: #111827; background: #fff; flex: 1 1 200px; min-width: 0; }
.pwt-in.sm { flex: 0 0 150px; }
.pwt-in.xs { flex: 0 0 80px; text-align: right; }
.pwt-unit { font-size: 14px; color: #6b7280; }
</style>
