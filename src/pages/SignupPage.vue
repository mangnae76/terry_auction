<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/authStore';
import { isKakaoLoginConfigured, isNaverLoginConfigured } from '../services/socialAuth';
import logoImg from '../assets/icones/log/LOGO_ENG.png';

const router = useRouter();
const authStore = useAuthStore();

const kakaoEnabled = isKakaoLoginConfigured();
const naverEnabled = isNaverLoginConfigured();

const email = ref('');
const password = ref('');
const passwordConfirm = ref('');
const nickname = ref('');
const submitting = ref(false);

const onSubmit = async () => {
  if (submitting.value) return;
  authStore.error = '';
  if (!email.value.trim() || !password.value || !passwordConfirm.value || !nickname.value.trim()) {
    authStore.error = '모든 항목을 입력해 주세요.';
    return;
  }
  if (password.value.length < 6) {
    authStore.error = '비밀번호는 6자 이상이어야 합니다.';
    return;
  }
  if (password.value !== passwordConfirm.value) {
    authStore.error = '비밀번호가 일치하지 않습니다.';
    return;
  }
  submitting.value = true;
  try {
    await authStore.signup(email.value, password.value, nickname.value);
    router.replace('/auctions/watchlist');
  } catch {
    /* error는 store.error에 반영됨 */
  } finally {
    submitting.value = false;
  }
};

const onSocialLogin = async (provider: 'kakao' | 'naver') => {
  if (submitting.value) return;
  submitting.value = true;
  authStore.error = '';
  try {
    if (provider === 'kakao') await authStore.loginWithKakao();
    else await authStore.loginWithNaver();
    router.replace('/auctions/watchlist');
  } catch {
    /* error는 store.error에 반영됨 */
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <section class="sp-shell">
    <div class="sp-card">
      <div class="sp-brand">
        <img :src="logoImg" alt="MYTURN" class="sp-brand-logo" />
        <p class="sp-brand-sub">회원가입</p>
      </div>

      <form class="sp-form" @submit.prevent="onSubmit">
        <label class="sp-field">
          <span>이메일</span>
          <input
            v-model="email"
            type="email"
            autocomplete="email"
            placeholder="example@email.com"
            required
          />
        </label>
        <label class="sp-field">
          <span>닉네임</span>
          <input
            v-model="nickname"
            type="text"
            autocomplete="nickname"
            placeholder="앱에 표시될 이름"
            maxlength="20"
            required
          />
        </label>
        <label class="sp-field">
          <span>비밀번호 (6자 이상)</span>
          <input
            v-model="password"
            type="password"
            autocomplete="new-password"
            placeholder="••••••"
            required
          />
        </label>
        <label class="sp-field">
          <span>비밀번호 확인</span>
          <input
            v-model="passwordConfirm"
            type="password"
            autocomplete="new-password"
            placeholder="••••••"
            required
          />
        </label>

        <p v-if="authStore.error" class="sp-err">{{ authStore.error }}</p>

        <button type="submit" class="sp-submit" :disabled="submitting || authStore.loading">
          {{ submitting || authStore.loading ? '가입 중…' : '가입하기' }}
        </button>
      </form>

      <div v-if="kakaoEnabled || naverEnabled" class="sp-social">
        <div class="sp-sep"><span>또는</span></div>
        <button
          v-if="kakaoEnabled"
          type="button"
          class="sp-social-btn kakao"
          :disabled="submitting || authStore.loading"
          @click="onSocialLogin('kakao')"
        >카카오로 시작하기</button>
        <button
          v-if="naverEnabled"
          type="button"
          class="sp-social-btn naver"
          :disabled="submitting || authStore.loading"
          @click="onSocialLogin('naver')"
        >네이버로 시작하기</button>
      </div>

      <p class="sp-footer">
        이미 계정이 있으신가요?
        <router-link to="/login" class="sp-link">로그인</router-link>
      </p>
    </div>
  </section>
</template>

<style scoped>
.sp-shell {
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(180deg, #1f3a72 0%, #15295b 100%);
  padding: 20px;
}
.sp-card {
  width: 100%; max-width: 360px;
  background: #fff; border-radius: 16px;
  padding: 26px 22px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}
.sp-brand { text-align: center; margin-bottom: 18px; }
.sp-brand-logo { height: 30px; object-fit: contain; }
.sp-brand-sub { margin: 6px 0 0; font-size: 14px; color: #111827; font-weight: 800; }

.sp-form { display: flex; flex-direction: column; gap: 10px; }
.sp-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #374151; font-weight: 600; }
.sp-field input {
  width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;
  font-size: 14px; color: #111827; outline: none; background: #fff;
}
.sp-field input:focus { border-color: #2b6df3; box-shadow: 0 0 0 3px rgba(43, 109, 243, 0.15); }
.sp-err { margin: 4px 0 0; font-size: 12px; color: #dc2626; }
.sp-submit {
  margin-top: 6px; width: 100%; height: 44px;
  border: none; border-radius: 10px; background: #1f3a72; color: #fff;
  font-size: 15px; font-weight: 800; cursor: pointer;
}
.sp-submit:disabled { background: #9ca3af; cursor: not-allowed; }
.sp-footer { text-align: center; font-size: 12px; color: #6b7280; margin: 14px 0 0; }
.sp-link { color: #2b6df3; font-weight: 700; text-decoration: none; margin-left: 4px; }

.sp-social { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
.sp-sep { position: relative; text-align: center; margin: 8px 0 4px; }
.sp-sep::before {
  content: ''; position: absolute; top: 50%; left: 0; right: 0; height: 1px;
  background: #e5e7eb;
}
.sp-sep span {
  position: relative; background: #fff; padding: 0 10px;
  font-size: 11px; color: #9ca3af; font-weight: 600;
}
.sp-social-btn {
  width: 100%; height: 42px; border: none; border-radius: 10px;
  font-size: 14px; font-weight: 700; cursor: pointer;
}
.sp-social-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.sp-social-btn.kakao { background: #FEE500; color: #191919; }
.sp-social-btn.naver { background: #03C75A; color: #fff; }
</style>
