<script setup lang="ts">
// '연 1,733 | 월 144.4' — 손품+현장 매매수요의 연 · 월 표기(adp-dm-pre · adp-dm-bar)와 같은 꼴.
// 지역분석 · 지역 수요공급 요약의 거래건수 칸에서 쓴다. 글자 색 · 크기는 감싼 칸(b)을 따른다
// lead · leadN — 앞 칸을 '연' 대신 다른 기간 합계로(웹 랭킹분석 24개월 '2년 3,296', 2026-11-08). 주지 않으면 예전 그대로
defineProps<{ year: number; month: number; lead?: string; leadN?: number }>();
const int = (n: number) => Math.round(n).toLocaleString('ko-KR');
const one = (n: number) => (n > 0 ? n.toFixed(1) : '0');
</script>

<template>
  <span class="ym"><template v-if="lead"><em class="pre">{{ lead }}</em>{{ int(leadN ?? 0) }}</template><template v-else><em class="pre">연</em>{{ int(year) }}</template><em class="bar">|</em><em class="pre">월</em>{{ one(month) }}</span>
</template>

<style scoped>
.ym { white-space: nowrap; }
.pre { font-style: normal; font-size: 12px; font-weight: 700; color: #6b7280; margin-right: 3px; }
.bar { font-style: normal; font-weight: 400; color: #c3c9d4; margin: 0 7px; }
</style>
