<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/authStore';
import { isKakaoLoginConfigured, isNaverLoginConfigured } from '../services/socialAuth';
import logoImg from '../assets/icones/log/LOGO_ENG.png';

const router = useRouter();
const authStore = useAuthStore();

const email = ref('');
const password = ref('');
const submitting = ref(false);

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
    await authStore.login(email.value, password.value);
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
    if (provider === 'kakao') await authStore.loginWithKakao();
    else await authStore.loginWithNaver();
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
        <img :src="logoImg" alt="MYTURN" class="lp-brand-logo" />
        <p class="lp-brand-sub">마이턴 옥션</p>
      </div>

      <form class="lp-form" @submit.prevent="onSubmit">
        <label class="lp-field">
          <span>이메일</span>
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
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="6자 이상"
            required
          />
        </label>

        <p v-if="authStore.error" class="lp-err">{{ authStore.error }}</p>

        <button type="submit" class="lp-submit" :disabled="submitting || authStore.loading">
          {{ submitting || authStore.loading ? '로그인 중…' : '로그인' }}
        </button>
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

      <p class="lp-footer">
        아직 계정이 없으신가요?
        <router-link to="/signup" class="lp-link">회원가입</router-link>
      </p>
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
.lp-brand-logo { height: 36px; object-fit: contain; }
.lp-brand-sub { margin: 8px 0 0; font-size: 12px; color: #6b7280; font-weight: 600; letter-spacing: 1px; }

.lp-form { display: flex; flex-direction: column; gap: 12px; }
.lp-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #374151; font-weight: 600; }
.lp-field input {
  width: 100%; padding: 11px 12px; border: 1px solid #d1d5db; border-radius: 8px;
  font-size: 14px; color: #111827; outline: none; background: #fff;
}
.lp-field input:focus { border-color: #2b6df3; box-shadow: 0 0 0 3px rgba(43, 109, 243, 0.15); }
.lp-err { margin: 4px 0 0; font-size: 12px; color: #dc2626; }
.lp-submit {
  margin-top: 6px; width: 100%; height: 44px;
  border: none; border-radius: 10px; background: #1f3a72; color: #fff;
  font-size: 15px; font-weight: 800; cursor: pointer;
}
.lp-submit:disabled { background: #9ca3af; cursor: not-allowed; }
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
