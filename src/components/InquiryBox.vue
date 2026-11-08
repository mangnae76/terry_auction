<script setup lang="ts">
// 고객센터 › 1:1 문의 — 회원이 문의 · 정보 오류 제보를 남기고, 운영자의 답을 '내 문의'에서 본다.
// 저장은 services/inquiryRepository(DB inquiries). 운영자는 운영 › 문의함 · 제보 처리에서 답한다.
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AppConfirm from './AppConfirm.vue';
import type { ConfirmBox } from '../services/confirmBox';
import { useAuthStore } from '../stores/authStore';
import { userMessage } from '../services/userMessage';
import {
  createInquiry,
  INQUIRY_BODY_MAX,
  INQUIRY_KINDS,
  INQUIRY_TITLE_MAX,
  removeInquiry,
  REPORT_KIND,
  subscribeMyInquiries,
  type Inquiry,
  type InquiryKind,
} from '../services/inquiryRepository';

const auth = useAuthStore();
const router = useRouter();

const kind = ref<InquiryKind>('이용문의');
const title = ref('');
const body = ref('');
const caseNumber = ref('');
const sending = ref(false);
const msg = ref('');
let msgTimer = 0;
const flash = (t: string, ms = 2600) => { msg.value = t; window.clearTimeout(msgTimer); msgTimer = window.setTimeout(() => { msg.value = ''; }, ms); };

/* 내 문의 — 로그인한 계정이 바뀌면 다시 듣는다 */
const mine = ref<Inquiry[]>([]);
const loadErr = ref('');
let stop: () => void = () => {};
watch(() => auth.uid, (uid) => {
  stop();
  mine.value = [];
  stop = subscribeMyInquiries(uid, (rows) => { mine.value = rows; loadErr.value = ''; }, (m) => { loadErr.value = m; });
}, { immediate: true });
onUnmounted(() => stop());

const openId = ref('');
const toggle = (id: string) => { openId.value = openId.value === id ? '' : id; };

const canSend = computed(() => !!title.value.trim() && !!body.value.trim() && !sending.value);
const send = async () => {
  if (!auth.uid) { router.push('/login'); return; }
  if (!title.value.trim()) { flash('제목을 적어 주세요.'); return; }
  if (!body.value.trim()) { flash('내용을 적어 주세요.'); return; }
  sending.value = true;
  try {
    const id = await createInquiry({
      uid: auth.uid, email: auth.email, nickname: auth.nickname,
      kind: kind.value, title: title.value, body: body.value, caseNumber: caseNumber.value,
    });
    title.value = ''; body.value = ''; caseNumber.value = '';
    openId.value = id;
    flash('문의를 보냈습니다. 답이 오면 아래 내 문의에 보입니다.');
  } catch (e) {
    flash(userMessage(e, '보내지 못했습니다. 잠시 뒤 다시 해 주세요.'), 5000);
  } finally {
    sending.value = false;
  }
};

const confirmBox = ref<ConfirmBox | null>(null);
const askRemove = (q: Inquiry) => {
  confirmBox.value = {
    title: '이 문의를 지울까요?',
    desc: '아직 답이 오지 않은 문의만 지울 수 있습니다.',
    okLabel: '지우기',
    skipKey: '',
    run: async () => { try { await removeInquiry(q.id); flash('지웠습니다.'); } catch (e) { flash(userMessage(e, '지우지 못했습니다.')); } },
  };
};

const day = (iso?: string) => (iso ? iso.slice(0, 10).replace(/-/g, '.') : '');
</script>

<template>
  <section class="inq">
    <header class="inq-head">
      <h2>1:1 문의</h2>
      <p>운영자가 확인해 답해 드립니다. 답은 아래 내 문의에서 볼 수 있습니다.</p>
    </header>

    <div v-if="!auth.uid" class="inq-out">
      <p>로그인하면 문의를 남기고 답을 받을 수 있습니다.</p>
      <button type="button" class="inq-btn pri" @click="router.push('/login')">로그인</button>
    </div>

    <template v-else>
      <div class="inq-form">
        <div class="inq-row">
          <span class="inq-label">종류</span>
          <div class="inq-kinds">
            <button v-for="k in INQUIRY_KINDS" :key="k" type="button" :class="{ on: kind === k }" @click="kind = k">{{ k }}</button>
          </div>
        </div>
        <label v-if="kind === REPORT_KIND" class="inq-row">
          <span class="inq-label">사건번호</span>
          <input v-model="caseNumber" type="text" maxlength="40" placeholder="예) 2026타경503385 (모르면 비워 두세요)" />
        </label>
        <label class="inq-row">
          <span class="inq-label">제목</span>
          <input v-model="title" type="text" :maxlength="INQUIRY_TITLE_MAX" placeholder="무엇이 궁금하신가요" />
        </label>
        <label class="inq-row top">
          <span class="inq-label">내용</span>
          <span class="inq-body">
            <textarea v-model="body" rows="6" :maxlength="INQUIRY_BODY_MAX" :placeholder="kind === REPORT_KIND ? '어느 정보가 어떻게 틀렸는지 적어 주세요' : '자세히 적어 주시면 더 빨리 답해 드립니다'" />
            <small>{{ body.length.toLocaleString('ko-KR') }} / {{ INQUIRY_BODY_MAX.toLocaleString('ko-KR') }}</small>
          </span>
        </label>
        <div class="inq-acts">
          <button type="button" class="inq-btn pri" :disabled="!canSend" @click="send">{{ sending ? '보내는 중' : '문의보내기' }}</button>
        </div>
      </div>

      <div class="inq-mine">
        <h3>내 문의 <em>{{ mine.length.toLocaleString('ko-KR') }}</em></h3>
        <p v-if="loadErr" class="inq-empty">{{ loadErr }}</p>
        <p v-else-if="!mine.length" class="inq-empty">아직 남긴 문의가 없습니다.</p>
        <ul v-else class="inq-list">
          <li v-for="q in mine" :key="q.id" :class="{ open: openId === q.id }">
            <button type="button" class="inq-line" :aria-expanded="openId === q.id" @click="toggle(q.id)">
              <span :class="['inq-st', q.status]">{{ q.status === 'answered' ? '답변완료' : '답변대기' }}</span>
              <span class="inq-kind">{{ q.kind }}</span>
              <b>{{ q.title }}</b>
              <small>{{ day(q.createdAt) }}</small>
            </button>
            <div v-if="openId === q.id" class="inq-detail">
              <p v-if="q.caseNumber" class="inq-case">사건번호 {{ q.caseNumber }}</p>
              <p class="inq-text">{{ q.body }}</p>
              <div v-if="q.status === 'answered'" class="inq-answer">
                <span>운영자 답변 · {{ day(q.answeredAt) }}</span>
                <p>{{ q.answer }}</p>
              </div>
              <button v-else type="button" class="inq-del" @click="askRemove(q)">지우기</button>
            </div>
          </li>
        </ul>
      </div>
    </template>

    <p v-if="msg" class="inq-toast">{{ msg }}</p>
    <Teleport to="body"><AppConfirm :box="confirmBox" @close="confirmBox = null" /></Teleport>
  </section>
</template>

<style scoped>
.inq { background: #fff; border-radius: 10px; padding: 18px 20px 20px; display: grid; gap: 14px; }
.inq-head h2 { margin: 0; font-size: 16px; font-weight: 800; color: #111827; }
.inq-head p { margin: 4px 0 0; font-size: 13px; color: #6b7280; }
.inq-out { display: grid; justify-items: center; gap: 12px; padding: 24px 0; }
.inq-out p { margin: 0; font-size: 14px; color: #4b5563; }
.inq-form { display: grid; gap: 10px; }
.inq-row { display: grid; grid-template-columns: 64px 1fr; align-items: center; gap: 10px; }
.inq-row.top { align-items: start; }
.inq-label { font-size: 13px; font-weight: 700; color: #4b5563; }
.inq-row.top .inq-label { padding-top: 9px; }
.inq-kinds { display: flex; flex-wrap: wrap; gap: 6px; }
.inq-kinds button { height: 30px; padding: 0 12px; border: 1px solid #dde3ee; border-radius: 999px; background: #fff; color: #4b5563; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.inq-kinds button.on { border-color: #2b6df3; background: #eef3ff; color: #2b6df3; }
.inq-row input { height: 38px; padding: 0 12px; border: 1px solid #dde3ee; border-radius: 8px; font: inherit; font-size: 14px; min-width: 0; }
.inq-body { position: relative; display: block; }
.inq-body textarea { width: 100%; box-sizing: border-box; min-height: 140px; padding: 10px 12px 24px; border: 1px solid #dde3ee; border-radius: 8px; font: inherit; font-size: 14px; line-height: 1.6; resize: vertical; }
.inq-body small { position: absolute; right: 10px; bottom: 8px; font-size: 12px; color: #9aa6c4; }
.inq-acts { display: flex; justify-content: flex-end; }
.inq-btn { height: 38px; padding: 0 18px; border: 1px solid #c9d6f5; border-radius: 8px; background: #fff; color: #2b6df3; font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; }
.inq-btn.pri { border-color: #2b6df3; background: #2b6df3; color: #fff; }
.inq-btn:disabled { opacity: .5; cursor: default; }
.inq-mine { border-top: 1px solid #eef1f6; padding-top: 14px; }
.inq-mine h3 { margin: 0 0 8px; font-size: 14px; font-weight: 800; color: #111827; }
.inq-mine h3 em { font-style: normal; color: #2b6df3; margin-left: 4px; }
.inq-empty { margin: 0; padding: 18px 0; text-align: center; font-size: 13px; color: #9aa6c4; }
.inq-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.inq-list li { border: 1px solid #e8ebf1; border-radius: 8px; }
.inq-list li.open { border-color: #c7d2ea; background: #f8faff; }
.inq-line { width: 100%; display: grid; grid-template-columns: auto auto 1fr auto; align-items: center; gap: 8px; padding: 10px 12px; border: 0; background: transparent; font: inherit; text-align: left; cursor: pointer; }
.inq-line b { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 700; color: #111827; }
.inq-line small { font-size: 12px; color: #9aa6c4; }
.inq-st { padding: 2px 8px; border-radius: 5px; font-size: 12px; font-weight: 800; background: #fff4e5; color: #b45309; }
.inq-st.answered { background: #e8f6ee; color: #15803d; }
.inq-kind { font-size: 12px; color: #6b7280; }
.inq-detail { padding: 0 12px 12px; display: grid; gap: 8px; }
.inq-case { margin: 0; font-size: 13px; color: #4b5563; }
.inq-text { margin: 0; font-size: 14px; line-height: 1.7; color: #374151; white-space: pre-wrap; word-break: keep-all; }
.inq-answer { padding: 10px 12px; border-radius: 8px; background: #eef3ff; }
.inq-answer span { font-size: 12px; font-weight: 800; color: #2b6df3; }
.inq-answer p { margin: 6px 0 0; font-size: 14px; line-height: 1.7; color: #1f2937; white-space: pre-wrap; word-break: keep-all; }
.inq-del { justify-self: end; height: 30px; padding: 0 12px; border: 1px solid #f3c4c4; border-radius: 7px; background: #fff; color: #dc2626; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.inq-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 1200; margin: 0; padding: 10px 16px; border-radius: 8px; background: rgba(17, 24, 39, .92); color: #fff; font-size: 14px; }
</style>
