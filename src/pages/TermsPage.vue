<script setup lang="ts">
// 이용약관 — 글은 services/legalTerms 에 있고 여기서는 그리기만 한다.
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import { TERMS_CHAPTERS, TERMS_EFFECTIVE } from '../services/legalTerms';

const router = useRouter();
</script>

<template>
  <section class="tms-shell">
    <header class="tms-header">
      <button type="button" class="tms-back" aria-label="뒤로" @click="router.back()"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg></button>
      <h1 class="tms-title">이용약관</h1>
      <span class="tms-crumb">마이페이지 › 약관</span>
    </header>

    <div class="tms-body">
      <section v-for="ch in TERMS_CHAPTERS" :key="ch.title" class="tms-card">
        <h2 class="tms-chapter">【 {{ ch.title }} 】</h2>
        <article v-for="a in ch.articles" :key="a.title" class="tms-art">
          <h3 class="tms-art-title">{{ a.title }}</h3>
          <p v-if="a.text" class="tms-text">{{ a.text }}</p>
          <ol v-if="a.items.length" class="tms-items">
            <li v-for="(it, i) in a.items" :key="i">{{ it }}</li>
          </ol>
        </article>
      </section>

      <section class="tms-card">
        <h2 class="tms-chapter">부칙</h2>
        <p class="tms-text">본 약관은 {{ TERMS_EFFECTIVE }}부터 시행하며, 종전의 이용약관은 본 약관으로 대체합니다.</p>
      </section>
    </div>

    <AppMobileBottomNav active="more" />
  </section>
</template>

<style scoped>
.tms-shell { min-height: 100vh; background: #f4f6fb; padding-bottom: 96px; }
.tms-header { padding: 14px 12px 8px; display: flex; align-items: baseline; gap: 8px; border-bottom: 1px solid #e5e7eb; }
.tms-back {
  border: none; background: transparent; cursor: pointer;
  font-size: 22px; line-height: 1; color: #334155; padding: 0 2px; align-self: center;
}
.tms-title { margin: 0; font-size: 20px; font-weight: 800; color: #111827; }
.tms-crumb { margin-left: auto; font-size: 11px; color: #9ca3af; }
.tms-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.tms-card { background: #fff; border-radius: 10px; padding: 12px 14px 14px; }
.tms-chapter { margin: 0 0 8px; font-size: 13.5px; font-weight: 800; color: #1f3a72; }
.tms-art + .tms-art { margin-top: 12px; padding-top: 10px; border-top: 1px solid #f1f3f7; }
.tms-art-title { margin: 0 0 4px; font-size: 12.5px; font-weight: 800; color: #111827; }
.tms-text { margin: 0; font-size: 12px; line-height: 1.7; color: #374151; word-break: keep-all; }
.tms-items { margin: 4px 0 0; padding-left: 18px; }
.tms-items li { font-size: 12px; line-height: 1.7; color: #374151; word-break: keep-all; }
</style>
