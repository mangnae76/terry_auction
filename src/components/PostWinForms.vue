<script setup lang="ts">
// 낙찰이후 · 서식 창(웹) — 고른 물건의 사건번호 · 법원 · 주소를 채운 서식을 보여 주고, 고쳐서 복사 · 인쇄한다.
// 낙찰자 이름 · 연락처는 이 브라우저에 기억하고, 점유자 이름 · 날짜는 물건마다 기억한다.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { AuctionDetail } from '../types/auction';
import { FIELD_LABEL, FORMS, type FormCtx, type FormField, type FormKey } from '../services/postWinForms';
import { courtInfoOf } from '../utils/auctionSummary';

const props = defineProps<{ auction: AuctionDetail | null; keys: FormKey[] }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const ME_KEY = 'pw.forms.me';
const itemKey = () => `pw.forms.item.${props.auction?.id ?? ''}`;
const read = (k: string): Record<string, string> => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { return {}; } };
const write = (k: string, val: Record<string, string>) => { try { localStorage.setItem(k, JSON.stringify(val)); } catch { /* 그만 */ } };

const today = () => { const d = new Date(); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };
const me = ref<{ winner: string; phone: string }>({ winner: '', phone: '', ...read(ME_KEY) });
const item = ref<Record<FormField, string>>({ occupant: '', balanceDate: '', deadline: '', execDate: '', moveDate: '', amount: '', ...read(itemKey()) });
if (!item.value.balanceDate && props.auction?.balanceDueDate) item.value.balanceDate = props.auction.balanceDueDate;
watch(me, (x) => write(ME_KEY, x), { deep: true });
watch(item, (x) => write(itemKey(), x), { deep: true });

const cur = ref<FormKey>(props.keys[0]);
const form = computed(() => FORMS[cur.value]);
const ctx = computed<FormCtx>(() => ({
  caseNo: props.auction?.caseNumber ?? '',
  court: props.auction ? courtInfoOf(props.auction).name : '',
  address: props.auction?.address ?? '',
  winner: me.value.winner,
  phone: me.value.phone,
  ...item.value,
  today: today(),
}));
/** 본문 — 칸을 고치면 새로 쓰고, 그 뒤 손으로 고친 글은 칸을 다시 고치기 전까지 둔다 */
const text = ref('');
watch([ctx, cur], () => { text.value = form.value.body(ctx.value); }, { immediate: true, deep: true });

const copied = ref(false);
const copy = async () => {
  try { await navigator.clipboard.writeText(text.value); copied.value = true; window.setTimeout(() => { copied.value = false; }, 1500); } catch { /* 그만 */ }
};
const esc = (s: string) => s.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] as string));
const print = () => {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(form.value.title)}</title>
<style>body{font-family:'Noto Sans KR','Apple SD Gothic Neo',sans-serif;margin:48px;color:#111}pre{white-space:pre-wrap;font:inherit;font-size:15px;line-height:1.9}</style></head>
<body><pre>${esc(text.value)}</pre><script>window.onload=()=>{window.print();}<\/script></body></html>`);
  w.document.close();
};
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close'); };
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="pwf-veil" @click="emit('close')" />
  <div class="pwf" role="dialog" :aria-label="form.title">
    <header class="pwf-head">
      <h2>서식</h2>
      <span v-if="keys.length > 1" class="pwf-tabs">
        <button v-for="k in keys" :key="k" type="button" :class="{ on: cur === k }" @click="cur = k">{{ FORMS[k].title }}</button>
      </span>
      <b v-else class="pwf-name">{{ form.title }}</b>
      <button type="button" class="pwf-x" aria-label="닫기" @click="emit('close')">
        <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true"><path d="M2 2l10 10M12 2 2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
      </button>
    </header>
    <div class="pwf-body">
      <!-- 적는 칸 — 낙찰자는 늘, 나머지는 이 서식에 쓰는 것만 -->
      <div class="pwf-fields">
        <label><span>낙찰자 이름</span><input v-model="me.winner" placeholder="홍길동" /></label>
        <label><span>연락처</span><input v-model="me.phone" placeholder="010-0000-0000" /></label>
        <label v-for="f in form.fields" :key="f"><span>{{ FIELD_LABEL[f] }}</span><input v-model="item[f]" :placeholder="f === 'amount' ? '1,000,000' : f === 'occupant' ? '' : '2026년 11월 30일'" /></label>
      </div>
      <p class="pwf-auto">사건번호 · 법원 · 주소는 고른 물건에서 자동으로 넣었습니다. 아래 글은 고쳐 쓸 수 있습니다.</p>
      <textarea v-model="text" class="pwf-text" spellcheck="false" />
    </div>
    <footer class="pwf-foot">
      <button type="button" class="pwf-btn" @click="copy">{{ copied ? '복사됨' : '복사' }}</button>
      <button type="button" class="pwf-btn primary" @click="print">인쇄</button>
    </footer>
  </div>
</template>

<style scoped>
.pwf-veil { position: fixed; inset: 0; z-index: 950; background: rgba(15, 23, 42, .45); }
.pwf { position: fixed; z-index: 951; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(820px, calc(100vw - 32px)); max-height: calc(100vh - 64px);
  display: flex; flex-direction: column; color-scheme: light; background: #fff; color: #111827; border-radius: 12px; box-shadow: 0 20px 48px rgba(15, 23, 42, .28); }
.pwf-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px 12px 20px; border-bottom: 1px solid #eef1f6; }
.pwf-head h2 { margin: 0; font-size: 16px; font-weight: 800; }
.pwf-name { font-size: 15px; color: #374151; }
.pwf-tabs { display: inline-flex; gap: 4px; }
.pwf-tabs button { height: 30px; padding: 0 10px; border: 1px solid #e3e8f0; border-radius: 6px; background: #fff; color: #6b7280; font-size: 14px; cursor: pointer; }
.pwf-tabs button:hover { color: #111827; }
.pwf-tabs button.on { border-color: #1f2a44; background: #1f2a44; color: #fff; }
.pwf-x { margin-left: auto; width: 26px; height: 26px; padding: 0; border: 1px solid #e3e8f0; border-radius: 6px; background: #fff; color: #4b5563; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.pwf-x:hover { background: #f3f4f6; color: #111827; }
.pwf-body { padding: 14px 20px; overflow: auto; }
.pwf-fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px 12px; }
.pwf-fields label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; color: #4b5563; }
.pwf-fields input { height: 34px; padding: 0 10px; border: 1px solid #d0d5dd; border-radius: 6px; font-size: 14px; color: #111827; background: #fff; }
.pwf-auto { margin: 12px 0 6px; font-size: 14px; color: #6b7280; }
.pwf-text { width: 100%; min-height: 340px; padding: 14px; box-sizing: border-box; border: 1px solid #d0d5dd; border-radius: 8px; font: inherit; font-size: 14px; line-height: 1.8; color: #111827; background: #fafbfc; resize: vertical; }
.pwf-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px 16px; border-top: 1px solid #eef1f6; }
.pwf-btn { height: 34px; padding: 0 16px; border: 1px solid #d0d5dd; border-radius: 6px; background: #fff; color: #374151; font-size: 14px; font-weight: 600; cursor: pointer; }
.pwf-btn.primary { border-color: #1f2a44; background: #1f2a44; color: #fff; }
</style>
