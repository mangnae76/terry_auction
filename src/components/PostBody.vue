<script setup lang="ts">
// 글 본문 — 표와 줄 맞춤까지 그려 준다. 규칙은 services/boardBody 에 있다.
import { computed } from 'vue';
import { parseBody } from '../services/boardBody';

const props = defineProps<{ body?: string }>();
const blocks = computed(() => parseBody(props.body));
</script>

<template>
  <div v-if="blocks.length" class="pb">
    <template v-for="(b, i) in blocks" :key="i">
      <table v-if="b.kind === 'table'" class="pb-table">
        <thead v-if="b.head.length">
          <tr><th v-for="(c, j) in b.head" :key="j">{{ c }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="(r, j) in b.rows" :key="j">
            <td v-for="(c, k) in r" :key="k">{{ c }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else :class="['pb-p', b.align]">{{ b.lines.join('\n') }}</p>
    </template>
  </div>
</template>

<style scoped>
.pb { display: flex; flex-direction: column; gap: 10px; }
.pb-p {
  margin: 0; font-size: 12.5px; line-height: 1.8; color: #374151;
  white-space: pre-wrap; word-break: keep-all;
}
.pb-p.center { text-align: center; }
.pb-p.right { text-align: right; }
.pb-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.pb-table th, .pb-table td {
  border: 1px solid #e5e7eb; padding: 7px 9px; text-align: left; word-break: keep-all;
}
.pb-table th { background: #f4f6fb; font-weight: 800; color: #111827; }
.pb-table td { color: #374151; }
</style>
