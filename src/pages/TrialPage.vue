<script setup lang="ts">
// 무료체험 안내 — 고객센터 · 첫 방문자 안내의 '3일 무료체험 안내'에서 들어온다.
// 글은 services/trialInfo 와 services/legalTerms 에 있고 여기서는 그리기만 한다.
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import { TRIAL_DAYS, TRIAL_NOTE, TRIAL_PERKS, TRIAL_STEPS } from '../services/trialInfo';
import { TRIAL_PRIVACY_INTRO, TRIAL_PRIVACY_ROWS } from '../services/legalTerms';

const router = useRouter();
</script>

<template>
  <section class="tr-shell">
    <header class="tr-header">
      <button type="button" class="tr-back" aria-label="뒤로" @click="router.back()">‹</button>
      <h1 class="tr-title">{{ TRIAL_DAYS }}일 무료체험 안내</h1>
      <span class="tr-crumb">고객센터 › 무료체험</span>
    </header>

    <div class="tr-body">
      <section class="tr-card">
        <div class="tr-perks">
          <span v-for="p in TRIAL_PERKS" :key="p.small">
            <b>{{ p.big }}</b><small>{{ p.small }}</small>
          </span>
        </div>

        <h2 class="tr-h2">📌 무료체험 이용안내</h2>
        <ol class="tr-steps">
          <li v-for="(st, i) in TRIAL_STEPS" :key="i">
            <span class="no">{{ i + 1 }}</span>
            <small v-html="st" />
          </li>
        </ol>
        <p class="tr-warnbar">{{ TRIAL_NOTE }}</p>
      </section>

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

.tr-perks { display: flex; gap: 6px; }
.tr-perks span {
  flex: 1 1 0; min-width: 0; border: 1px solid #e3e8f4; border-radius: 10px;
  background: #f7f9ff; padding: 11px 4px 10px; text-align: center;
  display: flex; flex-direction: column; gap: 2px;
}
.tr-perks b { font-size: 15px; font-weight: 800; color: #1f3a72; }
.tr-perks small { font-size: 10.5px; color: #6b7280; word-break: keep-all; }

.tr-h2 { margin: 16px 0 8px; font-size: 13px; font-weight: 800; color: #111827; }
.tr-card:nth-child(2) .tr-h2 { margin-top: 0; }
.tr-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.tr-steps li { position: relative; display: flex; align-items: flex-start; gap: 8px; padding-bottom: 6px; }
.tr-steps li:not(:last-child)::before {
  content: ''; position: absolute; left: 9.5px; top: 22px; bottom: 0; width: 1px; background: #dbe3f7;
}
.tr-steps .no {
  flex: none; width: 20px; height: 20px; border-radius: 50%; background: #2a3f8f; color: #fff;
  display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800;
}
.tr-steps small { flex: 1 1 auto; font-size: 12px; line-height: 1.65; color: #374151; word-break: keep-all; }
.tr-steps small :deep(b) { color: #1f3a72; font-weight: 700; }
.tr-warnbar {
  margin: 10px 0 0; padding: 9px 11px; border-left: 3px solid #e8a33d; background: #fff8ec;
  font-size: 11.5px; line-height: 1.7; color: #8a6418; word-break: keep-all;
}

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
