<script setup lang="ts">
// 무료체험 안내 — 고객센터 · 첫 방문자 안내의 '3일 무료체험 안내'에서 들어온다.
// 개인정보 수집 및 이용 동의만 둔다(혜택 · 이용안내는 회원가입 카드에 있다). 글은 services/legalTerms 에 있고 여기서는 그리기만 한다.
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import { TRIAL_DAYS } from '../services/trialInfo';
import { TRIAL_PRIVACY_INTRO, TRIAL_PRIVACY_ROWS } from '../services/legalTerms';

const router = useRouter();
</script>

<template>
  <section class="tr-shell">
    <header class="tr-header">
      <button type="button" class="tr-back" aria-label="뒤로" @click="router.back()"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg></button>
      <h1 class="tr-title">{{ TRIAL_DAYS }}일 무료체험 안내</h1>
      <span class="tr-crumb">고객센터 › 무료체험</span>
    </header>

    <div class="tr-body">
      <section class="tr-card">
        <h2 class="tr-h2">[무료체험] 개인정보 수집 및 이용안내</h2>
        <p v-for="(t, i) in TRIAL_PRIVACY_INTRO" :key="i" class="tr-p">{{ t }}</p>
        <dl class="tr-privacy">
          <template v-for="row in TRIAL_PRIVACY_ROWS" :key="row.head">
            <dt>{{ row.head }}</dt>
            <dd><span v-for="(b, i) in row.body" :key="i">{{ b }}</span></dd>
          </template>
        </dl>
      </section>

      <button type="button" class="tr-go" @click="router.push('/signup')">
        {{ TRIAL_DAYS }}일 무료체험 하기 ›
      </button>
    </div>

    <AppMobileBottomNav active="more" />
  </section>
</template>

<style scoped>
.tr-shell { min-height: 100vh; background: #f4f6fb; padding-bottom: 96px; }
.tr-header { padding: 14px 12px 8px; display: flex; align-items: baseline; gap: 8px; border-bottom: 1px solid #e5e7eb; }
.tr-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 2px; align-self: center;
}
.tr-title { margin: 0; font-size: 20px; font-weight: 800; color: #111827; }
.tr-crumb { margin-left: auto; font-size: 11px; color: #9ca3af; }
.tr-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.tr-card { background: #fff; border-radius: 10px; padding: 13px 13px 15px; }


.tr-h2 { margin: 16px 0 8px; font-size: 13px; font-weight: 800; color: #111827; }
.tr-card .tr-h2 { margin-top: 0; }

.tr-p { margin: 0 0 4px; font-size: 11.5px; line-height: 1.7; color: #4b5563; word-break: keep-all; }
.tr-privacy { margin: 10px 0 0; }
.tr-privacy dt {
  font-size: 11.5px; font-weight: 800; color: #1f3a72;
  padding: 8px 0 3px; border-top: 1px solid #eef1f7;
}
.tr-privacy dd { margin: 0 0 3px; }
.tr-privacy dd span { display: block; font-size: 11.5px; line-height: 1.7; color: #4b5563; word-break: keep-all; }

.tr-go {
  width: 100%; height: 46px; border: none; border-radius: 999px;
  background: #1f3a72; color: #fff; font-family: inherit; font-size: 14px; font-weight: 800; cursor: pointer;
}
</style>
