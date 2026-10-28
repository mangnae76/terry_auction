<script setup lang="ts">
// 낙찰이후 · 서식 창(웹) — 위쪽 칸(사건번호 · 주소 · 이름 · 날짜)의 값을 서식의 {자리표}에 채워 보여 준다.
// 서식 글은 '서식 고치기'에서 고쳐 계정에 저장한다(어느 물건 · 어느 기기에서 열어도 내 서식). 기본 서식으로 언제든 되돌린다.
// 사건번호 · 법원 · 주소는 고른 물건에서 가져오고, 고친 값은 물건마다 기억한다. 낙찰자 이름 · 연락처는 이 브라우저에 기억한다.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { AuctionDetail } from '../types/auction';
import { FORMS, FORM_TAB, TOKENS, defaultTemplate, fillTemplate, tokensIn, type FormCtx, type FormKey } from '../services/postWinForms';
import { courtInfoOf } from '../utils/auctionSummary';
import { useAuthStore } from '../stores/authStore';
import { loadUserPrefs, saveUserPrefs } from '../services/userPrefsRepository';

const props = defineProps<{ auction: AuctionDetail | null; keys: FormKey[] }>();
const emit = defineEmits<{ (e: 'close'): void }>();
const auth = useAuthStore();

// ===== 위쪽 칸의 값 =====
const ME_KEY = 'pw.forms.me';
const itemKey = () => `pw.forms.item.${props.auction?.id ?? ''}`;
const read = (k: string): Record<string, string> => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { return {}; } };
const write = (k: string, val: Record<string, string>) => { try { localStorage.setItem(k, JSON.stringify(val)); } catch { /* 그만 */ } };
const todayText = () => { const d = new Date(); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };
const a = props.auction;
const vals = ref<FormCtx>({
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
  ...read(itemKey()),
  ...read(ME_KEY),
});
watch(vals, (x) => {
  write(ME_KEY, { winner: x.winner, phone: x.phone });
  const { winner: _w, phone: _p, today: _t, ...rest } = x;
  write(itemKey(), rest as unknown as Record<string, string>);
}, { deep: true });
/** 사건 카드에서 다시 가져오기 — 칸을 지웠거나 고친 것을 되돌린다 */
const refill = () => {
  if (!a) return;
  vals.value.caseNo = a.caseNumber ?? '';
  vals.value.court = courtInfoOf(a).name;
  vals.value.address = a.address ?? '';
};

// ===== 서식 글 — 저장한 내 서식, 없으면 기본 서식 =====
const saved = ref<Record<string, string>>({});
onMounted(async () => {
  const prefs = await loadUserPrefs(auth.uid);
  saved.value = { ...(prefs?.postWinForms ?? {}) };
});
// 고른 탭도 새로고침 뒤 그대로
const CUR_SS = 'pw.form.cur';
const cur = ref<FormKey>((() => { try { const k = sessionStorage.getItem(CUR_SS) as FormKey | null; return k && props.keys.includes(k) ? k : props.keys[0]; } catch { return props.keys[0]; } })());
watch(cur, (k) => { try { sessionStorage.setItem(CUR_SS, k); } catch { /* 그만 */ } }, { immediate: true });
const form = computed(() => FORMS[cur.value]);
const isMine = computed(() => !!(saved.value[cur.value] ?? '').trim());
const template = computed(() => (isMine.value ? saved.value[cur.value] : defaultTemplate(cur.value)));
const preview = computed(() => fillTemplate(template.value, vals.value));
/** 이 서식에 쓰는 칸만 — 자리표가 있는 것 */
const fields = computed(() => tokensIn(template.value));
const LABEL = new Map(TOKENS.map(([, k, label]) => [k, label]));
const TOKEN_OF = new Map(TOKENS.map(([t, k]) => [k, t]));
const AUTO: Array<keyof FormCtx> = ['caseNo', 'court', 'address'];

// ===== 서식 고치기 =====
const editing = ref(false);
const draft = ref('');
const area = ref<HTMLTextAreaElement | null>(null);
const startEdit = () => { draft.value = template.value; editing.value = true; };
watch(cur, () => { editing.value = false; });
/** 자리표 넣기 — 커서 자리에 */
const putToken = (k: keyof FormCtx) => {
  const t = `{${TOKEN_OF.get(k)}}`;
  const el = area.value;
  if (!el) { draft.value += t; return; }
  const s = el.selectionStart ?? draft.value.length; const e = el.selectionEnd ?? s;
  draft.value = draft.value.slice(0, s) + t + draft.value.slice(e);
  requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + t.length; });
};
const msg = ref('');
const flash = (m: string) => { msg.value = m; window.setTimeout(() => { if (msg.value === m) msg.value = ''; }, 1800); };
const persist = async (text: string) => {
  saved.value = { ...saved.value, [cur.value]: text };
  // 빈 글('')로 덮어써야 merge 저장에서 예전 글이 남지 않는다
  await saveUserPrefs(auth.uid, { postWinForms: { [cur.value]: text } });
};
const saveDraft = async () => { await persist(draft.value.trim() === defaultTemplate(cur.value).trim() ? '' : draft.value); editing.value = false; flash('내 서식으로 저장했습니다'); };
const resetDefault = async () => {
  if (!window.confirm('기본 서식으로 되돌릴까요? 고쳐 저장한 글은 지워집니다.')) return;
  await persist(''); draft.value = defaultTemplate(cur.value); editing.value = false; flash('기본 서식으로 되돌렸습니다');
};

// ===== 복사 · 인쇄 =====
const copy = async () => { try { await navigator.clipboard.writeText(preview.value); flash('복사했습니다'); } catch { /* 그만 */ } };
const esc = (s: string) => s.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] as string));
const print = () => {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(form.value.title)}</title>
<style>body{font-family:'Noto Sans KR','Apple SD Gothic Neo',sans-serif;margin:48px;color:#111}pre{white-space:pre-wrap;font:inherit;font-size:15px;line-height:1.9}</style></head>
<body><pre>${esc(preview.value)}</pre><script>window.onload=()=>{window.print();}<\/script></body></html>`);
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
      <em v-if="isMine" class="pwf-mine">내서식</em>
      <button type="button" class="pwf-x" aria-label="닫기" @click="emit('close')">
        <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true"><path d="M2 2l10 10M12 2 2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
      </button>
    </header>
    <div class="pwf-body">
      <!-- 서식에 들어갈 값 — 글을 고치다 지워지지 않게 위에 따로 둔다 -->
      <div class="pwf-sub">
        <b>들어갈 값</b>
        <span>사건번호 · 법원 · 주소는 사건 카드에서 가져왔습니다</span>
        <button type="button" class="pwf-link" @click="refill">다시가져오기</button>
      </div>
      <div class="pwf-fields">
        <label v-for="k in fields" :key="k" :class="{ wide: k === 'address', auto: AUTO.includes(k) }">
          <span>{{ LABEL.get(k) }}</span>
          <input v-model="vals[k]" />
        </label>
      </div>

      <div class="pwf-sub">
        <b>{{ editing ? '서식 고치기' : '미리보기' }}</b>
        <span v-if="editing">{자리표} 자리에 위의 값이 들어갑니다 — 아래 단추로 넣을 수 있어요</span>
        <span v-else>값이 채워진 글입니다</span>
        <button v-if="!editing" type="button" class="pwf-link" @click="startEdit">서식고치기</button>
      </div>
      <template v-if="editing">
        <div class="pwf-tokens">
          <button v-for="[t, k] in TOKENS" :key="t" type="button" @click="putToken(k)">{{ '{' + t + '}' }}</button>
        </div>
        <textarea ref="area" v-model="draft" class="pwf-text" spellcheck="false" />
      </template>
      <pre v-else class="pwf-text pwf-pre">{{ preview }}</pre>
    </div>
    <footer class="pwf-foot">
      <span class="pwf-msg">{{ msg }}</span>
      <template v-if="editing">
        <button type="button" class="pwf-btn ghost" @click="resetDefault">기본서식으로</button>
        <button type="button" class="pwf-btn" @click="editing = false">취소</button>
        <button type="button" class="pwf-btn primary" @click="saveDraft">저장</button>
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
.pwf-mine { font-style: normal; height: 22px; padding: 0 8px; display: inline-flex; align-items: center; border-radius: 6px; background: #e6f4ea; color: #2f7d4a; font-size: 14px; font-weight: 700; }
.pwf-tabs { display: inline-flex; gap: 4px; }
.pwf-tabs button { height: 30px; padding: 0 10px; border: 1px solid #e3e8f0; border-radius: 6px; background: #fff; color: #6b7280; font-size: 14px; cursor: pointer; }
.pwf-tabs button:hover { color: #111827; }
.pwf-tabs button.on { border-color: #1f2a44; background: #1f2a44; color: #fff; }
.pwf-x { margin-left: auto; width: 26px; height: 26px; padding: 0; border: 1px solid #e3e8f0; border-radius: 6px; background: #fff; color: #4b5563; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.pwf-x:hover { background: #f3f4f6; color: #111827; }
.pwf-body { padding: 14px 20px; overflow: auto; }
.pwf-sub { display: flex; align-items: baseline; gap: 10px; margin: 4px 0 8px; font-size: 14px; color: #6b7280; }
.pwf-sub b { font-size: 15px; color: #111827; }
.pwf-sub + .pwf-fields { margin-bottom: 16px; }
.pwf-link { margin-left: auto; border: 0; background: none; padding: 0; color: #2b6df3; font-size: 14px; cursor: pointer; }
.pwf-link:hover { text-decoration: underline; text-underline-offset: 3px; }
.pwf-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 12px; }
.pwf-fields label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; color: #4b5563; }
.pwf-fields label.wide { grid-column: span 3; }
.pwf-fields input { height: 34px; padding: 0 10px; border: 1px solid #d0d5dd; border-radius: 6px; font-size: 14px; color: #111827; background: #fff; }
.pwf-fields label.auto input { background: #f5f8ff; }
.pwf-tokens { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.pwf-tokens button { height: 26px; padding: 0 8px; border: 1px solid #c7d6f5; border-radius: 6px; background: #f2f6fe; color: #2b5fc4; font-size: 14px; cursor: pointer; }
.pwf-text { display: block; width: 100%; min-height: 320px; margin: 0; padding: 14px; box-sizing: border-box; border: 1px solid #d0d5dd; border-radius: 8px; font: inherit; font-size: 14px; line-height: 1.8; color: #111827; background: #fff; resize: vertical; }
.pwf-pre { white-space: pre-wrap; background: #fafbfc; }
.pwf-foot { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 20px 16px; border-top: 1px solid #eef1f6; }
.pwf-msg { margin-right: auto; font-size: 14px; color: #2f7d4a; }
.pwf-btn { height: 34px; padding: 0 16px; border: 1px solid #d0d5dd; border-radius: 6px; background: #fff; color: #374151; font-size: 14px; font-weight: 600; cursor: pointer; }
.pwf-btn.ghost { border-color: transparent; color: #6b7280; }
.pwf-btn.ghost:hover { color: #111827; }
.pwf-btn.primary { border-color: #1f2a44; background: #1f2a44; color: #fff; }
</style>
