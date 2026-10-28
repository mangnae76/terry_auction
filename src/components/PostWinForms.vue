<script setup lang="ts">
// 낙찰이후 · 서식 창(웹) — 위쪽 '들어갈 값'을 채운 문서를 보여 주고, [편집]으로 글을 고쳐 [저장]하면 이 물건의 문서로 남는다.
// [초기화]는 들어갈 값(사건 카드에서 다시)과 글(기본 서식)을 함께 처음으로 돌린다. 저장 · 인쇄처럼 결과를 내는 단추는 파란색.
// 사건번호 · 법원 · 주소는 사건 카드에서 가져온다. 낙찰자 이름 · 연락처는 이 브라우저에, 나머지 값은 물건마다 기억한다.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { AuctionDetail } from '../types/auction';
import { FORMS, FORM_TAB, TOKENS, defaultTemplate, fillTemplate, tokensIn, type FormCtx, type FormKey } from '../services/postWinForms';
import { courtInfoOf } from '../utils/auctionSummary';
import { useAuctionStore } from '../stores/auctionStore';

const props = defineProps<{ auction: AuctionDetail | null; keys: FormKey[] }>();
const emit = defineEmits<{ (e: 'close'): void }>();
const store = useAuctionStore();

// ===== 들어갈 값 =====
const ME_KEY = 'pw.forms.me';
const itemKey = () => `pw.forms.item.${props.auction?.id ?? ''}`;
const read = (k: string): Record<string, string> => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { return {}; } };
const write = (k: string, val: Record<string, string>) => { try { localStorage.setItem(k, JSON.stringify(val)); } catch { /* 그만 */ } };
const todayText = () => { const d = new Date(); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };
const a = props.auction;
/** 사건 카드에서 오는 처음 값 */
const fresh = (): FormCtx => ({
  caseNo: a?.caseNumber ?? '',
  court: a ? courtInfoOf(a).name : '',
  address: a?.address ?? '',
  winner: '',
  phone: '',
  occupant: '',
  balanceDate: a?.balanceDueDate ?? '',
  deadline: '',
  execDate: '',
  moveDate: '',
  amount: '',
  today: todayText(),
});
/** 기억해 둔 값 중 빈 칸은 버린다 — 빈 값이 사건 카드 값을 덮어쓰지 않게 */
const filled = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, x]) => String(x ?? '').trim()));
const vals = ref<FormCtx>({ ...fresh(), ...filled(read(itemKey())), ...filled(read(ME_KEY)) });
watch(vals, (x) => {
  write(ME_KEY, { winner: x.winner, phone: x.phone });
  const { winner: _w, phone: _p, today: _t, ...rest } = x;
  write(itemKey(), rest as unknown as Record<string, string>);
}, { deep: true });

// ===== 탭(내용증명 1 · 2 · 3차처럼 여럿일 때) — 새로고침 뒤에도 그대로 =====
const CUR_SS = 'pw.form.cur';
const cur = ref<FormKey>((() => { try { const k = sessionStorage.getItem(CUR_SS) as FormKey | null; return k && props.keys.includes(k) ? k : props.keys[0]; } catch { return props.keys[0]; } })());
watch(cur, (k) => { try { sessionStorage.setItem(CUR_SS, k); } catch { /* 그만 */ } }, { immediate: true });
const form = computed(() => FORMS[cur.value]);

// ===== 문서 글 — 이 물건에 저장한 글이 있으면 그것, 없으면 기본 서식에 값을 채운 글 =====
const savedText = computed(() => (props.auction?.postWinDocs?.[cur.value] ?? '').trim() ? props.auction!.postWinDocs![cur.value] : '');
const text = computed(() => savedText.value || fillTemplate(defaultTemplate(cur.value), vals.value));
/** 이 서식에 쓰는 값 칸만 */
const fields = computed(() => tokensIn(defaultTemplate(cur.value)));
const LABEL = new Map(TOKENS.map(([, k, label]) => [k, label]));
const AUTO: Array<keyof FormCtx> = ['caseNo', 'court', 'address'];

// ===== 편집 · 저장 · 초기화 =====
const editing = ref(false);
const draft = ref('');
const startEdit = () => { draft.value = text.value; editing.value = true; };
watch(cur, () => { editing.value = false; });
const msg = ref('');
const flash = (m: string) => { msg.value = m; window.setTimeout(() => { if (msg.value === m) msg.value = ''; }, 1800); };
const saveDoc = async (body: string) => {
  const au = props.auction;
  if (!au) return;
  // 빈 글('')로 덮어써야 merge 저장에서 예전 글이 남지 않는다
  au.postWinDocs = { ...(au.postWinDocs ?? {}), [cur.value]: body };
  try { await store.saveAuction(au); } catch { flash('저장하지 못했습니다 — 잠시 뒤 다시 눌러 주세요'); throw new Error('save'); }
};
const save = async () => { try { await saveDoc(draft.value); editing.value = false; flash('저장했습니다'); } catch { /* 글은 편집 칸에 그대로 */ } };
const reset = async () => {
  if (!window.confirm('초기화할까요? 들어갈 값은 사건 카드 값으로, 글은 처음 서식으로 돌아갑니다.')) return;
  const me = { winner: vals.value.winner, phone: vals.value.phone };   // 낙찰자 이름 · 연락처는 남긴다
  vals.value = { ...fresh(), ...me };
  editing.value = false;
  try { await saveDoc(''); flash('초기화했습니다'); } catch { /* 위에서 알렸다 */ }
};

// ===== 복사 · 인쇄 =====
const copy = async () => { try { await navigator.clipboard.writeText(text.value); flash('복사했습니다'); } catch { /* 그만 */ } };
const esc = (s: string) => s.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] as string));
const print = () => {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(form.value.title)}</title>
<style>body{font-family:'Noto Sans KR','Apple SD Gothic Neo',sans-serif;margin:48px;color:#111}pre{white-space:pre-wrap;font:inherit;font-size:15px;line-height:1.9}</style></head>
<body><pre>${esc(text.value)}</pre><script>window.onload=()=>{window.print();}<\/script></body></html>`);
  w.document.close();
};
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editing.value) emit('close'); };
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="pwf-veil" @click="emit('close')" />
  <div class="pwf" role="dialog" :aria-label="form.title">
    <header class="pwf-head">
      <span v-if="keys.length > 1" class="pwf-tabs">
        <button v-for="k in keys" :key="k" type="button" :class="{ on: cur === k }" @click="cur = k">{{ FORM_TAB[k] }}</button>
      </span>
      <h2 v-else>{{ form.title }}</h2>
      <button type="button" class="pwf-x" aria-label="닫기" @click="emit('close')">
        <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true"><path d="M2 2l10 10M12 2 2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
      </button>
    </header>
    <div class="pwf-body">
      <!-- 들어갈 값 — 사건번호 · 법원 · 주소는 사건 카드에서 -->
      <div class="pwf-sub"><b>들어갈 값</b></div>
      <div class="pwf-fields">
        <label v-for="k in fields" :key="k" :class="{ wide: k === 'address', auto: AUTO.includes(k) }">
          <span>{{ LABEL.get(k) }}</span>
          <input v-model="vals[k]" :disabled="editing" />
        </label>
      </div>
      <p v-if="savedText && !editing" class="pwf-hint">저장한 글이라 위 값을 바꿔도 글은 그대로예요 — 초기화하면 다시 채워집니다</p>

      <div class="pwf-sub">
        <b>내용</b>
        <button v-if="!editing" type="button" class="pwf-btn sm" @click="startEdit">편집</button>
      </div>
      <textarea v-if="editing" v-model="draft" class="pwf-text" spellcheck="false" />
      <pre v-else class="pwf-text pwf-pre">{{ text }}</pre>
    </div>
    <footer class="pwf-foot">
      <button type="button" class="pwf-btn" @click="reset">초기화</button>
      <span class="pwf-msg">{{ msg }}</span>
      <template v-if="editing">
        <button type="button" class="pwf-btn" @click="editing = false">취소</button>
        <button type="button" class="pwf-btn primary" @click="save">저장</button>
      </template>
      <template v-else>
        <button type="button" class="pwf-btn" @click="copy">복사</button>
        <button type="button" class="pwf-btn primary" @click="print">인쇄</button>
      </template>
    </footer>
  </div>
</template>

<style scoped>
.pwf-veil { position: fixed; inset: 0; z-index: 950; background: rgba(15, 23, 42, .45); }
.pwf { position: fixed; z-index: 951; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(860px, calc(100vw - 32px)); max-height: calc(100vh - 48px);
  display: flex; flex-direction: column; color-scheme: light; background: #fff; color: #111827; border-radius: 12px; box-shadow: 0 20px 48px rgba(15, 23, 42, .28); }
.pwf-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px 12px 20px; border-bottom: 1px solid #eef1f6; }
.pwf-head h2 { margin: 0; font-size: 16px; font-weight: 800; }
.pwf-tabs { display: inline-flex; gap: 4px; }
.pwf-tabs button { height: 30px; padding: 0 10px; border: 1px solid #e3e8f0; border-radius: 6px; background: #fff; color: #6b7280; font-size: 14px; cursor: pointer; }
.pwf-tabs button:hover { color: #111827; }
.pwf-tabs button.on { border-color: #2b6df3; background: #2b6df3; color: #fff; }
.pwf-x { margin-left: auto; width: 26px; height: 26px; padding: 0; border: 1px solid #e3e8f0; border-radius: 6px; background: #fff; color: #4b5563; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.pwf-x:hover { background: #f3f4f6; color: #111827; }
.pwf-body { padding: 14px 20px; overflow: auto; }
.pwf-sub { display: flex; align-items: center; gap: 10px; margin: 4px 0 8px; }
.pwf-sub b { font-size: 15px; color: #111827; }
.pwf-sub .pwf-btn { margin-left: auto; }
.pwf-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 12px; margin-bottom: 16px; }
.pwf-fields label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; color: #4b5563; }
.pwf-fields label.wide { grid-column: span 3; }
.pwf-fields input { height: 34px; padding: 0 10px; border: 1px solid #d0d5dd; border-radius: 6px; font-size: 14px; color: #111827; background: #fff; }
.pwf-fields input:disabled { color: #9ca3af; background: #f5f6f8; }
.pwf-fields label.auto input:not(:disabled) { background: #f5f8ff; }
.pwf-hint { margin: -8px 0 14px; font-size: 14px; color: #9ca3af; }
.pwf-text { display: block; width: 100%; min-height: 320px; margin: 0; padding: 14px; box-sizing: border-box; border: 1px solid #d0d5dd; border-radius: 8px; font: inherit; font-size: 14px; line-height: 1.8; color: #111827; background: #fff; resize: vertical; }
.pwf-pre { white-space: pre-wrap; background: #fafbfc; }
.pwf-foot { display: flex; align-items: center; gap: 8px; padding: 12px 20px 16px; border-top: 1px solid #eef1f6; }
.pwf-msg { margin-right: auto; font-size: 14px; color: #2f7d4a; }
.pwf-btn { height: 34px; padding: 0 16px; border: 1px solid #d0d5dd; border-radius: 6px; background: #fff; color: #374151; font-size: 14px; font-weight: 600; cursor: pointer; }
.pwf-btn:hover { background: #f3f4f6; }
.pwf-btn.sm { height: 30px; padding: 0 12px; }
/* 결과를 내는 단추(저장 · 인쇄)는 파란색 */
.pwf-btn.primary { border-color: #2b6df3; background: #2b6df3; color: #fff; }
.pwf-btn.primary:hover { background: #1f5ad6; }
</style>
