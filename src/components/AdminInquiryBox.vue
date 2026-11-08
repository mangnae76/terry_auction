<script setup lang="ts">
// 운영 › 문의함 · 제보 처리 — 회원이 고객센터 › 1:1 문의에 남긴 글을 보고 답한다(DB inquiries).
// mode 'inquiries' 는 정보오류제보를 뺀 문의, 'reports' 는 정보오류제보만.
import { computed, onUnmounted, ref } from 'vue';
import AppConfirm from './AppConfirm.vue';
import type { ConfirmBox } from '../services/confirmBox';
import { useAuthStore } from '../stores/authStore';
import { userMessage } from '../services/userMessage';
import {
  answerInquiry,
  INQUIRY_BODY_MAX,
  isReport,
  removeInquiry,
  subscribeAllInquiries,
  type Inquiry,
} from '../services/inquiryRepository';

const props = defineProps<{ mode: 'inquiries' | 'reports' }>();
const auth = useAuthStore();

const all = ref<Inquiry[]>([]);
const loadErr = ref('');
const stop = subscribeAllInquiries((rows) => { all.value = rows; loadErr.value = ''; }, (m) => { loadErr.value = m; });
onUnmounted(stop);

const mine = computed(() => all.value.filter((q) => (props.mode === 'reports' ? isReport(q) : !isReport(q))));
const tab = ref<'open' | 'answered'>('open');
const openN = computed(() => mine.value.filter((q) => q.status !== 'answered').length);
const doneN = computed(() => mine.value.length - openN.value);
const rows = computed(() => mine.value.filter((q) => (tab.value === 'open' ? q.status !== 'answered' : q.status === 'answered')));

const openId = ref('');
const draft = ref('');
const toggle = (q: Inquiry) => {
  if (openId.value === q.id) { openId.value = ''; return; }
  openId.value = q.id;
  draft.value = q.answer ?? '';
};

const msg = ref('');
let msgTimer = 0;
const flash = (t: string, ms = 2600) => { msg.value = t; window.clearTimeout(msgTimer); msgTimer = window.setTimeout(() => { msg.value = ''; }, ms); };

const saving = ref(false);
const send = async (q: Inquiry) => {
  if (!draft.value.trim()) { flash('답을 적어 주세요.'); return; }
  saving.value = true;
  try {
    await answerInquiry(q.id, draft.value, auth.email || auth.nickname || '운영자');
    flash(q.status === 'answered' ? '답을 고쳤습니다.' : '답을 보냈습니다. 회원의 내 문의에 바로 보입니다.');
    openId.value = '';
  } catch (e) {
    flash(userMessage(e, '보내지 못했습니다. 잠시 뒤 다시 해 주세요.'), 5000);
  } finally {
    saving.value = false;
  }
};

const confirmBox = ref<ConfirmBox | null>(null);
const askRemove = (q: Inquiry) => {
  confirmBox.value = {
    title: '이 문의를 지울까요?',
    desc: '회원의 내 문의에서도 사라집니다.',
    okLabel: '지우기',
    skipKey: '',
    run: async () => { try { await removeInquiry(q.id); flash('지웠습니다.'); } catch (e) { flash(userMessage(e, '지우지 못했습니다.')); } },
  };
};

const when = (iso?: string) => (iso ? `${iso.slice(0, 10).replace(/-/g, '.')} ${iso.slice(11, 16)}` : '');
</script>

<template>
  <section class="adb-card aiq">
    <header class="aiq-head">
      <div class="aiq-tabs" role="tablist">
        <button type="button" role="tab" :class="{ on: tab === 'open' }" :aria-selected="tab === 'open'" @click="tab = 'open'">답변대기<em>{{ openN.toLocaleString('ko-KR') }}</em></button>
        <button type="button" role="tab" :class="{ on: tab === 'answered' }" :aria-selected="tab === 'answered'" @click="tab = 'answered'">답변완료<em>{{ doneN.toLocaleString('ko-KR') }}</em></button>
      </div>
    </header>

    <p v-if="loadErr" class="aiq-empty">{{ loadErr }}</p>
    <p v-else-if="!rows.length" class="aiq-empty">{{ tab === 'open' ? '답을 기다리는 글이 없습니다.' : '답한 글이 없습니다.' }}</p>
    <ul v-else class="aiq-list">
      <li v-for="q in rows" :key="q.id" :class="{ open: openId === q.id }">
        <button type="button" class="aiq-line" :aria-expanded="openId === q.id" @click="toggle(q)">
          <small class="aiq-when">{{ when(q.createdAt) }}</small>
          <span class="aiq-who">{{ q.nickname || q.email || '회원' }}</span>
          <span class="aiq-kind">{{ q.kind }}</span>
          <b>{{ q.title }}</b>
        </button>
        <div v-if="openId === q.id" class="aiq-detail">
          <p class="aiq-meta">{{ q.email }}<template v-if="q.caseNumber"> · 사건번호 {{ q.caseNumber }}</template></p>
          <p class="aiq-text">{{ q.body }}</p>
          <p v-if="q.status === 'answered'" class="aiq-meta">답한 때 {{ when(q.answeredAt) }} · {{ q.answeredBy }}</p>
          <span class="aiq-ans">
            <textarea v-model="draft" rows="5" :maxlength="INQUIRY_BODY_MAX" placeholder="회원에게 보일 답을 적어 주세요" />
            <small>{{ draft.length.toLocaleString('ko-KR') }} / {{ INQUIRY_BODY_MAX.toLocaleString('ko-KR') }}</small>
          </span>
          <div class="aiq-acts">
            <button type="button" class="del" @click="askRemove(q)">지우기</button>
            <button type="button" class="pri" :disabled="saving" @click="send(q)">{{ saving ? '보내는 중' : q.status === 'answered' ? '답고치기' : '답보내기' }}</button>
          </div>
        </div>
      </li>
    </ul>

    <p v-if="msg" class="aiq-toast">{{ msg }}</p>
    <Teleport to="body"><AppConfirm :box="confirmBox" @close="confirmBox = null" /></Teleport>
  </section>
</template>

<style scoped>
.aiq { display: grid; gap: 12px; }
.aiq-tabs { display: flex; gap: 6px; }
.aiq-tabs button { height: 32px; padding: 0 14px; border: 1px solid #dde3ee; border-radius: 999px; background: #fff; color: #4b5563; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.aiq-tabs button.on { border-color: #2b6df3; background: #eef3ff; color: #2b6df3; }
.aiq-tabs em { font-style: normal; margin-left: 6px; }
.aiq-empty { margin: 0; padding: 28px 0; text-align: center; font-size: 14px; color: #9aa6c4; }
.aiq-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.aiq-list li { border: 1px solid #e8ebf1; border-radius: 8px; }
.aiq-list li.open { border-color: #c7d2ea; background: #f8faff; }
.aiq-line { width: 100%; display: grid; grid-template-columns: 112px 110px 84px 1fr; align-items: center; gap: 10px; padding: 10px 12px; border: 0; background: transparent; font: inherit; text-align: left; cursor: pointer; }
.aiq-line b { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 700; color: #111827; }
.aiq-when { font-size: 12px; color: #9aa6c4; }
.aiq-who { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: #374151; }
.aiq-kind { font-size: 12px; color: #6b7280; }
.aiq-detail { padding: 0 12px 12px; display: grid; gap: 8px; }
.aiq-meta { margin: 0; font-size: 12px; color: #6b7280; }
.aiq-text { margin: 0; font-size: 14px; line-height: 1.7; color: #374151; white-space: pre-wrap; word-break: keep-all; }
.aiq-ans { position: relative; display: block; }
.aiq-ans textarea { width: 100%; box-sizing: border-box; min-height: 120px; padding: 10px 12px 24px; border: 1px solid #dde3ee; border-radius: 8px; font: inherit; font-size: 14px; line-height: 1.6; resize: vertical; }
.aiq-ans small { position: absolute; right: 10px; bottom: 8px; font-size: 12px; color: #9aa6c4; }
.aiq-acts { display: flex; justify-content: flex-end; gap: 8px; }
.aiq-acts button { height: 34px; padding: 0 16px; border: 1px solid #dde3ee; border-radius: 8px; background: #fff; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; }
.aiq-acts .pri { border-color: #2b6df3; background: #2b6df3; color: #fff; }
.aiq-acts .pri:disabled { opacity: .5; cursor: default; }
.aiq-acts .del { border-color: #f3c4c4; color: #dc2626; }
.aiq-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 1200; margin: 0; padding: 10px 16px; border-radius: 8px; background: rgba(17, 24, 39, .92); color: #fff; font-size: 14px; }
</style>
