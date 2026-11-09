<script setup lang="ts">
// 마이턴 옥션 로고 — 로그인·회원가입·앱 머리글·분석 도구가 같이 쓴다.
//
// 엠블럼 · MYTURN 벡터 한 장(LOGO_MYTURN.svg — 홍보 영상 원본 logo_data.json 에서 만든 것).
// AUCTION 을 뺀 뒤로는 흰 바탕 · 색 바탕 판이 같아 tone 은 받기만 한다.
// size 는 그림 전체 높이 — 597x197 비율대로 가로를 못 박아 둔다
// (가로를 적어 두지 않으면 좁은 칸에서 그림이 눌린다).
import { computed } from 'vue';
import logo from '../assets/icones/log/LOGO_MYTURN.svg';

const props = withDefaults(defineProps<{ size?: number; tone?: 'gray' | 'white' }>(), {
  size: 38,
  tone: 'gray',
});

const box = computed(() => ({
  height: `${props.size}px`,
  width: `${(props.size * (597 / 197)).toFixed(2)}px`,
}));
</script>

<template>
  <img :src="logo" alt="MYTURN" class="brand" :style="box" />
</template>

<style scoped>
/* inline-block 이라 부모의 text-align 으로 가운데에 둘 수 있다 */
.brand { display: inline-block; vertical-align: top; flex: none; object-fit: contain; }
</style>
