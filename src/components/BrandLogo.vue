<script setup lang="ts">
// 마이턴 옥션 로고 묶음 — 로그인·회원가입·관리자 도구가 같이 쓴다.
//
// 로고 그림은 MYTURN 까지만 그려져 있어 'AUCTION' 은 글자로 받친다.
// 그림 아래에 빈 자리가 조금 들어 있어(592x194 중 글자는 y133 까지) 그만큼
// 끌어올려 MYTURN 바로 밑에 붙이고, 오른쪽도 여백만큼 당겨 N 끝과 맞춘다.
import logoImg from '../assets/icones/log/LOGO_ENG.png';

withDefaults(defineProps<{ size?: number }>(), { size: 36 });
</script>

<template>
  <span class="brand" :style="{ '--h': `${size}px` }">
    <img :src="logoImg" alt="MYTURN AUCTION" class="brand-logo" />
    <small class="brand-sub">AUCTION</small>
  </span>
</template>

<style scoped>
.brand { display: inline-flex; flex-direction: column; align-items: flex-end; line-height: 1; }
.brand-logo { display: block; height: var(--h); object-fit: contain; }
.brand-sub {
  /* 그림 높이에 따라 같은 비율로 따라간다 (36px 일 때 -11px · 8.5px) */
  margin-top: calc(var(--h) * -0.306);
  font-size: calc(var(--h) * 0.236);
  font-weight: 700; letter-spacing: 0.6px; color: #111827; padding-right: 2px;
}
</style>
