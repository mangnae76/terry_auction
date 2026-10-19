<script setup lang="ts">
// 마이턴 옥션 로고 — 로그인·회원가입·앱 머리글·분석 도구가 같이 쓴다.
//
// 그림 한 장에 MYTURN 과 AUCTION 이 같이 들어 있다.
// 흰 바탕에는 회색 판, 색이 깔린 바탕에는 흰 판을 쓴다 (AUCTION 글자 색만 다르다).
// size 는 그림 전체 높이 — 597x197 비율대로 가로를 못 박아 둔다
// (가로를 적어 두지 않으면 좁은 칸에서 그림이 눌린다).
import { computed } from 'vue';
import grayLogo from '../assets/icones/log/LOGO_AUCTION_GRAY.png';
import whiteLogo from '../assets/icones/log/LOGO_AUCTION_WHITE.png';

const props = withDefaults(defineProps<{ size?: number; tone?: 'gray' | 'white' }>(), {
  size: 38,
  tone: 'gray',
});

const src = computed(() => (props.tone === 'white' ? whiteLogo : grayLogo));
const box = computed(() => ({
  height: `${props.size}px`,
  width: `${(props.size * (597 / 197)).toFixed(2)}px`,
}));
</script>

<template>
  <img :src="src" alt="MYTURN AUCTION" class="brand" :style="box" />
</template>

<style scoped>
/* inline-block 이라 부모의 text-align 으로 가운데에 둘 수 있다 */
.brand { display: inline-block; vertical-align: top; flex: none; object-fit: contain; }
</style>
