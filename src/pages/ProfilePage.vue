<script setup lang="ts">
// 내 정보 — 로그인한 계정의 기본 정보를 보고, 닉네임을 고친다.
// 더보기 · 상단 프로필 메뉴의 '내 정보 수정'에서 들어온다.
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import AppToast from '../components/AppToast.vue';
import { useAuthStore } from '../stores/authStore';
import { updateNickname } from '../services/authRepository';

const router = useRouter();
const auth = useAuthStore();

const nickname = ref(auth.nickname);
watch(() => auth.nickname, (v) => { nickname.value = v; });
const dirty = computed(() => nickname.value.trim() !== (auth.nickname ?? '').trim());

/** 가입한 날 — '2026. 3. 14.' */
const joinedAt = computed(() => {
  const raw = auth.currentUser?.createdAt ?? '';
  if (!raw) return '-';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('ko-KR');
});
/** 어떻게 들어왔는지 — 메일 주소 꼴로 가늠한다 */
const loginWay = computed(() => {
  const mail = (auth.email ?? '').toLowerCase();
  if (mail.endsWith('@kakao.local')) return '카카오';
  if (mail.endsWith('@naver.local')) return '네이버';
  return '이메일';
});

const toastText = ref('');
const toastTone = ref<'info' | 'success' | 'error'>('success');
const toast = (text: string, tone: 'info' | 'success' | 'error' = 'success') => {
  toastTone.value = tone;
  toastText.value = text;
  window.setTimeout(() => { toastText.value = ''; }, 1600);
};

const saving = ref(false);
const save = async () => {
  const next = nickname.value.trim();
  if (!next) { toast('닉네임을 적어 주세요.', 'error'); return; }
  if (!auth.uid) { toast('로그인한 뒤에 저장됩니다.', 'error'); return; }
  saving.value = true;
  try {
    await updateNickname(auth.uid, next);
    toast('저장했습니다.');
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
      <button type="button" class="prf-back" aria-label="뒤로" @click="router.back()">‹</button>
      <h1 class="prf-title">내 정보</h1>
      <button type="button" class="prf-save" :class="{ on: dirty }" :disabled="saving" @click="save">💾 저장</button>
    </header>

    <div class="prf-body">
      <!-- 누구로 들어와 있는지 -->
      <section class="prf-card">
        <div class="prf-who">
          <span class="prf-avatar">{{ (auth.nickname || auth.email || '?').slice(0, 1) }}</span>
          <span class="prf-who-txt">
            <strong>{{ auth.nickname || '이름 없음' }}</strong>
            <small>{{ auth.email || '로그인하지 않았습니다' }}</small>
          </span>
        </div>
      </section>

      <section class="prf-card">
        <h2 class="prf-h2">기본 정보</h2>
        <label class="prf-fld">
          <small>닉네임</small>
          <input v-model="nickname" class="prf-input" placeholder="앱에서 보일 이름" maxlength="20" />
        </label>
        <div class="prf-row"><span class="lab">이메일</span><span class="val">{{ auth.email || '-' }}</span></div>
        <div class="prf-row"><span class="lab">로그인 방식</span><span class="val">{{ loginWay }}</span></div>
        <div class="prf-row"><span class="lab">가입일</span><span class="val">{{ joinedAt }}</span></div>
      </section>

      <p class="prf-note">비밀번호 변경·알림설정·결제하기는 다음에 붙입니다.</p>
    </div>

    <AppMobileBottomNav active="more" />
    <AppToast :visible="!!toastText" :text="toastText" :tone="toastTone" />
  </section>
</template>

<style scoped>
.prf-shell { min-height: 100vh; background: #f4f6fb; padding-bottom: 86px; }
.prf-header { padding: 14px 12px 8px; display: flex; align-items: center; gap: 8px; }
.prf-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 2px;
}
.prf-title { margin: 0; flex: 1 1 auto; font-size: 20px; font-weight: 800; color: #111827; }
.prf-save {
  flex: 0 0 auto; height: 26px; padding: 0 10px;
  border: 1px solid #c7d7f8; border-radius: 8px; background: #fff;
  font-family: inherit; font-size: 11.5px; font-weight: 700; color: #2b6df3; cursor: pointer;
}
.prf-save.on { background: #2b6df3; border-color: #2b6df3; color: #fff; }
.prf-save:disabled { opacity: 0.5; cursor: default; }
.prf-body { padding: 0 12px; display: flex; flex-direction: column; gap: 8px; }
.prf-card { background: #fff; border-radius: 10px; padding: 12px; }
.prf-who { display: flex; align-items: center; gap: 10px; }
.prf-avatar {
  flex: 0 0 auto; width: 42px; height: 42px; border-radius: 50%;
  background: #dce5ff; color: #3850c2;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 800;
}
.prf-who-txt { display: flex; flex-direction: column; min-width: 0; }
.prf-who-txt strong { font-size: 15px; font-weight: 800; color: #111827; }
.prf-who-txt small { font-size: 12px; color: #6b7280; }
.prf-h2 { margin: 0 0 8px; font-size: 13.5px; font-weight: 800; color: #111827; }
.prf-fld { display: block; margin-bottom: 10px; }
.prf-fld small { display: block; font-size: 10.5px; font-weight: 700; color: #6b7280; margin-bottom: 3px; }
.prf-input {
  width: 100%; box-sizing: border-box; height: 32px;
  border: 1px solid #e3e8f0; border-radius: 8px; background: #fff;
  padding: 2px 9px; font-family: inherit; font-size: 13px; color: #111827;
}
.prf-input:focus { outline: none; border-color: #2b6df3; }
.prf-row {
  display: flex; align-items: baseline; gap: 8px;
  padding: 7px 0; border-top: 1px solid #f1f3f7;
  font-size: 12.5px;
}
.prf-row .lab { flex: 0 0 84px; color: #6b7280; font-weight: 600; }
.prf-row .val { flex: 1 1 auto; min-width: 0; color: #111827; font-weight: 600; word-break: break-all; }
.prf-note { margin: 2px 2px 0; font-size: 11.5px; color: #9ca3af; }
</style>
