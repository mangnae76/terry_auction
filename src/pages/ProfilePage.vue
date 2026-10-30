<script setup lang="ts">
// 내 정보 수정 — 비밀번호·연락처·주소를 고친다.
// 더보기의 '정보 수정' 알약과 마이페이지의 '내 정보 수정'에서 들어온다.
import { computed, inject, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import AppToast from '../components/AppToast.vue';
import { useAuthStore } from '../stores/authStore';
import { useAuctionStore } from '../stores/auctionStore';
import {
  BIZ_TYPES,
  changePassword,
  emptyAccountDetail,
  hasPasswordLogin,
  loadAccountDetail,
  saveAccountDetail,
  type AccountDetail,
} from '../services/authRepository';

const router = useRouter();
const auth = useAuthStore();
const webEmbed = inject<boolean>('webEmbed', false);
// 웹 — 사업자 구분 · 주택 보유수는 적고, 매출은 매도 기록(매도일 · 매도가)으로 해마다 저절로 셈한다
const auctionStore = useAuctionStore();
const thisYear = new Date().getFullYear();
const salesOf = (y: number) => auctionStore.auctions
  .filter((a) => String(a.sellDate ?? '').startsWith(String(y)))
  .reduce((sum, a) => sum + (a.expectedSaleValue || 0), 0);
const wonText = (n: number) => (n ? `${n.toLocaleString('ko-KR')}원` : '매도 기록 없음');

/** 자주 쓰는 메일 주소는 골라 넣는다 */
const MAIL_DOMAINS = ['직접입력', 'naver.com', 'gmail.com', 'daum.net', 'hanmail.net', 'nate.com', 'kakao.com'];

const form = ref<AccountDetail>(emptyAccountDetail());
const domainPick = ref('직접입력');
const loading = ref(true);

/** 아이디 — 로그인에 쓰는 메일의 앞쪽 */
const loginId = computed(() => (auth.email ?? '').split('@')[0] || '-');
/** 카카오·네이버로 들어왔으면 바꿀 비밀번호가 없다 */
const canChangePw = computed(() => hasPasswordLogin());

const currentPw = ref('');
const nextPw = ref('');
const nextPw2 = ref('');

/** 번호는 실수로 고치는 일이 없게 잠가 둔다 */
const phoneLocked = ref(true);

const load = async (uid: string) => {
  loading.value = true;
  const saved = await loadAccountDetail(uid);
  // 닉네임은 로그인 정보가 먼저다 (저장된 것이 비어 있을 수 있다)
  form.value = { ...saved, nickname: saved.nickname || auth.nickname };
  domainPick.value = MAIL_DOMAINS.includes(saved.emailDomain) ? saved.emailDomain : '직접입력';
  phoneLocked.value = true;
  loading.value = false;
};
onMounted(() => { void load(auth.uid); });
watch(() => auth.uid, (uid) => { void load(uid); });

watch(domainPick, (v) => {
  if (v !== '직접입력') form.value.emailDomain = v;
});

const onPhone = (key: 'phone1' | 'phone2' | 'phone3', el: HTMLInputElement) => {
  const digits = el.value.replace(/\D/g, '').slice(0, key === 'phone1' ? 3 : 4);
  form.value[key] = digits;
  if (el.value !== digits) el.value = digits;
};

const toastText = ref('');
const toastTone = ref<'info' | 'success' | 'error'>('success');
const toast = (text: string, tone: 'info' | 'success' | 'error' = 'success') => {
  toastTone.value = tone;
  toastText.value = text;
  window.setTimeout(() => { toastText.value = ''; }, 2000);
};

const saving = ref(false);
const submit = async () => {
  if (!auth.uid) { toast('로그인한 뒤에 저장됩니다.', 'error'); return; }
  const wantsPw = !!(nextPw.value || nextPw2.value);
  if (wantsPw) {
    if (!canChangePw.value) { toast('소셜 계정은 비밀번호를 바꿀 수 없습니다.', 'error'); return; }
    if (!currentPw.value) { toast('현재 비밀번호를 입력해 주세요.', 'error'); return; }
    if (nextPw.value.length < 6 || nextPw.value.length > 30) { toast('새 비밀번호는 6~30자입니다.', 'error'); return; }
    if (nextPw.value !== nextPw2.value) { toast('새 비밀번호가 서로 다릅니다.', 'error'); return; }
  }
  saving.value = true;
  try {
    if (wantsPw) await changePassword(currentPw.value, nextPw.value);
    await saveAccountDetail(auth.uid, form.value);
    currentPw.value = ''; nextPw.value = ''; nextPw2.value = '';
    phoneLocked.value = true;
    toast(wantsPw ? '비밀번호와 정보를 고쳤습니다.' : '정보를 고쳤습니다.');
  } catch (e) {
    toast(e instanceof Error ? e.message : '저장하지 못했습니다.', 'error');
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <section class="prf-shell">
    <header class="prf-header">
      <button type="button" class="prf-back" aria-label="뒤로" @click="router.back()"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg></button>
      <h1 class="prf-title">내 정보 수정</h1>
      <span class="prf-crumb">마이페이지 › 내 정보 수정</span>
    </header>

    <div class="prf-body">
      <section class="prf-card">
        <h2 class="prf-h1">내 정보 수정</h2>
        <p class="prf-sub">비밀번호·연락처·주소 등 개인정보를 수정합니다.</p>
        <p class="prf-warn">🔒 본인 확인을 위해 현재 비밀번호를 입력해야 정보수정이 가능합니다.</p>

        <!-- 누구로 들어와 있는지 -->
        <div class="prf-who">
          <span class="lab">회원명</span><b>{{ form.nickname || auth.nickname || '-' }}</b>
          <span class="lab">아이디</span><b>{{ loginId }}</b>
        </div>

        <!-- 비밀번호 -->
        <label class="prf-fld">
          <small>현재 비밀번호</small>
          <input v-model="currentPw" type="password" class="prf-input" :disabled="!canChangePw" placeholder="현재 비밀번호 입력" autocomplete="current-password" />
        </label>
        <label class="prf-fld">
          <small>새 비밀번호</small>
          <span class="prf-lockwrap">
            <input v-model="nextPw" type="password" class="prf-input" :disabled="!canChangePw" placeholder="영문,숫자 특수문자 일부허용 (6~30자)" autocomplete="new-password" />
            <i class="prf-lock">🔒</i>
          </span>
        </label>
        <label class="prf-fld">
          <small>새 비밀번호 확인</small>
          <span class="prf-lockwrap">
            <input v-model="nextPw2" type="password" class="prf-input" :disabled="!canChangePw" placeholder="새 비밀번호 확인" autocomplete="new-password" />
            <i class="prf-lock">🔒</i>
          </span>
        </label>
        <p v-if="!canChangePw" class="prf-hint">카카오·네이버로 들어온 계정이라 바꿀 비밀번호가 없습니다.</p>

        <!-- 이메일 -->
        <div class="prf-fld">
          <small class="with-chk">
            이메일 <em>(선택)</em>
            <label class="prf-chk"><input v-model="form.emailOptIn" type="checkbox" />메일 수신동의</label>
          </small>
          <div class="prf-mail">
            <input v-model="form.emailId" class="prf-input" placeholder="이메일" />
            <span class="at">@</span>
            <select v-model="domainPick" class="prf-input sel">
              <option v-for="d in MAIL_DOMAINS" :key="d" :value="d">{{ d }}</option>
            </select>
          </div>
          <input
            v-model="form.emailDomain"
            class="prf-input mt"
            :disabled="domainPick !== '직접입력'"
            placeholder="예: naver.com"
          />
        </div>

        <!-- 휴대폰 -->
        <div class="prf-fld">
          <small class="with-chk">
            휴대폰
            <label class="prf-chk"><input v-model="form.smsOptIn" type="checkbox" />알림톡/문자 수신동의</label>
          </small>
          <div class="prf-phone">
            <input :value="form.phone1" class="prf-input" inputmode="numeric" :disabled="phoneLocked" placeholder="010" @input="onPhone('phone1', $event.target as HTMLInputElement)" />
            <input :value="form.phone2" class="prf-input" inputmode="numeric" :disabled="phoneLocked" @input="onPhone('phone2', $event.target as HTMLInputElement)" />
            <input :value="form.phone3" class="prf-input" inputmode="numeric" :disabled="phoneLocked" @input="onPhone('phone3', $event.target as HTMLInputElement)" />
            <button type="button" :class="['prf-numbtn', { on: !phoneLocked }]" @click="phoneLocked = !phoneLocked">번호수정</button>
          </div>
          <p class="prf-hint red">※ [번호수정] 버튼을 먼저 누르셔야 번호 입력이 가능합니다.</p>
        </div>

        <!-- 주소 -->
        <div class="prf-fld">
          <small>주소</small>
          <input v-model="form.address1" class="prf-input" placeholder="예: 경기 성남시 분당구 수내로 181" />
          <input v-model="form.address2" class="prf-input mt" placeholder="상세주소 — 예: 분당동, 샛별마을" />
        </div>

        <!-- 웹 — 사업자 · 주택 · 매출(세금 셈의 바탕) -->
        <template v-if="webEmbed">
          <div class="prf-fld">
            <small>사업자 구분</small>
            <div class="prf-seg">
              <button v-for="[k, label] in BIZ_TYPES" :key="k" type="button" :class="{ on: form.bizType === k }" @click="form.bizType = k">{{ label }}</button>
            </div>
          </div>
          <label class="prf-fld">
            <small>주택 보유수</small>
            <span class="prf-unit"><input v-model="form.houseCount" class="prf-input" inputmode="numeric" placeholder="0" @input="form.houseCount = form.houseCount.replace(/\D/g, '')" /><em>채</em></span>
          </label>
          <div class="prf-fld">
            <small>매출 <i class="prf-auto">매도 기록에서 저절로</i></small>
            <div class="prf-sales">
              <span><b>{{ thisYear - 1 }}년</b>{{ wonText(salesOf(thisYear - 1)) }}</span>
              <span><b>{{ thisYear }}년</b>{{ wonText(salesOf(thisYear)) }}</span>
            </div>
          </div>
        </template>

        <button type="button" class="prf-submit" :disabled="saving || loading" @click="submit">
          {{ saving ? '저장하는 중…' : '내 정보 수정' }}
        </button>
      </section>
    </div>

    <AppMobileBottomNav active="more" />
    <AppToast :visible="!!toastText" :text="toastText" :tone="toastTone" />
  </section>
</template>

<style scoped>
.prf-shell { min-height: 100vh; background: #f4f6fb; padding-bottom: 96px; }
.prf-header { padding: 14px 12px 8px; display: flex; align-items: baseline; gap: 8px; border-bottom: 1px solid #e5e7eb; }
.prf-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 2px; align-self: center;
}
.prf-title { margin: 0; font-size: 20px; font-weight: 800; color: #111827; }
.prf-crumb { margin-left: auto; font-size: 11px; color: #9ca3af; }
.prf-body { padding: 10px 12px; }
.prf-card { background: #fff; border-radius: 10px; padding: 14px 14px 16px; }

.prf-h1 { margin: 0; text-align: center; font-size: 16px; font-weight: 800; color: #1f3a72; }
.prf-sub { margin: 5px 0 0; text-align: center; font-size: 11.5px; color: #8a93a4; word-break: keep-all; }
.prf-warn {
  margin: 8px 0 12px; text-align: center;
  font-size: 11.5px; font-weight: 700; color: #c62828; word-break: keep-all;
}

/* 회원명 · 아이디 */
.prf-who {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px;
  background: #f6f8fc; border: 1px solid #e8ebf1; border-radius: 8px;
  padding: 9px 11px; margin-bottom: 14px;
}
.prf-who .lab { font-size: 11px; color: #8a93a4; font-weight: 700; }
.prf-who b { font-size: 12.5px; color: #111827; font-weight: 800; margin-right: 6px; }

/* 입력 묶음 */
.prf-fld { display: block; margin-bottom: 12px; }
.prf-fld > small {
  display: block; font-size: 11.5px; font-weight: 700; color: #374151; margin-bottom: 4px;
}
.prf-fld > small.with-chk { display: flex; align-items: center; gap: 6px; }
.prf-fld > small em { font-style: normal; font-weight: 500; color: #9ca3af; }
.prf-chk {
  margin-left: auto; display: inline-flex; align-items: center; gap: 3px;
  font-size: 10.5px; font-weight: 600; color: #6b7280; cursor: pointer;
}
.prf-chk input { width: 13px; height: 13px; accent-color: #2a3f8f; }
.prf-input {
  width: 100%; box-sizing: border-box; height: 36px;
  border: 1px solid #e3e8f0; border-radius: 6px; background: #fff;
  padding: 2px 10px; font-family: inherit; font-size: 12.5px; color: #111827;
}
.prf-input::placeholder { color: #b6bdcb; }
.prf-input:focus { outline: none; border-color: #2a3f8f; }
.prf-input:disabled { background: #f6f7fa; color: #8a93a4; }
.prf-input.mt { margin-top: 6px; }
.prf-lockwrap { position: relative; display: block; }
.prf-lock { position: absolute; right: 9px; top: 50%; transform: translateY(-50%); font-size: 11px; font-style: normal; opacity: .55; }

.prf-mail { display: flex; align-items: center; gap: 5px; }
.prf-mail .at { flex: 0 0 auto; font-size: 12.5px; color: #6b7280; }
.prf-mail .prf-input { flex: 1 1 0; min-width: 0; }
.prf-input.sel { padding-right: 4px; }

.prf-phone { display: flex; align-items: center; gap: 5px; }
.prf-phone .prf-input { flex: 1 1 0; min-width: 0; text-align: center; }
.prf-numbtn {
  flex: 0 0 auto; height: 36px; padding: 0 9px;
  border: 1px solid #2a3f8f; border-radius: 6px; background: #fff;
  font-family: inherit; font-size: 11.5px; font-weight: 700; color: #2a3f8f; cursor: pointer;
}
.prf-numbtn.on { background: #2a3f8f; color: #fff; }

.prf-hint { margin: 5px 0 0; font-size: 10.5px; color: #8a93a4; word-break: keep-all; }
.prf-hint.red { color: #c62828; }

.prf-submit {
  width: 100%; height: 44px; margin-top: 6px;
  border: none; border-radius: 6px; background: #2a3f8f; color: #fff;
  font-family: inherit; font-size: 14px; font-weight: 800; cursor: pointer;
}
.prf-submit:disabled { opacity: .6; cursor: default; }
.prf-seg { display: inline-flex; gap: 6px; }
.prf-seg button { height: 34px; padding: 0 14px; border: 1px solid #d0d5dd; border-radius: 6px; background: #fff; color: #4b5563; cursor: pointer; }
.prf-seg button.on { border-color: #2b6df3; background: #2b6df3; color: #fff; }
.prf-unit { display: inline-flex; align-items: center; gap: 6px; }
.prf-unit .prf-input { width: 120px; text-align: right; }
.prf-unit em { font-style: normal; color: #6b7280; }
.prf-auto { margin-left: 6px; font-style: normal; color: #9ca3af; }
.prf-sales { display: flex; gap: 24px; }
.prf-sales span { display: inline-flex; gap: 8px; align-items: baseline; color: #111827; }
.prf-sales b { color: #6b7280; font-weight: 600; }
</style>
