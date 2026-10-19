<script setup lang="ts">
// 알림 설정 — 무엇을 알려 줄지 고르고, 지금 걸려 있는 알림을 바로 본다.
// 알려 줄 거리를 셈하는 규칙은 services/alerts 에 있다 (화면은 그리기만 한다).
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import AppToast from '../components/AppToast.vue';
import { useAuctionStore } from '../stores/auctionStore';
import { useAuthStore } from '../stores/authStore';
import { useInteriorStore } from '../stores/interiorStore';
import { PHOTO_BUDGET_BYTES, readUsageBytes } from '../services/sitePhotoRepository';
import { loadUserPrefs, saveUserPrefs } from '../services/userPrefsRepository';
import {
  ALERT_DEFS,
  ALERT_GROUPS,
  alertOn,
  buildAlerts,
  ddayText,
  defaultAlertPrefs,
  type AlertItem,
  type AlertKey,
} from '../services/alerts';

const router = useRouter();
const store = useAuctionStore();
const auth = useAuthStore();
const interior = useInteriorStore();

/* ───────── 설정 ───────── */

const prefs = ref<Record<string, boolean>>(defaultAlertPrefs());
const loaded = ref(false);

const loadPrefs = async (uid: string) => {
  loaded.value = false;
  const saved = uid ? (await loadUserPrefs(uid))?.alertPrefs : null;
  prefs.value = { ...defaultAlertPrefs(), ...(saved ?? {}) };
  loaded.value = true;
};

const toastText = ref('');
const toast = (text: string) => {
  toastText.value = text;
  window.setTimeout(() => { toastText.value = ''; }, 1800);
};

const toggle = async (key: AlertKey) => {
  prefs.value = { ...prefs.value, [key]: !alertOn(prefs.value, key) };
  const def = ALERT_DEFS.find((d) => d.key === key);
  toast(`${def?.name ?? '알림'} ${prefs.value[key] ? '켬' : '끔'}`);
  if (auth.uid) await saveUserPrefs(auth.uid, { alertPrefs: prefs.value });
};

/* ───────── 지금 걸린 알림 ───────── */

const photoBytes = ref(0);
const readPhotos = async (uid: string) => {
  photoBytes.value = uid ? await readUsageBytes(uid) : 0;
};

const alerts = computed<AlertItem[]>(() => buildAlerts({
  auctions: store.auctions,
  interior: interior.rows,
  photoBytes: photoBytes.value,
  photoBudget: PHOTO_BUDGET_BYTES,
  prefs: prefs.value,
}));

/** 끈 알림 때문에 안 보이는 줄이 몇 개인지 — 껐다는 사실을 알려 준다 */
const hiddenCount = computed(() => {
  const all = buildAlerts({
    auctions: store.auctions,
    interior: interior.rows,
    photoBytes: photoBytes.value,
    photoBudget: PHOTO_BUDGET_BYTES,
    prefs: defaultAlertPrefs(),
  });
  return Math.max(0, all.length - alerts.value.length);
});

const go = (item: AlertItem) => {
  if (!item.to) return;
  router.push({ path: item.to.path, query: item.to.query });
};

const groupDefs = (title: string) => ALERT_DEFS.filter((d) => d.group === title);

onMounted(() => {
  interior.initialize();
  void loadPrefs(auth.uid);
  void readPhotos(auth.uid);
});
watch(() => auth.uid, (uid) => {
  void loadPrefs(uid);
  void readPhotos(uid);
});
</script>

<template>
  <section class="alr-shell">
    <header class="alr-header">
      <button type="button" class="alr-back" aria-label="뒤로" @click="router.back()">‹</button>
      <h1 class="alr-title">알림 설정</h1>
      <span class="alr-crumb">마이페이지 › 알림</span>
    </header>

    <div class="alr-body">
      <!-- 지금 걸린 알림 -->
      <section class="alr-card">
        <h2 class="alr-card-title">
          지금 알림
          <em v-if="alerts.length" class="alr-count">{{ alerts.length }}</em>
        </h2>

        <ul v-if="alerts.length" class="alr-list">
          <li
            v-for="it in alerts"
            :key="it.id"
            :class="['alr-item', it.tone, { tap: !!it.to }]"
            @click="go(it)"
          >
            <span class="alr-dday">
              <b>{{ it.dday === null ? '•' : ddayText(it.dday) }}</b>
              <small>{{ it.when }}</small>
            </span>
            <span class="alr-txt">
              <strong>{{ it.title }}</strong>
              <small>{{ it.body }}</small>
            </span>
            <span v-if="it.to" class="alr-arr">›</span>
          </li>
        </ul>
        <p v-else class="alr-empty">
          지금 알릴 것은 없다. 기한이 가까워지면 여기에 쌓인다.
        </p>

        <p v-if="hiddenCount" class="alr-hidden">
          꺼 둔 알림 {{ hiddenCount }}건은 보이지 않는다.
        </p>
      </section>

      <!-- 켜고 끄기 -->
      <section v-for="g in ALERT_GROUPS" :key="g.title" class="alr-card">
        <h2 class="alr-card-title">{{ g.title }}</h2>
        <p class="alr-note">{{ g.note }}</p>
        <ul class="alr-opts">
          <li v-for="d in groupDefs(g.title)" :key="d.key" class="alr-opt">
            <span class="alr-opt-txt">
              <strong>{{ d.name }}</strong>
              <small>{{ d.desc }}</small>
            </span>
            <button
              type="button"
              :class="['alr-sw', { on: alertOn(prefs, d.key) }]"
              :aria-pressed="alertOn(prefs, d.key)"
              :aria-label="d.name"
              :disabled="!loaded"
              @click="toggle(d.key)"
            >
              <i />
            </button>
          </li>
        </ul>
      </section>

      <p class="alr-foot">
        지금은 앱을 열었을 때 이 자리에 쌓이는 알림이다. 휴대폰 푸시는 결제 연동과 함께 붙인다.
        잔금 납부 기한은 낙찰일로부터 45일로 셈한다 — 법원 통지서의 기한이 다르면 그쪽을 따르자.
      </p>
    </div>

    <AppToast :visible="!!toastText" :text="toastText" />
    <AppMobileBottomNav active="more" />
  </section>
</template>

<style scoped>
.alr-shell { min-height: 100vh; background: #f4f6fb; padding-bottom: 96px; }
.alr-header { padding: 14px 12px 8px; display: flex; align-items: baseline; gap: 8px; border-bottom: 1px solid #e5e7eb; }
.alr-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 2px; align-self: center;
}
.alr-title { margin: 0; font-size: 20px; font-weight: 800; color: #111827; }
.alr-crumb { margin-left: auto; font-size: 11px; color: #9ca3af; }
.alr-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.alr-card { background: #fff; border-radius: 10px; padding: 12px 14px 14px; }
.alr-card-title { margin: 0; font-size: 13.5px; font-weight: 800; color: #1f3a72; display: flex; align-items: center; gap: 6px; }
.alr-count {
  font-style: normal; font-size: 11px; font-weight: 800; color: #fff; background: #e03b3b;
  min-width: 18px; height: 18px; border-radius: 9px; padding: 0 5px;
  display: inline-flex; align-items: center; justify-content: center;
}
.alr-note { margin: 4px 0 0; font-size: 11.5px; color: #6b7280; word-break: keep-all; }

/* 알림 줄 */
.alr-list { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.alr-item {
  display: flex; align-items: flex-start; gap: 10px;
  border: 1px solid #e3e8f0; border-left-width: 3px; border-radius: 8px;
  padding: 8px 10px; background: #fff;
}
.alr-item.tap { cursor: pointer; }
.alr-item.red { border-left-color: #e03b3b; background: #fff6f6; }
.alr-item.orange { border-left-color: #e8872a; background: #fff9f2; }
.alr-item.blue { border-left-color: #2b6df3; background: #f6f9ff; }
.alr-item.gray { border-left-color: #9aa6c4; }
.alr-dday { display: flex; flex-direction: column; align-items: center; min-width: 56px; }
.alr-dday b { font-size: 12.5px; font-weight: 800; color: #111827; }
.alr-item.red .alr-dday b { color: #c62828; }
.alr-item.orange .alr-dday b { color: #b45309; }
.alr-dday small { margin-top: 2px; font-size: 10px; color: #9ca3af; }
.alr-txt { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.alr-txt strong { font-size: 12.5px; font-weight: 800; color: #111827; word-break: keep-all; }
.alr-txt small { font-size: 11.5px; line-height: 1.6; color: #4b5563; word-break: keep-all; }
.alr-arr { align-self: center; font-size: 18px; color: #c3cbdd; }
.alr-empty { margin: 10px 0 0; font-size: 12px; color: #6b7280; }
.alr-hidden { margin: 8px 0 0; font-size: 11px; color: #9ca3af; }

/* 켜고 끄기 */
.alr-opts { list-style: none; margin: 8px 0 0; padding: 0; }
.alr-opt { display: flex; align-items: center; gap: 10px; padding: 9px 0; }
.alr-opt + .alr-opt { border-top: 1px solid #f1f3f7; }
.alr-opt-txt { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.alr-opt-txt strong { font-size: 12.5px; font-weight: 800; color: #111827; }
.alr-opt-txt small { font-size: 11.5px; line-height: 1.6; color: #6b7280; word-break: keep-all; }
.alr-sw {
  flex: none; width: 42px; height: 24px; border-radius: 12px; border: none;
  background: #d7dced; position: relative; cursor: pointer; transition: background .15s;
}
.alr-sw[disabled] { opacity: .5; cursor: default; }
.alr-sw.on { background: #2a3f8f; }
.alr-sw i {
  position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%;
  background: #fff; transition: left .15s;
}
.alr-sw.on i { left: 21px; }
.alr-foot { margin: 2px 2px 0; font-size: 11px; line-height: 1.7; color: #9ca3af; word-break: keep-all; }
</style>
