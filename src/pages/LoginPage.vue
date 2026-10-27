<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/authStore';
import { checkEmailTaken, friendlyAuthError, sendPasswordReset, setLoginPersistence } from '../services/authRepository';
import { isKakaoLoginConfigured, isNaverLoginConfigured } from '../services/socialAuth';
import { isAllowedEmail } from '../services/accessControl';
import BrandLogo from '../components/BrandLogo.vue';
import { TRIAL_PRIVACY_INTRO, TRIAL_PRIVACY_ROWS } from '../services/legalTerms';
import { TRIAL_NOTE, TRIAL_STEPS } from '../services/trialInfo';
import {
  PLANS,
  TRIAL_DAYS,
  WELCOME_POINT,
  perMonth,
} from '../services/billingPlans';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

// 가입 화면에서 난 안내가 여기까지 따라오지 않게 먼저 지운다 —
// 두 화면이 같은 자리를 보고 있어 '이름을 적어 주세요'가 로그인 칸 아래 남았다.
// 허용 목록에 없는 계정이라 가드가 내보낸 경우만 왜 튕겼는지 알려 준다.
onMounted(() => {
  const saved = readLocal(SAVED_ID_KEY);
  if (saved) email.value = saved;
  authStore.error = route.query.denied
    ? '이 계정은 사용 권한이 없습니다. 등록된 계정으로 로그인해 주세요.'
    : '';
});

const trialAgree = ref(false);
const trialDetail = ref(false);

/** 가입 전 안내 창 — '' 이면 닫힘 */
const info = ref<'' | 'pay' | 'trial' | 'findId' | 'findPw'>('');
const won = (n: number) => n.toLocaleString('ko-KR');
/** 할인이 붙는 기간 — 안내 글이 요금표를 따라간다 */
const offListText = PLANS.filter((p) => !p.base).map((p) => p.label).join(', ');

/** 웹(대문 · 웹 로그인 창)에 떴는가 — 회원가입을 작은 줄로 옮기고 창을 줄인다 */
const webEmbed = inject<boolean>('webEmbed', false);
const email = ref('');
const password = ref('');
const showPw = ref(false);
const submitting = ref(false);

// === 아이디 저장 · 로그인 유지 — 이 기기에만 적어 둔다 ===
const SAVED_ID_KEY = 'myturn.login.savedId';
const KEEP_KEY = 'myturn.login.keep';
function readLocal(key: string) { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } }
function writeLocal(key: string, value: string) { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* 못 적어도 로그인은 된다 */ } }
/** 아이디 저장 — 켜 두면 다음에 열 때 아이디 칸이 채워져 있다 */
const saveId = ref(!!readLocal(SAVED_ID_KEY));
/** 로그인 유지 — 기본은 켜짐(지금까지와 같다). 끄면 창을 닫을 때 로그아웃된다 */
const keepLogin = ref(readLocal(KEEP_KEY) !== '0');
/** 로그인 직전 — 유지 방식을 정하고 고른 값을 적어 둔다 */
const beforeLogin = async () => {
  writeLocal(KEEP_KEY, keepLogin.value ? '' : '0');
  await setLoginPersistence(keepLogin.value);
};
/** 로그인 뒤 — 아이디 저장을 켰으면 아이디를 적고, 껐으면 지운다 */
const afterLogin = (id: string) => writeLocal(SAVED_ID_KEY, saveId.value ? id.trim() : '');

// === 아이디 찾기 · 비밀번호 찾기 ===
const findId = ref('');
const findMsg = ref('');
const findOk = ref(false);
const findBusy = ref(false);
const openFind = (kind: 'findId' | 'findPw') => {
  findId.value = email.value.trim();
  findMsg.value = '';
  findOk.value = false;
  info.value = kind;
};
/** 아이디 찾기 — 회원 아이디는 가입한 이메일이다. 적은 이메일이 가입돼 있는지 확인한다 */
const checkFindId = async () => {
  const id = findId.value.trim();
  if (!id) { findMsg.value = '가입할 때 적은 이메일을 넣어 주세요.'; findOk.value = false; return; }
  findBusy.value = true;
  const r = await checkEmailTaken(id).catch(() => 'unknown' as const);
  findBusy.value = false;
  if (r === 'taken') {
    findOk.value = true;
    findMsg.value = '가입된 아이디입니다. 이 아이디로 로그인해 주세요.';
    email.value = id;
  } else {
    findOk.value = false;
    findMsg.value = "이 이메일로 가입된 기록을 확인할 수 없습니다. 카카오로 가입했다면 '카카오로 시작하기'로 들어와 주세요.";
  }
};
/** 비밀번호 찾기 — 적은 아이디(이메일)로 재설정 메일을 보낸다 */
const sendFindPw = async () => {
  const id = findId.value.trim();
  if (!id) { findMsg.value = '가입한 이메일(회원 아이디)을 넣어 주세요.'; findOk.value = false; return; }
  findBusy.value = true;
  try {
    await sendPasswordReset(id);
    findOk.value = true;
    findMsg.value = '비밀번호 재설정 메일을 보냈습니다. 메일함(스팸함 포함)을 확인해 주세요.';
  } catch (e) {
    findOk.value = false;
    findMsg.value = friendlyAuthError(e);
  } finally {
    findBusy.value = false;
  }
};

const kakaoEnabled = isKakaoLoginConfigured();
const naverEnabled = isNaverLoginConfigured();

const onSubmit = async () => {
  if (submitting.value) return;
  if (!email.value.trim() || !password.value) {
    authStore.error = '이메일과 비밀번호를 입력해 주세요.';
    return;
  }
  submitting.value = true;
  try {
    await beforeLogin();
    const profile = await authStore.login(email.value, password.value);
    if (!isAllowedEmail(profile.email)) {
      await authStore.logout();
      authStore.error = '이 계정은 사용 권한이 없습니다.';
      return;
    }
    afterLogin(email.value);
    router.replace('/auctions/watchlist');
  } catch {
    /* error 메시지는 store.error에 반영됨 */
  } finally {
    submitting.value = false;
  }
};

const onSocialLogin = async (provider: 'kakao' | 'naver') => {
  if (submitting.value) return;
  submitting.value = true;
  authStore.error = '';
  try {
    await beforeLogin();
    const profile = provider === 'kakao'
      ? await authStore.loginWithKakao()
      : await authStore.loginWithNaver();
    if (!isAllowedEmail(profile.email)) {
      await authStore.logout();
      authStore.error = '이 계정은 사용 권한이 없습니다.';
      return;
    }
    router.replace('/auctions/watchlist');
  } catch {
    /* error 메시지는 store.error에 반영됨 */
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <section class="lp-shell">
    <div class="lp-card">
      <div class="lp-brand">
        <BrandLogo :size="60" />
      </div>

      <form class="lp-form" @submit.prevent="onSubmit">
        <label class="lp-field">
          <span>회원 아이디</span>
          <input
            v-model="email"
            type="email"
            autocomplete="email"
            placeholder="example@email.com"
            required
          />
        </label>
        <label class="lp-field">
          <span>비밀번호</span>
          <span class="lp-pw">
            <input
              v-model="password"
              :type="showPw ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="6자 이상"
              required
            />
            <!-- 비밀번호 보기/가리기 -->
            <button type="button" class="lp-eye" :aria-label="showPw ? '비밀번호 가리기' : '비밀번호 보기'" :title="showPw ? '비밀번호 가리기' : '비밀번호 보기'" @click.prevent="showPw = !showPw">
              <svg v-if="showPw" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.4 3.3" /><path d="M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="m2 2 20 20" /></svg>
              <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
            </button>
          </span>
        </label>

        <p v-if="authStore.error" class="lp-err">{{ authStore.error }}</p>

        <button type="submit" class="lp-submit" :disabled="submitting || authStore.loading">
          {{ submitting || authStore.loading ? '로그인 중…' : '로그인' }}
        </button>
        <!-- 웹은 회원가입을 아래 작은 줄(무료체험 오른쪽)로 옮겨 창을 줄인다 -->
        <button
          v-if="!webEmbed"
          type="button"
          class="lp-submit ghost"
          :disabled="submitting || authStore.loading"
          @click="router.push('/signup')"
        >회원가입</button>

      </form>

      <div v-if="kakaoEnabled || naverEnabled" class="lp-social">
        <div class="lp-sep"><span>또는</span></div>
        <button
          v-if="kakaoEnabled"
          type="button"
          class="lp-social-btn kakao"
          :disabled="submitting || authStore.loading"
          @click="onSocialLogin('kakao')"
        >카카오로 시작하기</button>
        <button
          v-if="naverEnabled"
          type="button"
          class="lp-social-btn naver"
          :disabled="submitting || authStore.loading"
          @click="onSocialLogin('naver')"
        >네이버로 시작하기</button>
      </div>

      <!-- 아이디 저장 · 로그인 유지 / 아이디 찾기 · 비밀번호 찾기 -->
      <div class="lp-opts">
        <label class="lp-opt"><input v-model="saveId" type="checkbox" />아이디 저장</label>
        <label class="lp-opt"><input v-model="keepLogin" type="checkbox" />로그인 유지</label>
      </div>
      <!-- 한 줄 — 아이디 찾기 · 비밀번호 찾기 · 결제안내 · 무료체험 (로그인하지 않아도 그 자리에서 열린다) -->
      <p class="lp-links lp-find">
        <button type="button" @click="openFind('findId')">아이디 찾기</button>
        <i>·</i>
        <button type="button" @click="openFind('findPw')">비밀번호 찾기</button>
        <i>·</i>
        <!-- 웹은 결제안내를 뺀다(결제는 마이페이지에서) -->
        <template v-if="!webEmbed"><button type="button" @click="info = 'pay'">결제안내</button>
        <i>·</i></template>
        <button type="button" @click="info = 'trial'">무료체험</button>
        <template v-if="webEmbed"><i>·</i><button type="button" class="lp-signup-link" @click="router.push('/signup')">회원가입</button></template>
      </p>

    </div>

    <!-- 결제안내 · 무료체험 안내 창 -->
    <div v-if="info" class="lp-modal" @click.self="info = ''">
      <div class="lp-modal-box">
        <header class="lp-modal-head">
          <strong>{{ info === 'pay' ? '결제안내' : info === 'findId' ? '아이디 찾기' : info === 'findPw' ? '비밀번호 찾기' : `${TRIAL_DAYS}일 무료체험 안내` }}</strong>
          <button type="button" class="lp-modal-x" aria-label="닫기" @click="info = ''">
            <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
              <path d="M1.5 1.5 12.5 12.5M12.5 1.5 1.5 12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
        </header>

        <div class="lp-modal-body">
          <template v-if="info === 'pay'">
            <p class="lp-m-lead">표에 표시된 {{ offListText }} 금액은 할인 적용 금액입니다.</p>
            <table class="lp-m-table">
              <thead>
                <tr><th>기간</th><th>할인</th><th class="num">결제금액</th><th class="num">월 환산</th></tr>
              </thead>
              <tbody>
                <tr v-for="p in PLANS" :key="p.key">
                  <td>{{ p.label }}</td>
                  <td>{{ p.base ? '기준가' : `${p.off}%` }}</td>
                  <td class="num"><b>{{ won(p.price) }}</b></td>
                  <td class="num">{{ won(perMonth(p)) }}</td>
                </tr>
              </tbody>
            </table>
            <p class="lp-m-note">포인트 보유 시 포인트 결제가 가능합니다.</p>
          </template>

          <template v-else-if="info === 'findId' || info === 'findPw'">
            <p class="lp-m-lead">
              {{ info === 'findId'
                ? '회원 아이디는 가입할 때 적은 이메일입니다. 이메일을 넣으면 가입 여부를 확인합니다.'
                : '가입한 이메일(회원 아이디)로 비밀번호 재설정 메일을 보냅니다. 카카오로 가입한 계정은 비밀번호가 없습니다.' }}
            </p>
            <input v-model="findId" class="lp-find-in" type="email" autocomplete="email" placeholder="example@email.com" @keydown.enter.prevent="info === 'findId' ? checkFindId() : sendFindPw()" />
            <p v-if="findMsg" :class="['lp-find-msg', { ok: findOk }]">{{ findMsg }}</p>
            <button type="button" class="lp-m-go" :disabled="findBusy" @click="info === 'findId' ? checkFindId() : sendFindPw()">
              {{ findBusy ? '확인 중…' : info === 'findId' ? '아이디 확인' : '재설정 메일 보내기' }}
            </button>
          </template>

          <template v-else>
            <!-- 가입하면 바로 받는 것 -->
            <div class="lp-m-perks">
              <span><b>{{ TRIAL_DAYS }}일</b><small>무료이용</small></span>
              <span><b>{{ won(WELCOME_POINT) }}p</b><small>축하포인트</small></span>
              <span><b>무료</b><small>경매교육 영상</small></span>
            </div>

            <h4 class="lp-m-sub">📌 무료체험 이용안내</h4>
            <ol class="lp-steps">
              <li v-for="(st, i) in TRIAL_STEPS" :key="i">
                <span class="no">{{ i + 1 }}</span>
                <small v-html="st" />
              </li>
            </ol>
            <p class="lp-warnbar">{{ TRIAL_NOTE }}</p>

            <!-- 개인정보 수집 및 이용 동의 -->
            <div class="lp-agree">
              <label class="lp-agree-chk">
                <input v-model="trialAgree" type="checkbox" />
                [ 무료체험 ] 개인정보 수집 및 이용 동의
              </label>
              <button type="button" class="lp-agree-view" @click="trialDetail = !trialDetail">
                {{ trialDetail ? '접기' : '내용보기' }}
              </button>
            </div>

            <div v-if="trialDetail" class="lp-privacy">
              <h5>[무료체험] 개인정보 수집 및 이용안내</h5>
              <p v-for="(t, i) in TRIAL_PRIVACY_INTRO" :key="i">{{ t }}</p>
              <dl>
                <template v-for="row in TRIAL_PRIVACY_ROWS" :key="row.head">
                  <dt>{{ row.head }}</dt>
                  <dd><span v-for="(b, i) in row.body" :key="i">{{ b }}</span></dd>
                </template>
              </dl>
            </div>

            <button
              type="button"
              class="lp-m-go"
              :disabled="!trialAgree"
              @click="info = ''; router.push('/signup')"
            >
              {{ trialAgree ? `${TRIAL_DAYS}일 무료체험 하기 ›` : '개인정보 수집에 동의해 주세요' }}
            </button>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lp-shell {
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(180deg, #1f3a72 0%, #15295b 100%);
  padding: 20px;
}
.lp-card {
  width: 100%; max-width: 360px;
  background: #fff; border-radius: 16px;
  padding: 28px 22px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}
.lp-brand { text-align: center; margin-bottom: 22px; }


.lp-form { display: flex; flex-direction: column; gap: 12px; }
.lp-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #374151; font-weight: 600; }
.lp-field input {
  width: 100%; padding: 11px 12px; border: 1px solid #d1d5db; border-radius: 8px;
  font-size: 14px; color: #111827; outline: none; background: #fff;
}
.lp-pw { position: relative; display: block; }
.lp-pw input { padding-right: 42px; }
.lp-eye { position: absolute; top: 50%; right: 6px; transform: translateY(-50%); width: 32px; height: 32px; padding: 0; border: none; border-radius: 6px; background: transparent; color: #9ca3af; display: grid; place-items: center; cursor: pointer; }
.lp-eye:hover { color: #4b5563; background: #f3f4f6; }
.lp-field input:focus { border-color: #2b6df3; box-shadow: 0 0 0 3px rgba(43, 109, 243, 0.15); }
.lp-err { margin: 4px 0 0; font-size: 12px; color: #dc2626; }
.lp-submit {
  margin-top: 6px; width: 100%; height: 44px;
  border: none; border-radius: 10px; background: #1f3a72; color: #fff;
  font-size: 15px; font-weight: 800; cursor: pointer;
}
.lp-submit:disabled { background: #9ca3af; cursor: not-allowed; }
/* 회원가입 — 로그인 바로 아래, 같은 크기에 속만 비운다 */
.lp-submit.ghost {
  margin-top: 8px; background: #fff; color: #1f3a72;
  border: 1px solid #c7d0e4; font-family: inherit;
}
.lp-submit.ghost:disabled { background: #f3f4f6; color: #9ca3af; }

/* 회원가입 아래 작은 두 줄 */
.lp-links {
  margin: 10px 0 0; display: flex; align-items: center; justify-content: center; gap: 8px;
}
.lp-links button {
  border: none; background: transparent; padding: 0; cursor: pointer;
  font-family: inherit; font-size: 12px; font-weight: 600; color: #9ca3af;
}
.lp-links button:hover { color: #4b5563; text-decoration: underline; }
.lp-links i { font-style: normal; font-size: 11px; color: #cbd2de; }
/* 아이디 저장 · 로그인 유지 */
.lp-opts { margin-top: 14px; display: flex; justify-content: center; gap: 18px; }
.lp-opt { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: #4b5563; cursor: pointer; }
.lp-opt input { width: 15px; height: 15px; margin: 0; accent-color: #1f3a72; }
.lp-find { margin-top: 10px; flex-wrap: nowrap; white-space: nowrap; }
.lp-find-in {
  width: 100%; box-sizing: border-box; padding: 10px 12px; margin-top: 10px;
  border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; color: #111827; outline: none;
}
.lp-find-in:focus { border-color: #2b6df3; box-shadow: 0 0 0 3px rgba(43, 109, 243, 0.15); }
.lp-find-msg { margin: 8px 0 0; font-size: 12px; color: #dc2626; line-height: 1.5; }
.lp-find-msg.ok { color: #16a34a; }

/* 안내 창 */
.lp-modal {
  position: fixed; inset: 0; z-index: 60; background: rgba(17, 24, 39, .45);
  display: flex; align-items: center; justify-content: center; padding: 18px 14px;
}
.lp-modal-box {
  width: 100%; max-width: 360px; max-height: 76vh; box-sizing: border-box;
  background: #fff; border-radius: 10px; display: flex; flex-direction: column; overflow: hidden;
}
.lp-modal-head {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 12px 10px; border-bottom: 1px solid #eef1f6;
}
.lp-modal-head strong { font-size: 13.5px; font-weight: 800; color: #111827; }
.lp-modal-x {
  margin-left: auto; width: 26px; height: 26px; border: 1px solid #e3e8f0; border-radius: 6px;
  background: #fff; color: #4b5563; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; padding: 0; line-height: 0;
}
.lp-modal-x svg { display: block; }
.lp-modal-body { overflow-y: auto; padding: 12px 14px 16px; }
.lp-m-lead { margin: 0 0 9px; font-size: 12px; font-weight: 700; color: #1f3a72; }
.lp-m-table { width: 100%; border-collapse: collapse; }
.lp-m-table th, .lp-m-table td {
  padding: 6px 4px; font-size: 11.5px; text-align: center; border-bottom: 1px solid #f1f3f7;
}
.lp-m-table th { color: #6b7280; font-weight: 700; background: #f7f9fd; }
.lp-m-table td { color: #374151; }
.lp-m-table td b { color: #111827; font-weight: 800; }
/* 돈은 오른쪽 끝을 맞춘다 — 자릿수가 달라도 일의 자리가 한 줄에 선다 */
.lp-m-table .num { text-align: right; padding-right: 8px; font-variant-numeric: tabular-nums; }
/* 가입 혜택 — 회원가입 화면의 카드와 같은 내용 */
.lp-m-perks { display: flex; gap: 6px; }
.lp-m-perks span {
  flex: 1 1 0; min-width: 0; border: 1px solid #e3e8f4; border-radius: 10px;
  background: #f7f9ff; padding: 10px 4px 9px; text-align: center;
  display: flex; flex-direction: column; gap: 2px;
}
.lp-m-perks b { font-size: 14px; font-weight: 800; color: #1f3a72; }
.lp-m-perks small { font-size: 10px; color: #6b7280; word-break: keep-all; }
.lp-m-sub { margin: 14px 0 8px; font-size: 12.5px; font-weight: 800; color: #111827; }

/* 1 → 2 → 3 */
.lp-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.lp-steps li { position: relative; display: flex; align-items: flex-start; gap: 8px; padding-bottom: 6px; }
.lp-steps li:not(:last-child)::before {
  content: ''; position: absolute; left: 9.5px; top: 22px; bottom: 0; width: 1px; background: #dbe3f7;
}
.lp-steps .no {
  flex: none; width: 20px; height: 20px; border-radius: 50%; background: #2a3f8f; color: #fff;
  display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800;
}
.lp-steps small { flex: 1 1 auto; font-size: 11.5px; line-height: 1.6; color: #374151; word-break: keep-all; }
.lp-steps small :deep(b) { color: #1f3a72; font-weight: 700; }
.lp-warnbar {
  margin: 10px 0 0; padding: 8px 10px; border-left: 3px solid #e8a33d; background: #fff8ec;
  font-size: 11px; line-height: 1.7; color: #8a6418; word-break: keep-all;
}

/* 동의 */
.lp-agree { margin-top: 12px; display: flex; align-items: center; gap: 8px; }
.lp-agree-chk {
  display: inline-flex; align-items: center; gap: 5px; cursor: pointer;
  font-size: 11.5px; font-weight: 700; color: #374151;
}
.lp-agree-chk input { width: 14px; height: 14px; accent-color: #2a3f8f; }
.lp-agree-view {
  margin-left: auto; border: 1px solid #d7deea; border-radius: 5px; background: #fff;
  padding: 3px 7px; font-family: inherit; font-size: 10.5px; font-weight: 700; color: #4b5563; cursor: pointer;
}
.lp-privacy {
  margin-top: 8px; border: 1px solid #e8edf7; border-radius: 8px; padding: 10px 11px; background: #f9fbff;
}
.lp-privacy h5 { margin: 0 0 6px; font-size: 11.5px; font-weight: 800; color: #111827; }
.lp-privacy p { margin: 0 0 4px; font-size: 10.5px; line-height: 1.65; color: #4b5563; word-break: keep-all; }
.lp-privacy dl { margin: 8px 0 0; }
.lp-privacy dt {
  font-size: 10.5px; font-weight: 800; color: #1f3a72;
  padding: 6px 0 2px; border-top: 1px solid #e8edf7;
}
.lp-privacy dd { margin: 0 0 2px; }
.lp-privacy dd span { display: block; font-size: 10.5px; line-height: 1.6; color: #4b5563; word-break: keep-all; }
.lp-m-note { margin: 10px 0 0; font-size: 11px; line-height: 1.6; color: #9ca3af; word-break: keep-all; }
.lp-m-go {
  width: 100%; height: 40px; margin-top: 12px;
  border: none; border-radius: 999px; background: #1f3a72; color: #fff;
  font-family: inherit; font-size: 13px; font-weight: 800; cursor: pointer;
}
.lp-m-go:disabled { background: #c3cbdd; cursor: not-allowed; }
.lp-footer { text-align: center; font-size: 12px; color: #6b7280; margin: 16px 0 0; }
.lp-link { color: #2b6df3; font-weight: 700; text-decoration: none; margin-left: 4px; }

.lp-social { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
.lp-sep { position: relative; text-align: center; margin: 8px 0 4px; }
.lp-sep::before {
  content: ''; position: absolute; top: 50%; left: 0; right: 0; height: 1px;
  background: #e5e7eb;
}
.lp-sep span {
  position: relative; background: #fff; padding: 0 10px;
  font-size: 11px; color: #9ca3af; font-weight: 600;
}
.lp-social-btn {
  width: 100%; height: 42px; border: none; border-radius: 10px;
  font-size: 14px; font-weight: 700; cursor: pointer;
}
.lp-social-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.lp-social-btn.kakao { background: #FEE500; color: #191919; }
.lp-social-btn.naver { background: #03C75A; color: #fff; }
</style>
