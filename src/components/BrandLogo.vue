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
.brand { position: relative; display: inline-block; line-height: 0; }
.brand-logo {
  /* 너비를 비율대로 못 박는다 — 안 그러면 칸에 눌려 그림이 줄고 글자 자리가 어긋난다
     (그림은 592x194) */
  display: block; height: var(--h); width: calc(var(--h) * 3.0515); flex: none;
}
.brand-sub {
  /* 그림 안에서 MYTURN 글자가 끝나는 자리(194 중 133)에 글상자 윗변을 둔다.
     글상자 안쪽 윗공백(0.13em)만큼 다시 끌어올리면 글자끼리 맞닿는다 —
     둘 다 그림 높이·글자 크기에 비례해서 어느 크기로 써도 같은 꼴이다 */
  position: absolute; right: calc(var(--h) * 0.055);
  top: calc(var(--h) * 0.6856);
  transform: translateY(-0.13em);
  font-size: calc(var(--h) * 0.236); line-height: 1;
  font-weight: 700; letter-spacing: 0.6px; color: #111827; white-space: nowrap;
}
</style>
