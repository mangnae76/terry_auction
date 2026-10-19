<script setup lang="ts">
// 회원가입 — 로그인 화면의 '회원가입'에서 들어온다.
// 이름·아이디(이메일)·비밀번호·연락처·지역·가입경로를 받고, 약관에 동의하면 계정을 만든다.
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/authStore';
import { checkEmailTaken, saveSignupExtra } from '../services/authRepository';
import logoImg from '../assets/icones/log/LOGO_ENG.png';

const router = useRouter();
const authStore = useAuthStore();

/** 가입하면 바로 받는 것 — 카드 세 장 */
const PERKS = [
  { no: '01', big: '3일', small: '무료이용' },
  { no: '02', big: '1,000p', small: '축하포인트' },
  { no: '03', big: '무료', small: '경매교육\n동영상 강의' },
];

const SIDO = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
];
const JOIN_PATHS = ['검색', '학원', '카페', '유튜브', '기타'];

const realName = ref('');
const email = ref('');
const password = ref('');
const passwordConfirm = ref('');
const phone1 = ref('010');
const phone2 = ref('');
const phone3 = ref('');
const region = ref('');
const joinPath = ref('');
const joinPathDetail = ref('');

const agreeTerms = ref(false);
const agreePrivacy = ref(false);
const agreeSms = ref(false);
const agreeAll = computed({
  get: () => agreeTerms.value && agreePrivacy.value && agreeSms.value,
  set: (v: boolean) => { agreeTerms.value = v; agreePrivacy.value = v; agreeSms.value = v; },
});

/** 아이디(메일)를 고치면 중복확인은 다시 받아야 한다 */
const idChecked = ref<'' | 'free' | 'taken'>('');
watch(email, () => { idChecked.value = ''; });

const PHONE_BOX = { p1: phone1, p2: phone2, p3: phone3 };
const onPhone = (key: keyof typeof PHONE_BOX, el: HTMLInputElement, max: number) => {
  const digits = el.value.replace(/\D/g, '').slice(0, max);
  PHONE_BOX[key].value = digits;
  if (el.value !== digits) el.value = digits;
};

const submitting = ref(false);
const checking = ref(false);
const notice = ref('');

const onCheckId = async () => {
  const mail = email.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    authStore.error = '아이디는 메일 주소 꼴로 적어 주세요.';
    return;
  }
  checking.value = true;
  authStore.error = '';
  try {
    const r = await checkEmailTaken(mail);
    if (r === 'taken') {
      idChecked.value = 'taken';
      notice.value = '이미 쓰고 있는 아이디입니다.';
    } else {
      idChecked.value = 'free';
      notice.value = r === 'free' ? '쓸 수 있는 아이디입니다.' : '쓸 수 있어 보입니다 — 마지막 확인은 가입할 때 합니다.';
    }
  } finally {
    checking.value = false;
    window.setTimeout(() => { notice.value = ''; }, 2600);
  }
};

const onVerifyPhone = () => {
  notice.value = '문자 인증 — 준비 중입니다. 번호는 그대로 저장됩니다.';
  window.setTimeout(() => { notice.value = ''; }, 2200);
};

const onSubmit = async () => {
  if (submitting.value) return;
  authStore.error = '';
  const mail = email.value.trim();
  if (!realName.value.trim()) { authStore.error = '이름을 적어 주세요.'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { authStore.error = '아이디는 메일 주소 꼴로 적어 주세요.'; return; }
  if (idChecked.value === 'taken') { authStore.error = '이미 쓰고 있는 아이디입니다.'; return; }
  if (password.value.length < 6 || password.value.length > 30) { authStore.error = '비밀번호는 6~30자입니다.'; return; }
  if (password.value !== passwordConfirm.value) { authStore.error = '비밀번호가 서로 다릅니다.'; return; }
  if (!region.value) { authStore.error = '시/도를 골라 주세요.'; return; }
  if (!agreeTerms.value || !agreePrivacy.value) { authStore.error = '[필수] 약관에 동의해 주세요.'; return; }

  submitting.value = true;
  try {
    await authStore.signup(mail, password.value, realName.value.trim());
    await saveSignupExtra(authStore.uid, {
      realName: realName.value.trim(),
      phone: [phone1.value, phone2.value, phone3.value].filter(Boolean).join('-'),
      region: region.value,
      joinPath: joinPath.value,
      joinPathDetail: joinPathDetail.value.trim(),
      smsOptIn: agreeSms.value,
      agreedAt: new Date().toISOString(),
    });
    router.replace('/auctions/watchlist');
  } catch {
    /* 잘못된 까닭은 store.error 에 담긴다 */
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <section class="su-shell">
    <div class="su-card">
      <img :src="logoImg" alt="MYTURN" class="su-logo" />
      <h1 class="su-title">회원가입</h1>
      <p class="su-note">
        마이턴 옥션은 컨설팅·외부광고 등의 전화를 하지 않으며 개인정보를 타사와 공유하지 않습니다.
        본사를 사칭한 전화를 받으시면 고객센터로 알려 주세요.
      </p>

      <p class="su-perk-line">가입 즉시 <b>3일 무료이용권</b> + <b>무료 교육영상</b> + <b>1,000P</b> 지급</p>
      <div class="su-perks">
        <div v-for="(p, i) in PERKS" :key="p.no" :class="['su-perk', { on: i === 1 }]">
          <span class="no">{{ p.no }}</span>
          <strong>{{ p.big }}</strong>
          <small>{{ p.small }}</small>
        </div>
      </div>

      <form class="su-form" @submit.prevent="onSubmit">
        <input v-model="realName" class="su-input" placeholder="이름 (실명)" autocomplete="name" />

        <div class="su-row">
          <span class="su-lockwrap">
            <input v-model="email" class="su-input" placeholder="아이디 (메일 주소)" autocomplete="username" inputmode="email" />
            <i class="su-lock">🔒</i>
          </span>
          <button type="button" class="su-sidebtn" :disabled="checking" @click="onCheckId">중복확인</button>
        </div>

        <span class="su-lockwrap">
          <input v-model="password" type="password" class="su-input" placeholder="영문,숫자 특수문자 일부허용 (6~30자)" autocomplete="new-password" />
          <i class="su-lock">🔒</i>
        </span>
        <span class="su-lockwrap">
          <input v-model="passwordConfirm" type="password" class="su-input" placeholder="비밀번호 재확인" autocomplete="new-password" />
          <i class="su-lock">🔒</i>
        </span>

        <div class="su-row phone">
          <input :value="phone1" class="su-input" inputmode="numeric" @input="onPhone('p1', $event.target as HTMLInputElement, 3)" />
          <input :value="phone2" class="su-input" inputmode="numeric" placeholder="0000" @input="onPhone('p2', $event.target as HTMLInputElement, 4)" />
          <input :value="phone3" class="su-input" inputmode="numeric" placeholder="0000" @input="onPhone('p3', $event.target as HTMLInputElement, 4)" />
          <button type="button" class="su-sidebtn fill" @click="onVerifyPhone">인증요청</button>
        </div>

        <select v-model="region" class="su-input">
          <option value="">시/도 선택</option>
          <option v-for="s in SIDO" :key="s" :value="s">{{ s }}</option>
        </select>

        <div class="su-block">
          <small class="su-blabel">가입경로</small>
          <div class="su-radios">
            <label v-for="j in JOIN_PATHS" :key="j" class="su-radio">
              <input v-model="joinPath" type="radio" :value="j" />{{ j }}
            </label>
          </div>
          <input v-model="joinPathDetail" class="su-input" placeholder="가입경로 상세 (선택)" />
        </div>

        <div class="su-agree">
          <label class="su-chk all"><input v-model="agreeAll" type="checkbox" />전체동의</label>
          <label class="su-chk">
            <input v-model="agreeTerms" type="checkbox" /><em class="req">[필수]</em> 이용약관
            <a class="su-view" href="/terms" target="_blank" rel="noopener" @click.stop>보기</a>
          </label>
          <label class="su-chk">
            <input v-model="agreePrivacy" type="checkbox" /><em class="req">[필수]</em> 개인정보 수집 및 이용
            <a class="su-view" href="/privacy" target="_blank" rel="noopener" @click.stop>보기</a>
          </label>
          <label class="su-chk">
            <input v-model="agreeSms" type="checkbox" /><em>[선택]</em> 알림톡/문자수신
          </label>
        </div>

        <p v-if="notice" class="su-msg">{{ notice }}</p>
        <p v-if="authStore.error" class="su-err">{{ authStore.error }}</p>

        <button type="submit" class="su-submit" :disabled="submitting || authStore.loading">
          {{ submitting || authStore.loading ? '가입하는 중…' : '가입하기' }}
        </button>
        <button type="button" class="su-back" @click="router.push('/login')">이미 계정이 있습니다 — 로그인</button>
      </form>
    </div>
  </section>
</template>

<style scoped>
.su-shell {
  min-height: 100vh; background: #1f3a72;
  padding: 18px 12px 40px; box-sizing: border-box;
  display: flex; justify-content: center; align-items: flex-start;
}
.su-card {
  width: 100%; max-width: 420px; box-sizing: border-box;
  background: #fff; border-radius: 14px; padding: 20px 16px 22px;
}
.su-logo { display: block; height: 22px; margin: 0 auto 10px; }
.su-title { margin: 0; text-align: center; font-size: 20px; font-weight: 800; color: #111827; }
.su-note {
  margin: 7px 0 0; text-align: center;
  font-size: 11px; line-height: 1.6; color: #8a93a4; word-break: keep-all;
}

/* 가입 혜택 */
.su-perk-line {
  margin: 12px 0 0; padding: 8px 6px; text-align: center;
  border: 1px solid #dbe3f7; border-radius: 8px; background: #f6f8ff;
  font-size: 11.5px; color: #3c4a6b; word-break: keep-all;
}
.su-perk-line b { color: #1f3a72; font-weight: 800; }
.su-perks { display: flex; gap: 6px; margin-top: 10px; }
.su-perk {
  flex: 1 1 0; min-width: 0; border: 1px solid #e3e8f4; border-radius: 10px;
  background: #f7f9ff; padding: 12px 4px 11px; text-align: center;
}
.su-perk.on { background: #2a3f8f; border-color: #2a3f8f; transform: translateY(-4px); }
.su-perk .no {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 50%;
  background: #2a3f8f; color: #fff; font-size: 10px; font-weight: 800;
}
.su-perk.on .no { background: #fff; color: #2a3f8f; }
.su-perk strong { display: block; margin-top: 6px; font-size: 15px; font-weight: 800; color: #1f3a72; }
.su-perk small { display: block; margin-top: 2px; font-size: 10px; color: #6b7280; white-space: pre-line; line-height: 1.4; }
.su-perk.on strong, .su-perk.on small { color: #fff; }

/* 입력 */
.su-form { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
.su-input {
  width: 100%; box-sizing: border-box; height: 40px;
  border: 1px solid #e3e8f0; border-radius: 6px; background: #fff;
  padding: 2px 11px; font-family: inherit; font-size: 12.5px; color: #111827;
}
.su-input::placeholder { color: #b6bdcb; }
.su-input:focus { outline: none; border-color: #2a3f8f; }
.su-lockwrap { position: relative; display: block; flex: 1 1 0; min-width: 0; }
.su-lock { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 11px; font-style: normal; opacity: .5; }
.su-row { display: flex; align-items: center; gap: 6px; }
.su-row.phone .su-input { flex: 1 1 0; min-width: 0; text-align: center; }
.su-sidebtn {
  flex: 0 0 auto; height: 40px; padding: 0 11px;
  border: 1px solid #2a3f8f; border-radius: 6px; background: #fff;
  font-family: inherit; font-size: 11.5px; font-weight: 700; color: #2a3f8f; cursor: pointer;
}
.su-sidebtn.fill { background: #2a3f8f; color: #fff; }
.su-sidebtn:disabled { opacity: .55; cursor: default; }

.su-block { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
.su-blabel { font-size: 11.5px; font-weight: 700; color: #374151; }
.su-radios { display: flex; flex-wrap: wrap; gap: 4px 12px; }
.su-radio { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: #4b5563; cursor: pointer; }
.su-radio input { width: 13px; height: 13px; accent-color: #2a3f8f; }

/* 약관 */
.su-agree {
  margin-top: 4px; border: 1px solid #e3e8f0; border-radius: 8px; padding: 10px 11px;
  display: flex; flex-direction: column; gap: 9px;
}
.su-chk {
  display: flex; align-items: center; gap: 5px;
  font-size: 11.5px; color: #4b5563; cursor: pointer;
}
.su-chk.all { font-size: 12.5px; font-weight: 800; color: #111827; padding-bottom: 8px; border-bottom: 1px solid #f1f3f7; }
.su-chk input { width: 14px; height: 14px; accent-color: #2a3f8f; }
.su-chk em { font-style: normal; color: #8a93a4; }
.su-chk em.req { color: #2a3f8f; font-weight: 700; }
.su-view { margin-left: auto; font-size: 10.5px; color: #8a93a4; text-decoration: underline; }

.su-msg { margin: 2px 0 0; font-size: 11.5px; color: #2a3f8f; }
.su-err { margin: 2px 0 0; font-size: 11.5px; color: #c62828; word-break: keep-all; }
.su-submit {
  margin-top: 6px; width: 100%; height: 46px;
  border: none; border-radius: 6px; background: #2a3f8f; color: #fff;
  font-family: inherit; font-size: 15px; font-weight: 800; cursor: pointer;
}
.su-submit:disabled { background: #9ca3af; cursor: not-allowed; }
.su-back {
  border: none; background: transparent; cursor: pointer;
  font-family: inherit; font-size: 11.5px; color: #6b7280; text-decoration: underline;
}
</style>
