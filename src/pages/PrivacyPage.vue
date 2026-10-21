<script setup lang="ts">
// 개인정보 처리방침 — 글은 services/legalTerms 에 있고 여기서는 그리기만 한다.
import { useRouter } from 'vue-router';
import AppMobileBottomNav from '../components/AppMobileBottomNav.vue';
import {
  PRIVACY_CHILD,
  PRIVACY_EFFECTIVE,
  PRIVACY_OFFICER,
  PRIVACY_SECTIONS,
} from '../services/legalTerms';

const router = useRouter();
</script>

<template>
  <section class="tms-shell">
    <header class="tms-header">
      <button type="button" class="tms-back" aria-label="뒤로" @click="router.back()"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg></button>
      <h1 class="tms-title">개인정보 처리방침</h1>
      <span class="tms-crumb">마이페이지 › 처리방침</span>
    </header>

    <div class="tms-body">
      <section v-for="sec in PRIVACY_SECTIONS" :key="sec.title" class="tms-card">
        <h2 class="tms-chapter">{{ sec.title }}</h2>
        <template v-for="(b, i) in sec.blocks" :key="i">
          <p v-if="b.kind === 'p'" class="tms-text">{{ b.text }}</p>
          <h3 v-else-if="b.kind === 'label'" class="tms-sub">{{ b.text }}</h3>
          <ol v-else-if="b.kind === 'ol'" class="tms-items paren">
            <li v-for="(it, k) in b.items" :key="k">{{ it }}</li>
          </ol>
          <ul v-else class="tms-items dash">
            <li v-for="(it, k) in b.items" :key="k">{{ it }}</li>
          </ul>
        </template>
      </section>

      <section class="tms-card">
        <h2 class="tms-chapter">개인정보 관리책임자</h2>
        <dl class="tms-officer">
          <template v-for="row in PRIVACY_OFFICER" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </template>
        </dl>
      </section>

      <section class="tms-card">
        <h2 class="tms-chapter">아동의 개인정보보호</h2>
        <p class="tms-text">{{ PRIVACY_CHILD }}</p>
      </section>

      <section class="tms-card">
        <h2 class="tms-chapter">부칙</h2>
        <p class="tms-text">(시행일) 이 개인정보 처리방침은 {{ PRIVACY_EFFECTIVE }}부터 시행합니다.</p>
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
.tms-card { background: #fff; border-radius: 10px; padding: 12px 14px 14px; counter-reset: pv; }
.tms-chapter { margin: 0 0 8px; font-size: 13.5px; font-weight: 800; color: #1f3a72; }
.tms-sub { margin: 8px 0 2px; font-size: 12px; font-weight: 800; color: #111827; }
.tms-text { margin: 0; font-size: 12px; line-height: 1.7; color: #374151; word-break: keep-all; }
.tms-text + .tms-text { margin-top: 6px; }
.tms-items { margin: 4px 0 0; padding-left: 20px; }
.tms-items li { font-size: 12px; line-height: 1.7; color: #374151; word-break: keep-all; }
/* 번호는 원문처럼 (1) 꼴로, 작은 줄은 가운뎃점으로 */
.tms-items.paren { list-style: none; padding-left: 0; }
.tms-items.paren > li { counter-increment: pv; padding-left: 22px; text-indent: -22px; }
.tms-items.paren > li::before { content: '(' counter(pv) ') '; color: #6b7280; }
.tms-items.dash { list-style: none; padding-left: 0; }
.tms-items.dash > li { padding-left: 12px; text-indent: -12px; }
.tms-items.dash > li::before { content: '· '; color: #6b7280; }
.tms-officer { margin: 0; display: grid; grid-template-columns: 72px 1fr; row-gap: 4px; column-gap: 8px; }
.tms-officer dt { font-size: 12px; font-weight: 700; color: #6b7280; }
.tms-officer dd { margin: 0; font-size: 12px; color: #374151; word-break: break-all; }
</style>
