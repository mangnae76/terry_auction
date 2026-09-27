import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Unsubscribe } from 'firebase/auth';
import {
  friendlyAuthError,
  loginWithEmail,
  loginWithKakao as loginWithKakaoCall,
  loginWithNaver as loginWithNaverCall,
  logout as logoutCall,
  onAuthChange,
  signupWithEmail,
  type UserProfile,
} from '../services/authRepository';

export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref<UserProfile | null>(null);
  const ready = ref(false);          // 첫 onAuthStateChanged 콜백 도착 여부 (라우터 가드의 대기 신호)
  const loading = ref(false);        // login/signup 진행중
  const error = ref('');

  let unsubscribe: Unsubscribe | null = null;
  let readyResolve: (() => void) | null = null;
  const readyPromise: Promise<void> = new Promise((resolve) => {
    readyResolve = resolve;
  });

  const isLoggedIn = computed(() => !!currentUser.value);
  const uid = computed(() => currentUser.value?.uid ?? '');
  const nickname = computed(() => currentUser.value?.nickname ?? '');
  const email = computed(() => currentUser.value?.email ?? '');

  const initialize = () => {
    if (unsubscribe) return; // 중복 구독 방지
    unsubscribe = onAuthChange((profile) => {
      currentUser.value = profile;
      if (!ready.value) {
        ready.value = true;
        readyResolve?.();
      }
    });
  };

  const waitUntilReady = () => (ready.value ? Promise.resolve() : readyPromise);

  const login = async (emailValue: string, password: string) => {
    loading.value = true;
    error.value = '';
    try {
      const profile = await loginWithEmail(emailValue, password);
      currentUser.value = profile;
      return profile;
    } catch (e) {
      error.value = friendlyAuthError(e);
      throw e;
    } finally {
      loading.value = false;
    }
  };

  const loginWithKakao = async () => {
    loading.value = true;
    error.value = '';
    try {
      const profile = await loginWithKakaoCall();
      currentUser.value = profile;
      return profile;
    } catch (e) {
      error.value = friendlyAuthError(e);
      throw e;
    } finally {
      loading.value = false;
    }
  };

  const loginWithNaver = async () => {
    loading.value = true;
    error.value = '';
    try {
      const profile = await loginWithNaverCall();
      currentUser.value = profile;
      return profile;
    } catch (e) {
      error.value = friendlyAuthError(e);
      throw e;
    } finally {
      loading.value = false;
    }
  };

  const signup = async (emailValue: string, password: string, nickname: string) => {
    loading.value = true;
    error.value = '';
    try {
      const profile = await signupWithEmail(emailValue, password, nickname);
      currentUser.value = profile;
      return profile;
    } catch (e) {
      error.value = friendlyAuthError(e);
      throw e;
    } finally {
      loading.value = false;
    }
  };

  const logout = async () => {
    loading.value = true;
    try {
      await logoutCall();
      currentUser.value = null;
    } finally {
      loading.value = false;
    }
  };

  return {
    currentUser,
    ready,
    loading,
    error,
    isLoggedIn,
    uid,
    nickname,
    email,
    initialize,
    waitUntilReady,
    login,
    loginWithKakao,
    loginWithNaver,
    signup,
    logout,
  };
});
