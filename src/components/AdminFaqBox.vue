<script setup lang="ts">
// 운영 › FAQ 관리 — 고객센터 · 커뮤니티 FAQ 의 질문과 답(DB contentDocs/faq). 처음엔 코드 글(supportFaq)을 불러와 고친다.
// 답은 **굵게** 만 쓴다. 고친 뒤 [저장]을 눌러야 앱 · 웹에 나간다.
import { computed, ref, watch } from 'vue';
import { useAuthStore } from '../stores/authStore';
import { userMessage } from '../services/userMessage';
import { FAQ_SEED, FAQ_TAGS, type FaqItem, type FaqTag } from '../services/supportFaq';
import { boldToHtml, faqFromDb, htmlToBold, saveFaq, startContentSync } from '../services/contentRepository';

startContentSync();
const auth = useAuthStore();

/** 고치는 목록 — 답은 간단 표기(**굵게**)로 들고 있다가 저장할 때 HTML 로 */
type Row = { tag: FaqTag; q: string; a: string; points?: boolean; key: number };
let seq = 0;
const toRows = (items: FaqItem[]): Row[] => items.map((f) => ({ tag: f.tag, q: f.q, a: htmlToBold(f.a), points: f.points, key: ++seq }));
const rows = ref<Row[]>(toRows(faqFromDb.value ?? FAQ_SEED));
const fromDb = computed(() => !!faqFromDb.value);
const dirty = ref(false);
/* DB 판이 늦게 오면(처음 열 때) 아직 손대지 않았을 때만 바꿔 끼운다 */
watch(faqFromDb, (v) => { if (v && !dirty.value) rows.value = toRows(v); });

const filter = ref<'' | FaqTag>('');
const shown = computed(() => rows.value.filter((r) => !filter.value || r.tag === filter.value));
const openKey = ref(0);

const touch = () => { dirty.value = true; };
const add = () => {
  const r: Row = { tag: filter.value || '서비스', q: '', a: '', key: ++seq };
  rows.value = [r, ...rows.value];
  openKey.value = r.key;
  touch();
};
const move = (r: Row, d: -1 | 1) => {
  const i = rows.value.indexOf(r); const j = i + d;
  if (j < 0 || j >= rows.value.length) return;
  const next = [...rows.value]; [next[i], next[j]] = [next[j], next[i]]; rows.value = next; touch();
};
const remove = (r: Row) => { rows.value = rows.value.filter((x) => x !== r); touch(); };

const msg = ref('');
let msgTimer = 0;
const flash = (t: string, ms = 2600) => { msg.value = t; window.clearTimeout(msgTimer); msgTimer = window.setTimeout(() => { msg.value = ''; }, ms); };
const saving = ref(false);
const save = async () => {
  const bad = rows.value.find((r) => !r.q.trim() || !r.a.trim());
  if (bad) { openKey.value = bad.key; flash('질문과 답을 모두 적어 주세요.'); return; }
  saving.value = true;
  try {
    await saveFaq(rows.value.map((r) => ({ tag: r.tag, q: r.q, a: boldToHtml(r.a), points: r.points })), auth.email || '운영자');
    dirty.value = false;
    flash('저장했습니다. 고객센터 · 커뮤니티 FAQ 에 바로 보입니다.');
  } catch (e) {
    flash(userMessage(e, '저장하지 못했습니다. 잠시 뒤 다시 해 주세요.'), 5000);
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <section class="adb-card afq">
    <div class="afq-tools">
      <div class="afq-tags">
        <button type="button" :class="{ on: !filter }" @click="filter = ''">전체 {{ rows.length }}</button>
        <button v-for="t in FAQ_TAGS" :key="t" type="button" :class="{ on: filter === t }" @click="filter = t">{{ t }}</button>
      </div>
      <button type="button" class="afq-add" @click="add">＋ 질문</button>
    </div>
    <p class="afq-note">
      {{ fromDb ? 'DB에 저장된 목록입니다.' : '아직 DB에 저장한 적이 없어 코드에 적힌 목록을 불러왔습니다. 저장하면 이 목록이 쓰입니다.' }}
      답에서 굵게 할 곳은 <b>**두 별표**</b>로 감쌉니다. 포인트 글은 포인트를 붙이기 전까지 화면에 나가지 않습니다.
    </p>
    <ul class="afq-list">
      <li v-for="r in shown" :key="r.key" :class="{ open: openKey === r.key }">
        <div class="afq-line">
          <span class="afq-tag">{{ r.tag }}</span>
          <button type="button" class="afq-q" @click="openKey = openKey === r.key ? 0 : r.key">{{ r.q || '(새 질문)' }}<em v-if="r.points">포인트</em></button>
          <span class="afq-acts">
            <button type="button" title="위로" @click="move(r, -1)">▲</button>
            <button type="button" title="아래로" @click="move(r, 1)">▼</button>
            <button type="button" class="del" @click="remove(r)">지우기</button>
          </span>
        </div>
        <div v-if="openKey === r.key" class="afq-edit">
          <label><span>분류</span><select v-model="r.tag" @change="touch"><option v-for="t in FAQ_TAGS" :key="t" :value="t">{{ t }}</option></select></label>
          <label><span>질문</span><input v-model="r.q" type="text" maxlength="120" @input="touch" /></label>
          <label class="top"><span>답</span><textarea v-model="r.a" rows="4" maxlength="1000" @input="touch" /></label>
        </div>
      </li>
    </ul>
    <div class="afq-foot">
      <small v-if="dirty">고친 내용이 있습니다 — 저장해야 나갑니다.</small>
      <button type="button" class="pri" :disabled="saving || (!dirty && fromDb)" @click="save">{{ saving ? '저장 중' : '저장' }}</button>
    </div>
    <p v-if="msg" class="afq-toast">{{ msg }}</p>
  </section>
</template>

<style scoped>
.afq { display: grid; gap: 12px; }
.afq-tools { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.afq-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.afq-tags button { height: 30px; padding: 0 12px; border: 1px solid #dde3ee; border-radius: 999px; background: #fff; color: #4b5563; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.afq-tags button.on { border-color: #2b6df3; background: #eef3ff; color: #2b6df3; }
.afq-add { height: 34px; padding: 0 14px; border: 1px solid #c9d6f5; border-radius: 8px; background: #fff; color: #2b6df3; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; }
.afq-note { margin: 0; padding: 10px 12px; border-radius: 8px; background: #f8faff; font-size: 13px; line-height: 1.6; color: #4b5563; }
.afq-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.afq-list li { border: 1px solid #e8ebf1; border-radius: 8px; }
.afq-list li.open { border-color: #c7d2ea; background: #f8faff; }
.afq-line { display: flex; align-items: center; gap: 10px; padding: 8px 10px; }
.afq-tag { flex: none; padding: 2px 8px; border-radius: 5px; background: #eef3ff; color: #2b6df3; font-size: 12px; font-weight: 800; }
.afq-q { flex: 1; min-width: 0; border: 0; background: transparent; padding: 0; text-align: left; font: inherit; font-size: 14px; font-weight: 700; color: #111827; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.afq-q em { font-style: normal; margin-left: 8px; padding: 1px 6px; border-radius: 4px; background: #fff4e5; color: #b45309; font-size: 12px; }
.afq-acts { display: flex; gap: 4px; }
.afq-acts button { height: 28px; padding: 0 8px; border: 1px solid #dde3ee; border-radius: 6px; background: #fff; font: inherit; font-size: 12px; cursor: pointer; }
.afq-acts .del { color: #dc2626; border-color: #f3c4c4; }
.afq-edit { padding: 0 12px 12px; display: grid; gap: 8px; }
.afq-edit label { display: grid; grid-template-columns: 48px 1fr; align-items: center; gap: 10px; }
.afq-edit label.top { align-items: start; }
.afq-edit span { font-size: 13px; font-weight: 700; color: #4b5563; }
.afq-edit input, .afq-edit select { height: 36px; padding: 0 10px; border: 1px solid #dde3ee; border-radius: 8px; font: inherit; font-size: 14px; background: #fff; }
.afq-edit textarea { padding: 8px 10px; border: 1px solid #dde3ee; border-radius: 8px; font: inherit; font-size: 14px; line-height: 1.6; resize: vertical; }
.afq-foot { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.afq-foot small { font-size: 13px; color: #c2410c; }
.afq-foot .pri { height: 38px; padding: 0 22px; border: 0; border-radius: 8px; background: #2b6df3; color: #fff; font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; }
.afq-foot .pri:disabled { opacity: .45; cursor: default; }
.afq-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 1200; margin: 0; padding: 10px 16px; border-radius: 8px; background: rgba(17, 24, 39, .92); color: #fff; font-size: 14px; }
</style>
