<script setup lang="ts">
// 운영 › 운영자 가이드 — 이용가이드에 있던 '운영자 가이드' 칸을 옮겨 왔다(2026-11-23 사용자).
// 글은 코드에 두지 않고 DB adminDocs/guide(운영자만 읽기 · 쓰기, firestore.rules)에만 둔다 — 이용가이드 · 웹 · 앱 파일 어디에도 없어 소스로 읽히지 않는다.
// 문서 꼴: { json: '{"title","desc","subs":[{id,label,title,path?,blocks:[{t:'p'|'note'|'table', ...}]}]}', updatedAt, updatedBy }
import { onMounted, ref } from 'vue';
import { doc, getDoc } from 'firebase/firestore';
import { firestore, firestoreDisabledReason } from '../services/firebase';

type Block = { t: 'p' | 'note' | 'table'; html?: string; tone?: string; title?: string; head?: string[]; rows?: string[][] };
type Sub = { id: string; label: string; title: string; path?: string; blocks: Block[] };
type Guide = { title?: string; desc?: string; subs: Sub[] };

const guide = ref<Guide | null>(null);
const err = ref('');
const loading = ref(true);
const at = ref('');

onMounted(async () => {
  try {
    if (!firestore) throw new Error(firestoreDisabledReason || 'DB 연결이 꺼져 있습니다.');
    const s = await getDoc(doc(firestore, 'adminDocs', 'guide'));
    if (!s.exists()) { err.value = '운영자 가이드 문서가 아직 없습니다.'; return; }
    const d = s.data() as { json?: string; updatedAt?: string };
    guide.value = JSON.parse(String(d.json ?? '{}')) as Guide;
    at.value = String(d.updatedAt ?? '').slice(0, 10);
  } catch (e) {
    err.value = `운영자 가이드를 불러오지 못했습니다. ${(e as Error).message || ''}`;
  } finally {
    loading.value = false;
  }
});
const jump = (id: string) => document.getElementById(`agd-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
</script>

<template>
  <section class="adb-card agd">
    <p v-if="loading" class="agd-empty">불러오는 중입니다…</p>
    <p v-else-if="err" class="agd-err">{{ err }}</p>
    <template v-else-if="guide">
      <header class="agd-head">
        <p v-if="guide.desc" class="agd-desc">{{ guide.desc }}</p>
        <small v-if="at" class="agd-at">고친 날 {{ at }}</small>
      </header>
      <nav class="agd-toc">
        <button v-for="s in guide.subs" :key="s.id" type="button" @click="jump(s.id)">{{ s.label }}</button>
      </nav>
      <article v-for="s in guide.subs" :id="`agd-${s.id}`" :key="s.id" class="agd-sec">
        <h3>{{ s.title }}<small v-if="s.path">{{ s.path }}</small></h3>
        <template v-for="(b, i) in s.blocks" :key="i">
          <!-- 글은 운영자만 쓰는 문서에서 온 것(이용가이드에 있던 글 그대로) -->
          <p v-if="b.t === 'p'" class="agd-p" v-html="b.html" />
          <div v-else-if="b.t === 'note'" :class="['agd-note', b.tone || 'tip']"><b v-if="b.title">{{ b.title }}</b><span v-html="b.html" /></div>
          <div v-else-if="b.t === 'table'" class="agd-tbl">
            <table>
              <thead><tr><th v-for="h in b.head" :key="h">{{ h }}</th></tr></thead>
              <tbody><tr v-for="(r, ri) in b.rows" :key="ri"><td v-for="(c, ci) in r" :key="ci" v-html="c" /></tr></tbody>
            </table>
          </div>
        </template>
      </article>
    </template>
  </section>
</template>

<style scoped>
.agd { display: grid; gap: 18px; }
.agd-empty { margin: 0; padding: 28px 0; text-align: center; font-size: 14px; color: #9aa6c4; }
.agd-err { margin: 0; color: #dc2626; font-size: 14px; }
.agd-head { display: flex; align-items: baseline; gap: 12px; }
.agd-desc { margin: 0; flex: 1; font-size: 14px; color: #4b5563; }
.agd-at { font-size: 12px; color: #9aa6c4; }
.agd-toc { display: flex; flex-wrap: wrap; gap: 6px; }
.agd-toc button { height: 32px; padding: 0 14px; border: 1px solid #dde3ee; border-radius: 999px; background: #fff; color: #4b5563; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.agd-toc button:hover { border-color: #2b6df3; color: #2b6df3; }
.agd-sec { display: grid; gap: 10px; padding-top: 16px; border-top: 1px solid #e8ebf1; scroll-margin-top: 80px; }
.agd-sec h3 { margin: 0; display: flex; align-items: baseline; gap: 10px; font-size: 16px; font-weight: 800; color: #111827; }
.agd-sec h3 small { font-size: 12px; font-weight: 500; color: #8a909c; }
.agd-p { margin: 0; font-size: 14px; line-height: 1.7; color: #374151; }
.agd-note { display: grid; gap: 4px; padding: 12px 14px; border-radius: 8px; background: #f4f7fc; border: 1px solid #e3e9f4; font-size: 13.5px; line-height: 1.65; color: #374151; }
.agd-note.warn { background: #fff7ed; border-color: #fde3c4; }
.agd-note b { font-size: 13.5px; color: #1f2a4d; }
.agd-tbl { overflow-x: auto; border: 1px solid #e3e6eb; border-radius: 8px; }
.agd-tbl table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.agd-tbl th { background: #f6f8fc; color: #1f2a4d; font-weight: 800; text-align: left; padding: 10px 12px; white-space: nowrap; }
.agd-tbl td { padding: 10px 12px; border-top: 1px solid #eef0f4; color: #374151; line-height: 1.6; vertical-align: top; }
.agd-tbl td:first-child { font-weight: 700; color: #1f2a4d; white-space: nowrap; }
</style>
