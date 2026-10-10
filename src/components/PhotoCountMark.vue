<script setup lang="ts">
// 사진 칸 제목 옆에 붙는 장수 뱃지.
//
// 사진 칸은 여러 화면에 흩어져 있는데, 장수를 보여 주는 모양과 말("사진 3장")은
// 모두 같아야 한다. 칸마다 같은 <span>을 베껴 두면 한 곳만 고치고 넘어가기 쉬워,
// 모양·말은 여기 한 벌만 둔다. 어느 칸이 몇 장인지는 PHOTO_AREAS 가 들고 있다.
defineProps<{
  /** 붙어 있는 사진 장수 — 0이면 아무것도 그리지 않는다 */
  n: number;
}>();
</script>

<template>
  <span v-if="n > 0" class="adp-photo-mark" :title="`사진 ${n}장`">{{ n }}</span>
</template>
