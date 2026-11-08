<script setup lang="ts">
// 운영 › 접근 권한 관리 — 운영자 계정 더하고 빼기(DB adminConfig/main). 기본 2계정은 잠겨 있어 못 뺀다.
// 메일로 로그인한 계정만 운영자가 될 수 있다(카카오처럼 메일이 없는 계정은 규칙이 알아보지 못한다).
import { computed, onUnmounted, ref } from 'vue';
import AppConfirm from './AppConfirm.vue';
import type { ConfirmBox } from '../services/confirmBox';
import { useAuthStore } from '../stores/authStore';
import { userMessage } from '../services/userMessage';
import { BASE_ADMIN_EMAILS, LEGACY_ADMIN_EMAILS } from '../services/accessControl';
import { ADMIN_MAX, saveAdmins, subscribeAdminConfig } from '../services/adminConfigRepository';

const auth = useAuthStore();
/** null — DB 문서가 아직 없다(예전 목록을 보여 주고, 처음 저장할 때 옮긴다) */
const dbList = ref<string[] | null>(null);
const meta = ref({ updatedAt: '', updatedBy: '' });
const loaded = ref(false);
const loadErr = ref('');
const stop = subscribeAdminConfig((list, m) => { dbList.value = list; meta.value = m; loaded.value = true; loadErr.value = ''; }, (m) => { loadErr.value = m; loaded.value = true; });
onUnmounted(stop);

const extras = computed(() => dbList.value ?? LEGACY_ADMIN_EMAILS);
const me = computed(() => (auth.email || '').toLowerCase());

const msg = ref('');
let msgTimer = 0;
const flash = (t: string, ms = 2600) => { msg.value = t; window.clearTimeout(msgTimer); msgTimer = window.setTimeout(() => { msg.value = ''; }, ms); };

const input = ref('');
const saving = ref(false);
const save = async (next: string[], done: string) => {
  saving.value = true;
  try { await saveAdmins(next, auth.email || '운영자'); flash(done); return true; }
  catch (e) { flash(userMessage(e, '저장하지 못했습니다. 잠시 뒤 다시 해 주세요.'), 5000); return false; }
  finally { saving.value = false; }
};
const add = async () => {
  const e = input.value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { flash('메일 주소를 바르게 적어 주세요.'); return; }
  if (BASE_ADMIN_EMAILS.includes(e) || extras.value.includes(e)) { flash('이미 운영자인 계정입니다.'); return; }
  if (extras.value.length >= ADMIN_MAX) { flash(`운영자는 기본 계정 말고 ${ADMIN_MAX}명까지 둘 수 있습니다.`); return; }
  if (await save([...extras.value, e], `${e} 계정을 운영자로 더했습니다. 그 계정으로 다시 로그인하면 운영 메뉴가 보입니다.`)) input.value = '';
};

const confirmBox = ref<ConfirmBox | null>(null);
const askRemove = (e: string) => {
  confirmBox.value = {
    title: '운영자에서 뺄까요?',
    desc: e === me.value ? `${e} — 지금 쓰고 있는 계정입니다. 빼면 이 화면을 더 쓸 수 없습니다.` : `${e} — 운영 메뉴와 운영자 기능을 더 쓸 수 없게 됩니다.`,
    okLabel: '빼기',
    skipKey: '',
    run: async () => { await save(extras.value.filter((x) => x !== e), `${e} 계정을 운영자에서 뺐습니다.`); },
  };
};
const when = (iso: string) => (iso ? iso.slice(0, 16).replace('T', ' ') : '');
</script>

<template>
  <section class="adb-card aac">
    <p v-if="loadErr" class="aac-err">{{ loadErr }}</p>
    <div class="aac-add">
      <input v-model="input" type="email" placeholder="운영자로 더할 계정의 메일 (예: name@gmail.com)" @keydown.enter.prevent="add" />
      <button type="button" class="pri" :disabled="saving || !input.trim()" @click="add">＋ 추가</button>
    </div>
    <ul class="aac-list">
      <li v-for="e in BASE_ADMIN_EMAILS" :key="e">
        <b>{{ e }}</b><span class="aac-tag base">기본</span><em v-if="e === me">지금 계정</em>
        <span class="aac-lock">빼지 못함</span>
      </li>
      <li v-for="e in extras" :key="e">
        <b>{{ e }}</b><span class="aac-tag">추가</span><em v-if="e === me">지금 계정</em>
        <button type="button" class="del" :disabled="saving" @click="askRemove(e)">빼기</button>
      </li>
    </ul>
    <p class="aac-note">
      기본 2계정은 잠겨 있어 뺄 수 없습니다(모두 빼서 아무도 못 들어가는 일을 막습니다). 메일로 로그인한 계정만 운영자가 될 수 있습니다.
      <template v-if="loaded && dbList === null"> 지금 목록은 예전 설정에서 가져온 것이며, 처음 더하거나 빼면 DB에 저장됩니다.</template>
    </p>
    <p v-if="meta.updatedAt" class="aac-meta">마지막 저장 {{ when(meta.updatedAt) }} · {{ meta.updatedBy }}</p>
    <p v-if="msg" class="aac-toast">{{ msg }}</p>
    <Teleport to="body"><AppConfirm :box="confirmBox" @close="confirmBox = null" /></Teleport>
  </section>
</template>

<style scoped>
.aac { display: grid; gap: 14px; }
.aac-err { margin: 0; color: #dc2626; font-size: 14px; }
.aac-add { display: flex; gap: 8px; }
.aac-add input { flex: 1; height: 40px; padding: 0 12px; border: 1px solid #dde3ee; border-radius: 8px; font: inherit; font-size: 14px; min-width: 0; }
.aac-add .pri { height: 40px; padding: 0 18px; border: 0; border-radius: 8px; background: #2b6df3; color: #fff; font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; }
.aac-add .pri:disabled { opacity: .45; cursor: default; }
.aac-list { list-style: none; margin: 0; padding: 0; border: 1px solid #e8ebf1; border-radius: 8px; overflow: hidden; }
.aac-list li { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-top: 1px solid #eef1f6; }
.aac-list li:first-child { border-top: 0; }
.aac-list b { font-size: 14px; font-weight: 700; color: #111827; }
.aac-list em { font-style: normal; font-size: 12px; color: #2b6df3; }
.aac-tag { padding: 2px 8px; border-radius: 5px; background: #f1f3f8; color: #6b7280; font-size: 12px; font-weight: 800; }
.aac-tag.base { background: #fff4e5; color: #b45309; }
.aac-lock { margin-left: auto; font-size: 12px; color: #9aa6c4; }
.aac-list .del { margin-left: auto; height: 30px; padding: 0 12px; border: 1px solid #f3c4c4; border-radius: 7px; background: #fff; color: #dc2626; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.aac-note { margin: 0; padding: 10px 12px; border-radius: 8px; background: #f8faff; font-size: 13px; line-height: 1.6; color: #4b5563; }
.aac-meta { margin: 0; font-size: 12px; color: #9aa6c4; text-align: right; }
.aac-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 1200; margin: 0; padding: 10px 16px; border-radius: 8px; background: rgba(17, 24, 39, .92); color: #fff; font-size: 14px; }
</style>
