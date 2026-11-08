<script setup lang="ts">
// 운영 › 약관 관리 — 이용약관 · 개인정보처리방침 · 환불정책 · 저작권정책 · 사업제휴 글(DB legalDocs).
// 처음엔 코드 글을 간단 표기로 불러와 고친다. 저장하면 지금 판은 '지난 판'으로 남고 새 판이 앱 · 웹 · 대문에 바로 나간다.
import { computed, ref, watch } from 'vue';
import { useAuthStore } from '../stores/authStore';
import { userMessage } from '../services/userMessage';
import { legalDoc } from '../services/legalDocs';
import { htmlToMarkup, legalFromDb, loadLegalHistory, markupToHtml, saveLegal, startContentSync, type LegalKey } from '../services/contentRepository';

startContentSync();
const auth = useAuthStore();
const DOCS: Array<[LegalKey, string]> = [['terms', '이용약관'], ['privacy', '개인정보처리방침'], ['refund', '환불정책'], ['copyright', '저작권정책'], ['partner', '사업제휴']];

const key = ref<LegalKey>('terms');
const markup = ref('');
const effective = ref('');
const dirty = ref(false);
const preview = ref(false);
const fromDb = computed(() => !!legalFromDb(key.value));
/** 고를 때 · DB 판이 늦게 올 때(손대기 전) — DB 판의 간단 표기, 없으면 코드 글을 바꿔 불러온다 */
const fill = () => {
  const db = legalFromDb(key.value);
  markup.value = db?.markup || htmlToMarkup(legalDoc(key.value)?.html ?? '');
  effective.value = db?.effective ?? '';
  dirty.value = false;
};
fill();
watch(key, () => { history.value = null; fill(); });
watch(() => legalFromDb(key.value)?.updatedAt, () => { if (!dirty.value) fill(); });
const html = computed(() => markupToHtml(markup.value));

const msg = ref('');
let msgTimer = 0;
const flash = (t: string, ms = 2600) => { msg.value = t; window.clearTimeout(msgTimer); msgTimer = window.setTimeout(() => { msg.value = ''; }, ms); };
const saving = ref(false);
const save = async () => {
  if (!markup.value.trim()) { flash('글이 비어 있습니다.'); return; }
  saving.value = true;
  try {
    await saveLegal(key.value, markup.value, effective.value, auth.email || '운영자', legalFromDb(key.value)?.html ?? legalDoc(key.value)?.html ?? '');
    dirty.value = false;
    history.value = null;
    flash('새 판을 저장했습니다. 앱 · 웹 · 대문에 바로 보입니다.');
  } catch (e) {
    flash(userMessage(e, '저장하지 못했습니다. 잠시 뒤 다시 해 주세요.'), 5000);
  } finally {
    saving.value = false;
  }
};

const history = ref<Awaited<ReturnType<typeof loadLegalHistory>> | null>(null);
const openHist = ref('');
const showHistory = async () => {
  try { history.value = await loadLegalHistory(key.value); } catch (e) { flash(userMessage(e, '지난 판을 불러오지 못했습니다.')); }
};
</script>

<template>
  <section class="adb-card alg">
    <div class="alg-tabs" role="tablist">
      <button v-for="[k, t] in DOCS" :key="k" type="button" role="tab" :class="{ on: key === k }" :aria-selected="key === k" @click="key = k">{{ t }}</button>
    </div>
    <p class="alg-note">
      {{ fromDb ? `DB에 저장된 판입니다(${legalFromDb(key)?.updatedAt.slice(0, 10).replace(/-/g, '.')} · ${legalFromDb(key)?.updatedBy}).` : '아직 DB에 저장한 적이 없어 지금 화면에 나가는 글을 불러왔습니다.' }}
      적는 법 — <b># 큰 제목</b>, <b>## 작은 제목</b>, <b>- 점 목록</b>, <b>1. 번호 목록</b>, <b>**굵게**</b>, 빈 줄은 문단 사이. &lt; 로 시작하는 줄(표 · 연락처 상자)은 그대로 둡니다.
    </p>
    <label class="alg-row"><span>시행일</span><input v-model="effective" type="text" placeholder="예) 2026년 12월 1일 (글 안 부칙도 같이 고쳐 주세요)" @input="dirty = true" /></label>
    <div class="alg-mode">
      <button type="button" :class="{ on: !preview }" @click="preview = false">고치기</button>
      <button type="button" :class="{ on: preview }" @click="preview = true">미리보기</button>
    </div>
    <textarea v-if="!preview" v-model="markup" class="alg-text" rows="22" @input="dirty = true" />
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-else class="alg-preview" v-html="html" />
    <div class="alg-foot">
      <button type="button" class="ghost" @click="showHistory">지난판보기</button>
      <small v-if="dirty">고친 내용이 있습니다 — 저장해야 나갑니다.</small>
      <button type="button" class="pri" :disabled="saving || !dirty" @click="save">{{ saving ? '저장 중' : '새판저장' }}</button>
    </div>
    <div v-if="history" class="alg-hist">
      <p v-if="!history.length" class="alg-empty">지난 판이 없습니다.</p>
      <div v-for="h in history" :key="h.id" class="alg-hrow">
        <button type="button" @click="openHist = openHist === h.id ? '' : h.id">{{ h.savedAt.slice(0, 16).replace('T', ' ') }}에 바뀐 판 · {{ h.by }}{{ h.effective ? ` · 시행 ${h.effective}` : '' }}</button>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-if="openHist === h.id" class="alg-preview" v-html="h.html" />
      </div>
    </div>
    <p v-if="msg" class="alg-toast">{{ msg }}</p>
  </section>
</template>

<style scoped>
.alg { display: grid; gap: 12px; }
.alg-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.alg-tabs button { height: 32px; padding: 0 14px; border: 1px solid #dde3ee; border-radius: 999px; background: #fff; color: #4b5563; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.alg-tabs button.on { border-color: #2b6df3; background: #eef3ff; color: #2b6df3; }
.alg-note { margin: 0; padding: 10px 12px; border-radius: 8px; background: #f8faff; font-size: 13px; line-height: 1.6; color: #4b5563; }
.alg-row { display: grid; grid-template-columns: 56px 1fr; align-items: center; gap: 10px; }
.alg-row span { font-size: 13px; font-weight: 700; color: #4b5563; }
.alg-row input { height: 36px; padding: 0 10px; border: 1px solid #dde3ee; border-radius: 8px; font: inherit; font-size: 14px; }
.alg-mode { display: inline-flex; width: max-content; border: 1px solid #dde3ee; border-radius: 8px; overflow: hidden; }
.alg-mode button { height: 32px; padding: 0 14px; border: 0; background: #fff; color: #6b7280; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.alg-mode button.on { background: #2b6df3; color: #fff; }
.alg-text { width: 100%; box-sizing: border-box; padding: 12px; border: 1px solid #dde3ee; border-radius: 8px; font-family: ui-monospace, Menlo, monospace; font-size: 13px; line-height: 1.7; resize: vertical; }
.alg-preview { max-height: 520px; overflow-y: auto; padding: 14px 16px; border: 1px solid #e8ebf1; border-radius: 8px; font-size: 14px; line-height: 1.7; color: #374151; }
.alg-preview :deep(h3) { margin: 16px 0 8px; font-size: 16px; font-weight: 800; color: #111827; }
.alg-preview :deep(h4) { margin: 10px 0 6px; font-size: 14px; font-weight: 800; color: #1f3a72; }
.alg-preview :deep(table) { width: 100%; border-collapse: collapse; font-size: 13px; }
.alg-preview :deep(th), .alg-preview :deep(td) { border: 1px solid #e5e7eb; padding: 6px; }
.alg-foot { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.alg-foot small { font-size: 13px; color: #c2410c; }
.alg-foot .ghost { margin-right: auto; height: 36px; padding: 0 14px; border: 1px solid #dde3ee; border-radius: 8px; background: #fff; color: #4b5563; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.alg-foot .pri { height: 38px; padding: 0 20px; border: 0; border-radius: 8px; background: #2b6df3; color: #fff; font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; }
.alg-foot .pri:disabled { opacity: .45; cursor: default; }
.alg-hist { display: grid; gap: 6px; }
.alg-hrow > button { width: 100%; text-align: left; padding: 8px 12px; border: 1px solid #e8ebf1; border-radius: 8px; background: #fff; font: inherit; font-size: 13px; color: #374151; cursor: pointer; }
.alg-empty { margin: 0; font-size: 13px; color: #9aa6c4; }
.alg-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 1200; margin: 0; padding: 10px 16px; border-radius: 8px; background: rgba(17, 24, 39, .92); color: #fff; font-size: 14px; }
</style>
