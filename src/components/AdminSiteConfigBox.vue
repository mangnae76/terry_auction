<script setup lang="ts">
// 운영 › 점검 모드 · 앱 시작 팝업 — DB siteConfig/main 을 고친다. 웹 · 앱은 components/SiteNotice 가 바로 따라간다.
import { computed, onUnmounted, ref } from 'vue';
import DateTimeField from './DateTimeField.vue';
import { useAuthStore } from '../stores/authStore';
import { userMessage } from '../services/userMessage';
import { emptySiteConfig, popupLive, saveSiteConfig, subscribeSiteConfig, type SiteConfig } from '../services/siteConfigRepository';

const props = defineProps<{ mode: 'maintenance' | 'popup' }>();
const auth = useAuthStore();

/* 서버 값(saved)과 고치는 값(draft)을 따로 — 고치는 동안 다른 운영자가 바꿔도 덮어쓰지 않게 처음 한 번만 채운다 */
const saved = ref<SiteConfig | null>(null);
const draft = ref<SiteConfig>(emptySiteConfig());
const loadErr = ref('');
const stop = subscribeSiteConfig((c) => {
  if (!saved.value) draft.value = JSON.parse(JSON.stringify(c)) as SiteConfig;
  saved.value = c;
  loadErr.value = '';
}, (m) => { loadErr.value = m; });
onUnmounted(stop);

const dirty = computed(() => !!saved.value && JSON.stringify(props.mode === 'maintenance' ? draft.value.maintenance : draft.value.popup)
  !== JSON.stringify(props.mode === 'maintenance' ? saved.value.maintenance : saved.value.popup));

const msg = ref('');
let msgTimer = 0;
const flash = (t: string, ms = 2600) => { msg.value = t; window.clearTimeout(msgTimer); msgTimer = window.setTimeout(() => { msg.value = ''; }, ms); };

const saving = ref(false);
const save = async () => {
  if (props.mode === 'popup' && draft.value.popup.on && !draft.value.popup.title.trim()) { flash('팝업 제목을 적어 주세요.'); return; }
  saving.value = true;
  try {
    /* 내 칸만 바꾸고 다른 칸은 서버 값 그대로 — 두 칸을 오가며 고쳐도 서로 덮지 않게 */
    const base = saved.value ?? emptySiteConfig();
    const next: SiteConfig = props.mode === 'maintenance'
      ? { ...base, maintenance: { ...draft.value.maintenance } }
      : { ...base, popup: { ...draft.value.popup } };
    await saveSiteConfig(next, saved.value, auth.email || '운영자');
    flash(props.mode === 'maintenance'
      ? (next.maintenance.on ? '점검 모드를 켰습니다. 회원에게 바로 점검 화면이 보입니다.' : '점검 모드를 껐습니다.')
      : (next.popup.on ? '팝업을 저장했습니다. 웹 · 앱을 열 때 보입니다.' : '팝업을 껐습니다.'));
  } catch (e) {
    flash(userMessage(e, '저장하지 못했습니다. 잠시 뒤 다시 해 주세요.'), 5000);
  } finally {
    saving.value = false;
  }
};

const live = computed(() => popupLive(draft.value.popup));
</script>

<template>
  <section class="adb-card asc">
    <p v-if="loadErr" class="asc-err">{{ loadErr }}</p>

    <template v-if="mode === 'maintenance'">
      <div class="asc-row">
        <span class="asc-label">점검 모드</span>
        <div class="asc-seg">
          <button type="button" :class="{ on: !draft.maintenance.on }" @click="draft.maintenance.on = false">끔</button>
          <button type="button" :class="{ on: draft.maintenance.on, warn: draft.maintenance.on }" @click="draft.maintenance.on = true">켬</button>
        </div>
        <small>켜면 회원 · 손님의 웹 · 앱에 점검 화면이 덮여 아무것도 고칠 수 없습니다. 운영자는 그대로 씁니다.</small>
      </div>
      <label class="asc-row top">
        <span class="asc-label">안내 글</span>
        <span class="asc-area"><textarea v-model="draft.maintenance.message" rows="4" maxlength="500" placeholder="비우면 '더 나은 서비스를 위해 점검하고 있습니다. 잠시 뒤 다시 들어와 주세요.'" /><small>{{ draft.maintenance.message.length }} / 500</small></span>
      </label>
      <div class="asc-row">
        <span class="asc-label">끝나는 때</span>
        <DateTimeField v-model="draft.maintenance.until" />
        <small>비워 두면 적지 않습니다(예정 시각으로만 보입니다).</small>
      </div>
    </template>

    <template v-else>
      <div class="asc-row">
        <span class="asc-label">시작 팝업</span>
        <div class="asc-seg">
          <button type="button" :class="{ on: !draft.popup.on }" @click="draft.popup.on = false">끔</button>
          <button type="button" :class="{ on: draft.popup.on }" @click="draft.popup.on = true">켬</button>
        </div>
        <small>{{ draft.popup.on ? (live ? '지금 띄우는 중입니다.' : '기간 밖이라 아직 띄우지 않습니다.') : '꺼 두면 띄우지 않습니다.' }}</small>
      </div>
      <label class="asc-row"><span class="asc-label">제목</span><input v-model="draft.popup.title" type="text" maxlength="60" placeholder="예) 11월 업데이트 안내" /></label>
      <label class="asc-row top">
        <span class="asc-label">내용</span>
        <span class="asc-area"><textarea v-model="draft.popup.body" rows="5" maxlength="500" placeholder="웹 · 앱을 열 때 한 번 보일 안내" /><small>{{ draft.popup.body.length }} / 500</small></span>
      </label>
      <label class="asc-row"><span class="asc-label">자세히보기</span><input v-model="draft.popup.linkUrl" type="url" placeholder="https:// (비우면 단추 없음)" /></label>
      <div class="asc-row"><span class="asc-label">시작</span><DateTimeField v-model="draft.popup.startAt" /><small>비우면 바로</small></div>
      <div class="asc-row"><span class="asc-label">끝</span><DateTimeField v-model="draft.popup.endAt" /><small>비우면 계속</small></div>
      <p class="asc-note">회원은 열 때 한 번 보고, '오늘 하루 보지 않기'를 고르면 그날은 다시 안 보입니다. 내용을 고쳐 저장하면 새 팝업으로 다시 보입니다.</p>
    </template>

    <div class="asc-acts">
      <small v-if="saved?.updatedAt">마지막 저장 {{ saved.updatedAt.slice(0, 16).replace('T', ' ') }} · {{ saved.updatedBy }}</small>
      <button type="button" class="pri" :disabled="saving || !dirty" @click="save">{{ saving ? '저장 중' : '저장' }}</button>
    </div>
    <p v-if="msg" class="asc-toast">{{ msg }}</p>
  </section>
</template>

<style scoped>
.asc { display: grid; gap: 14px; }
.asc-err { margin: 0; color: #dc2626; font-size: 14px; }
.asc-row { display: grid; grid-template-columns: 96px auto 1fr; align-items: center; gap: 12px; }
.asc-row.top { align-items: start; }
.asc-row > input, .asc-row > .asc-area { grid-column: 2 / 4; }
.asc-label { font-size: 14px; font-weight: 700; color: #374151; }
.asc-row.top .asc-label { padding-top: 9px; }
.asc-row small { font-size: 13px; color: #6b7280; }
.asc-row input { height: 38px; padding: 0 12px; border: 1px solid #dde3ee; border-radius: 8px; font: inherit; font-size: 14px; min-width: 0; }
.asc-area { position: relative; display: block; }
.asc-area textarea { width: 100%; box-sizing: border-box; padding: 10px 12px 24px; border: 1px solid #dde3ee; border-radius: 8px; font: inherit; font-size: 14px; line-height: 1.6; resize: vertical; }
.asc-area small { position: absolute; right: 10px; bottom: 8px; font-size: 12px; color: #9aa6c4; }
.asc-seg { display: inline-flex; border: 1px solid #dde3ee; border-radius: 8px; overflow: hidden; }
.asc-seg button { height: 34px; padding: 0 18px; border: 0; background: #fff; color: #6b7280; font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; }
.asc-seg button.on { background: #2b6df3; color: #fff; }
.asc-seg button.on.warn { background: #c2410c; }
.asc-note { margin: 0; padding: 10px 12px; border-radius: 8px; background: #f8faff; font-size: 13px; line-height: 1.6; color: #4b5563; }
.asc-acts { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.asc-acts small { font-size: 12px; color: #9aa6c4; }
.asc-acts .pri { height: 38px; padding: 0 22px; border: 0; border-radius: 8px; background: #2b6df3; color: #fff; font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; }
.asc-acts .pri:disabled { opacity: .45; cursor: default; }
.asc-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 1200; margin: 0; padding: 10px 16px; border-radius: 8px; background: rgba(17, 24, 39, .92); color: #fff; font-size: 14px; }
</style>
