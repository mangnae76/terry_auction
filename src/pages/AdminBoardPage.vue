<script setup lang="ts">
// 운영 — 공지·이벤트·업데이트 올리기.
// 여기서 저장하면 앱의 더보기 › 공지 탭에 바로 나간다.
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import BrandLogo from '../components/BrandLogo.vue';
import { useAuthStore } from '../stores/authStore';
import {
  newBoardId,
  removeBoardPost,
  saveBoardPost,
  subscribeBoardPosts,
  type BoardKind,
  type BoardPost,
} from '../services/boardRepository';

const router = useRouter();
const auth = useAuthStore();
const who = computed(() => auth.nickname || auth.email || '');

const KINDS: Array<{ key: BoardKind; label: string; hint: string; tags: string[] }> = [
  { key: 'event', label: '이벤트', hint: '진행 중인 이벤트 한 줄', tags: ['안내', '진행', '마감'] },
  { key: 'notice', label: '공지사항', hint: '점검·정책처럼 알려야 하는 것', tags: ['안내', '점검', '중요'] },
  { key: 'update', label: '업데이트', hint: '새로 붙은 기능·고친 것', tags: ['신규', '기능', '개선'] },
  { key: 'banner', label: '이벤트 배너', hint: '이벤트 탭 맨 위 큰 칸', tags: ['EVENT'] },
];

const posts = ref<BoardPost[]>([]);
const err = ref('');
let unsub: (() => void) | null = null;
onMounted(() => {
  unsub = subscribeBoardPosts((rows) => { posts.value = rows; }, (m) => { err.value = m; });
});
onUnmounted(() => { if (unsub) unsub(); });

const listOf = (kind: BoardKind) => computed(() => posts.value.filter((p) => p.kind === kind));

/* ───────── 쓰기 ───────── */

const emptyPost = (kind: BoardKind): BoardPost => ({
  id: newBoardId(),
  kind,
  tag: KINDS.find((k) => k.key === kind)?.tags[0] ?? '안내',
  text: '',
  star: false,
  badge: kind === 'banner' ? 'EVENT' : '',
  desc: '',
  cta: '자세히 보기',
  period: '',
  order: Date.now(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const draft = ref<BoardPost | null>(null);
const openNew = (kind: BoardKind) => { draft.value = emptyPost(kind); };
const openEdit = (p: BoardPost) => { draft.value = { ...p }; };
const close = () => { draft.value = null; };

const saving = ref(false);
const msg = ref('');
const flash = (text: string) => {
  msg.value = text;
  window.setTimeout(() => { msg.value = ''; }, 2200);
};

/** 막힌 까닭을 사람 말로 — 규칙에 막히면 어느 계정인지 같이 알려 준다 */
const reason = (e: unknown, fallback: string) => {
  const m = e instanceof Error ? e.message : '';
  if (/permission|insufficient/i.test(m)) {
    return `이 계정(${auth.email || '로그인 안 됨'})에는 올릴 권한이 없습니다 — 운영자 계정으로 들어와 주세요.`;
  }
  return m || fallback;
};

const save = async () => {
  const d = draft.value;
  if (!d) return;
  if (!d.text.trim()) { flash('글을 적어 주세요.'); return; }
  saving.value = true;
  try {
    await saveBoardPost({ ...d, text: d.text.trim() });
    flash('올렸습니다. 앱에 바로 나갑니다.');
    close();
  } catch (e) {
    flash(reason(e, '저장하지 못했습니다.'));
  } finally {
    saving.value = false;
  }
};

const removeOne = async (p: BoardPost) => {
  if (!window.confirm(`'${p.text}' 를 지울까요?`)) return;
  try {
    await removeBoardPost(p.id);
    flash('지웠습니다.');
  } catch (e) {
    flash(reason(e, '지우지 못했습니다.'));
  }
};

/** 차례 바꾸기 — 작은 것이 위 */
const move = async (p: BoardPost, dir: -1 | 1) => {
  const list = posts.value.filter((x) => x.kind === p.kind);
  const i = list.findIndex((x) => x.id === p.id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  const a = list[i];
  const b = list[j];
  await saveBoardPost({ ...a, order: b.order });
  await saveBoardPost({ ...b, order: a.order });
};
</script>

<template>
  <section class="adm-shell">
    <header class="adm-top">
      <div class="adm-top-in">
        <button type="button" class="adm-back" aria-label="뒤로" @click="router.push('/admin')">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg>
        </button>
        <div class="adm-brand">
          <BrandLogo :size="36" tone="white" />
          <small class="adm-brand-tag">운영</small>
        </div>
        <nav class="adm-top-nav">
          <button type="button" class="adm-top-link" @click="router.push('/more')">앱에서 보기</button>
          <span class="adm-who">{{ who }}</span>
        </nav>
      </div>
    </header>

    <div class="adm-body">
      <div class="adm-head">
        <h1>공지 · 이벤트 · 업데이트</h1>
        <p>여기서 올린 글이 앱의 <b>더보기 › 공지</b> 탭에 그대로 나갑니다. 하나도 없으면 기본 글이 대신 보입니다.</p>
      </div>

      <p v-if="err" class="adb-err">
        {{ err }}
        <template v-if="/permission|insufficient/i.test(err)"> — 지금 계정 {{ auth.email || '(로그인 안 됨)' }}</template>
      </p>

      <section v-for="k in KINDS" :key="k.key" class="adb-card">
        <header class="adb-head">
          <h2>{{ k.label }}<small>{{ k.hint }}</small></h2>
          <button type="button" class="adb-add" @click="openNew(k.key)">＋ 새 글</button>
        </header>

        <p v-if="listOf(k.key).value.length === 0" class="adb-empty">
          올린 글이 없습니다 — 앱에는 기본 글이 보입니다.
        </p>
        <ul v-else class="adb-list">
          <li v-for="p in listOf(k.key).value" :key="p.id">
            <span class="adb-tag" :class="{ star: p.star }">{{ p.star ? '✦' : (p.tag || '—') }}</span>
            <span class="adb-txt">
              <b>{{ p.text }}</b>
              <small v-if="k.key === 'banner'">{{ p.desc }} · {{ p.period }}</small>
            </span>
            <span class="adb-acts">
              <button type="button" @click="move(p, -1)" title="위로">▲</button>
              <button type="button" @click="move(p, 1)" title="아래로">▼</button>
              <button type="button" @click="openEdit(p)">고치기</button>
              <button type="button" class="del" @click="removeOne(p)">지우기</button>
            </span>
          </li>
        </ul>
      </section>
    </div>

    <!-- 쓰기 창 -->
    <div v-if="draft" class="adb-modal" @click.self="close">
      <div class="adb-box">
        <header class="adb-box-head">
          <strong>{{ KINDS.find((k) => k.key === draft!.kind)?.label }}</strong>
          <button type="button" class="adb-x" aria-label="닫기" @click="close">✕</button>
        </header>

        <div class="adb-form">
          <label v-if="draft.kind !== 'banner'">
            <small>꼬리표</small>
            <span class="adb-tags">
              <button
                v-for="t in KINDS.find((k) => k.key === draft!.kind)?.tags ?? []"
                :key="t"
                type="button"
                :class="['adb-tagbtn', { on: draft!.tag === t }]"
                @click="draft!.tag = t"
              >{{ t }}</button>
            </span>
          </label>

          <label>
            <small>{{ draft.kind === 'banner' ? '제목' : '글' }}</small>
            <input v-model="draft.text" class="adb-input" :placeholder="draft.kind === 'banner' ? '첫 낙찰 축하 리워드' : '한 줄로 적습니다'" />
          </label>

          <template v-if="draft.kind === 'banner'">
            <label><small>배지</small><input v-model="draft.badge" class="adb-input" placeholder="EVENT" /></label>
            <label><small>설명</small><input v-model="draft.desc" class="adb-input" placeholder="무엇을 주는지 한 줄" /></label>
            <label><small>기간</small><input v-model="draft.period" class="adb-input" placeholder="2026.10.01 ~ 10.31" /></label>
            <label><small>단추 글</small><input v-model="draft.cta" class="adb-input" placeholder="자세히 보기" /></label>
          </template>

          <label v-if="draft.kind === 'notice'" class="adb-check">
            <input v-model="draft.star" type="checkbox" />
            맨 위에 붙박이로 둔다 (✦)
          </label>
        </div>

        <footer class="adb-box-foot">
          <button type="button" class="adb-cancel" @click="close">그만두기</button>
          <button type="button" class="adb-save" :disabled="saving" @click="save">{{ saving ? '올리는 중…' : '올리기' }}</button>
        </footer>
      </div>
    </div>

    <p v-if="msg" class="adb-toast">{{ msg }}</p>
  </section>
</template>

<style scoped>
.adm-shell { min-height: 100vh; background: #f4f6fb; }
.adm-top {
  position: sticky; top: 0; z-index: 20;
  background: linear-gradient(180deg, #1f3a72 0%, #15295b 100%);
  border-bottom: 1px solid #16265280;
}
.adm-top-in {
  max-width: 1480px; margin: 0 auto; padding: 12px 28px;
  display: flex; align-items: center; gap: 16px;
}
.adm-back {
  border: 1px solid #ffffff4d; background: #ffffff1a; border-radius: 8px;
  width: 30px; height: 30px; color: #fff; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; padding: 0;
}
.adm-brand { display: flex; align-items: center; gap: 12px; }
.adm-brand-tag {
  font-size: 11.5px; font-weight: 700; color: #c7d2ea;
  padding-left: 12px; border-left: 1px solid #ffffff33; line-height: 1.2;
}
.adm-top-nav { margin-left: auto; display: flex; align-items: center; gap: 12px; }
.adm-top-link {
  border: 1px solid #ffffff4d; background: #ffffff1a; border-radius: 8px;
  padding: 6px 12px; font-family: inherit; font-size: 12.5px; font-weight: 700; color: #fff; cursor: pointer;
}
.adm-who { font-size: 12px; color: #c7d2ea; font-weight: 600; }

.adm-body { max-width: 1000px; margin: 0 auto; padding: 28px 24px 60px; }
.adm-head { margin-bottom: 20px; }
.adm-head h1 { margin: 0 0 6px; font-size: 24px; font-weight: 800; color: #111827; }
.adm-head p { margin: 0; font-size: 13px; color: #6b7280; }
.adm-head b { color: #1f3a72; }
.adb-err { margin: 0 0 12px; font-size: 12.5px; color: #c62828; }

.adb-card { background: #fff; border: 1px solid #e8ebf1; border-radius: 12px; padding: 16px 18px; margin-bottom: 12px; }
.adb-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.adb-head h2 { margin: 0; font-size: 15px; font-weight: 800; color: #111827; display: flex; align-items: baseline; gap: 8px; }
.adb-head h2 small { font-size: 11.5px; font-weight: 500; color: #9ca3af; }
.adb-add {
  margin-left: auto; border: 1px solid #c7d2ea; border-radius: 8px; background: #fff;
  padding: 6px 12px; font-family: inherit; font-size: 12px; font-weight: 700; color: #2a3f8f; cursor: pointer;
}
.adb-empty { margin: 8px 0 0; font-size: 12.5px; color: #9ca3af; }
.adb-list { list-style: none; margin: 0; padding: 0; }
.adb-list li {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 0; border-bottom: 1px solid #f1f3f7;
}
.adb-list li:last-child { border-bottom: none; }
.adb-tag {
  flex: none; min-width: 42px; text-align: center; padding: 3px 7px; border-radius: 5px;
  background: #f1f3f8; font-size: 11px; font-weight: 700; color: #6b7280;
}
.adb-tag.star { background: #e8f0ff; color: #2b6df3; }
.adb-txt { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.adb-txt b { font-size: 13px; font-weight: 600; color: #111827; }
.adb-txt small { font-size: 11px; color: #9ca3af; }
.adb-acts { flex: none; display: flex; gap: 4px; }
.adb-acts button {
  border: 1px solid #e3e8f0; border-radius: 6px; background: #fff;
  padding: 4px 8px; font-family: inherit; font-size: 11px; color: #4b5563; cursor: pointer;
}
.adb-acts .del { color: #c62828; border-color: #f0d4d4; }

/* 쓰기 창 */
.adb-modal {
  position: fixed; inset: 0; z-index: 60; background: rgba(17, 24, 39, .45);
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.adb-box { width: 100%; max-width: 480px; background: #fff; border-radius: 12px; overflow: hidden; }
.adb-box-head {
  display: flex; align-items: center; padding: 14px 16px; border-bottom: 1px solid #eef1f6;
}
.adb-box-head strong { font-size: 14px; font-weight: 800; color: #111827; }
.adb-x {
  margin-left: auto; width: 26px; height: 26px; border: 1px solid #e3e8f0; border-radius: 6px;
  background: #fff; font-size: 12px; color: #4b5563; cursor: pointer; line-height: 1;
}
.adb-form { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.adb-form label { display: flex; flex-direction: column; gap: 5px; }
.adb-form small { font-size: 11.5px; font-weight: 700; color: #6b7280; }
.adb-input {
  width: 100%; box-sizing: border-box; height: 38px;
  border: 1px solid #e3e8f0; border-radius: 8px; padding: 2px 11px;
  font-family: inherit; font-size: 13px; color: #111827;
}
.adb-input:focus { outline: none; border-color: #2a3f8f; }
.adb-tags { display: flex; gap: 5px; }
.adb-tagbtn {
  border: 1px solid #e3e8f0; border-radius: 999px; background: #fff;
  padding: 5px 12px; font-family: inherit; font-size: 12px; font-weight: 700; color: #6b7280; cursor: pointer;
}
.adb-tagbtn.on { background: #2a3f8f; border-color: #2a3f8f; color: #fff; }
.adb-check { flex-direction: row !important; align-items: center; gap: 7px; font-size: 12.5px; color: #374151; }
.adb-check input { width: 15px; height: 15px; accent-color: #2a3f8f; }
.adb-box-foot { display: flex; gap: 8px; padding: 0 16px 16px; }
.adb-cancel, .adb-save {
  flex: 1 1 0; height: 40px; border-radius: 8px; font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
}
.adb-cancel { border: 1px solid #e3e8f0; background: #fff; color: #4b5563; }
.adb-save { border: none; background: #2a3f8f; color: #fff; }
.adb-save:disabled { background: #9aa6c4; cursor: default; }

.adb-toast {
  position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 70;
  margin: 0; padding: 10px 16px; border-radius: 999px;
  background: rgba(17, 24, 39, .92); color: #fff; font-size: 12.5px;
}
</style>
