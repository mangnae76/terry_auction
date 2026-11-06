<script setup lang="ts">
// 회원가입 — 로그인 화면의 '회원가입'에서 들어온다.
// 이름·아이디(이메일)·비밀번호·연락처·지역·가입경로를 받고, 약관에 동의하면 계정을 만든다.
import { computed, inject, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/authStore';
import { BIZ_TYPES, checkEmailFree, checkEmailTaken, saveSignupExtra, type BizType } from '../services/authRepository';
import {
  PRIVACY_CHILD,
  PRIVACY_EFFECTIVE,
  PRIVACY_OFFICER,
  PRIVACY_OFFICER_TITLE,
  PRIVACY_CHILD_TITLE,
  PRIVACY_SECTIONS,
  SMS_NOTICE_PARTS,
  TERMS_CHAPTERS,
  TERMS_EFFECTIVE,
} from '../services/legalTerms';
import markImg from '../assets/icones/log/LOGO_MARK.png';
import { POINTS_OPEN, TRIAL_DAYS, WELCOME_POINT } from '../services/billingPlans';
import { TRIAL_PERK_LINE } from '../services/trialInfo';

const router = useRouter();
const authStore = useAuthStore();

// 로그인 화면에서 난 안내를 들고 들어오지 않는다 (두 화면이 같은 자리를 쓴다)
onMounted(() => { authStore.error = ''; });

// 회원가입 카드(01 3일 무료이용 · 02 무료 교육영상 + 전자책)는 뺐다(2026-11-03 사용자 지시) — 위 한 줄 안내만 둔다

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
// 주소 — 다음(카카오) 우편번호 서비스로 찾고(키 없이 무료), 상세 주소는 손으로. 고르면 시/도도 맞춘다
const address1 = ref('');
const address2 = ref('');
const addrOpen = ref(false);
const addrBox = ref<HTMLElement | null>(null);
const addr2Input = ref<HTMLInputElement | null>(null);
type PostcodeData = { roadAddress?: string; jibunAddress?: string; address?: string; sido?: string; buildingName?: string };
type PostcodeCtor = new (o: { oncomplete: (d: PostcodeData) => void; width?: string; height?: string }) => { embed: (el: HTMLElement) => void };
let postcodeLoad: Promise<PostcodeCtor> | null = null;
const loadPostcode = () => {
  const w = window as unknown as { daum?: { Postcode?: PostcodeCtor } };
  if (w.daum?.Postcode) return Promise.resolve(w.daum.Postcode);
  postcodeLoad ??= new Promise<PostcodeCtor>((ok, no) => {
    const sc = document.createElement('script');
    sc.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    sc.onload = () => (w.daum?.Postcode ? ok(w.daum.Postcode) : no(new Error('postcode')));
    sc.onerror = () => { postcodeLoad = null; no(new Error('postcode')); };
    document.head.appendChild(sc);
  });
  return postcodeLoad;
};
const openAddrSearch = async () => {
  addrOpen.value = true;
  try {
    const Postcode = await loadPostcode();
    if (!addrBox.value) return;
    addrBox.value.innerHTML = '';
    new Postcode({
      width: '100%', height: '100%',
      oncomplete: (d) => {
        address1.value = (d.roadAddress || d.jibunAddress || d.address || '') + (d.buildingName ? ` (${d.buildingName})` : '');
        const sd = String(d.sido || '');
        const hit = SIDO.find((s) => sd.startsWith(s)) || SIDO.find((s) => sd.slice(0, 2) === s);
        if (hit) region.value = hit;
        addrOpen.value = false;
        window.setTimeout(() => addr2Input.value?.focus(), 0);
      },
    }).embed(addrBox.value);
  } catch {
    addrOpen.value = false;
    authStore.error = '주소 검색을 불러오지 못했습니다. 잠시 뒤 다시 눌러 주세요.';
  }
};
const joinPath = ref('');
const joinPathDetail = ref('');
/** 추천코드 — 웹만(앱은 아직 받지 않는다) */
const webEmbed = inject<boolean>('webEmbed', false);
const referralCode = ref('');
/** 사업자 구분 — 웹만(세금분석의 기본 선택이 된다) */
const bizType = ref<BizType>('');

const agreeTerms = ref(false);
const agreePrivacy = ref(false);
const agreeSms = ref(false);
const agreeAll = computed({
  get: () => agreeTerms.value && agreePrivacy.value && agreeSms.value,
  set: (v: boolean) => { agreeTerms.value = v; agreePrivacy.value = v; agreeSms.value = v; },
});

/** 아이디(메일)를 고치면 중복확인은 다시 받아야 한다 */
const idChecked = ref<'' | 'free' | 'taken'>('');
// 웹 — 중복확인 결과는 아이디 칸 바로 아래에, 아이디를 고칠 때까지 남긴다(아래쪽에 잠깐 떴다 사라져 못 보고 지나쳤다 2026-11-06)
const idNotice = ref<{ tone: 'ok' | 'bad' | 'unk'; text: string } | null>(null);
watch(email, () => { idChecked.value = ''; idNotice.value = null; });

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
  privacy: '개인정보처리방침',
  sms: '알림톡/문자수신',
};

const submitting = ref(false);
const checking = ref(false);
const notice = ref('');

const onCheckId = async () => {
  const mail = email.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    if (webEmbed) { idNotice.value = { tone: 'bad', text: '아이디는 메일 주소 꼴로 적어 주세요.' }; return; }
    authStore.error = '아이디는 메일 주소 꼴로 적어 주세요.';
    return;
  }
  checking.value = true;
  authStore.error = '';
  try {
    const r = await (webEmbed ? checkEmailFree : checkEmailTaken)(mail);   // 웹 — 열거 보호를 꺼서 빈 결과는 '쓸 수 있음'
    if (r === 'taken') {
      idChecked.value = 'taken';
      if (webEmbed) idNotice.value = { tone: 'bad', text: '이미 쓰고 있는 아이디입니다. 다른 메일 주소를 적어 주세요.' };
      else notice.value = '이미 쓰고 있는 아이디입니다.';
    } else {
      idChecked.value = 'free';
      const text = r === 'free' ? '쓸 수 있는 아이디입니다.' : '쓸 수 있어 보입니다 — 마지막 확인은 가입할 때 합니다.';
      if (webEmbed) idNotice.value = { tone: r === 'free' ? 'ok' : 'unk', text };
      else notice.value = text;
    }
  } finally {
    checking.value = false;
    if (!webEmbed) window.setTimeout(() => { notice.value = ''; }, 2600);
  }
};

/* 휴대폰 문자 인증 — 서비스 오픈 때 단추와 함께 연다(docs/서비스오픈목록.md)
const onVerifyPhone = () => {
  notice.value = '문자 인증 — 준비 중입니다. 번호는 그대로 저장됩니다.';
  window.setTimeout(() => { notice.value = ''; }, 2200);
};
*/

const onSubmit = async () => {
  if (submitting.value) return;
  authStore.error = '';
  const mail = email.value.trim();
  if (!realName.value.trim()) { authStore.error = '이름을 적어 주세요.'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { authStore.error = '아이디는 메일 주소 꼴로 적어 주세요.'; return; }
  if (idChecked.value === 'taken') { authStore.error = '이미 쓰고 있는 아이디입니다.'; return; }
  if (password.value.length < 6 || password.value.length > 30) { authStore.error = '비밀번호는 6~30자입니다.'; return; }
  if (password.value !== passwordConfirm.value) { authStore.error = '비밀번호가 서로 다릅니다.'; return; }
  if (webEmbed && (phone2.value.length < 3 || phone3.value.length < 4)) { authStore.error = '휴대폰 번호를 적어 주세요.'; return; }
  if (!address1.value.trim()) { authStore.error = '주소를 검색해 골라 주세요.'; return; }
  if (!agreeTerms.value || !agreePrivacy.value) { authStore.error = '[필수] 약관에 동의해 주세요.'; return; }

  submitting.value = true;
  try {
    await authStore.signup(mail, password.value, realName.value.trim());
    // 가입 정보는 users/{uid} 에 — 마이페이지(내 정보)가 읽는 칸 이름 그대로 함께 적는다
    const saved = await saveSignupExtra(authStore.uid, mail, {
      realName: realName.value.trim(),
      phone: [phone1.value, phone2.value, phone3.value].filter(Boolean).join('-'),
      region: region.value,
      address1: address1.value.trim(),
      address2: address2.value.trim(),
      joinPath: joinPath.value,
      joinPathDetail: joinPathDetail.value.trim(),
      ...(webEmbed ? { referralCode: referralCode.value.trim(), bizType: bizType.value } : {}),
      smsOptIn: agreeSms.value,
      agreedAt: new Date().toISOString(),
    });
    // 계정은 이미 만들어졌다 — 정보만 못 적었으면 알리고 그대로 들어간다(마이페이지에서 다시 적을 수 있다)
    if (!saved) window.alert('가입은 되었지만 연락처 등 가입 정보를 저장하지 못했습니다. 마이페이지 › 내 정보에서 다시 적어 주세요.');
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
      <!-- 가입을 그만둘 때 — 오른쪽 위 귀퉁이에서 로그인으로 돌아간다 -->
      <button type="button" class="su-close" aria-label="닫기" @click="router.push('/login')">
        <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
          <path d="M1.5 1.5 12.5 12.5M12.5 1.5 1.5 12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </button>
      <h1 class="su-title"><img :src="markImg" alt="" class="su-mark" />회원가입</h1>
      <p class="su-note">마이턴옥션은 영업 전화를 하지 않으며 개인정보를 타사와 공유하지 않습니다.</p>

      <p class="su-perk-line">가입 즉시 <b>{{ TRIAL_DAYS }}일 무료이용권</b> + <b>무료 {{ TRIAL_PERK_LINE }}</b><template v-if="POINTS_OPEN"> + <b>{{ WELCOME_POINT.toLocaleString('ko-KR') }}P</b></template> 지급</p>

      <form class="su-form" @submit.prevent="onSubmit">
        <!-- 웹 — 필수 칸은 칸 왼쪽 안에 빨간 별(이름 · 아이디 · 비밀번호 · 재확인 · 휴대폰 · 시/도) -->
        <span :class="['su-reqwrap', { req: webEmbed }]"><input v-model="realName" class="su-input" placeholder="이름 (실명)" autocomplete="name" /></span>

        <div class="su-row">
          <span :class="['su-lockwrap', { req: webEmbed }]">
            <input v-model="email" class="su-input" placeholder="아이디 (메일 주소)" autocomplete="username" inputmode="email" />
            <i class="su-lock">🔒</i>
          </span>
          <button type="button" class="su-sidebtn" :disabled="checking" @click="onCheckId">중복확인</button>
        </div>
        <p v-if="webEmbed && idNotice" :class="['su-idmsg', idNotice.tone]" role="status">{{ idNotice.text }}</p>

        <span :class="['su-lockwrap', { req: webEmbed }]">
          <input v-model="password" type="password" class="su-input" placeholder="영문,숫자 특수문자 일부허용 (6~30자)" autocomplete="new-password" />
          <i class="su-lock">🔒</i>
        </span>
        <span :class="['su-lockwrap', { req: webEmbed }]">
          <input v-model="passwordConfirm" type="password" class="su-input" placeholder="비밀번호 재확인" autocomplete="new-password" />
          <i class="su-lock">🔒</i>
        </span>

        <div :class="['su-row', 'phone', { req: webEmbed }]">
          <input :value="phone1" class="su-input" inputmode="numeric" @input="onPhone('p1', $event.target as HTMLInputElement, 3)" />
          <input :value="phone2" class="su-input" inputmode="numeric" placeholder="0000" @input="onPhone('p2', $event.target as HTMLInputElement, 4)" />
          <input :value="phone3" class="su-input" inputmode="numeric" placeholder="0000" @input="onPhone('p3', $event.target as HTMLInputElement, 4)" />
          <!-- 휴대폰 문자 인증 — 서비스 오픈 때 연다(docs/서비스오픈목록.md). 지금은 번호만 받아 저장한다
          <button type="button" class="su-sidebtn fill" @click="onVerifyPhone">인증요청</button>
          -->
        </div>

        <!-- 주소(필수) — 검색으로 고르고 상세 주소를 적는다(가로 한 줄). 시/도는 고른 주소에서 저절로 정한다 -->
        <div class="su-row addr">
          <span class="su-reqwrap req su-addr1"><input :value="address1" class="su-input" placeholder="주소 검색" readonly @click="openAddrSearch" /></span>
          <input ref="addr2Input" v-model="address2" class="su-input su-addr2" placeholder="상세 주소" autocomplete="off" />
          <button type="button" class="su-sidebtn" @click="openAddrSearch">주소 검색</button>
        </div>
        <div v-if="addrOpen" class="su-addr-veil" @click.self="addrOpen = false">
          <div class="su-addr-pop" role="dialog" aria-label="주소 검색">
            <div class="su-addr-head"><b>주소 검색</b><button type="button" aria-label="닫기" @click="addrOpen = false">✕</button></div>
            <div ref="addrBox" class="su-addr-box"><p class="su-addr-wait">주소 검색을 불러오는 중입니다…</p></div>
          </div>
        </div>

        <div v-if="webEmbed" class="su-block inline">
          <small class="su-blabel">사업자 구분</small>
          <div class="su-seg">
            <button v-for="[k, label] in BIZ_TYPES" :key="k" type="button" :class="{ on: bizType === k }" @click="bizType = k">{{ label }}</button>
          </div>
        </div>

        <div v-if="webEmbed" class="su-block inline">
          <small class="su-blabel">추천코드</small>
          <!-- 안내는 칸 안 회색 글(placeholder)로 — 아래 한 줄을 없애 회원가입 창을 줄인다 -->
          <input v-model="referralCode" class="su-input" placeholder="선택 입력 · 코드에 따라 무료 이용 기간 자동 적용" autocomplete="off" />
        </div>

        <div class="su-block">
          <!-- 가입경로 — 고르는 칸을 이름 바로 오른쪽 한 줄에 -->
          <div class="su-jrow">
            <small class="su-blabel">가입경로</small>
            <div class="su-radios">
              <label v-for="j in JOIN_PATHS" :key="j" class="su-radio">
                <input v-model="joinPath" type="radio" :value="j" />{{ j }}
              </label>
            </div>
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
            <input v-model="agreePrivacy" type="checkbox" /><em class="req">[필수]</em> 개인정보처리방침
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

    <!-- 약관 보기 — 더보기 화면과 같은 글을 그대로 띄운다. 화면 전체 위에 따로 넓은 창으로(body 로 옮긴다) -->
    <Teleport to="body">
    <div v-if="viewer" class="su-modal" @click.self="viewer = ''">
      <div class="su-modal-box">
        <header class="su-modal-head">
          <strong>{{ VIEWER_TITLE[viewer] }}</strong>
          <button type="button" class="su-modal-x" aria-label="닫기" @click="viewer = ''">
            <!-- 글자 ✕ 는 글꼴마다 기울고 치우쳐 선으로 그린다 — 칸 한가운데에 선다 -->
            <svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true">
              <path d="M1.5 1.5 12.5 12.5M12.5 1.5 1.5 12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
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

          <!-- 개인정보처리방침 — 더보기 · 웹 · 대문의 처리방침과 같은 글(services/legalTerms) -->
          <template v-else>
            <section v-for="sec in PRIVACY_SECTIONS" :key="sec.title" class="su-doc">
              <h3 class="su-doc-h">{{ sec.title }}</h3>
              <template v-for="(b, i) in sec.blocks" :key="i">
                <p v-if="b.kind === 'p'">{{ b.text }}</p>
                <h4 v-else-if="b.kind === 'label'">{{ b.text }}</h4>
                <ol v-else-if="b.kind === 'ol'" class="paren">
                  <li v-for="(it, k) in b.items" :key="k">{{ it }}</li>
                </ol>
                <ul v-else-if="b.kind === 'ul'">
                  <li v-for="(it, k) in b.items" :key="k">{{ it }}</li>
                </ul>
                <div v-else-if="b.kind === 'table'" class="su-doc-table">
                  <table>
                    <thead><tr><th v-for="h in b.head" :key="h">{{ h }}</th></tr></thead>
                    <tbody><tr v-for="(r, ri) in b.rows" :key="ri"><td v-for="(c, ci) in r" :key="ci">{{ c }}</td></tr></tbody>
                  </table>
                </div>
                <p v-else-if="b.kind === 'note'" class="su-doc-note">{{ b.text }}</p>
              </template>
            </section>
            <section class="su-doc">
              <h3 class="su-doc-h">{{ PRIVACY_OFFICER_TITLE }}</h3>
              <p v-for="row in PRIVACY_OFFICER" :key="row.label">{{ row.label }} : {{ row.value }}</p>
            </section>
            <section class="su-doc">
              <h3 class="su-doc-h">{{ PRIVACY_CHILD_TITLE }}</h3>
              <p>{{ PRIVACY_CHILD }}</p>
            </section>
            <p class="su-doc-tail">이 개인정보 처리방침은 {{ PRIVACY_EFFECTIVE }}부터 시행합니다.</p>
          </template>
        </div>
      </div>
    </div>
    </Teleport>
  </section>
</template>

<style scoped>
.su-shell {
  min-height: 100vh; background: #1f3a72;
  padding: 18px 12px 40px; box-sizing: border-box;
  display: flex; justify-content: center; align-items: flex-start;
}
.su-card {
  position: relative;
  width: 100%; max-width: 420px; box-sizing: border-box;
  background: #fff; border-radius: 14px; padding: 14px 16px 14px;   /* 세로를 줄였다(2026-11-03) — 위 여백 · 칸 높이 · 간격 */
}
.su-close {
  position: absolute; top: 10px; right: 10px;
  width: 28px; height: 28px; border: 1px solid #e3e8f0; border-radius: 6px;
  background: #fff; color: #4b5563; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; padding: 0; line-height: 0;
}
.su-close svg { display: block; }
/* 제목 옆에 동그라미 로고 — 큰 로고를 세우는 대신 자리를 아낀다 */
.su-title {
  margin: 0; font-size: 18px; font-weight: 800; color: #111827;
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.su-mark { display: block; width: 22px; height: 22px; }
.su-note {
  margin: 3px 0 0; text-align: center;
  font-size: 11px; line-height: 1.5; color: #8a93a4; word-break: keep-all;
}

/* 가입 혜택 */
.su-perk-line {
  margin: 8px 0 0; padding: 5px 6px; text-align: center;
  border: 1px solid #dbe3f7; border-radius: 8px; background: #f6f8ff;
  font-size: 11.5px; color: #3c4a6b; word-break: keep-all;
}
.su-perk-line b { color: #1f3a72; font-weight: 800; }
/* 혜택 상자 — 번호 · 큰 글 · 설명을 한 줄에 눕혀 낮게(세로로 쌓던 상자가 길어 줄였다, 2026-11-02) */
.su-perks { display: flex; gap: 6px; margin-top: 8px; }
.su-perk {
  flex: 1 1 0; min-width: 0; border: 1px solid #e3e8f4; border-radius: 10px;
  background: #f7f9ff; padding: 8px 10px; text-align: left;
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.su-perk.on { background: #2a3f8f; border-color: #2a3f8f; }
.su-perk .no {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 50%; box-sizing: border-box;
  background: #2a3f8f; color: #fff; font-size: 10px; font-weight: 800;
  line-height: 1; padding-bottom: 1px; font-variant-numeric: tabular-nums;   /* 숫자가 원 가운데보다 내려앉아 보여 1px 올린다 */
}
.su-perk.on .no { background: #fff; color: #2a3f8f; }
.su-perk .no { flex: none; }
.su-perk strong { display: block; font-size: 15px; font-weight: 800; color: #1f3a72; white-space: nowrap; }
.su-perk small { display: block; font-size: 12px; color: #6b7280; line-height: 1.35; word-break: keep-all; }
.su-perk.on strong, .su-perk.on small { color: #fff; }

/* 입력 */
.su-form { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.su-input {
  width: 100%; box-sizing: border-box; height: 36px;
  border: 1px solid #e3e8f0; border-radius: 6px; background: #fff;
  padding: 2px 11px; font-family: inherit; font-size: 12.5px; color: #111827;
}
.su-input::placeholder { color: #b6bdcb; }
.su-input:focus { outline: none; border-color: #2a3f8f; }
.su-lockwrap { position: relative; display: block; flex: 1 1 0; min-width: 0; }
.su-lock { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 11px; font-style: normal; opacity: .5; }
.su-row { display: flex; align-items: center; gap: 6px; }
.su-row.phone .su-input { flex: 1 1 0; min-width: 0; text-align: center; }
.su-row.addr .su-addr1 { flex: 1.3 1 0; min-width: 0; }
.su-row.addr .su-addr1 .su-input { width: 100%; cursor: pointer; }
.su-row.addr .su-addr2 { flex: 1 1 0; min-width: 0; }
.su-addr-veil { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 16px; background: rgba(15, 23, 42, .45); }
.su-addr-pop { display: flex; flex-direction: column; width: min(480px, 100%); height: min(560px, calc(100vh - 32px)); border-radius: 14px; background: #fff; overflow: hidden; box-shadow: 0 24px 60px rgba(0, 0, 0, .35); }
.su-addr-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid #eef0f5; }
.su-addr-head b { font-size: 14px; color: #111827; }
.su-addr-head button { border: 0; background: none; font-size: 15px; color: #6b7280; cursor: pointer; }
.su-addr-box { flex: 1 1 auto; min-height: 0; }
.su-addr-wait { margin: 0; padding: 24px; text-align: center; font-size: 12.5px; color: #6b7280; }
.su-sidebtn {
  flex: 0 0 auto; height: 36px; padding: 0 11px;
  border: 1px solid #2a3f8f; border-radius: 6px; background: #fff;
  font-family: inherit; font-size: 11.5px; font-weight: 700; color: #2a3f8f; cursor: pointer;
}
.su-sidebtn.fill { background: #2a3f8f; color: #fff; }
.su-sidebtn:disabled { opacity: .55; cursor: default; }

.su-block { display: flex; flex-direction: column; gap: 4px; margin-top: 2px; }
.su-block.inline { flex-direction: row; align-items: center; gap: 12px; }   /* 이름표를 칸 왼쪽에 — 한 줄 아낀다 */
.su-block.inline > .su-blabel { flex: 0 0 64px; }
.su-block.inline > :not(.su-blabel) { flex: 1 1 auto; min-width: 0; }
.su-blabel { font-size: 11.5px; font-weight: 700; color: #374151; }
.su-jrow { display: flex; align-items: center; gap: 12px; }
.su-jrow .su-blabel { flex: 0 0 64px; }   /* 사업자 구분 · 추천코드 이름표와 같은 폭 */
.su-jrow .su-radios { flex: 1 1 auto; min-width: 0; }
/* 필수 칸 빨간 별(웹) — 칸 왼쪽 안, 글은 별 뒤로 */
.su-reqwrap { position: relative; display: block; }
:is(.su-reqwrap, .su-lockwrap, .su-row.phone).req { position: relative; }
:is(.su-reqwrap, .su-lockwrap, .su-row.phone).req::before {
  content: '*'; position: absolute; left: 11px; top: 50%; transform: translateY(-46%); z-index: 1; pointer-events: none;
  font-size: 14px; font-weight: 800; color: #ef4444; line-height: 1;
}
:is(.su-reqwrap, .su-lockwrap).req .su-input, .su-row.phone.req .su-input:first-child { padding-left: 24px; }
/* 사업자 구분 — 네 칸 한 줄, 고른 칸은 남색 */
.su-seg { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.su-seg button { height: 36px; padding: 0 4px; border: 1px solid #e3e8f0; border-radius: 6px; background: #fff; font-family: inherit; font-size: 12.5px; color: #4b5563; cursor: pointer; white-space: nowrap; }
.su-seg button.on { border-color: #2a3f8f; background: #2a3f8f; color: #fff; font-weight: 700; }
/* 추천코드 아래 한 줄 안내 */
.su-refnote { font-size: 12px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.su-radios { display: flex; flex-wrap: wrap; gap: 4px 12px; }
.su-radio { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: #4b5563; cursor: pointer; }
.su-radio input { width: 13px; height: 13px; accent-color: #2a3f8f; }

/* 약관 */
.su-agree {
  margin-top: 2px; border: 1px solid #e3e8f0; border-radius: 8px; padding: 8px 11px;
  display: flex; flex-direction: column; gap: 6px;
}
.su-chk {
  display: flex; align-items: center; gap: 6px;
  font-size: 12.5px; color: #374151; cursor: pointer;
}
.su-chk.all { font-size: 12.5px; font-weight: 800; color: #111827; padding-bottom: 6px; border-bottom: 1px solid #f1f3f7; }
.su-chk input { width: 14px; height: 14px; accent-color: #2a3f8f; }
/* 꼭 받아야 하는 동의는 빨강, 골라 받는 것은 검정 */
.su-chk em { font-style: normal; color: #111827; font-weight: 700; }
.su-chk em.req { color: #c62828; }
.su-view {
  margin-left: 4px; border: 1px solid #d5dbe6; border-radius: 5px; background: #fff; padding: 2px 8px; cursor: pointer;
  font-family: inherit; font-size: 11px; font-weight: 700; color: #4b5563; line-height: 1.4;
}
.su-view:hover { border-color: #2a3f8f; color: #2a3f8f; }

/* 약관 보기 창 */
.su-modal {
  position: fixed; inset: 0; z-index: 3000; background: rgba(17, 24, 39, .45);
  display: flex; align-items: center; justify-content: center; padding: 18px 14px;
}
.su-modal-box {
  width: 100%; max-width: 420px; max-height: 76vh;
}
.su-modal-box { box-sizing: border-box;
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
  padding: 0; line-height: 0;
}
.su-modal-x svg { display: block; }
.su-modal-body { overflow-y: auto; padding: 12px 14px 16px; -webkit-overflow-scrolling: touch; }
@media (min-width: 720px) {
  .su-modal-box { max-width: 900px; max-height: 84vh; }   /* 웹 — 약관을 넓은 창으로 읽는다 */
  .su-modal-head strong { font-size: 16px; }
  .su-modal-head { padding: 14px 18px 12px; }
  .su-modal-body { padding: 18px 28px 26px; font-size: 14px; }
  .su-modal-body .su-doc-h { font-size: 15px; }
  .su-modal-body .su-doc h4 { font-size: 14px; }
  .su-modal-body .su-doc p, .su-modal-body .su-doc li { font-size: 13.5px; line-height: 1.8; }
}

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
.su-doc-table { overflow-x: auto; margin: 4px 0 6px; }
.su-doc-table table { width: 100%; border-collapse: collapse; font-size: 11px; line-height: 1.55; }
.su-doc-table th, .su-doc-table td { border: 1px solid #e5e9f2; padding: 5px 7px; text-align: left; vertical-align: top; word-break: keep-all; color: #4b5563; }
.su-doc-table th { background: #f5f7fb; font-weight: 700; color: #111827; }
.su-doc-note { color: #8a93a4 !important; }
.su-doc li { white-space: pre-line; }
@media (min-width: 720px) { .su-modal-body .su-doc-table table { font-size: 13px; } }

.su-msg { margin: 2px 0 0; font-size: 11.5px; color: #2a3f8f; }
/* 웹 — 아이디 칸 바로 아래 중복확인 결과(쓸 수 있음 초록 · 이미 있음 빨강 · 확인 못 함 파랑) */
.su-idmsg { margin: -2px 2px 2px; font-size: 12px; line-height: 1.4; word-break: keep-all; }
.su-idmsg.ok { color: #15803d; }
.su-idmsg.bad { color: #c62828; }
.su-idmsg.unk { color: #2a3f8f; }
.su-err { margin: 2px 0 0; font-size: 11.5px; color: #c62828; word-break: keep-all; }
.su-submit {
  margin-top: 4px; width: 100%; height: 42px;
  border: none; border-radius: 6px; background: #2a3f8f; color: #fff;
  font-family: inherit; font-size: 15px; font-weight: 800; cursor: pointer;
}
.su-submit:disabled { background: #9ca3af; cursor: not-allowed; }
.su-back {
  border: none; background: transparent; cursor: pointer;
  font-family: inherit; font-size: 11.5px; color: #6b7280; text-decoration: underline;
}
</style>
