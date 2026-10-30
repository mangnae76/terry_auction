<script setup lang="ts">
// 커뮤니티 › 오류및제안(웹) — 게시판. 목록(번호 · 제목[댓글 수] · 작성자 · 조회수 · 작성일) · 찾기 · 글쓰기 · 읽기 · 댓글.
// 글과 댓글은 suggestPosts(DB)에 남는다. 내 글만 고치고 지우며, 운영자는 모두 지운다.
import { computed, onUnmounted, ref, watch } from 'vue';
import { useAuthStore } from '../stores/authStore';
import { isAdminEmail } from '../services/accessControl';
import {
  addSuggestComment,
  bumpSuggestView,
  createSuggestPost,
  deleteSuggestComment,
  deleteSuggestPost,
  maskName,
  subscribeSuggestComments,
  subscribeSuggestPosts,
  updateSuggestPost,
  type SuggestComment,
  type SuggestPost,
} from '../services/suggestBoard';

const auth = useAuthStore();
const isAdmin = computed(() => isAdminEmail(auth.email));
const myName = computed(() => (auth.nickname || auth.email.split('@')[0] || '회원').trim());

const posts = ref<SuggestPost[]>([]);
const err = ref('');
const stop = subscribeSuggestPosts((rows) => { posts.value = rows; err.value = ''; }, (m) => { err.value = /permission/i.test(m) ? '로그인하면 게시판 글을 볼 수 있습니다.' : `글을 불러오지 못했습니다 — ${m}`; });
onUnmounted(stop);

/* ───── 목록 · 찾기 ───── */
type Field = 'title' | 'body' | 'author';
const FIELDS: Array<[Field, string]> = [['title', '제목'], ['body', '내용'], ['author', '작성자']];
const field = ref<Field>('title');
const q = ref('');
const applied = ref<{ field: Field; q: string }>({ field: 'title', q: '' });
const search = () => { applied.value = { field: field.value, q: q.value.trim() }; page.value = 1; };
/** 번호는 오래된 글부터 1 — 지운 글이 있어도 남은 글끼리 차례대로 */
const numbered = computed(() => posts.value.map((p, i) => ({ ...p, no: posts.value.length - i })));
const filtered = computed(() => {
  const { field: f, q: k } = applied.value;
  if (!k) return numbered.value;
  const has = (s: string) => s.toLowerCase().includes(k.toLowerCase());
  return numbered.value.filter((p) => (f === 'title' ? has(p.title) : f === 'body' ? has(p.body) : has(p.authorName)));
});
const PER = 10;
const page = ref(1);
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PER)));
const shown = computed(() => filtered.value.slice((page.value - 1) * PER, page.value * PER));
const ymd = (iso: string) => (iso ? iso.slice(0, 10) : '');
const num = (n: number) => (n || 0).toLocaleString('ko-KR');

/* ───── 화면 — 목록 · 읽기 · 쓰기 ───── */
const view = ref<'list' | 'read' | 'write'>('list');
const readId = ref('');
const reading = computed(() => posts.value.find((p) => p.id === readId.value) ?? null);
const mine = (p: { authorUid: string } | null) => !!p && (p.authorUid === auth.uid || isAdmin.value);

const comments = ref<SuggestComment[]>([]);
let stopComments: (() => void) | null = null;
const openPost = (p: SuggestPost) => {
  readId.value = p.id; view.value = 'read';
  // 같은 글은 이 창에서 한 번만 센다
  const k = `suggest.seen.${p.id}`;
  try { if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, '1'); void bumpSuggestView(p.id); } } catch { void bumpSuggestView(p.id); }
};
watch(readId, (id) => {
  stopComments?.(); stopComments = null; comments.value = [];
  if (id) stopComments = subscribeSuggestComments(id, (rows) => { comments.value = rows; });
});
onUnmounted(() => stopComments?.());

/* ───── 쓰기 · 고치기 ───── */
const editId = ref('');
const draftTitle = ref('');
const draftBody = ref('');
const busy = ref(false);
const startWrite = () => {
  if (!auth.uid) { err.value = '로그인하면 글을 쓸 수 있습니다.'; return; }
  editId.value = ''; draftTitle.value = ''; draftBody.value = ''; view.value = 'write';
};
const startEdit = () => {
  if (!reading.value) return;
  editId.value = reading.value.id; draftTitle.value = reading.value.title; draftBody.value = reading.value.body; view.value = 'write';
};
const save = async () => {
  const title = draftTitle.value.trim(); const body = draftBody.value.trim();
  if (!title || !body) { err.value = '제목과 내용을 적어 주세요.'; return; }
  busy.value = true;
  try {
    if (editId.value) { await updateSuggestPost(editId.value, { title, body }); readId.value = editId.value; view.value = 'read'; }
    else { const id = await createSuggestPost({ title, body, authorUid: auth.uid, authorName: myName.value }); readId.value = id; view.value = 'read'; }
    err.value = '';
  } catch (e) {
    err.value = `저장하지 못했습니다 — ${(e as Error).message}`;
  } finally { busy.value = false; }
};
const removePost = async () => {
  if (!reading.value || !window.confirm('이 글을 지울까요?')) return;
  try { await deleteSuggestPost(reading.value.id); view.value = 'list'; readId.value = ''; } catch (e) { err.value = `지우지 못했습니다 — ${(e as Error).message}`; }
};

/* ───── 댓글 ───── */
const reply = ref('');
const sendReply = async () => {
  const body = reply.value.trim();
  if (!body || !reading.value) return;
  if (!auth.uid) { err.value = '로그인하면 댓글을 달 수 있습니다.'; return; }
  try {
    await addSuggestComment(reading.value.id, { body, authorUid: auth.uid, authorName: myName.value, admin: isAdmin.value });
    reply.value = '';
  } catch (e) { err.value = `댓글을 달지 못했습니다 — ${(e as Error).message}`; }
};
const removeReply = async (c: SuggestComment) => {
  if (!reading.value || !window.confirm('이 댓글을 지울까요?')) return;
  try { await deleteSuggestComment(reading.value.id, c.id); } catch (e) { err.value = `지우지 못했습니다 — ${(e as Error).message}`; }
};
const whoOf = (x: { authorName: string; admin?: boolean }) => (x.admin ? '운영자' : maskName(x.authorName));
</script>

<template>
  <section class="sgb">
    <p v-if="err" class="sgb-err">{{ err }}</p>

    <!-- 목록 -->
    <template v-if="view === 'list'">
      <form class="sgb-search" @submit.prevent="search">
        <select v-model="field" class="sgb-select">
          <option v-for="[k, label] in FIELDS" :key="k" :value="k">{{ label }}</option>
        </select>
        <input v-model="q" class="sgb-input" placeholder="검색어 입력" />
        <button type="submit" class="sgb-btn navy">검색</button>
      </form>
      <div class="sgb-tblwrap">
        <table class="sgb-tbl">
          <colgroup><col style="width: 8%" /><col /><col style="width: 12%" /><col style="width: 10%" /><col style="width: 14%" /></colgroup>
          <thead><tr><th>번호</th><th>제목</th><th>작성자</th><th>조회수</th><th>작성일</th></tr></thead>
          <tbody>
            <tr v-for="p in shown" :key="p.id" class="row" @click="openPost(p)">
              <td>{{ p.no }}</td>
              <td class="title">{{ p.title }}<em v-if="p.commentCount > 0" class="cnt">[{{ p.commentCount }}]</em></td>
              <td>{{ maskName(p.authorName) }}</td>
              <td>{{ num(p.views) }}</td>
              <td>{{ ymd(p.createdAt) }}</td>
            </tr>
            <tr v-if="shown.length === 0"><td colspan="5" class="none">{{ applied.q ? '찾는 글이 없습니다.' : '아직 올라온 글이 없습니다. 오류나 바라는 점을 남겨 주세요.' }}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="sgb-foot">
        <nav v-if="pages > 1" class="sgb-pages">
          <button v-for="n in pages" :key="n" type="button" :class="{ on: n === page }" @click="page = n">{{ n }}</button>
        </nav>
        <button type="button" class="sgb-btn green" @click="startWrite">글쓰기</button>
      </div>
    </template>

    <!-- 읽기 -->
    <template v-else-if="view === 'read' && reading">
      <article class="sgb-read">
        <header class="sgb-read-head">
          <h3>{{ reading.title }}</h3>
          <p class="meta"><span>{{ maskName(reading.authorName) }}</span><span>{{ ymd(reading.createdAt) }}</span><span>조회 {{ num(reading.views) }}</span></p>
        </header>
        <p class="sgb-body">{{ reading.body }}</p>
      </article>
      <section class="sgb-comments">
        <h4>댓글 {{ comments.length }}</h4>
        <ul>
          <li v-for="c in comments" :key="c.id" :class="{ admin: c.admin }">
            <p class="who"><b>{{ whoOf(c) }}</b><span>{{ ymd(c.createdAt) }}</span><button v-if="mine(c)" type="button" class="sgb-x" @click="removeReply(c)">삭제</button></p>
            <p class="txt">{{ c.body }}</p>
          </li>
        </ul>
        <form class="sgb-reply" @submit.prevent="sendReply">
          <input v-model="reply" class="sgb-input" placeholder="댓글 입력" />
          <button type="submit" class="sgb-btn navy">등록</button>
        </form>
      </section>
      <div class="sgb-foot">
        <button type="button" class="sgb-btn line" @click="view = 'list'">목록</button>
        <span class="gap" />
        <template v-if="mine(reading)">
          <button v-if="reading.authorUid === auth.uid" type="button" class="sgb-btn line" @click="startEdit">수정</button>
          <button type="button" class="sgb-btn line red" @click="removePost">삭제</button>
        </template>
      </div>
    </template>

    <!-- 쓰기 · 고치기 -->
    <template v-else-if="view === 'write'">
      <div class="sgb-write">
        <input v-model="draftTitle" class="sgb-input" maxlength="80" placeholder="제목 입력" />
        <textarea v-model="draftBody" class="sgb-text" placeholder="오류는 어느 화면에서 무엇을 했을 때 생겼는지, 제안은 무엇이 있으면 좋을지 적어 주세요." />
      </div>
      <div class="sgb-foot">
        <button type="button" class="sgb-btn line" @click="view = editId ? 'read' : 'list'">취소</button>
        <span class="gap" />
        <button type="button" class="sgb-btn green" :disabled="busy" @click="save">{{ editId ? '수정' : '등록' }}</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
/* 웹 규격 — 큰 흰 상자(모서리 14 · 안쪽 20/24), 글 14 이상, 표 모서리 8 */
.sgb { background: #fff; border: 1px solid #eef0f5; border-radius: 14px; padding: 20px 24px; }
.sgb-err { margin: 0 0 12px; padding: 10px 14px; border-radius: 8px; background: #fdf0e3; color: #8a4b12; font-size: 14px; }
.sgb-search { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 12px; }
.sgb-select, .sgb-input { box-sizing: border-box; height: 44px; padding: 0 14px; border: 1px solid #e3e8f0; border-radius: 6px; background: #fff; font-family: inherit; font-size: 14px; color: #111827; }
.sgb-select { width: 150px; }
.sgb-search .sgb-input { width: 320px; }
.sgb-input:focus, .sgb-select:focus, .sgb-text:focus { outline: none; border-color: #2a3f8f; }
.sgb-btn { height: 44px; min-width: 76px; padding: 0 18px; border: 0; border-radius: 8px; font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.sgb-btn.navy { background: #2a3f8f; color: #fff; }
.sgb-btn.green { background: #4caf50; color: #fff; }
.sgb-btn.line { background: #fff; color: #374151; border: 1px solid #d5dbe6; }
.sgb-btn.line.red { color: #dc2626; border-color: #f3c4c4; }
.sgb-btn:disabled { opacity: .6; cursor: default; }
.sgb-tblwrap { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
.sgb-tbl { width: 100%; border-collapse: collapse; table-layout: fixed; }
.sgb-tbl th { height: 52px; background: #f7f9fc; font-size: 14px; font-weight: 700; color: #111827; border-bottom: 1px solid #e5e7eb; }
.sgb-tbl td { height: 64px; padding: 0 12px; text-align: center; font-size: 14px; color: #111827; border-bottom: 1px solid #eef1f6; }
.sgb-tbl tr:last-child td { border-bottom: 0; }
.sgb-tbl td.title { text-align: left; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sgb-tbl .cnt { margin-left: 10px; font-style: normal; font-weight: 600; color: #2a3f8f; }
.sgb-tbl tr.row { cursor: pointer; }
.sgb-tbl tr.row:hover td { background: #f7f9fd; }
.sgb-tbl td.none { height: 120px; color: #9ca3af; font-weight: 400; }
.sgb-foot { display: flex; align-items: center; gap: 8px; margin-top: 16px; }
.sgb-foot .gap, .sgb-pages { flex: 1 1 auto; }
.sgb-foot > .sgb-btn.green:only-child { margin-left: auto; }
.sgb-pages { display: flex; justify-content: center; gap: 4px; }
.sgb-pages button { width: 36px; height: 36px; border: 1px solid #e3e8f0; border-radius: 6px; background: #fff; font-size: 14px; color: #374151; cursor: pointer; }
.sgb-pages button.on { border-color: #2a3f8f; background: #2a3f8f; color: #fff; font-weight: 700; }
.sgb-read-head { padding-bottom: 14px; border-bottom: 1px solid #eef0f5; }
.sgb-read-head h3 { margin: 0 0 8px; font-size: 18px; font-weight: 800; color: #111827; }
.sgb-read-head .meta { display: flex; gap: 16px; margin: 0; font-size: 14px; color: #6b7280; }
.sgb-body { margin: 0; padding: 20px 0 24px; min-height: 120px; font-size: 15px; line-height: 1.8; color: #111827; white-space: pre-line; word-break: keep-all; border-bottom: 1px solid #eef0f5; }
.sgb-comments { padding-top: 16px; }
.sgb-comments h4 { margin: 0 0 10px; font-size: 16px; font-weight: 800; color: #111827; }
.sgb-comments ul { list-style: none; margin: 0 0 12px; padding: 0; }
.sgb-comments li { padding: 12px 14px; border: 1px solid #eef0f5; border-radius: 10px; }
.sgb-comments li + li { margin-top: 8px; }
.sgb-comments li.admin { border-color: #c7d2ea; }
.sgb-comments .who { display: flex; align-items: center; gap: 10px; margin: 0 0 6px; font-size: 14px; color: #6b7280; }
.sgb-comments .who b { color: #111827; }
.sgb-comments li.admin .who b { color: #2a3f8f; }
.sgb-comments .txt { margin: 0; font-size: 14px; line-height: 1.7; color: #111827; white-space: pre-line; }
.sgb-x { margin-left: auto; border: 0; background: none; font-size: 14px; color: #9ca3af; cursor: pointer; }
.sgb-reply { display: flex; gap: 8px; }
.sgb-reply .sgb-input { flex: 1 1 auto; }
.sgb-write { display: flex; flex-direction: column; gap: 10px; }
.sgb-text { box-sizing: border-box; min-height: 280px; padding: 14px; border: 1px solid #e3e8f0; border-radius: 6px; font-family: inherit; font-size: 15px; line-height: 1.7; color: #111827; resize: vertical; }
</style>
