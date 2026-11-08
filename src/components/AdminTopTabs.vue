<script setup lang="ts">
// 관리자 화면 머리 탭 — 관리자 도구(/admin) · 운영(/admin/board) · 플랫폼(웹 /web). 관리자 도구 · 운영 두 화면이 같이 쓴다(2026-11-08)
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const TABS: Array<{ key: string; label: string; to: string; ext?: boolean }> = [
  { key: 'home', label: '관리자 도구', to: '/admin' },
  { key: 'board', label: '운영', to: '/admin/board' },
  { key: 'web', label: '플랫폼', to: '/web', ext: true },
];
const on = (t: { key: string; to: string }) => (t.key === 'board' ? route.path.startsWith('/admin/board') : t.key === 'home' ? route.path === '/admin' : false);
const go = (t: { to: string; ext?: boolean }) => { if (t.ext) window.location.href = t.to; else void router.push(t.to); };
</script>

<template>
  <nav class="adm-tabs-nav" role="tablist" aria-label="관리자 화면">
    <button v-for="t in TABS" :key="t.key" type="button" role="tab" :aria-selected="on(t)" :class="['adm-tab', { on: on(t) }]" @click="go(t)">{{ t.label }}</button>
  </nav>
</template>

<style scoped>
.adm-tabs-nav { display: flex; align-items: stretch; gap: 4px; align-self: stretch; margin: -12px 0 -12px 12px; }   /* 머리 띠 위아래 끝까지 — 밑줄이 띠 아래 끝에 붙게 */
.adm-tab { position: relative; padding: 0 14px; border: 0; background: none; color: #c7d2ea; font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.adm-tab:hover { color: #fff; }
.adm-tab.on { color: #fff; }
.adm-tab::after { content: ""; position: absolute; left: 10px; right: 10px; bottom: 0; height: 3px; border-radius: 2px 2px 0 0; background: #f08a24; transform: scaleX(0); transition: transform .2s ease; }
.adm-tab:hover::after { transform: scaleX(1); opacity: .45; }
.adm-tab.on::after { transform: scaleX(1); opacity: 1; }
</style>
