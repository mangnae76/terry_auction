<script setup lang="ts">
// 안에 든 부품만 웹 꼴(webEmbed)로 그리게 한다 — 앱 화면에서 웹과 같은 내용 · 계산을 쓰고 싶은 자리만 감싼다(2026-11-09 앱 낙찰이후).
// 이 부품 밖(앱 화면 나머지)은 그대로 앱이다
import { provide } from 'vue';

const props = withDefaults(defineProps<{ on?: boolean }>(), { on: true });
provide('webEmbed', props.on);
</script>

<template>
  <slot />
</template>
