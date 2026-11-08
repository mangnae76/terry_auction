<script setup lang="ts">
// 운영 › 탈퇴 처리 — 회원이 마이페이지에서 남긴 탈퇴 신청(DB withdrawRequests)을 보고 '처리완료'로 적는다.
// 로그인 계정 자체는 서버 권한이 있어야 지울 수 있어, 처리 순서를 안내하고 여기서는 상태만 바꾼다.
import { computed, onUnmounted, ref } from 'vue';
import AppConfirm from './AppConfirm.vue';
import type { ConfirmBox } from '../services/confirmBox';
import { useAuthStore } from '../stores/authStore';
import { userMessage } from '../services/userMessage';
import { markLeaveDone, subscribeLeaveRequests, type LeaveRow } from '../services/adminMembersRepository';

const auth = useAuthStore();
const all = ref<LeaveRow[]>([]);
const loadErr = ref('');
const stop = subscribeLeaveRequests((r) => { all.value = r; loadErr.value = ''; }, (m) => { loadErr.value = m; });
onUnmounted(stop);

const tab = ref<'requested' | 'done'>('requested');
const reqN = computed(() => all.value.filter((r) => r.status === 'requested').length);
const rows = computed(() => all.value.filter((r) => r.status === tab.value));

const msg = ref('');
let msgTimer = 0;
const flash = (t: string, ms = 2600) => { msg.value = t; window.clearTimeout(msgTimer); msgTimer = window.setTimeout(() => { msg.value = ''; }, ms); };

const confirmBox = ref<ConfirmBox | null>(null);
const askDone = (r: LeaveRow) => {
  confirmBox.value = {
    title: '처리완료로 적을까요?',
    desc: `${r.email || r.nickname} — 로그인 계정은 Firebase 콘솔 › Authentication 에서 이 메일을 찾아 지운 뒤 누르세요.`,
    okLabel: '처리완료',
    skipKey: '',
    tone: 'calm',
    run: async () => { try { await markLeaveDone(r.uid, auth.email || '운영자'); flash('처리완료로 적었습니다.'); } catch (e) { flash(userMessage(e, '적지 못했습니다.'), 5000); } },
  };
};
const day = (ms: number) => { if (!ms) return '-'; const d = new Date(ms); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };
</script>

<template>
  <section class="adb-card alv">
    <div class="alv-tabs" role="tablist">
      <button type="button" role="tab" :class="{ on: tab === 'requested' }" :aria-selected="tab === 'requested'" @click="tab = 'requested'">신청<em>{{ reqN.toLocaleString('ko-KR') }}</em></button>
      <button type="button" role="tab" :class="{ on: tab === 'done' }" :aria-selected="tab === 'done'" @click="tab = 'done'">처리완료<em>{{ (all.length - reqN).toLocaleString('ko-KR') }}</em></button>
    </div>
    <p v-if="loadErr" class="alv-err">{{ loadErr }}</p>
    <p v-else-if="!rows.length" class="alv-empty">{{ tab === 'requested' ? '처리할 탈퇴 신청이 없습니다.' : '처리한 탈퇴가 없습니다.' }}</p>
    <ul v-else class="alv-list">
      <li v-for="r in rows" :key="r.uid">
        <div class="alv-main">
          <b>{{ r.email || '(메일 없음)' }}</b><span>{{ r.nickname }}</span><small>신청 {{ day(r.requestedAt) }}</small>
          <p v-if="r.reason" class="alv-reason">{{ r.reason }}</p>
          <small v-if="r.status === 'done'" class="alv-done">처리 {{ (r.doneAt || '').slice(0, 10).replace(/-/g, '.') }} · {{ r.doneBy }}</small>
        </div>
        <button v-if="r.status === 'requested'" type="button" class="pri" @click="askDone(r)">처리완료</button>
      </li>
    </ul>
    <p class="alv-note">처리 순서 — ① Firebase 콘솔 › Authentication 에서 그 메일의 계정을 지웁니다 ② 여기서 처리완료를 누릅니다. 전화번호는 안내대로 3개월 보관 뒤 지웁니다.</p>
    <p v-if="msg" class="alv-toast">{{ msg }}</p>
    <Teleport to="body"><AppConfirm :box="confirmBox" @close="confirmBox = null" /></Teleport>
  </section>
</template>

<style scoped>
.alv { display: grid; gap: 12px; }
.alv-tabs { display: flex; gap: 6px; }
.alv-tabs button { height: 32px; padding: 0 14px; border: 1px solid #dde3ee; border-radius: 999px; background: #fff; color: #4b5563; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.alv-tabs button.on { border-color: #2b6df3; background: #eef3ff; color: #2b6df3; }
.alv-tabs em { font-style: normal; margin-left: 6px; }
.alv-err { margin: 0; color: #dc2626; font-size: 14px; }
.alv-empty { margin: 0; padding: 28px 0; text-align: center; font-size: 14px; color: #9aa6c4; }
.alv-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.alv-list li { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid #e8ebf1; border-radius: 8px; }
.alv-main { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
.alv-main b { font-size: 14px; color: #111827; }
.alv-main span { font-size: 13px; color: #4b5563; }
.alv-main small { font-size: 12px; color: #9aa6c4; }
.alv-reason { flex-basis: 100%; margin: 4px 0 0; font-size: 13px; line-height: 1.6; color: #374151; white-space: pre-wrap; }
.alv-done { flex-basis: 100%; }
.alv-list .pri { height: 34px; padding: 0 14px; border: 0; border-radius: 8px; background: #2b6df3; color: #fff; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; }
.alv-note { margin: 0; padding: 10px 12px; border-radius: 8px; background: #f8faff; font-size: 13px; line-height: 1.6; color: #4b5563; }
.alv-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 1200; margin: 0; padding: 10px 16px; border-radius: 8px; background: rgba(17, 24, 39, .92); color: #fff; font-size: 14px; }
</style>
