<script setup lang="ts">
// 점검 화면 · 시작 팝업 — 운영 › 점검 모드 · 앱 시작 팝업(DB siteConfig/main)을 따라 웹 · 앱 맨 위에 띄운다.
// 앱은 AppShell 이, 웹은 껍데기가 mountSiteNotice 로 붙인다(같은 부품 하나).
//  - 점검 모드: 회원 · 손님에게는 화면 전체를 덮는 점검 안내(쓰기도 막힌다). 운영자에게는 위에 얇은 알림 띠만.
//    운영자가 로그아웃 상태여도 끌 수 있게 '운영자 로그인' 단추를 둔다.
//  - 시작 팝업: 기간 안이면 열 때 한 번. '오늘 하루 보지 않기'는 팝업을 고치면(version) 다시 풀린다.
import { computed, inject, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/authStore';
import { isAdminEmail } from '../services/accessControl';
import { emptySiteConfig, popupLive, subscribeSiteConfig, type SiteConfig } from '../services/siteConfigRepository';
import { todayStamp } from '../services/confirmBox';
import { memberBlockOf, touchLastSeen } from '../services/memberStatus';

const web = inject('webEmbed', false);
const route = web ? null : useRoute();
const router = web ? null : useRouter();
const auth = useAuthStore();

const cfg = ref<SiteConfig>(emptySiteConfig());
const loaded = ref(false);
const stop = subscribeSiteConfig((c) => { cfg.value = c; loaded.value = true; });
onUnmounted(stop);

const admin = computed(() => isAdminEmail(auth.email));
/* 회원 이용 제한 — 운영 › 회원 관리에서 차단하거나 이용 기한이 지나면 화면 전체를 덮고 로그아웃만 남긴다(2026-11-13 사용자). 운영자는 늘 통과.
   로그인할 때마다 한 번 읽고, 마지막 접속일도 하루 한 번 적는다 */
const memberBlock = ref<Awaited<ReturnType<typeof memberBlockOf>>>(null);
watch(() => auth.uid, async (uid) => {
  memberBlock.value = null;
  if (!uid) return;
  void touchLastSeen(uid);
  memberBlock.value = await memberBlockOf(uid, auth.email);
}, { immediate: true });
const memberOut = async () => {
  if (web) { (document.getElementById('gOut') as HTMLButtonElement | null)?.click(); return; }
  await auth.logout();
  void router?.push('/login');
};
const memberUntil = computed(() => (memberBlock.value?.until ? memberBlock.value.until.replace(/-/g, '.') : ''));
/* 운영자 로그인을 누르면 이번 창에서는 점검 화면을 잠깐 걷는다 — 로그인 창이 그 위에 떠야 해서.
   로그인했는데 운영자가 아니면 다시 덮는다 */
const tryingLogin = ref(false);
const onLoginPage = computed(() => !!route && ['/login', '/signup'].includes(route.path));
const blocked = computed(() => loaded.value && cfg.value.maintenance.on && !admin.value && !onLoginPage.value
  && !(tryingLogin.value && !auth.isLoggedIn));
const adminBar = computed(() => loaded.value && cfg.value.maintenance.on && admin.value);
const adminLogin = () => {
  tryingLogin.value = true;
  if (web) window.dispatchEvent(new CustomEvent('myturn:login'));
  else void router?.push('/login');
};
const reload = () => window.location.reload();
const untilText = computed(() => {
  const u = cfg.value.maintenance.until;
  if (!u) return '';
  const [d, t] = u.split('T');
  return `${d.replace(/-/g, '.')} ${t ?? ''}`.trim();
});

/* 시작 팝업 — 이번 창에서 한 번, 오늘 하루 보지 않기 */
const SKIP_KEY = 'myturn.popup.skip';
const SEEN_KEY = 'myturn.popup.seen';
const closedNow = ref(false);
const skipped = (v: number) => { try { return localStorage.getItem(SKIP_KEY) === `${v}:${todayStamp()}`; } catch { return false; } };
const seen = (v: number) => { try { return sessionStorage.getItem(SEEN_KEY) === String(v); } catch { return false; } };
const showPopup = computed(() => {
  const p = cfg.value.popup;
  return loaded.value && !blocked.value && !closedNow.value && popupLive(p) && !onLoginPage.value && !skipped(p.version) && !seen(p.version);
});
const skipToday = ref(false);
const closePopup = () => {
  const v = cfg.value.popup.version;
  try { sessionStorage.setItem(SEEN_KEY, String(v)); } catch { /* 이번 창만 */ }
  if (skipToday.value) { try { localStorage.setItem(SKIP_KEY, `${v}:${todayStamp()}`); } catch { /* 그만 */ } }
  closedNow.value = true;
};
const openLink = () => {
  const u = cfg.value.popup.linkUrl;
  closePopup();
  if (u) window.open(u, '_blank', 'noopener');
};
</script>

<template>
  <!-- 점검 화면 — 회원 · 손님 -->
  <div v-if="blocked" class="sn-block" role="alertdialog" aria-modal="true" aria-labelledby="snT">
    <div class="sn-box">
      <div class="sn-ic" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" /></svg>
      </div>
      <h2 id="snT">서비스 점검 중입니다</h2>
      <p class="sn-msg">{{ cfg.maintenance.message || '더 나은 서비스를 위해 점검하고 있습니다. 잠시 뒤 다시 들어와 주세요.' }}</p>
      <p v-if="untilText" class="sn-until">끝나는 때 {{ untilText }} (예정)</p>
      <div class="sn-acts">
        <button type="button" class="pri" @click="reload">새로고침</button>
        <button type="button" class="ghost" @click="adminLogin">운영자로그인</button>
      </div>
    </div>
  </div>

  <!-- 이용 제한 — 차단 · 이용 기한 만료(운영 › 회원 관리) -->
  <div v-if="memberBlock && !blocked && !onLoginPage" class="sn-block" role="alertdialog" aria-modal="true" aria-labelledby="snMT">
    <div class="sn-box">
      <div class="sn-ic" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M5.7 5.7l12.6 12.6" /></svg>
      </div>
      <h2 id="snMT">{{ memberBlock.state === 'blocked' ? '이용이 제한된 계정입니다' : '이용 기한이 끝났습니다' }}</h2>
      <p class="sn-msg"><template v-if="memberBlock.state === 'blocked'">{{ memberBlock.reason || '운영 정책에 따라 이 계정의 이용을 멈췄습니다.' }}</template><template v-else>{{ memberUntil }}까지 이용할 수 있는 계정입니다.</template></p>
      <p class="sn-until">문의는 고객센터(이메일)로 보내 주세요.</p>
      <div class="sn-acts">
        <button type="button" class="pri" @click="memberOut">로그아웃</button>
      </div>
    </div>
  </div>

  <!-- 운영자 — 점검 중임을 알리는 띠 -->
  <div v-if="adminBar" class="sn-bar" role="status">
    점검 모드가 켜져 있습니다. 회원에게는 점검 화면이 보입니다.
    <a href="/admin/board">운영에서끄기</a>
  </div>

  <!-- 시작 팝업 -->
  <div v-if="showPopup" class="sn-pop-back" @click.self="closePopup">
    <div class="sn-pop" role="dialog" aria-modal="true" aria-labelledby="snPopT">
      <h2 id="snPopT">{{ cfg.popup.title }}</h2>
      <p v-if="cfg.popup.body" class="sn-pop-body">{{ cfg.popup.body }}</p>
      <button v-if="cfg.popup.linkUrl" type="button" class="sn-pop-link" @click="openLink">자세히보기</button>
      <div class="sn-pop-foot">
        <label><input v-model="skipToday" type="checkbox" /> 오늘 하루 보지 않기</label>
        <button type="button" @click="closePopup">닫기</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sn-block { position: fixed; inset: 0; z-index: 3000; display: grid; place-items: center; padding: 16px; background: #f4f6fb; }
.sn-box { width: min(440px, 100%); padding: 32px 28px 28px; border-radius: 16px; background: #fff; box-shadow: 0 12px 40px rgba(15, 23, 42, .12); text-align: center; display: grid; gap: 12px; justify-items: center; }
.sn-ic { width: 60px; height: 60px; border-radius: 50%; display: grid; place-items: center; background: #fff4e5; color: #c2410c; }
.sn-box h2 { margin: 0; font-size: 20px; font-weight: 800; color: #111827; }
.sn-msg { margin: 0; font-size: 15px; line-height: 1.7; color: #374151; white-space: pre-wrap; word-break: keep-all; }
.sn-until { margin: 0; font-size: 14px; color: #6b7280; }
.sn-acts { display: flex; gap: 8px; margin-top: 6px; }
.sn-acts button { height: 40px; padding: 0 18px; border-radius: 8px; font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; }
.sn-acts .pri { border: 1px solid #2b6df3; background: #2b6df3; color: #fff; }
.sn-acts .ghost { border: 1px solid #dde3ee; background: #fff; color: #6b7280; }
.sn-bar { position: fixed; left: 50%; top: 8px; transform: translateX(-50%); z-index: 2500; padding: 8px 14px; border-radius: 999px; background: #c2410c; color: #fff; font-size: 13px; box-shadow: 0 4px 14px rgba(0, 0, 0, .15); white-space: nowrap; }
.sn-bar a { margin-left: 10px; color: #fff; font-weight: 800; text-decoration: underline; }
.sn-pop-back { position: fixed; inset: 0; z-index: 2400; display: grid; place-items: center; padding: 16px; background: rgba(15, 23, 42, .45); }
.sn-pop { width: min(420px, 100%); padding: 24px 22px 14px; border-radius: 14px; background: #fff; display: grid; gap: 12px; }
.sn-pop h2 { margin: 0; font-size: 18px; font-weight: 800; color: #111827; }
.sn-pop-body { margin: 0; font-size: 15px; line-height: 1.7; color: #374151; white-space: pre-wrap; word-break: keep-all; }
.sn-pop-link { height: 42px; border: 0; border-radius: 8px; background: #2b6df3; color: #fff; font: inherit; font-size: 15px; font-weight: 800; cursor: pointer; }
.sn-pop-foot { display: flex; align-items: center; justify-content: space-between; padding-top: 10px; border-top: 1px solid #eef1f6; }
.sn-pop-foot label { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #6b7280; cursor: pointer; }
.sn-pop-foot button { height: 32px; padding: 0 14px; border: 0; background: transparent; font: inherit; font-size: 14px; font-weight: 800; color: #374151; cursor: pointer; }
</style>
