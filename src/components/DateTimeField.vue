<script setup lang="ts">
// 날짜·시각 한 칸 — 'YYYY-MM-DDTHH:mm' 한 값을 날짜 칸과 시각 칸으로 나눠 받는다.
//
// datetime-local 한 칸으로 받으면 날짜만 고르고 시각을 비워 둔 동안 값이 아예 서지 않는다.
// 그래서 둘로 나누고, 날짜를 고르면 시각은 00:00(밤 12시)로 맞춰 둔다.
import { computed } from 'vue';

const props = defineProps<{ modelValue?: string; disabled?: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const date = computed(() => (props.modelValue ?? '').slice(0, 10));
const time = computed(() => (props.modelValue ?? '').slice(11, 16));

const onDate = (ev: Event) => {
  const v = (ev.target as HTMLInputElement).value;
  emit('update:modelValue', v ? `${v}T${time.value || '00:00'}` : '');
};
/* 시각은 시 · 분 두 고르기로 — 브라우저 시각 칸은 돌림 목록이 너무 빨리 넘어가 고르기 힘들다(2026-11-08).
   시는 0~23 을 한 번에 다 펼치고, 분은 5분 단위(예전에 적어 둔 5분 단위 밖의 값도 그대로 남긴다) */
const pad = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const hour = computed(() => time.value.slice(0, 2) || '00');
const minute = computed(() => time.value.slice(3, 5) || '00');
const minutes = computed(() => {
  const list = Array.from({ length: 12 }, (_, i) => pad(i * 5));
  return list.includes(minute.value) ? list : [...list, minute.value].sort();
});
const setTime = (h: string, m: string) => {
  if (!date.value) { emit('update:modelValue', ''); return; }
  emit('update:modelValue', `${date.value}T${h}:${m}`);
};
</script>

<template>
  <span class="dtf">
    <input type="date" class="dtf-date" :value="date" :disabled="disabled" @change="onDate" @input="onDate" />
    <span class="dtf-time">
      <select :value="hour" :disabled="disabled || !date" aria-label="시" @change="setTime(($event.target as HTMLSelectElement).value, minute)">
        <option v-for="h in HOURS" :key="h" :value="h">{{ h }}시</option>
      </select>
      <select :value="minute" :disabled="disabled || !date" aria-label="분" @change="setTime(hour, ($event.target as HTMLSelectElement).value)">
        <option v-for="m in minutes" :key="m" :value="m">{{ m }}분</option>
      </select>
    </span>
  </span>
</template>

<style scoped>
/* 좁은 칸 둘이 한 줄에 — 자리가 모자라면 시각 칸이 아랫줄로 내려간다 (글자가 잘리지 않게) */
.dtf { display: flex; flex-wrap: wrap; gap: 5px; min-width: 0; }
.dtf input, .dtf select {
  box-sizing: border-box; height: 38px;
  min-width: 0; border: 1px solid #e3e8f0; border-radius: 8px; padding: 2px 5px;
  font-family: inherit; font-size: 11.5px; color: #111827; background: #fff;
}
.dtf :is(input, select):focus { outline: none; border-color: #2a3f8f; }
.dtf :is(input, select):disabled { background: #f7f8fb; color: #9ca3af; }
/* 날짜는 '2026. 10. 01.' 만큼만, 남는 자리는 시각 칸이 가져간다 */
.dtf-date { flex: 1 1 124px; min-width: 110px; }
.dtf-time { flex: 1 1 124px; min-width: 120px; display: flex; gap: 4px; }
.dtf-time select { flex: 1 1 0; cursor: pointer; }
.dtf-time select:disabled { cursor: default; }
</style>
