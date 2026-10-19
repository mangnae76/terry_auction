<script setup lang="ts">
// 회원가입 — 로그인 화면의 '회원가입'에서 들어온다.
// 이름·아이디(이메일)·비밀번호·연락처·지역·가입경로를 받고, 약관에 동의하면 계정을 만든다.
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/authStore';
import { checkEmailTaken, saveSignupExtra } from '../services/authRepository';
import {
  PRIVACY_CHILD,
  PRIVACY_EFFECTIVE,
  PRIVACY_OFFICER,
  PRIVACY_SECTIONS,
  SMS_NOTICE_PARTS,
  TERMS_CHAPTERS,
  TERMS_EFFECTIVE,
} from '../services/legalTerms';
import logoImg from '../assets/icones/log/LOGO_ENG.png';

const router = useRouter();
const authStore = useAuthStore();

/** 가입하면 바로 받는 것 — 카드 세 장 */
const PERKS = [
  { no: '01', big: '3일', small: '무료이용' },
  { no: '02', big: '1,000p', small: '축하포인트' },
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

/** 약관 '보기' — 더보기 쪽 글을 그대로 띄운다 */
type Viewer = '' | 'terms' | 'privacy' | 'sms';
const viewer = ref<Viewer>('');
const VIEWER_TITLE: Record<Exclude<Viewer, ''>, string> = {
  terms: '이용약관',
  privacy: '개인정보 수집 및 이용',
  sms: '알림톡/문자수신',
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

      <p class="su-perk-line">가입 즉시 <b>3일 무료이용권</b> + <b>1,000P</b> 지급</p>
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
            <button type="button" class="su-view" @click.prevent.stop="viewer = 'terms'">보기</button>
          </label>
          <label class="su-chk">
            <input v-model="agreePrivacy" type="checkbox" /><em class="req">[필수]</em> 개인정보 수집 및 이용
            <button type="button" class="su-view" @click.prevent.stop="viewer = 'privacy'">보기</button>
          </label>
          <label class="su-chk">
            <input v-model="agreeSms" type="checkbox" /><em>[선택]</em> 알림톡/문자수신
            <button type="button" class="su-view" @click.prevent.stop="viewer = 'sms'">보기</button>
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

    <!-- 약관 보기 — 더보기 화면과 같은 글을 그대로 띄운다 -->
    <div v-if="viewer" :class="['su-modal', { sms: viewer === 'sms' }]" @click.self="viewer = ''">
      <div :class="['su-modal-box', { narrow: viewer === 'sms' }]">
        <header class="su-modal-head">
          <strong>{{ VIEWER_TITLE[viewer] }}</strong>
          <button type="button" class="su-modal-x" aria-label="닫기" @click="viewer = ''">✕</button>
        </header>

        <div class="su-modal-body">
          <!-- 알림톡·문자 -->
          <p v-if="viewer === 'sms'" class="su-sms">
            <template v-for="(part, i) in SMS_NOTICE_PARTS" :key="i">
              <b v-if="part.mark">{{ part.text }}</b><template v-else>{{ part.text }}</template>
            </template>
          </p>

          <!-- 이용약관 -->
          <template v-else-if="viewer === 'terms'">
            <section v-for="ch in TERMS_CHAPTERS" :key="ch.title" class="su-doc">
              <h3 class="su-doc-h">【 {{ ch.title }} 】</h3>
              <article v-for="a in ch.articles" :key="a.title" class="su-doc-art">
                <h4>{{ a.title }}</h4>
                <p v-if="a.text">{{ a.text }}</p>
                <ol v-if="a.items.length">
                  <li v-for="(it, i) in a.items" :key="i">{{ it }}</li>
                </ol>
              </article>
            </section>
            <p class="su-doc-tail">본 약관은 {{ TERMS_EFFECTIVE }}부터 시행합니다.</p>
          </template>

          <!-- 개인정보 수집 및 이용 -->
          <template v-else>
            <section v-for="sec in PRIVACY_SECTIONS" :key="sec.title" class="su-doc">
              <h3 class="su-doc-h">{{ sec.title }}</h3>
              <template v-for="(b, i) in sec.blocks" :key="i">
                <p v-if="b.kind === 'p'">{{ b.text }}</p>
                <h4 v-else-if="b.kind === 'label'">{{ b.text }}</h4>
                <ol v-else-if="b.kind === 'ol'" class="paren">
                  <li v-for="(it, k) in b.items" :key="k">{{ it }}</li>
                </ol>
                <ul v-else>
                  <li v-for="(it, k) in b.items" :key="k">{{ it }}</li>
                </ul>
              </template>
            </section>
            <section class="su-doc">
              <h3 class="su-doc-h">개인정보 관리책임자</h3>
              <p v-for="row in PRIVACY_OFFICER" :key="row.label">{{ row.label }} : {{ row.value }}</p>
            </section>
            <section class="su-doc">
              <h3 class="su-doc-h">아동의 개인정보보호</h3>
              <p>{{ PRIVACY_CHILD }}</p>
            </section>
            <p class="su-doc-tail">이 개인정보 처리방침은 {{ PRIVACY_EFFECTIVE }}부터 시행합니다.</p>
          </template>
        </div>
      </div>
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
.su-view {
  margin-left: auto; border: none; background: transparent; padding: 0; cursor: pointer;
  font-family: inherit; font-size: 10.5px; color: #8a93a4; text-decoration: underline;
}

/* 약관 보기 창 */
.su-modal {
  position: fixed; inset: 0; z-index: 60; background: rgba(17, 24, 39, .45);
  display: flex; align-items: center; justify-content: center; padding: 18px 14px;
}
.su-modal-box {
  width: 100%; max-width: 420px; max-height: 76vh; box-sizing: border-box;
  background: #fff; border-radius: 10px; display: flex; flex-direction: column; overflow: hidden;
}
.su-modal-head {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 12px 10px; border-bottom: 1px solid #eef1f6;
}
.su-modal-head strong { font-size: 13.5px; font-weight: 800; color: #111827; }
.su-modal-x {
  margin-left: auto; width: 26px; height: 26px; border: 1px solid #e3e8f0; border-radius: 6px;
  background: #fff; font-size: 13px; color: #4b5563; cursor: pointer;
  /* ✕ 를 칸 한가운데에 — 글자 기준선에 맡기면 아래로 처진다 */
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0; line-height: 1;
}
.su-modal-body { overflow-y: auto; padding: 12px 14px 16px; -webkit-overflow-scrolling: touch; }
/* 짧은 안내는 창도 작게 — 화면을 가득 채울 까닭이 없다 */
.su-modal.sms { padding-left: 32px; padding-right: 32px; }
.su-modal-box.narrow { max-width: 320px; }

/* 알림톡 안내 — 가운데 부분만 파랗게 */
.su-sms { margin: 6px 2px; font-size: 12.5px; line-height: 1.8; color: #c62828; word-break: keep-all; }
.su-sms b { color: #2a3f8f; font-weight: 700; }

/* 약관 본문 */
.su-doc + .su-doc { margin-top: 12px; }
.su-doc-h { margin: 0 0 6px; font-size: 12.5px; font-weight: 800; color: #1f3a72; }
.su-doc-art + .su-doc-art { margin-top: 9px; }
.su-doc h4 { margin: 7px 0 3px; font-size: 11.5px; font-weight: 800; color: #111827; }
.su-doc p { margin: 0 0 4px; font-size: 11.5px; line-height: 1.7; color: #4b5563; word-break: keep-all; }
.su-doc ol, .su-doc ul { margin: 2px 0 4px; padding-left: 18px; }
.su-doc li { font-size: 11.5px; line-height: 1.7; color: #4b5563; word-break: keep-all; }
.su-doc ol.paren { list-style: none; padding-left: 0; counter-reset: pv; }
.su-doc ol.paren > li { counter-increment: pv; padding-left: 22px; text-indent: -22px; }
.su-doc ol.paren > li::before { content: '(' counter(pv) ') '; color: #8a93a4; }
.su-doc-tail { margin: 12px 0 0; font-size: 11px; color: #8a93a4; }

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
